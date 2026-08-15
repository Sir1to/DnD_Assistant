import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CampaignCharacterSheetsResponse,
  CharacterOptionsResponse,
  CharacterSheet,
  CreateCharacterSheetRequest,
  ImportCharacterSheetRequest,
  PortableCharacterSheet,
  UpdateCharacterSheetRequest,
} from '@fog-of-lore/contracts';
import { characterSheetDataSchema } from '@fog-of-lore/contracts';
import { dnd5eCharacterOptions } from '@fog-of-lore/domain';
import { and, desc, eq, sql } from 'drizzle-orm';

import { CampaignAccessService } from '../campaigns/campaign-access.service';
import { CampaignEventsService } from '../campaigns/campaign-events.service';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { campaignMembers, characterSheets, users } from '../database/schema';

type CharacterRecord = typeof characterSheets.$inferSelect & { ownerDisplayName: string };

@Injectable()
export class CharactersService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(CampaignEventsService) private readonly events: CampaignEventsService,
  ) {}

  public options(): CharacterOptionsResponse {
    return dnd5eCharacterOptions();
  }

  public async list(userId: string, campaignId: string): Promise<CampaignCharacterSheetsResponse> {
    const role = await this.access.requireMembership(userId, campaignId);
    const records = await this.database
      .select({
        id: characterSheets.id,
        campaignId: characterSheets.campaignId,
        ownerUserId: characterSheets.ownerUserId,
        createdByUserId: characterSheets.createdByUserId,
        name: characterSheets.name,
        ruleset: characterSheets.ruleset,
        data: characterSheets.data,
        revision: characterSheets.revision,
        createdAt: characterSheets.createdAt,
        updatedAt: characterSheets.updatedAt,
        ownerDisplayName: users.displayName,
      })
      .from(characterSheets)
      .innerJoin(users, eq(users.id, characterSheets.ownerUserId))
      .where(
        role === 'PLAYER'
          ? and(eq(characterSheets.campaignId, campaignId), eq(characterSheets.ownerUserId, userId))
          : eq(characterSheets.campaignId, campaignId),
      )
      .orderBy(desc(characterSheets.updatedAt));

    return { campaignId, role, sheets: records.map((record) => this.toSheet(record)) };
  }

  public async get(userId: string, sheetId: string): Promise<CharacterSheet> {
    const record = await this.load(sheetId);
    if (!record) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, record);
    return this.toSheet(record);
  }

  public async create(
    userId: string,
    campaignId: string,
    input: CreateCharacterSheetRequest,
  ): Promise<CharacterSheet> {
    const role = await this.access.requireMembership(userId, campaignId);
    const ownerUserId = role === 'PLAYER' ? userId : (input.ownerUserId ?? userId);
    await this.requireCampaignMember(campaignId, ownerUserId);

    const [created] = await this.database
      .insert(characterSheets)
      .values({
        campaignId,
        ownerUserId,
        createdByUserId: userId,
        name: input.name,
        ruleset: input.ruleset,
        data: input.data,
      })
      .returning();
    if (!created) throw new Error('Character sheet insert did not return a row');

    this.events.publishCharactersChanged(campaignId);
    const record = await this.load(created.id);
    if (!record) throw new Error('Created character sheet could not be loaded');
    return this.toSheet(record);
  }

  public async update(
    userId: string,
    sheetId: string,
    input: UpdateCharacterSheetRequest,
  ): Promise<CharacterSheet> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, existing);

    const [updated] = await this.database
      .update(characterSheets)
      .set({
        name: input.name,
        data: input.data,
        revision: sql`${characterSheets.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(characterSheets.id, sheetId), eq(characterSheets.revision, input.expectedRevision)),
      )
      .returning();
    if (!updated) throw new ConflictException('The character sheet changed in another session');

    this.events.publishCharactersChanged(existing.campaignId);
    return this.toSheet({ ...updated, ownerDisplayName: existing.ownerDisplayName });
  }

  public async delete(userId: string, sheetId: string): Promise<void> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, existing);
    await this.database.delete(characterSheets).where(eq(characterSheets.id, sheetId));
    this.events.publishCharactersChanged(existing.campaignId);
  }

  public async export(userId: string, sheetId: string): Promise<PortableCharacterSheet> {
    const sheet = await this.get(userId, sheetId);
    return {
      format: 'fog-of-lore.character-sheet',
      version: 1,
      exportedAt: new Date().toISOString(),
      ruleset: {
        id: sheet.ruleset,
        system: 'D&D 5e',
        source: 'SRD 5.2.1',
        license: 'CC-BY-4.0',
      },
      character: { name: sheet.name, data: sheet.data },
    };
  }

  public import(
    userId: string,
    campaignId: string,
    input: ImportCharacterSheetRequest,
  ): Promise<CharacterSheet> {
    return this.create(userId, campaignId, {
      name: input.sheet.character.name,
      ownerUserId: input.ownerUserId,
      ruleset: input.sheet.ruleset.id,
      data: input.sheet.character.data,
    });
  }

  private async load(sheetId: string): Promise<CharacterRecord | undefined> {
    const [record] = await this.database
      .select({
        id: characterSheets.id,
        campaignId: characterSheets.campaignId,
        ownerUserId: characterSheets.ownerUserId,
        createdByUserId: characterSheets.createdByUserId,
        name: characterSheets.name,
        ruleset: characterSheets.ruleset,
        data: characterSheets.data,
        revision: characterSheets.revision,
        createdAt: characterSheets.createdAt,
        updatedAt: characterSheets.updatedAt,
        ownerDisplayName: users.displayName,
      })
      .from(characterSheets)
      .innerJoin(users, eq(users.id, characterSheets.ownerUserId))
      .where(eq(characterSheets.id, sheetId))
      .limit(1);
    return record;
  }

  private async requireView(userId: string, record: CharacterRecord): Promise<void> {
    const role = await this.access.requireMembership(userId, record.campaignId);
    if (role === 'PLAYER' && record.ownerUserId !== userId) {
      throw new NotFoundException('Character sheet not found');
    }
  }

  private async requireCampaignMember(campaignId: string, userId: string): Promise<void> {
    const [member] = await this.database
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
      .limit(1);
    if (!member) throw new BadRequestException('Character owner must be a campaign member');
  }

  private toSheet(record: CharacterRecord): CharacterSheet {
    const parsedData = characterSheetDataSchema.safeParse(record.data);
    if (!parsedData.success || record.ruleset !== 'dnd5e-srd-5.2.1') {
      throw new BadRequestException('Stored character sheet has an unsupported format');
    }
    return {
      id: record.id,
      campaignId: record.campaignId,
      ownerUserId: record.ownerUserId,
      ownerDisplayName: record.ownerDisplayName,
      name: record.name,
      ruleset: record.ruleset,
      data: parsedData.data,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
