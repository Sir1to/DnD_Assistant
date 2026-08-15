import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CampaignLoreResponse,
  CampaignRole,
  CreateLoreEntryRequest,
  LoreAudience,
  LoreAttachment,
  LoreEntry,
  UpdateLoreEntryRequest,
} from '@fog-of-lore/contracts';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { campaignMembers, loreEntries, loreEntryRecipients, users } from '../database/schema';
import { CampaignAccessService } from './campaign-access.service';
import { CampaignEventsService } from './campaign-events.service';
import { LoreAttachmentsService } from './lore-attachments.service';

type LoreRecord = typeof loreEntries.$inferSelect & { authorDisplayName: string | null };

@Injectable()
export class LoreService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(CampaignEventsService) private readonly events: CampaignEventsService,
    @Inject(LoreAttachmentsService) private readonly attachments: LoreAttachmentsService,
  ) {}

  public async list(userId: string, campaignId: string): Promise<CampaignLoreResponse> {
    const role = await this.access.requireMembership(userId, campaignId);
    const records = await this.database
      .select({
        id: loreEntries.id,
        campaignId: loreEntries.campaignId,
        authorId: loreEntries.authorId,
        title: loreEntries.title,
        content: loreEntries.content,
        category: loreEntries.category,
        isPinned: loreEntries.isPinned,
        status: loreEntries.status,
        audience: loreEntries.audience,
        revision: loreEntries.revision,
        publishedAt: loreEntries.publishedAt,
        createdAt: loreEntries.createdAt,
        updatedAt: loreEntries.updatedAt,
        authorDisplayName: users.displayName,
      })
      .from(loreEntries)
      .leftJoin(users, eq(users.id, loreEntries.authorId))
      .where(eq(loreEntries.campaignId, campaignId))
      .orderBy(desc(loreEntries.updatedAt));
    const recipients = await this.loadRecipients(records.map(({ id }) => id));
    const attachments = await this.attachments.listByEntries(records.map(({ id }) => id));

    return {
      campaignId,
      role,
      entries: records
        .filter((record) => this.canView(record, recipients.get(record.id) ?? [], role, userId))
        .map((record) =>
          this.toEntry(
            record,
            recipients.get(record.id) ?? [],
            attachments.get(record.id) ?? [],
            role,
          ),
        ),
    };
  }

  public async get(userId: string, entryId: string): Promise<LoreEntry> {
    const record = await this.loadEntry(entryId);
    if (!record) throw new NotFoundException('Lore entry not found');
    const role = await this.access.requireMembership(userId, record.campaignId);
    const recipients = (await this.loadRecipients([entryId])).get(entryId) ?? [];
    const attachments = (await this.attachments.listByEntries([entryId])).get(entryId) ?? [];

    if (!this.canView(record, recipients, role, userId)) {
      throw new NotFoundException('Lore entry not found');
    }

    return this.toEntry(record, recipients, attachments, role);
  }

  public async create(
    userId: string,
    campaignId: string,
    input: CreateLoreEntryRequest,
  ): Promise<LoreEntry> {
    const role = await this.access.requireEditor(userId, campaignId);
    await this.validateRecipients(campaignId, input.audience, input.recipientUserIds);
    const now = new Date();
    const record = await this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(loreEntries)
        .values({
          campaignId,
          authorId: userId,
          title: input.title,
          content: input.content,
          category: input.category,
          isPinned: input.isPinned,
          status: input.status,
          audience: input.audience,
          publishedAt: input.status === 'PUBLISHED' ? now : null,
        })
        .returning();

      if (!created) throw new Error('Lore entry insert did not return a row');
      await this.replaceRecipients(transaction, created.id, input.recipientUserIds);
      return created;
    });

    this.events.publishLoreChanged(campaignId);
    return this.toEntry({ ...record, authorDisplayName: null }, input.recipientUserIds, [], role);
  }

  public async update(
    userId: string,
    entryId: string,
    input: UpdateLoreEntryRequest,
  ): Promise<LoreEntry> {
    const existing = await this.loadEntry(entryId);
    if (!existing) throw new NotFoundException('Lore entry not found');
    const role = await this.access.requireEditor(userId, existing.campaignId);
    const currentRecipients = (await this.loadRecipients([entryId])).get(entryId) ?? [];
    const audience = input.audience ?? existing.audience;
    const recipientUserIds =
      input.recipientUserIds ??
      (input.audience !== undefined && input.audience !== 'SELECTED_PLAYERS'
        ? []
        : currentRecipients);
    await this.validateRecipients(existing.campaignId, audience, recipientUserIds);
    const status = input.status ?? existing.status;
    const publishedAt = status === 'DRAFT' ? null : (existing.publishedAt ?? new Date());

    const updated = await this.database.transaction(async (transaction) => {
      const [record] = await transaction
        .update(loreEntries)
        .set({
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.audience === undefined ? {} : { audience: input.audience }),
          publishedAt,
          revision: sql`${loreEntries.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(loreEntries.id, entryId), eq(loreEntries.revision, input.expectedRevision)))
        .returning();

      if (!record) throw new ConflictException('The lore entry changed in another session');
      await this.replaceRecipients(transaction, entryId, recipientUserIds);
      return record;
    });

    this.events.publishLoreChanged(existing.campaignId);
    return this.toEntry(
      { ...updated, authorDisplayName: existing.authorDisplayName },
      recipientUserIds,
      (await this.attachments.listByEntries([entryId])).get(entryId) ?? [],
      role,
    );
  }

  public async delete(userId: string, entryId: string): Promise<void> {
    const existing = await this.loadEntry(entryId);
    if (!existing) throw new NotFoundException('Lore entry not found');
    await this.access.requireEditor(userId, existing.campaignId);
    await this.attachments.deleteForEntry(entryId);
    await this.database.delete(loreEntries).where(eq(loreEntries.id, entryId));
    this.events.publishLoreChanged(existing.campaignId);
  }

  private async loadEntry(entryId: string): Promise<LoreRecord | undefined> {
    const [record] = await this.database
      .select({
        id: loreEntries.id,
        campaignId: loreEntries.campaignId,
        authorId: loreEntries.authorId,
        title: loreEntries.title,
        content: loreEntries.content,
        category: loreEntries.category,
        isPinned: loreEntries.isPinned,
        status: loreEntries.status,
        audience: loreEntries.audience,
        revision: loreEntries.revision,
        publishedAt: loreEntries.publishedAt,
        createdAt: loreEntries.createdAt,
        updatedAt: loreEntries.updatedAt,
        authorDisplayName: users.displayName,
      })
      .from(loreEntries)
      .leftJoin(users, eq(users.id, loreEntries.authorId))
      .where(eq(loreEntries.id, entryId))
      .limit(1);
    return record;
  }

  private async loadRecipients(entryIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (entryIds.length === 0) return result;
    const records = await this.database
      .select({ entryId: loreEntryRecipients.loreEntryId, userId: loreEntryRecipients.userId })
      .from(loreEntryRecipients)
      .where(inArray(loreEntryRecipients.loreEntryId, entryIds));

    for (const record of records) {
      result.set(record.entryId, [...(result.get(record.entryId) ?? []), record.userId]);
    }
    return result;
  }

  private async validateRecipients(
    campaignId: string,
    audience: LoreAudience,
    recipientUserIds: string[],
  ): Promise<void> {
    if (audience !== 'SELECTED_PLAYERS') {
      if (recipientUserIds.length > 0) {
        throw new BadRequestException('Recipients are only allowed for selected-player lore');
      }
      return;
    }

    if (recipientUserIds.length === 0) {
      throw new BadRequestException('Select at least one player');
    }

    const uniqueIds = [...new Set(recipientUserIds)];
    const members = await this.database
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.role, 'PLAYER'),
          inArray(campaignMembers.userId, uniqueIds),
        ),
      );

    if (members.length !== uniqueIds.length) {
      throw new BadRequestException('Every lore recipient must be a player in this campaign');
    }
  }

  private async replaceRecipients(
    transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
    entryId: string,
    recipientUserIds: string[],
  ): Promise<void> {
    await transaction
      .delete(loreEntryRecipients)
      .where(eq(loreEntryRecipients.loreEntryId, entryId));
    if (recipientUserIds.length > 0) {
      await transaction
        .insert(loreEntryRecipients)
        .values(recipientUserIds.map((userId) => ({ loreEntryId: entryId, userId })));
    }
  }

  private canView(
    record: LoreRecord,
    recipients: string[],
    role: CampaignRole,
    userId: string,
  ): boolean {
    if (role !== 'PLAYER') return true;
    if (record.status !== 'PUBLISHED' || record.audience === 'MASTER') return false;
    return record.audience === 'ALL_PLAYERS' || recipients.includes(userId);
  }

  private toEntry(
    record: LoreRecord,
    recipients: string[],
    attachments: LoreAttachment[],
    role: CampaignRole,
  ): LoreEntry {
    return {
      id: record.id,
      campaignId: record.campaignId,
      title: record.title,
      content: record.content,
      category: record.category,
      isPinned: record.isPinned,
      status: record.status,
      audience: record.audience,
      recipientUserIds: role === 'PLAYER' ? [] : recipients,
      attachments,
      authorDisplayName: record.authorDisplayName,
      revision: record.revision,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
