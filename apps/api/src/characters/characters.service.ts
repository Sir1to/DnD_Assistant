import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CampaignCharacterSheetsResponse,
  CharacterDocumentRevisionListResponse,
  CharacterDocumentResponse,
  CharacterDocumentV2,
  CharacterMasterCorrection,
  CharacterOptionsResponse,
  CharacterRuntimeState,
  CharacterSheet,
  CreateCharacterSheetRequest,
  ImportCharacterSheetRequest,
  PortableCharacterSheet,
  RestoreCharacterDocumentRevisionRequest,
  UpdateCharacterRuntimeRequest,
  UpdateCharacterDocumentRequest,
  UpdateCharacterSheetRequest,
} from '@fog-of-lore/contracts';
import {
  characterDocumentV2Schema,
  characterMasterCorrectionSchema,
  characterRuntimeStateSchema,
} from '@fog-of-lore/contracts';
import {
  deriveCharacterDocumentV2,
  dnd5eCharacterOptions,
  validateCharacterDocumentV2,
} from '@fog-of-lore/domain';
import { and, desc, eq, gt, sql } from 'drizzle-orm';

import { CampaignAccessService } from '../campaigns/campaign-access.service';
import { CampaignEventsService } from '../campaigns/campaign-events.service';
import {
  LoreAttachmentsService,
  type UploadedAttachment,
} from '../campaigns/lore-attachments.service';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import {
  campaignMembers,
  characterDocumentRevisions,
  characterRuntimeStates,
  characterSheets,
  users,
} from '../database/schema';
import { projectStoredCharacterData, readStoredCharacterDocument } from './character-document';

type CharacterRecord = {
  sheet: typeof characterSheets.$inferSelect;
  runtime: typeof characterRuntimeStates.$inferSelect | null;
  ownerDisplayName: string;
};

@Injectable()
export class CharactersService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(CampaignEventsService) private readonly events: CampaignEventsService,
    @Inject(LoreAttachmentsService) private readonly attachments: LoreAttachmentsService,
  ) {}

  public options(): CharacterOptionsResponse {
    return dnd5eCharacterOptions();
  }

  public async list(userId: string, campaignId: string): Promise<CampaignCharacterSheetsResponse> {
    const role = await this.access.requireMembership(userId, campaignId);
    const records = await this.database
      .select({
        sheet: characterSheets,
        runtime: characterRuntimeStates,
        ownerDisplayName: users.displayName,
      })
      .from(characterSheets)
      .innerJoin(users, eq(users.id, characterSheets.ownerUserId))
      .leftJoin(characterRuntimeStates, eq(characterRuntimeStates.sheetId, characterSheets.id))
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

    if ('document' in input) {
      if (
        role === 'PLAYER' &&
        input.document.ruleOverrides.some(({ source }) => source === 'CAMPAIGN')
      ) {
        throw new ForbiddenException('Only a game master can save campaign rule overrides');
      }
      if (input.document.ruleOverrides.some(({ source }) => source === 'LEGACY_V1')) {
        throw new BadRequestException('Legacy rule overrides cannot be used in a new character');
      }
      const overridePaths = new Set(input.document.ruleOverrides.map(({ path }) => path));
      if (overridePaths.size !== input.document.ruleOverrides.length) {
        throw new BadRequestException('A derived field can only have one rule override');
      }
      const issues = validateCharacterDocumentV2(input.document);
      if (input.status === 'READY' && issues.some(({ severity }) => severity === 'ERROR')) {
        throw new BadRequestException('A ready character must satisfy the selected ruleset');
      }
      const derived = deriveCharacterDocumentV2(input.document);
      const created = await this.database.transaction(async (transaction) => {
        const [sheet] = await transaction
          .insert(characterSheets)
          .values({
            campaignId,
            ownerUserId,
            createdByUserId: userId,
            name: input.name,
            ruleset: input.document.ruleset.id,
            rulesetVersion: input.document.ruleset.version,
            documentVersion: 2,
            creationMode: input.document.creation.mode,
            status: input.status,
            data: input.document,
          })
          .returning();
        if (!sheet) throw new Error('Character sheet insert did not return a row');
        await transaction.insert(characterRuntimeStates).values({
          sheetId: sheet.id,
          currentHitPoints: derived.hitPointMaximum,
        });
        await transaction.insert(characterDocumentRevisions).values({
          sheetId: sheet.id,
          documentRevision: sheet.revision,
          name: sheet.name,
          status: sheet.status,
          document: input.document,
          changedByUserId: userId,
          actorKind: revisionActorKind(role),
          kind: 'CREATED',
          summary: 'Создание листа персонажа',
        });
        return sheet;
      });

      this.events.publishCharactersChanged(campaignId);
      const record = await this.load(created.id);
      if (!record) throw new Error('Created character sheet could not be loaded');
      return this.toSheet(record);
    }

    const created = await this.database.transaction(async (transaction) => {
      const [sheet] = await transaction
        .insert(characterSheets)
        .values({
          campaignId,
          ownerUserId,
          createdByUserId: userId,
          name: input.name,
          ruleset: input.ruleset,
          creationMode: input.creationMode ?? 'MANUAL',
          data: input.data,
        })
        .returning();
      if (!sheet) throw new Error('Character sheet insert did not return a row');
      await transaction.insert(characterRuntimeStates).values({
        sheetId: sheet.id,
        currentHitPoints: input.data.hitPoints,
      });
      return sheet;
    });
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
    if (existing.sheet.documentVersion !== 1) {
      throw new ConflictException('This character requires the version 2 editor');
    }

    const previousData = projectStoredCharacterData(
      existing.sheet.data,
      existing.sheet.documentVersion,
    );
    const [updated] = await this.database.transaction(async (transaction) => {
      const rows = await transaction
        .update(characterSheets)
        .set({
          name: input.name,
          data: input.data,
          revision: sql`${characterSheets.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(characterSheets.id, sheetId),
            eq(characterSheets.revision, input.expectedRevision),
          ),
        )
        .returning();
      if (rows[0] && previousData && input.data.hitPoints < previousData.hitPoints) {
        await transaction
          .update(characterRuntimeStates)
          .set({
            currentHitPoints: sql`least(${characterRuntimeStates.currentHitPoints}, ${input.data.hitPoints})`,
            revision: sql`${characterRuntimeStates.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(characterRuntimeStates.sheetId, sheetId),
              gt(characterRuntimeStates.currentHitPoints, input.data.hitPoints),
            ),
          );
      }
      return rows;
    });
    if (!updated) throw new ConflictException('The character sheet changed in another session');

    this.events.publishCharactersChanged(existing.sheet.campaignId);
    const record = await this.load(updated.id);
    if (!record) throw new Error('Updated character sheet could not be loaded');
    return this.toSheet(record);
  }

  public async getDocument(userId: string, sheetId: string): Promise<CharacterDocumentResponse> {
    const record = await this.load(sheetId);
    if (!record) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, record);
    return this.toDocument(record);
  }

  public async updateDocument(
    userId: string,
    sheetId: string,
    input: UpdateCharacterDocumentRequest,
  ): Promise<CharacterDocumentResponse> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    const role = await this.requireView(userId, existing);
    const currentDocument = readStoredCharacterDocument(
      existing.sheet.data,
      existing.sheet.documentVersion,
      existing.sheet.creationMode,
    );
    if (!currentDocument) {
      throw new BadRequestException('Stored character sheet has an unsupported format');
    }
    if (
      role === 'PLAYER' &&
      input.document.ruleOverrides.some(({ source }) => source === 'CAMPAIGN')
    ) {
      throw new ForbiddenException('Only a game master can save campaign rule overrides');
    }
    const legacyOverrides = new Set(
      currentDocument.ruleOverrides
        .filter(({ source }) => source === 'LEGACY_V1')
        .map(overrideIdentity),
    );
    if (
      input.document.ruleOverrides.some(
        (override) =>
          override.source === 'LEGACY_V1' && !legacyOverrides.has(overrideIdentity(override)),
      )
    ) {
      throw new BadRequestException('Legacy rule overrides cannot be created or changed');
    }
    const overridePaths = new Set(input.document.ruleOverrides.map(({ path }) => path));
    if (overridePaths.size !== input.document.ruleOverrides.length) {
      throw new BadRequestException('A derived field can only have one rule override');
    }

    const issues = validateCharacterDocumentV2(input.document);
    if (input.status === 'READY' && issues.some(({ severity }) => severity === 'ERROR')) {
      throw new BadRequestException('A ready character must satisfy the selected ruleset');
    }
    const derived = deriveCharacterDocumentV2(input.document);
    const changedPaths = changedCharacterDocumentPaths(
      currentDocument,
      input.document,
      existing.sheet.name,
      input.name,
      existing.sheet.status,
      input.status,
    );
    const changedAt = new Date();
    const nextRevision = existing.sheet.revision + 1;
    const masterCorrections = updateMasterCorrections(
      existing.sheet.masterCorrections,
      changedPaths,
      role !== 'PLAYER' && existing.sheet.ownerUserId !== userId
        ? { userId, changedAt, revision: nextRevision }
        : undefined,
    );

    const [updated] = await this.database.transaction(async (transaction) => {
      const rows = await transaction
        .update(characterSheets)
        .set({
          name: input.name,
          ruleset: input.document.ruleset.id,
          rulesetVersion: input.document.ruleset.version,
          documentVersion: 2,
          creationMode: input.document.creation.mode,
          status: input.status,
          data: input.document,
          masterCorrections,
          revision: sql`${characterSheets.revision} + 1`,
          updatedAt: changedAt,
        })
        .where(
          and(
            eq(characterSheets.id, sheetId),
            eq(characterSheets.revision, input.expectedRevision),
          ),
        )
        .returning();
      if (rows[0]) {
        await transaction
          .update(characterRuntimeStates)
          .set({
            currentHitPoints: sql`least(${characterRuntimeStates.currentHitPoints}, ${derived.hitPointMaximum})`,
            revision: sql`${characterRuntimeStates.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(characterRuntimeStates.sheetId, sheetId),
              gt(characterRuntimeStates.currentHitPoints, derived.hitPointMaximum),
            ),
          );
        await transaction.insert(characterDocumentRevisions).values({
          sheetId,
          documentRevision: rows[0].revision,
          name: rows[0].name,
          status: rows[0].status,
          document: input.document,
          masterCorrections,
          changedByUserId: userId,
          actorKind: revisionActorKind(role),
          kind: 'UPDATED',
          summary: input.changeSummary,
          createdAt: changedAt,
        });
      }
      return rows;
    });
    if (!updated) throw new ConflictException('The character sheet changed in another session');

    this.events.publishCharactersChanged(existing.sheet.campaignId);
    const record = await this.load(updated.id);
    if (!record) throw new Error('Updated character sheet could not be loaded');
    return this.toDocument(record);
  }

  public async listDocumentRevisions(
    userId: string,
    sheetId: string,
  ): Promise<CharacterDocumentRevisionListResponse> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, existing);
    const revisions = await this.database
      .select({
        revision: characterDocumentRevisions,
        changedByDisplayName: users.displayName,
      })
      .from(characterDocumentRevisions)
      .innerJoin(users, eq(users.id, characterDocumentRevisions.changedByUserId))
      .where(eq(characterDocumentRevisions.sheetId, sheetId))
      .orderBy(desc(characterDocumentRevisions.documentRevision));

    return {
      sheetId,
      currentRevision: existing.sheet.revision,
      revisions: revisions.map(({ revision, changedByDisplayName }) => ({
        id: revision.id,
        documentRevision: revision.documentRevision,
        name: revision.name,
        status: revision.status,
        actorKind: revision.actorKind,
        kind: revision.kind,
        summary: revision.summary,
        changedByUserId: revision.changedByUserId,
        changedByDisplayName,
        masterCorrectionPaths: revision.masterCorrections
          .filter(
            ({ revision: correctionRevision }) => correctionRevision === revision.documentRevision,
          )
          .map(({ path }) => path),
        createdAt: revision.createdAt.toISOString(),
      })),
    };
  }

  public async restoreDocumentRevision(
    userId: string,
    sheetId: string,
    documentRevision: number,
    input: RestoreCharacterDocumentRevisionRequest,
  ): Promise<CharacterDocumentResponse> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    const role = await this.requireView(userId, existing);
    const [source] = await this.database
      .select()
      .from(characterDocumentRevisions)
      .where(
        and(
          eq(characterDocumentRevisions.sheetId, sheetId),
          eq(characterDocumentRevisions.documentRevision, documentRevision),
        ),
      )
      .limit(1);
    if (!source) throw new NotFoundException('Character document revision not found');

    const document = characterDocumentV2Schema.parse(source.document);
    const currentDocument = readStoredCharacterDocument(
      existing.sheet.data,
      existing.sheet.documentVersion,
      existing.sheet.creationMode,
    );
    if (!currentDocument) {
      throw new BadRequestException('Stored character sheet has an unsupported format');
    }
    const issues = validateCharacterDocumentV2(document);
    if (source.status === 'READY' && issues.some(({ severity }) => severity === 'ERROR')) {
      throw new BadRequestException('The stored revision no longer satisfies the selected ruleset');
    }

    const changedAt = new Date();
    const nextRevision = existing.sheet.revision + 1;
    const changedPaths = changedCharacterDocumentPaths(
      currentDocument,
      document,
      existing.sheet.name,
      source.name,
      existing.sheet.status,
      source.status,
    );
    const masterCorrections = updateMasterCorrections(
      source.masterCorrections,
      changedPaths,
      role !== 'PLAYER' && existing.sheet.ownerUserId !== userId
        ? { userId, changedAt, revision: nextRevision }
        : undefined,
    );
    const derived = deriveCharacterDocumentV2(document);
    const [updated] = await this.database.transaction(async (transaction) => {
      const rows = await transaction
        .update(characterSheets)
        .set({
          name: source.name,
          ruleset: document.ruleset.id,
          rulesetVersion: document.ruleset.version,
          documentVersion: 2,
          creationMode: document.creation.mode,
          status: source.status,
          data: document,
          masterCorrections,
          revision: sql`${characterSheets.revision} + 1`,
          updatedAt: changedAt,
        })
        .where(
          and(
            eq(characterSheets.id, sheetId),
            eq(characterSheets.revision, input.expectedRevision),
          ),
        )
        .returning();
      if (!rows[0]) return rows;

      await transaction
        .update(characterRuntimeStates)
        .set({
          currentHitPoints: sql`least(${characterRuntimeStates.currentHitPoints}, ${derived.hitPointMaximum})`,
          revision: sql`${characterRuntimeStates.revision} + 1`,
          updatedAt: changedAt,
        })
        .where(
          and(
            eq(characterRuntimeStates.sheetId, sheetId),
            gt(characterRuntimeStates.currentHitPoints, derived.hitPointMaximum),
          ),
        );
      await transaction.insert(characterDocumentRevisions).values({
        sheetId,
        documentRevision: rows[0].revision,
        name: source.name,
        status: source.status,
        document,
        masterCorrections,
        changedByUserId: userId,
        actorKind: revisionActorKind(role),
        kind: 'RESTORED',
        summary: input.summary ?? `Восстановлена ревизия ${documentRevision}`,
        createdAt: changedAt,
      });
      return rows;
    });
    if (!updated) throw new ConflictException('The character sheet changed in another session');

    this.events.publishCharactersChanged(existing.sheet.campaignId);
    const record = await this.load(updated.id);
    if (!record) throw new Error('Restored character sheet could not be loaded');
    return this.toDocument(record);
  }

  public async updateRuntime(
    userId: string,
    sheetId: string,
    input: UpdateCharacterRuntimeRequest,
  ): Promise<CharacterRuntimeState> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, existing);
    const data = projectStoredCharacterData(existing.sheet.data, existing.sheet.documentVersion);
    if (!data) throw new BadRequestException('Stored character sheet has an unsupported format');
    if (input.currentHitPoints !== undefined && input.currentHitPoints > data.hitPoints) {
      throw new BadRequestException('Current hit points cannot exceed the character maximum');
    }

    const [updated] = await this.database
      .update(characterRuntimeStates)
      .set({
        currentHitPoints: input.currentHitPoints,
        temporaryHitPoints: input.temporaryHitPoints,
        resources: input.resources,
        spellSlots: input.spellSlots,
        conditions: input.conditions,
        inspiration: input.inspiration,
        deathSaveSuccesses: input.deathSaveSuccesses,
        deathSaveFailures: input.deathSaveFailures,
        revision: sql`${characterRuntimeStates.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(characterRuntimeStates.sheetId, sheetId),
          eq(characterRuntimeStates.revision, input.expectedRevision),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException('The character runtime changed in another session');
    this.events.publishCharactersChanged(existing.sheet.campaignId);
    return this.toRuntime(updated, data.hitPoints);
  }

  public async setPortrait(
    userId: string,
    sheetId: string,
    file?: UploadedAttachment,
  ): Promise<CharacterSheet> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, existing);
    const portrait = await this.attachments.createPrivatePortrait(
      userId,
      existing.sheet.campaignId,
      existing.sheet.name,
      file,
    );
    const [updated] = await this.database
      .update(characterSheets)
      .set({
        portraitAssetId: portrait.id,
        revision: sql`${characterSheets.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(characterSheets.id, sheetId))
      .returning({ id: characterSheets.id });
    if (!updated) throw new NotFoundException('Character sheet not found');
    this.events.publishCharactersChanged(existing.sheet.campaignId);
    const record = await this.load(updated.id);
    if (!record) throw new Error('Updated character sheet could not be loaded');
    return this.toSheet(record);
  }

  public async portraitReference(
    userId: string,
    sheetId: string,
  ): Promise<{ campaignId: string; attachmentId: string }> {
    const record = await this.load(sheetId);
    if (!record) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, record);
    if (!record.sheet.portraitAssetId) throw new NotFoundException('Character portrait not found');
    return {
      campaignId: record.sheet.campaignId,
      attachmentId: record.sheet.portraitAssetId,
    };
  }

  public async delete(userId: string, sheetId: string): Promise<void> {
    const existing = await this.load(sheetId);
    if (!existing) throw new NotFoundException('Character sheet not found');
    await this.requireView(userId, existing);
    await this.database.delete(characterSheets).where(eq(characterSheets.id, sheetId));
    this.events.publishCharactersChanged(existing.sheet.campaignId);
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
        sheet: characterSheets,
        runtime: characterRuntimeStates,
        ownerDisplayName: users.displayName,
      })
      .from(characterSheets)
      .innerJoin(users, eq(users.id, characterSheets.ownerUserId))
      .leftJoin(characterRuntimeStates, eq(characterRuntimeStates.sheetId, characterSheets.id))
      .where(eq(characterSheets.id, sheetId))
      .limit(1);
    return record;
  }

  private async requireView(
    userId: string,
    record: CharacterRecord,
  ): Promise<'OWNER' | 'GM' | 'PLAYER'> {
    const role = await this.access.requireMembership(userId, record.sheet.campaignId);
    if (role === 'PLAYER' && record.sheet.ownerUserId !== userId) {
      throw new NotFoundException('Character sheet not found');
    }
    return role;
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
    const data = projectStoredCharacterData(record.sheet.data, record.sheet.documentVersion);
    if (
      !data ||
      record.sheet.ruleset !== 'dnd5e-srd-5.2.1' ||
      record.sheet.rulesetVersion !== '5.2.1'
    ) {
      throw new BadRequestException('Stored character sheet has an unsupported format');
    }
    return {
      id: record.sheet.id,
      campaignId: record.sheet.campaignId,
      ownerUserId: record.sheet.ownerUserId,
      ownerDisplayName: record.ownerDisplayName,
      name: record.sheet.name,
      ruleset: record.sheet.ruleset,
      rulesetVersion: '5.2.1',
      documentVersion: record.sheet.documentVersion as 1 | 2,
      creationMode: record.sheet.creationMode,
      status: record.sheet.status,
      portraitAssetId: record.sheet.portraitAssetId,
      data,
      runtime: this.toRuntime(record.runtime, data.hitPoints),
      revision: record.sheet.revision,
      createdAt: record.sheet.createdAt.toISOString(),
      updatedAt: record.sheet.updatedAt.toISOString(),
    };
  }

  private toDocument(record: CharacterRecord): CharacterDocumentResponse {
    const document = readStoredCharacterDocument(
      record.sheet.data,
      record.sheet.documentVersion,
      record.sheet.creationMode,
    );
    if (!document) {
      throw new BadRequestException('Stored character sheet has an unsupported format');
    }
    return {
      sheetId: record.sheet.id,
      campaignId: record.sheet.campaignId,
      ownerUserId: record.sheet.ownerUserId,
      ownerDisplayName: record.ownerDisplayName,
      name: record.sheet.name,
      status: record.sheet.status,
      storedDocumentVersion: record.sheet.documentVersion as 1 | 2,
      document,
      derived: deriveCharacterDocumentV2(document),
      issues: validateCharacterDocumentV2(document),
      masterCorrections: characterMasterCorrectionSchema
        .array()
        .parse(record.sheet.masterCorrections),
      revision: record.sheet.revision,
      updatedAt: record.sheet.updatedAt.toISOString(),
    };
  }

  private toRuntime(
    runtime: typeof characterRuntimeStates.$inferSelect | null,
    fallbackHitPoints: number,
  ): CharacterRuntimeState {
    return characterRuntimeStateSchema.parse({
      currentHitPoints: runtime?.currentHitPoints ?? fallbackHitPoints,
      temporaryHitPoints: runtime?.temporaryHitPoints ?? 0,
      resources: runtime?.resources ?? {},
      spellSlots: runtime?.spellSlots ?? {},
      conditions: runtime?.conditions ?? [],
      inspiration: runtime?.inspiration ?? false,
      deathSaveSuccesses: runtime?.deathSaveSuccesses ?? 0,
      deathSaveFailures: runtime?.deathSaveFailures ?? 0,
      revision: runtime?.revision ?? 0,
      updatedAt: (runtime?.updatedAt ?? recordFallbackDate()).toISOString(),
    });
  }
}

function recordFallbackDate(): Date {
  return new Date(0);
}

function overrideIdentity(override: {
  path: string;
  value: number;
  reason: string;
  source: string;
}): string {
  return JSON.stringify([override.path, override.value, override.reason, override.source]);
}

function revisionActorKind(role: 'OWNER' | 'GM' | 'PLAYER'): 'PLAYER' | 'GAME_MASTER' {
  return role === 'PLAYER' ? 'PLAYER' : 'GAME_MASTER';
}

export function changedCharacterDocumentPaths(
  current: CharacterDocumentV2,
  next: CharacterDocumentV2,
  currentName: string,
  nextName: string,
  currentStatus: string,
  nextStatus: string,
): string[] {
  const paths = collectChangedPaths(current, next);
  if (currentName !== nextName) paths.push('/name');
  if (currentStatus !== nextStatus) paths.push('/status');
  return [...new Set(paths)].sort();
}

function collectChangedPaths(current: unknown, next: unknown, path = ''): string[] {
  if (Object.is(current, next)) return [];
  if (Array.isArray(current) || Array.isArray(next)) {
    return JSON.stringify(current) === JSON.stringify(next) ? [] : [path || '/'];
  }
  if (isRecord(current) && isRecord(next)) {
    return [...new Set([...Object.keys(current), ...Object.keys(next)])].flatMap((key) =>
      collectChangedPaths(current[key], next[key], `${path}/${escapeJsonPointer(key)}`),
    );
  }
  return [path || '/'];
}

function updateMasterCorrections(
  current: CharacterMasterCorrection[],
  changedPaths: string[],
  master?: { userId: string; changedAt: Date; revision: number },
): CharacterMasterCorrection[] {
  const changed = new Set(changedPaths);
  const retained = characterMasterCorrectionSchema
    .array()
    .parse(current)
    .filter(({ path }) => !changed.has(path));
  if (!master) return retained;
  const correctedAt = master.changedAt.toISOString();
  return [
    ...retained,
    ...changedPaths.map((path) => ({
      path,
      correctedByUserId: master.userId,
      correctedAt,
      revision: master.revision,
    })),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
