import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  battleCharacterRuntimeSchema,
  battleCombatantSchema,
  battleSceneSavePayloadSchema,
  type AdjustBattleHpRequest,
  type AdjustBattleResourceRequest,
  type BattleBackgroundPreset,
  type BattleCombatant,
  type BattleCombatantPreset,
  type BattleObstacle,
  type BattleScene,
  type BattleSceneShape,
  type BattleSceneObject,
  type BattleSceneSave,
  type BattleSceneSavePayload,
  type BattleSceneSnapshot,
  type BattleToken,
  type CreateBattleCombatantRequest,
  type CreateBattleObstacleRequest,
  type CreateBattleSceneObjectRequest,
  type CreateBattleSceneSaveRequest,
  type CreateBattleSceneRequest,
  type DuplicateBattleCombatantPresetRequest,
  type GenerateRandomBattleMapRequest,
  type GeneratedRandomBattleMap,
  type ImportBattleEncounterRequest,
  type ImportBattleCombatantPresetRequest,
  type ImportPortableBattleCombatantPresetRequest,
  type MoveBattleTokenRequest,
  type NextBattleTurnRequest,
  type PortableBattleCombatantPreset,
  type PlaceCharacterOnBattleRequest,
  type RandomBattleMapTerrain,
  type SaveBattleCombatantPresetRequest,
  type SaveCharacterSheetAsBattlePresetRequest,
  type UpdateBattleCombatantRequest,
  type UpdateBattleCombatantPresetRequest,
  type UpdateBattleObstacleRequest,
  type UpdateBattleSceneObjectRequest,
  type UpdateBattleSceneRequest,
  type UpdateBattleTokenRequest,
} from '@fog-of-lore/contracts';
import {
  adjustBattleHp,
  battleSystemAssetById,
  battleHpState,
  defaultBattleSystemAssetId,
  dnd5eCharacterOptions,
  generateRandomBattleMap,
  isBattlePositionInsideShape,
  type MovementObstacle,
  type BattleSystemAssetKind,
  validatePlayerMove,
} from '@fog-of-lore/domain';
import { dnd5eMonsterById } from '@fog-of-lore/domain/dnd5e-bestiary';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { projectStoredCharacterData } from '../characters/character-document';
import {
  battleCombatants,
  battleCombatantPresets,
  battleSceneObstacles,
  battleSceneObjects,
  battleSceneSaves,
  battleScenes,
  battleTokens,
  campaignMembers,
  characterSheets,
  characterRuntimeStates,
  loreAttachments,
  loreEntries,
} from '../database/schema';
import { CampaignAccessService } from './campaign-access.service';
import { CampaignEventsService } from './campaign-events.service';
import { LoreAttachmentsService } from './lore-attachments.service';
import { LoreService } from './lore.service';
import {
  decodePortableBattlePresetImage,
  encodePortableBattlePresetImage,
} from './portable-battle-preset-image';

type BattleTerrain = Exclude<RandomBattleMapTerrain, 'RANDOM'>;

type EncounterCombatantDraft = {
  name: string;
  initiative: number;
  maxHp: number;
  armorClass: number | null;
  speed: number;
  species: string;
  size: number;
};

const backgroundPresetsByTerrain: Record<
  BattleTerrain,
  readonly [BattleBackgroundPreset, BattleBackgroundPreset]
> = {
  FOREST: ['FOREST_CLEARING', 'FOREST_CREEK'],
  RUINS: ['RUINS_RUBBLE', 'RUINS_COURTYARD'],
  DUNGEON: ['DUNGEON_STONE', 'DUNGEON_DAMP'],
  CAVE: ['CAVE_CRYSTAL', 'CAVE_VOLCANIC'],
  SWAMP: ['SWAMP_MURK', 'SWAMP_REEDS'],
  DESERT: ['DESERT_DUNES', 'DESERT_SALT'],
  SNOW: ['SNOW_TUNDRA', 'SNOW_GLACIER'],
  URBAN: ['URBAN_PLAZA', 'URBAN_ROAD'],
};

@Injectable()
export class BattleService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(CampaignEventsService) private readonly events: CampaignEventsService,
    @Inject(LoreService) private readonly lore: LoreService,
    @Inject(LoreAttachmentsService) private readonly attachments: LoreAttachmentsService,
  ) {}

  public async get(userId: string, campaignId: string): Promise<BattleSceneSnapshot> {
    const role = await this.access.requireMembership(userId, campaignId);
    const [scene] = await this.database
      .select()
      .from(battleScenes)
      .where(and(eq(battleScenes.campaignId, campaignId), ne(battleScenes.status, 'ARCHIVED')))
      .orderBy(desc(battleScenes.updatedAt))
      .limit(1);
    if (!scene) {
      return {
        campaignId,
        role,
        scene: null,
        combatants: [],
        tokens: [],
        obstacles: [],
        objects: [],
      };
    }

    const combatantRecords = await this.database
      .select()
      .from(battleCombatants)
      .where(eq(battleCombatants.sceneId, scene.id))
      .orderBy(desc(battleCombatants.initiative), battleCombatants.createdAt);
    const linkedSheetIds = [
      ...new Set(combatantRecords.flatMap(({ characterSheetId }) => characterSheetId ?? [])),
    ];
    const runtimeRecords = linkedSheetIds.length
      ? await this.database
          .select()
          .from(characterRuntimeStates)
          .where(inArray(characterRuntimeStates.sheetId, linkedSheetIds))
      : [];
    const runtimesBySheetId = new Map(runtimeRecords.map((runtime) => [runtime.sheetId, runtime]));
    const tokenRecords = await this.database
      .select()
      .from(battleTokens)
      .where(eq(battleTokens.sceneId, scene.id));
    const obstacleRecords = await this.database
      .select()
      .from(battleSceneObstacles)
      .where(eq(battleSceneObstacles.sceneId, scene.id));
    const objectRecords = await this.database
      .select()
      .from(battleSceneObjects)
      .where(eq(battleSceneObjects.sceneId, scene.id));
    const objectImageMimes = await this.loadAttachmentMimes(
      scene.campaignId,
      objectRecords.flatMap(({ imageAttachmentId }) => imageAttachmentId ?? []),
    );

    if (role !== 'PLAYER') {
      return {
        campaignId,
        role,
        scene: this.toScene(scene),
        combatants: combatantRecords.map((record) =>
          this.toMasterCombatant(
            record,
            record.characterSheetId ? runtimesBySheetId.get(record.characterSheetId) : undefined,
          ),
        ),
        tokens: tokenRecords.map((record) => this.toToken(record)),
        obstacles: obstacleRecords.map((record) => this.toObstacle(record)),
        objects: objectRecords.map((record) =>
          this.toSceneObject(
            record,
            objectImageMimes.get(record.imageAttachmentId ?? '') === 'image/gif',
          ),
        ),
      };
    }

    if (scene.status !== 'LIVE') {
      return {
        campaignId,
        role,
        scene: null,
        combatants: [],
        tokens: [],
        obstacles: [],
        objects: [],
      };
    }
    const visibleCombatants = combatantRecords.filter(({ hidden }) => !hidden);
    const visibleIds = new Set(visibleCombatants.map(({ id }) => id));
    return {
      campaignId,
      role,
      scene: this.toScene(scene),
      combatants: visibleCombatants.map((record) => this.toPlayerCombatant(record)),
      tokens: tokenRecords
        .filter(({ combatantId }) => visibleIds.has(combatantId))
        .map((record) => ({
          ...this.toToken(record),
          ownerUserId: record.ownerUserId === userId ? userId : null,
          imageAttachmentId: null,
        })),
      obstacles: obstacleRecords.map((record) => this.toObstacle(record)),
      objects: objectRecords
        .filter(({ visibleToPlayers }) => visibleToPlayers)
        .map((record) => ({
          ...this.toSceneObject(
            record,
            objectImageMimes.get(record.imageAttachmentId ?? '') === 'image/gif',
          ),
          imageAttachmentId: null,
        })),
    };
  }

  public async listSaves(userId: string, campaignId: string): Promise<BattleSceneSave[]> {
    await this.access.requireEditor(userId, campaignId);
    const saves = await this.database
      .select()
      .from(battleSceneSaves)
      .where(eq(battleSceneSaves.campaignId, campaignId))
      .orderBy(desc(battleSceneSaves.createdAt));
    return saves.map((save) => this.toSave(save));
  }

  public async listCombatantPresets(
    userId: string,
    campaignId: string,
  ): Promise<BattleCombatantPreset[]> {
    await this.access.requireEditor(userId, campaignId);
    const presets = await this.database
      .select()
      .from(battleCombatantPresets)
      .where(eq(battleCombatantPresets.campaignId, campaignId))
      .orderBy(desc(battleCombatantPresets.updatedAt), battleCombatantPresets.name);
    return presets.map((preset) => this.toCombatantPreset(preset));
  }

  public async saveScene(
    userId: string,
    sceneId: string,
    input: CreateBattleSceneSaveRequest,
  ): Promise<BattleSceneSave> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (scene.status === 'ARCHIVED') {
      throw new BadRequestException('Only an active battle scene can be saved');
    }

    const saved = await this.database.transaction(
      async (transaction) => {
        const records = await transaction
          .select({ scene: battleScenes, combatant: battleCombatants, token: battleTokens })
          .from(battleScenes)
          .leftJoin(battleCombatants, eq(battleCombatants.sceneId, battleScenes.id))
          .leftJoin(battleTokens, eq(battleTokens.combatantId, battleCombatants.id))
          .where(eq(battleScenes.id, sceneId));
        const first = records[0];
        if (!first) throw new NotFoundException('Battle scene not found');
        if (first.scene.status === 'ARCHIVED') {
          throw new BadRequestException('Only an active battle scene can be saved');
        }
        const obstacles = await transaction
          .select()
          .from(battleSceneObstacles)
          .where(eq(battleSceneObstacles.sceneId, sceneId));
        const objects = await transaction
          .select()
          .from(battleSceneObjects)
          .where(eq(battleSceneObjects.sceneId, sceneId));
        const payload = this.toSavePayload(first.scene, records, obstacles, objects);
        const [created] = await transaction
          .insert(battleSceneSaves)
          .values({
            campaignId: first.scene.campaignId,
            createdByUserId: userId,
            name: input.name,
            sourceSceneName: payload.scene.name,
            sceneStatus: payload.scene.status,
            gridColumns: payload.scene.gridColumns,
            gridRows: payload.scene.gridRows,
            combatantCount: payload.combatants.length,
            backgroundAttachmentId: first.scene.backgroundAttachmentId,
            payload,
          })
          .returning();
        if (!created) throw new Error('Battle scene save insert did not return a row');
        return created;
      },
      { isolationLevel: 'repeatable read' },
    );
    this.events.publishBattleChanged(scene.campaignId);
    return this.toSave(saved);
  }

  public async openSave(userId: string, saveId: string): Promise<BattleSceneSnapshot> {
    const save = await this.requireSave(saveId);
    await this.access.requireEditor(userId, save.campaignId);
    const payload = this.readSavePayload(save.payload);
    this.assertSavePayloadIntegrity(payload);

    await this.database.transaction(async (transaction) => {
      const ownerIds = [...new Set(payload.tokens.flatMap(({ ownerUserId }) => ownerUserId ?? []))];
      const characterSheetIds = [
        ...new Set(payload.combatants.flatMap(({ characterSheetId }) => characterSheetId ?? [])),
      ];
      const members = ownerIds.length
        ? await transaction
            .select({ userId: campaignMembers.userId })
            .from(campaignMembers)
            .where(
              and(
                eq(campaignMembers.campaignId, save.campaignId),
                eq(campaignMembers.role, 'PLAYER'),
                inArray(campaignMembers.userId, ownerIds),
              ),
            )
        : [];
      const playerIds = new Set(members.map(({ userId }) => userId));
      const characterSheetsInCampaign = characterSheetIds.length
        ? await transaction
            .select({ id: characterSheets.id })
            .from(characterSheets)
            .where(
              and(
                eq(characterSheets.campaignId, save.campaignId),
                inArray(characterSheets.id, characterSheetIds),
              ),
            )
        : [];
      const validCharacterSheetIds = new Set(characterSheetsInCampaign.map(({ id }) => id));
      const validLinkedCombatantSourceIds = new Set(
        payload.combatants
          .filter(
            ({ characterSheetId }) =>
              characterSheetId !== null && validCharacterSheetIds.has(characterSheetId),
          )
          .map(({ sourceId }) => sourceId),
      );
      const visualAttachmentIds = [
        ...payload.tokens.flatMap(({ imageAttachmentId }) => imageAttachmentId ?? []),
        ...payload.objects.flatMap(({ imageAttachmentId }) => imageAttachmentId ?? []),
      ];
      const visualAttachments = visualAttachmentIds.length
        ? await transaction
            .select({ id: loreAttachments.id, mimeType: loreAttachments.mimeType })
            .from(loreAttachments)
            .innerJoin(loreEntries, eq(loreEntries.id, loreAttachments.loreEntryId))
            .where(
              and(
                eq(loreEntries.campaignId, save.campaignId),
                inArray(loreAttachments.id, visualAttachmentIds),
              ),
            )
        : [];
      const visualAttachmentMimes = new Map(
        visualAttachments.map(({ id, mimeType }) => [id, mimeType]),
      );
      const combatantKinds = new Map(
        payload.combatants.map(({ sourceId, kind }) => [sourceId, kind]),
      );

      await transaction
        .update(battleScenes)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(
          and(eq(battleScenes.campaignId, save.campaignId), ne(battleScenes.status, 'ARCHIVED')),
        );

      const [scene] = await transaction
        .insert(battleScenes)
        .values({
          campaignId: save.campaignId,
          name: payload.scene.name,
          status: payload.scene.status,
          gridColumns: payload.scene.gridColumns,
          gridRows: payload.scene.gridRows,
          shape: payload.scene.shape,
          backgroundAttachmentId: save.backgroundAttachmentId,
          terrainTheme: payload.scene.terrainTheme,
          backgroundPreset: payload.scene.backgroundPreset,
          lightingTheme: payload.scene.lightingTheme,
          weatherTheme: payload.scene.weatherTheme,
          round: payload.scene.round,
        })
        .returning({ id: battleScenes.id });
      if (!scene) throw new Error('Battle scene restore insert did not return a row');

      const combatantIds = new Map(
        payload.combatants.map(({ sourceId }) => [sourceId, globalThis.crypto.randomUUID()]),
      );
      await transaction.insert(battleCombatants).values(
        payload.combatants.map((combatant) => ({
          id: combatantIds.get(combatant.sourceId),
          sceneId: scene.id,
          characterSheetId:
            combatant.characterSheetId && validCharacterSheetIds.has(combatant.characterSheetId)
              ? combatant.characterSheetId
              : null,
          name: combatant.name,
          kind: combatant.kind,
          initiative: combatant.initiative,
          currentHp: combatant.currentHp,
          maxHp: combatant.maxHp,
          temporaryHp: combatant.temporaryHp,
          armorClass: combatant.armorClass,
          speed: combatant.speed,
          movementSpent: combatant.movementSpent,
          className: combatant.className,
          species: combatant.species,
          conditions: combatant.conditions,
          note: combatant.note,
          hidden: combatant.hidden,
          nameVisibility: combatant.nameVisibility,
          hpVisibility: combatant.hpVisibility,
          showArmorClass: combatant.showArmorClass,
          showClassName: combatant.showClassName,
          showSpecies: combatant.showSpecies,
          conditionsVisibility: combatant.conditionsVisibility,
        })),
      );
      if (payload.tokens.length) {
        await transaction.insert(battleTokens).values(
          payload.tokens.map((token) => ({
            sceneId: scene.id,
            combatantId: combatantIds.get(token.combatantSourceId)!,
            ownerUserId:
              token.ownerUserId && playerIds.has(token.ownerUserId) ? token.ownerUserId : null,
            x: token.x,
            y: token.y,
            size: token.size,
            color: token.color,
            imageAttachmentId:
              token.imageAttachmentId &&
              ['image/jpeg', 'image/png', 'image/webp'].includes(
                visualAttachmentMimes.get(token.imageAttachmentId) ?? '',
              ) &&
              (combatantKinds.get(token.combatantSourceId) !== 'PLAYER' ||
                validLinkedCombatantSourceIds.has(token.combatantSourceId))
                ? token.imageAttachmentId
                : null,
            systemAssetId:
              combatantKinds.get(token.combatantSourceId) !== 'PLAYER' &&
              this.isSystemAsset(token.systemAssetId, 'TOKEN')
                ? token.systemAssetId
                : null,
          })),
        );
      }
      if (payload.obstacles.length) {
        await transaction.insert(battleSceneObstacles).values(
          payload.obstacles.map((obstacle) => ({
            sceneId: scene.id,
            ...obstacle,
            systemAssetId: this.isSystemAsset(obstacle.systemAssetId, 'OBSTACLE')
              ? obstacle.systemAssetId
              : null,
          })),
        );
      }
      if (payload.objects.length) {
        await transaction.insert(battleSceneObjects).values(
          payload.objects.map((object) => ({
            sceneId: scene.id,
            ...object,
            imageAttachmentId:
              object.imageAttachmentId &&
              (visualAttachmentMimes.get(object.imageAttachmentId) ?? '').startsWith('image/')
                ? object.imageAttachmentId
                : null,
            systemAssetId: this.isSystemAsset(object.systemAssetId, 'PROP')
              ? object.systemAssetId
              : null,
          })),
        );
      }
      const activeCombatantId = payload.scene.activeCombatantSourceId
        ? combatantIds.get(payload.scene.activeCombatantSourceId)!
        : null;
      await transaction
        .update(battleScenes)
        .set({ activeCombatantId })
        .where(eq(battleScenes.id, scene.id));
    });

    this.events.publishBattleChanged(save.campaignId);
    return this.get(userId, save.campaignId);
  }

  public async removeSave(userId: string, saveId: string): Promise<void> {
    const save = await this.requireSave(saveId);
    await this.access.requireEditor(userId, save.campaignId);
    await this.database.delete(battleSceneSaves).where(eq(battleSceneSaves.id, saveId));
    this.events.publishBattleChanged(save.campaignId);
  }

  public async resetScene(userId: string, sceneId: string): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    await this.database.delete(battleScenes).where(eq(battleScenes.id, sceneId));
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async createScene(
    userId: string,
    campaignId: string,
    input: CreateBattleSceneRequest,
  ): Promise<BattleSceneSnapshot> {
    await this.access.requireEditor(userId, campaignId);
    const [existing] = await this.database
      .select({ id: battleScenes.id })
      .from(battleScenes)
      .where(and(eq(battleScenes.campaignId, campaignId), ne(battleScenes.status, 'ARCHIVED')))
      .limit(1);
    if (existing) throw new ConflictException('Campaign already has an active battle scene');
    await this.database.insert(battleScenes).values({ campaignId, ...input });
    this.events.publishBattleChanged(campaignId);
    return this.get(userId, campaignId);
  }

  public async generateRandomMap(
    userId: string,
    campaignId: string,
    input: GenerateRandomBattleMapRequest,
  ): Promise<GeneratedRandomBattleMap> {
    await this.access.requireEditor(userId, campaignId);
    const [existing] = await this.database
      .select({ id: battleScenes.id })
      .from(battleScenes)
      .where(and(eq(battleScenes.campaignId, campaignId), ne(battleScenes.status, 'ARCHIVED')))
      .limit(1);
    if (existing) throw new ConflictException('Campaign already has an active battle scene');

    const seed = input.seed ?? randomUUID();
    let generated: ReturnType<typeof generateRandomBattleMap>;
    try {
      generated = generateRandomBattleMap({ ...input, seed });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'The random map could not be generated',
      );
    }

    const sceneId = randomUUID();
    const combatantIds = new Map(
      generated.combatants.map((combatant) => [combatant.key, randomUUID()]),
    );
    await this.database.transaction(async (transaction) => {
      await transaction.insert(battleScenes).values({
        id: sceneId,
        campaignId,
        name: generated.scene.name,
        status: 'DRAFT',
        shape: generated.scene.shape,
        gridColumns: generated.scene.gridColumns,
        gridRows: generated.scene.gridRows,
        terrainTheme: generated.terrain,
        backgroundPreset: generatedBackgroundPreset(generated.terrain, seed),
        lightingTheme: input.lighting,
        weatherTheme: input.weather,
        activeCombatantId: null,
        round: 1,
      });
      if (generated.combatants.length) {
        await transaction.insert(battleCombatants).values(
          generated.combatants.map((combatant) => ({
            id: combatantIds.get(combatant.key)!,
            sceneId,
            name: combatant.name,
            kind: combatant.kind,
            initiative: combatant.initiative,
            currentHp: combatant.currentHp,
            maxHp: combatant.maxHp,
            armorClass: combatant.armorClass,
            speed: combatant.speed,
            hidden: false,
            nameVisibility: 'GENERIC' as const,
            hpVisibility: 'STATE' as const,
            showArmorClass: false,
            showClassName: false,
            showSpecies: false,
            conditionsVisibility: 'ALL' as const,
          })),
        );
        await transaction.insert(battleTokens).values(
          generated.tokens.map((token) => ({
            sceneId,
            combatantId: combatantIds.get(token.combatantKey)!,
            ownerUserId: null,
            imageAttachmentId: null,
            systemAssetId: token.systemAssetId,
            x: token.x,
            y: token.y,
            size: token.size,
            color: token.color,
          })),
        );
      }
      if (generated.obstacles.length) {
        await transaction
          .insert(battleSceneObstacles)
          .values(generated.obstacles.map((obstacle) => ({ sceneId, ...obstacle })));
      }
      if (generated.objects.length) {
        await transaction.insert(battleSceneObjects).values(
          generated.objects.map((object) => ({
            sceneId,
            ...object,
            imageAttachmentId: null,
            currentHp: null,
            maxHp: null,
          })),
        );
      }
    });

    this.events.publishBattleChanged(campaignId);
    const snapshot = await this.get(userId, campaignId);
    return {
      ...snapshot,
      generation: {
        seed,
        summary: generated.summary,
        terrain: generated.terrain,
        playerStart: generated.starts.players,
        enemyStart: generated.starts.enemies,
      },
    };
  }

  public async updateScene(
    userId: string,
    sceneId: string,
    input: UpdateBattleSceneRequest,
  ): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (input.backgroundAttachmentId) {
      await this.requireBackground(scene.campaignId, input.backgroundAttachmentId);
    }
    const gridColumns = input.gridColumns ?? scene.gridColumns;
    const gridRows = input.gridRows ?? scene.gridRows;
    const shape = input.shape ?? scene.shape;
    if (
      input.gridColumns !== undefined ||
      input.gridRows !== undefined ||
      input.shape !== undefined
    ) {
      const tokens = await this.database
        .select()
        .from(battleTokens)
        .where(eq(battleTokens.sceneId, scene.id));
      if (
        tokens.some(
          ({ x, y, size }) =>
            !isBattlePositionInsideShape({ gridColumns, gridRows, shape }, x, y, size),
        )
      ) {
        throw new BadRequestException('Move every token inside the new scene boundary first');
      }
      const obstacles = await this.database
        .select()
        .from(battleSceneObstacles)
        .where(eq(battleSceneObstacles.sceneId, scene.id));
      if (
        obstacles.some(
          ({ x, y, width, height }) =>
            !isBattlePositionInsideShape({ gridColumns, gridRows, shape }, x, y, width, height),
        )
      ) {
        throw new BadRequestException(
          'Move every terrain feature inside the new scene boundary first',
        );
      }
      const objects = await this.database
        .select()
        .from(battleSceneObjects)
        .where(eq(battleSceneObjects.sceneId, scene.id));
      if (
        objects.some(
          ({ x, y, width, height }) =>
            !isBattlePositionInsideShape({ gridColumns, gridRows, shape }, x, y, width, height),
        )
      ) {
        throw new BadRequestException(
          'Move every scene object inside the new scene boundary first',
        );
      }
    }

    const [updated] = await this.database
      .update(battleScenes)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.gridColumns === undefined ? {} : { gridColumns: input.gridColumns }),
        ...(input.gridRows === undefined ? {} : { gridRows: input.gridRows }),
        ...(input.shape === undefined ? {} : { shape: input.shape }),
        ...(input.backgroundAttachmentId === undefined
          ? {}
          : { backgroundAttachmentId: input.backgroundAttachmentId }),
        ...(input.terrainTheme === undefined ? {} : { terrainTheme: input.terrainTheme }),
        ...(input.backgroundPreset === undefined
          ? {}
          : { backgroundPreset: input.backgroundPreset }),
        ...(input.lightingTheme === undefined ? {} : { lightingTheme: input.lightingTheme }),
        ...(input.weatherTheme === undefined ? {} : { weatherTheme: input.weatherTheme }),
        revision: sql`${battleScenes.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(battleScenes.id, sceneId), eq(battleScenes.revision, input.expectedRevision)))
      .returning({ id: battleScenes.id });
    if (!updated) throw new ConflictException('The battle scene changed in another session');
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async addCombatant(
    userId: string,
    sceneId: string,
    input: CreateBattleCombatantRequest,
  ): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    const position =
      input.x === undefined || input.y === undefined
        ? await this.findAvailableTokenPosition(scene, input.size)
        : { x: input.x, y: input.y };
    this.assertInsideScene(scene, position.x, position.y, input.size);
    await this.assertNotBlocked(scene, position.x, position.y, input.size);
    if (input.currentHp > input.maxHp) {
      throw new BadRequestException('Current HP cannot exceed maximum HP');
    }
    if (input.ownerUserId) await this.requirePlayer(scene.campaignId, input.ownerUserId);
    if (input.imageAttachmentId) {
      if (input.kind === 'PLAYER') {
        throw new BadRequestException('Player tokens use color circles and cannot have images');
      }
      await this.requireBattleImage(scene.campaignId, input.imageAttachmentId, false);
    }
    if (input.systemAssetId) {
      if (input.kind === 'PLAYER') {
        throw new BadRequestException('Player tokens use color circles and cannot have images');
      }
      this.requireSystemAsset(input.systemAssetId, 'TOKEN');
    }
    const tokenColor = await this.allocateTokenColor(sceneId, input.color);

    await this.database.transaction(async (transaction) => {
      const [combatant] = await transaction
        .insert(battleCombatants)
        .values({
          sceneId,
          name: input.name,
          kind: input.kind,
          initiative: input.initiative,
          currentHp: input.currentHp,
          maxHp: input.maxHp,
          armorClass: input.armorClass,
          speed: input.speed,
          className: input.className,
          species: input.species,
          conditions: input.conditions,
          hidden: input.hidden,
          nameVisibility: input.nameVisibility,
          hpVisibility: input.hpVisibility,
          showArmorClass: input.showArmorClass,
          showClassName: input.showClassName,
          showSpecies: input.showSpecies,
          conditionsVisibility: input.conditionsVisibility,
        })
        .returning({ id: battleCombatants.id });
      if (!combatant) throw new Error('Combatant insert did not return a row');
      await transaction.insert(battleTokens).values({
        sceneId,
        combatantId: combatant.id,
        ownerUserId: input.ownerUserId,
        x: position.x,
        y: position.y,
        size: input.size,
        color: tokenColor,
        imageAttachmentId: input.imageAttachmentId,
        systemAssetId: input.systemAssetId,
      });
    });

    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async placeCharacter(
    userId: string,
    sceneId: string,
    sheetId: string,
    input: PlaceCharacterOnBattleRequest,
  ): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    const [record] = await this.database
      .select({ sheet: characterSheets, runtime: characterRuntimeStates })
      .from(characterSheets)
      .leftJoin(characterRuntimeStates, eq(characterRuntimeStates.sheetId, characterSheets.id))
      .where(eq(characterSheets.id, sheetId))
      .limit(1);
    if (!record || record.sheet.campaignId !== scene.campaignId) {
      throw new NotFoundException('Character sheet not found');
    }
    const [existing] = await this.database
      .select({ id: battleCombatants.id })
      .from(battleCombatants)
      .where(
        and(eq(battleCombatants.sceneId, sceneId), eq(battleCombatants.characterSheetId, sheetId)),
      )
      .limit(1);
    if (existing) throw new ConflictException('This character is already on the battle scene');

    const data = projectStoredCharacterData(record.sheet.data, record.sheet.documentVersion);
    if (!data || record.sheet.ruleset !== 'dnd5e-srd-5.2.1') {
      throw new BadRequestException('Character sheet has an unsupported format');
    }
    const position =
      input.x === undefined || input.y === undefined
        ? await this.findAvailableTokenPosition(scene, input.size)
        : { x: input.x, y: input.y };
    this.assertInsideScene(scene, position.x, position.y, input.size);
    await this.assertNotBlocked(scene, position.x, position.y, input.size);
    const tokenColor = await this.allocateTokenColor(sceneId, input.color);
    const options = dnd5eCharacterOptions();
    const className = options.classes.find(({ id }) => id === data.classId)?.name ?? data.classId;
    const species = options.species.find(({ id }) => id === data.speciesId)?.name ?? data.speciesId;
    const maxHp = Math.max(1, data.hitPoints);
    const currentHp = Math.min(record.runtime?.currentHitPoints ?? maxHp, maxHp);
    const parsedConditions = battleCombatantSchema.shape.conditions.safeParse(
      record.runtime?.conditions ?? [],
    );
    const conditions = parsedConditions.success ? parsedConditions.data : [];
    const ownerUserId = (await this.isPlayer(scene.campaignId, record.sheet.ownerUserId))
      ? record.sheet.ownerUserId
      : null;

    await this.database.transaction(async (transaction) => {
      const [combatant] = await transaction
        .insert(battleCombatants)
        .values({
          sceneId,
          characterSheetId: sheetId,
          name: record.sheet.name,
          kind: 'PLAYER',
          initiative: input.initiative ?? Math.floor((data.abilities.dexterity - 10) / 2),
          currentHp,
          maxHp,
          temporaryHp: record.runtime?.temporaryHitPoints ?? 0,
          armorClass: data.armorClass,
          speed: Math.min(100, Math.ceil(data.speed / 5)),
          className,
          species,
          conditions,
          hidden: false,
          nameVisibility: 'EXACT',
          hpVisibility: 'EXACT',
          showArmorClass: true,
          showClassName: true,
          showSpecies: true,
          conditionsVisibility: 'ALL',
        })
        .returning({ id: battleCombatants.id });
      if (!combatant) throw new Error('Combatant insert did not return a row');
      await transaction.insert(battleTokens).values({
        sceneId,
        combatantId: combatant.id,
        ownerUserId,
        imageAttachmentId: record.sheet.portraitAssetId,
        systemAssetId: null,
        x: position.x,
        y: position.y,
        size: input.size,
        color: tokenColor,
      });
    });

    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async importEncounter(
    userId: string,
    campaignId: string,
    input: ImportBattleEncounterRequest,
  ): Promise<BattleSceneSnapshot> {
    await this.access.requireEditor(userId, campaignId);
    const [scene] = await this.database
      .select()
      .from(battleScenes)
      .where(and(eq(battleScenes.campaignId, campaignId), ne(battleScenes.status, 'ARCHIVED')))
      .orderBy(desc(battleScenes.updatedAt))
      .limit(1);
    if (!scene) {
      throw new BadRequestException('Create a battle scene before importing an encounter');
    }

    const drafts = input.opponents.flatMap((opponent): EncounterCombatantDraft[] => {
      if (opponent.source === 'CUSTOM') {
        return Array.from({ length: opponent.count }, (_, index) => ({
          name: this.numberedEncounterName(opponent.name, opponent.count, index),
          initiative: opponent.initiative,
          maxHp: opponent.maxHp,
          armorClass: opponent.armorClass,
          speed: opponent.speed,
          species: '',
          size: opponent.size,
        }));
      }

      const monster = dnd5eMonsterById(opponent.monsterId);
      if (!monster) throw new BadRequestException(`Unknown SRD monster: ${opponent.monsterId}`);
      const movementSpeeds = Object.values(monster.speed).filter(
        (value): value is number => typeof value === 'number',
      );
      const speedFeet =
        typeof monster.speed.walk === 'number'
          ? monster.speed.walk
          : Math.max(0, ...movementSpeeds);
      return Array.from({ length: opponent.count }, (_, index) => ({
        name: this.numberedEncounterName(monster.name, opponent.count, index),
        initiative: monster.initiativeModifier,
        maxHp: monster.hitPoints,
        armorClass: monster.armorClass,
        speed: Math.min(100, Math.ceil(speedFeet / 5)),
        species: monster.type,
        size: this.battleSizeForMonster(monster.size),
      }));
    });

    const [obstacles, objects, existingTokens] = await Promise.all([
      this.database
        .select()
        .from(battleSceneObstacles)
        .where(eq(battleSceneObstacles.sceneId, scene.id)),
      this.database
        .select()
        .from(battleSceneObjects)
        .where(eq(battleSceneObjects.sceneId, scene.id)),
      this.database.select().from(battleTokens).where(eq(battleTokens.sceneId, scene.id)),
    ]);
    const blockingTerrain = [
      ...obstacles.filter(({ kind }) => kind !== 'DIFFICULT_TERRAIN'),
      ...this.toBlockingObjects(objects),
    ];
    const occupied = existingTokens.map(({ x, y, size }) => ({ x, y, width: size, height: size }));
    const placements = drafts.map((draft) => {
      for (let y = 0; y <= scene.gridRows - draft.size; y += 1) {
        for (let x = 0; x <= scene.gridColumns - draft.size; x += 1) {
          if (!isBattlePositionInsideShape(scene, x, y, draft.size, draft.size)) continue;
          const blocked = blockingTerrain.some((item) =>
            this.rectanglesIntersect(
              x,
              y,
              draft.size,
              draft.size,
              item.x,
              item.y,
              item.width,
              item.height,
            ),
          );
          const overlapsToken = occupied.some((item) =>
            this.rectanglesIntersect(
              x,
              y,
              draft.size,
              draft.size,
              item.x,
              item.y,
              item.width,
              item.height,
            ),
          );
          if (blocked || overlapsToken) continue;
          const placement = { x, y, width: draft.size, height: draft.size };
          occupied.push(placement);
          return placement;
        }
      }
      throw new BadRequestException(
        `The current battle scene has no free space for all ${drafts.length} opponents`,
      );
    });
    const terrain = scene.terrainTheme ?? 'FOREST';

    await this.database.transaction(async (transaction) => {
      for (const [index, draft] of drafts.entries()) {
        const [combatant] = await transaction
          .insert(battleCombatants)
          .values({
            sceneId: scene.id,
            name: draft.name,
            kind: 'MONSTER',
            initiative: draft.initiative,
            currentHp: draft.maxHp,
            maxHp: draft.maxHp,
            armorClass: draft.armorClass,
            speed: draft.speed,
            className: '',
            species: draft.species,
            conditions: [],
            hidden: false,
            nameVisibility: 'EXACT',
            hpVisibility: 'STATE',
            showArmorClass: false,
            showClassName: false,
            showSpecies: false,
            conditionsVisibility: 'ALL',
          })
          .returning({ id: battleCombatants.id });
        if (!combatant) throw new Error('Encounter combatant insert did not return a row');
        const placement = placements[index]!;
        await transaction.insert(battleTokens).values({
          sceneId: scene.id,
          combatantId: combatant.id,
          ownerUserId: null,
          x: placement.x,
          y: placement.y,
          size: draft.size,
          color: '#ef5350',
          imageAttachmentId: null,
          systemAssetId: defaultBattleSystemAssetId('TOKEN', terrain, index),
        });
      }
    });

    this.events.publishBattleChanged(campaignId);
    return this.get(userId, campaignId);
  }

  public async saveCombatantPreset(
    userId: string,
    combatantId: string,
    input: SaveBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    const { combatant, scene } = await this.requireCombatant(combatantId);
    await this.access.requireEditor(userId, scene.campaignId);
    const [token] = await this.database
      .select()
      .from(battleTokens)
      .where(eq(battleTokens.combatantId, combatantId))
      .limit(1);
    if (!token) throw new NotFoundException('Battle token not found');
    const [created] = await this.database
      .insert(battleCombatantPresets)
      .values({
        campaignId: scene.campaignId,
        name: input.name ?? combatant.name,
        kind: combatant.kind,
        initiative: combatant.initiative,
        maxHp: combatant.maxHp,
        armorClass: combatant.armorClass,
        speed: combatant.speed,
        className: combatant.className,
        species: combatant.species,
        hidden: combatant.hidden,
        nameVisibility: combatant.nameVisibility,
        hpVisibility: combatant.hpVisibility,
        showArmorClass: combatant.showArmorClass,
        showClassName: combatant.showClassName,
        showSpecies: combatant.showSpecies,
        conditionsVisibility: combatant.conditionsVisibility,
        ownerUserId: token.ownerUserId,
        imageAttachmentId: combatant.kind === 'PLAYER' ? null : token.imageAttachmentId,
        systemAssetId: combatant.kind === 'PLAYER' ? null : token.systemAssetId,
        size: token.size,
        color: token.color,
      })
      .returning();
    if (!created) throw new Error('Battle combatant preset insert did not return a row');
    this.events.publishBattleChanged(scene.campaignId);
    return this.toCombatantPreset(created);
  }

  public async saveCharacterSheetAsCombatantPreset(
    userId: string,
    sheetId: string,
    input: SaveCharacterSheetAsBattlePresetRequest,
  ): Promise<BattleCombatantPreset> {
    const [sheet] = await this.database
      .select()
      .from(characterSheets)
      .where(eq(characterSheets.id, sheetId))
      .limit(1);
    if (!sheet) throw new NotFoundException('Character sheet not found');
    await this.access.requireEditor(userId, sheet.campaignId);
    const data = projectStoredCharacterData(sheet.data, sheet.documentVersion);
    if (!data || sheet.ruleset !== 'dnd5e-srd-5.2.1') {
      throw new BadRequestException('Character sheet has an unsupported format');
    }
    const options = dnd5eCharacterOptions();
    const className = options.classes.find(({ id }) => id === data.classId)?.name ?? data.classId;
    const species = options.species.find(({ id }) => id === data.speciesId)?.name ?? data.speciesId;
    const dexterityModifier = Math.floor((data.abilities.dexterity - 10) / 2);
    const ownerUserId = (await this.isPlayer(sheet.campaignId, sheet.ownerUserId))
      ? sheet.ownerUserId
      : null;
    const [created] = await this.database
      .insert(battleCombatantPresets)
      .values({
        campaignId: sheet.campaignId,
        name: input.name ?? sheet.name,
        kind: 'PLAYER',
        initiative: input.initiative ?? dexterityModifier,
        maxHp: Math.max(1, data.hitPoints),
        armorClass: data.armorClass,
        speed: Math.min(100, Math.ceil(data.speed / 5)),
        className,
        species,
        hidden: false,
        nameVisibility: 'EXACT',
        hpVisibility: 'EXACT',
        showArmorClass: true,
        showClassName: true,
        showSpecies: true,
        conditionsVisibility: 'ALL',
        ownerUserId,
        imageAttachmentId: null,
        systemAssetId: null,
        size: input.size,
        color: input.color,
      })
      .returning();
    if (!created) throw new Error('Battle combatant preset insert did not return a row');
    this.events.publishBattleChanged(sheet.campaignId);
    return this.toCombatantPreset(created);
  }

  public async updateCombatantPreset(
    userId: string,
    presetId: string,
    input: UpdateBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    const preset = await this.requireCombatantPreset(presetId);
    await this.access.requireEditor(userId, preset.campaignId);
    if (input.ownerUserId) await this.requirePlayer(preset.campaignId, input.ownerUserId);
    if (input.imageAttachmentId) {
      await this.requireBattleImage(preset.campaignId, input.imageAttachmentId, false);
    }
    if (input.systemAssetId) this.requireSystemAsset(input.systemAssetId, 'TOKEN');
    const [updated] = await this.database
      .update(battleCombatantPresets)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(battleCombatantPresets.id, presetId))
      .returning();
    if (!updated) throw new NotFoundException('Battle combatant preset not found');
    this.events.publishBattleChanged(preset.campaignId);
    return this.toCombatantPreset(updated);
  }

  public async duplicateCombatantPreset(
    userId: string,
    presetId: string,
    input: DuplicateBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    const preset = await this.requireCombatantPreset(presetId);
    await this.access.requireEditor(userId, preset.campaignId);
    const [created] = await this.database
      .insert(battleCombatantPresets)
      .values({
        campaignId: preset.campaignId,
        name: input.name ?? `${preset.name} — копия`,
        kind: preset.kind,
        initiative: preset.initiative,
        maxHp: preset.maxHp,
        armorClass: preset.armorClass,
        speed: preset.speed,
        className: preset.className,
        species: preset.species,
        hidden: preset.hidden,
        nameVisibility: preset.nameVisibility,
        hpVisibility: preset.hpVisibility,
        showArmorClass: preset.showArmorClass,
        showClassName: preset.showClassName,
        showSpecies: preset.showSpecies,
        conditionsVisibility: preset.conditionsVisibility,
        ownerUserId: preset.ownerUserId,
        imageAttachmentId: preset.kind === 'PLAYER' ? null : preset.imageAttachmentId,
        systemAssetId: preset.kind === 'PLAYER' ? null : preset.systemAssetId,
        size: preset.size,
        color: preset.color,
      })
      .returning();
    if (!created) throw new Error('Battle combatant preset insert did not return a row');
    this.events.publishBattleChanged(preset.campaignId);
    return this.toCombatantPreset(created);
  }

  public async exportCombatantPreset(
    userId: string,
    presetId: string,
  ): Promise<PortableBattleCombatantPreset> {
    const preset = await this.requireCombatantPreset(presetId);
    await this.access.requireEditor(userId, preset.campaignId);
    const image = preset.imageAttachmentId
      ? await this.attachments
          .readForBattleScene(preset.imageAttachmentId, preset.campaignId)
          .then(({ attachment, buffer }) =>
            encodePortableBattlePresetImage(attachment.originalName, attachment.mimeType, buffer),
          )
      : null;

    return {
      format: 'fog-of-lore.battle-combatant-preset',
      version: 1,
      exportedAt: new Date().toISOString(),
      preset: {
        name: preset.name,
        kind: preset.kind,
        initiative: preset.initiative,
        maxHp: preset.maxHp,
        armorClass: preset.armorClass,
        speed: preset.speed,
        className: preset.className,
        species: preset.species,
        hidden: preset.hidden,
        nameVisibility: preset.nameVisibility,
        hpVisibility: preset.hpVisibility,
        showArmorClass: preset.showArmorClass,
        showClassName: preset.showClassName,
        showSpecies: preset.showSpecies,
        conditionsVisibility: preset.conditionsVisibility,
        systemAssetId: preset.kind === 'PLAYER' ? null : preset.systemAssetId,
        size: preset.size,
        color: preset.color,
      },
      image,
    };
  }

  public async importPortableCombatantPreset(
    userId: string,
    campaignId: string,
    input: ImportPortableBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    await this.access.requireEditor(userId, campaignId);
    let importedLoreEntryId: string | null = null;
    let imageAttachmentId: string | null = null;

    if (input.preset.image) {
      const image = input.preset.image;
      const buffer = decodePortableBattlePresetImage(image);
      const entry = await this.lore.create(userId, campaignId, {
        title: `Токен · ${input.preset.preset.name}`.slice(0, 160),
        content: 'Импортировано вместе с переносимым боевым пресетом.',
        category: 'PERSON',
        isPinned: false,
        status: 'DRAFT',
        audience: 'MASTER',
        recipientUserIds: [],
      });
      importedLoreEntryId = entry.id;
      try {
        const attachment = await this.attachments.upload(userId, entry.id, {
          originalname: image.fileName,
          mimetype: image.mimeType,
          size: buffer.length,
          buffer,
        });
        imageAttachmentId = attachment.id;
      } catch (error) {
        await this.lore.delete(userId, entry.id);
        throw error;
      }
    }

    try {
      if (input.preset.preset.systemAssetId) {
        this.requireSystemAsset(input.preset.preset.systemAssetId, 'TOKEN');
      }
      const [created] = await this.database
        .insert(battleCombatantPresets)
        .values({
          campaignId,
          ...input.preset.preset,
          ownerUserId: null,
          imageAttachmentId,
          systemAssetId: imageAttachmentId ? null : input.preset.preset.systemAssetId,
        })
        .returning();
      if (!created) throw new Error('Battle combatant preset insert did not return a row');
      this.events.publishBattleChanged(campaignId);
      return this.toCombatantPreset(created);
    } catch (error) {
      if (importedLoreEntryId) await this.lore.delete(userId, importedLoreEntryId);
      throw error;
    }
  }

  public async importCombatantPreset(
    userId: string,
    sceneId: string,
    presetId: string,
    input: ImportBattleCombatantPresetRequest,
  ): Promise<BattleSceneSnapshot> {
    const [scene, preset] = await Promise.all([
      this.requireScene(sceneId),
      this.requireCombatantPreset(presetId),
    ]);
    await this.access.requireEditor(userId, scene.campaignId);
    if (preset.campaignId !== scene.campaignId) {
      throw new NotFoundException('Battle combatant preset not found');
    }
    let ownerUserId = input.ownerUserId === undefined ? preset.ownerUserId : input.ownerUserId;
    if (ownerUserId) {
      if (input.ownerUserId !== undefined) {
        await this.requirePlayer(scene.campaignId, ownerUserId);
      } else if (!(await this.isPlayer(scene.campaignId, ownerUserId))) {
        ownerUserId = null;
      }
    }
    const size = input.size ?? preset.size;
    const position =
      input.x === undefined || input.y === undefined
        ? await this.findAvailableTokenPosition(scene, size)
        : { x: input.x, y: input.y };
    this.assertInsideScene(scene, position.x, position.y, size);
    await this.assertNotBlocked(scene, position.x, position.y, size);
    if (preset.imageAttachmentId) {
      await this.requireBattleImage(scene.campaignId, preset.imageAttachmentId, false);
    }
    if (preset.systemAssetId) this.requireSystemAsset(preset.systemAssetId, 'TOKEN');
    const tokenColor = await this.allocateTokenColor(sceneId, input.color ?? preset.color);

    await this.database.transaction(async (transaction) => {
      const [combatant] = await transaction
        .insert(battleCombatants)
        .values({
          sceneId,
          name: input.name ?? preset.name,
          kind: preset.kind,
          initiative: input.initiative ?? preset.initiative,
          currentHp: input.maxHp ?? preset.maxHp,
          maxHp: input.maxHp ?? preset.maxHp,
          temporaryHp: 0,
          armorClass: input.armorClass === undefined ? preset.armorClass : input.armorClass,
          speed: input.speed ?? preset.speed,
          movementSpent: 0,
          className: input.className ?? preset.className,
          species: input.species ?? preset.species,
          conditions: [],
          hidden: preset.hidden,
          nameVisibility: preset.nameVisibility,
          hpVisibility: preset.hpVisibility,
          showArmorClass: preset.showArmorClass,
          showClassName: preset.showClassName,
          showSpecies: preset.showSpecies,
          conditionsVisibility: preset.conditionsVisibility,
        })
        .returning({ id: battleCombatants.id });
      if (!combatant) throw new Error('Combatant insert did not return a row');
      await transaction.insert(battleTokens).values({
        sceneId,
        combatantId: combatant.id,
        ownerUserId,
        imageAttachmentId: preset.kind === 'PLAYER' ? null : preset.imageAttachmentId,
        systemAssetId: preset.kind === 'PLAYER' ? null : preset.systemAssetId,
        x: position.x,
        y: position.y,
        size,
        color: tokenColor,
      });
    });

    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async removeCombatantPreset(userId: string, presetId: string): Promise<void> {
    const preset = await this.requireCombatantPreset(presetId);
    await this.access.requireEditor(userId, preset.campaignId);
    await this.database
      .delete(battleCombatantPresets)
      .where(eq(battleCombatantPresets.id, presetId));
    this.events.publishBattleChanged(preset.campaignId);
  }

  public async addObstacle(
    userId: string,
    sceneId: string,
    input: CreateBattleObstacleRequest,
  ): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (input.systemAssetId) this.requireSystemAsset(input.systemAssetId, 'OBSTACLE');
    this.assertInsideScene(scene, input.x, input.y, input.width, input.height);
    await this.database.insert(battleSceneObstacles).values({ sceneId, ...input });
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async removeObstacle(userId: string, obstacleId: string): Promise<BattleSceneSnapshot> {
    const [record] = await this.database
      .select({ obstacle: battleSceneObstacles, scene: battleScenes })
      .from(battleSceneObstacles)
      .innerJoin(battleScenes, eq(battleScenes.id, battleSceneObstacles.sceneId))
      .where(eq(battleSceneObstacles.id, obstacleId))
      .limit(1);
    if (!record) throw new NotFoundException('Battle scene obstacle not found');
    await this.access.requireEditor(userId, record.scene.campaignId);
    await this.database.delete(battleSceneObstacles).where(eq(battleSceneObstacles.id, obstacleId));
    this.events.publishBattleChanged(record.scene.campaignId);
    return this.get(userId, record.scene.campaignId);
  }

  public async updateObstacle(
    userId: string,
    obstacleId: string,
    input: UpdateBattleObstacleRequest,
  ): Promise<BattleSceneSnapshot> {
    const [record] = await this.database
      .select({ obstacle: battleSceneObstacles, scene: battleScenes })
      .from(battleSceneObstacles)
      .innerJoin(battleScenes, eq(battleScenes.id, battleSceneObstacles.sceneId))
      .where(eq(battleSceneObstacles.id, obstacleId))
      .limit(1);
    if (!record) throw new NotFoundException('Battle scene obstacle not found');
    await this.access.requireEditor(userId, record.scene.campaignId);
    if (input.systemAssetId) this.requireSystemAsset(input.systemAssetId, 'OBSTACLE');
    const [updated] = await this.database
      .update(battleSceneObstacles)
      .set({
        systemAssetId: input.systemAssetId,
        revision: sql`${battleSceneObstacles.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(battleSceneObstacles.id, obstacleId),
          eq(battleSceneObstacles.revision, input.expectedRevision),
        ),
      )
      .returning({ id: battleSceneObstacles.id });
    if (!updated) throw new ConflictException('The terrain feature changed in another session');
    this.events.publishBattleChanged(record.scene.campaignId);
    return this.get(userId, record.scene.campaignId);
  }

  public async addSceneObject(
    userId: string,
    sceneId: string,
    input: CreateBattleSceneObjectRequest,
  ): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (input.imageAttachmentId) {
      await this.requireBattleImage(scene.campaignId, input.imageAttachmentId, true);
    }
    if (input.systemAssetId) this.requireSystemAsset(input.systemAssetId, 'PROP');
    this.assertInsideScene(scene, input.x, input.y, input.width, input.height);
    if (input.blocksMovement) {
      const tokens = await this.database
        .select()
        .from(battleTokens)
        .where(eq(battleTokens.sceneId, sceneId));
      if (
        tokens.some(({ x, y, size }) =>
          this.rectanglesIntersect(x, y, size, size, input.x, input.y, input.width, input.height),
        )
      ) {
        throw new BadRequestException('A blocking object cannot overlap a token');
      }
    }
    await this.database.insert(battleSceneObjects).values({ sceneId, ...input });
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async updateSceneObject(
    userId: string,
    objectId: string,
    input: UpdateBattleSceneObjectRequest,
  ): Promise<BattleSceneSnapshot> {
    const { object, scene } = await this.requireSceneObject(objectId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (input.imageAttachmentId) {
      await this.requireBattleImage(scene.campaignId, input.imageAttachmentId, true);
    }
    if (input.systemAssetId) this.requireSystemAsset(input.systemAssetId, 'PROP');
    const nextImageAttachmentId =
      input.imageAttachmentId === undefined ? object.imageAttachmentId : input.imageAttachmentId;
    const nextSystemAssetId =
      input.systemAssetId === undefined ? object.systemAssetId : input.systemAssetId;
    if (nextImageAttachmentId && nextSystemAssetId) {
      throw new BadRequestException('Choose either a system asset or a campaign image');
    }
    if (input.blocksMovement && !object.blocksMovement) {
      const tokens = await this.database
        .select()
        .from(battleTokens)
        .where(eq(battleTokens.sceneId, scene.id));
      if (
        tokens.some(({ x, y, size }) =>
          this.rectanglesIntersect(
            x,
            y,
            size,
            size,
            object.x,
            object.y,
            object.width,
            object.height,
          ),
        )
      ) {
        throw new BadRequestException('A blocking object cannot overlap a token');
      }
    }
    const [updated] = await this.database
      .update(battleSceneObjects)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.blocksMovement === undefined ? {} : { blocksMovement: input.blocksMovement }),
        ...(input.visibleToPlayers === undefined
          ? {}
          : { visibleToPlayers: input.visibleToPlayers }),
        ...(input.showLabel === undefined ? {} : { showLabel: input.showLabel }),
        ...(input.imageAttachmentId === undefined
          ? {}
          : { imageAttachmentId: input.imageAttachmentId }),
        ...(input.systemAssetId === undefined ? {} : { systemAssetId: input.systemAssetId }),
        revision: sql`${battleSceneObjects.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(battleSceneObjects.id, objectId),
          eq(battleSceneObjects.revision, input.expectedRevision),
        ),
      )
      .returning({ id: battleSceneObjects.id });
    if (!updated) throw new ConflictException('The scene object changed in another session');
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async adjustSceneObjectHp(
    userId: string,
    objectId: string,
    input: AdjustBattleHpRequest,
  ): Promise<BattleSceneSnapshot> {
    const { object, scene } = await this.requireSceneObject(objectId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (object.currentHp === null || object.maxHp === null) {
      throw new BadRequestException('This scene object has no HP');
    }
    const hp = adjustBattleHp(object.currentHp, object.maxHp, 0, input.amount, input.mode);
    const [updated] = await this.database
      .update(battleSceneObjects)
      .set({
        currentHp: hp.currentHp,
        revision: sql`${battleSceneObjects.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(battleSceneObjects.id, objectId),
          eq(battleSceneObjects.revision, input.expectedRevision),
        ),
      )
      .returning({ id: battleSceneObjects.id });
    if (!updated) throw new ConflictException('The scene object changed in another session');
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async removeSceneObject(userId: string, objectId: string): Promise<BattleSceneSnapshot> {
    const { scene } = await this.requireSceneObject(objectId);
    await this.access.requireEditor(userId, scene.campaignId);
    await this.database.delete(battleSceneObjects).where(eq(battleSceneObjects.id, objectId));
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async updateCombatant(
    userId: string,
    combatantId: string,
    input: UpdateBattleCombatantRequest,
  ): Promise<BattleSceneSnapshot> {
    const { combatant, scene } = await this.requireCombatant(combatantId);
    await this.access.requireEditor(userId, scene.campaignId);
    const maxHp = input.maxHp ?? combatant.maxHp;
    const [updated] = await this.database
      .update(battleCombatants)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.initiative === undefined ? {} : { initiative: input.initiative }),
        ...(input.maxHp === undefined
          ? {}
          : { maxHp: input.maxHp, currentHp: Math.min(combatant.currentHp, maxHp) }),
        ...(input.armorClass === undefined ? {} : { armorClass: input.armorClass }),
        ...(input.speed === undefined ? {} : { speed: input.speed }),
        ...(input.className === undefined ? {} : { className: input.className }),
        ...(input.species === undefined ? {} : { species: input.species }),
        ...(input.conditions === undefined ? {} : { conditions: input.conditions }),
        ...(input.hidden === undefined ? {} : { hidden: input.hidden }),
        ...(input.nameVisibility === undefined ? {} : { nameVisibility: input.nameVisibility }),
        ...(input.hpVisibility === undefined ? {} : { hpVisibility: input.hpVisibility }),
        ...(input.showArmorClass === undefined ? {} : { showArmorClass: input.showArmorClass }),
        ...(input.showClassName === undefined ? {} : { showClassName: input.showClassName }),
        ...(input.showSpecies === undefined ? {} : { showSpecies: input.showSpecies }),
        ...(input.conditionsVisibility === undefined
          ? {}
          : { conditionsVisibility: input.conditionsVisibility }),
        revision: sql`${battleCombatants.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(battleCombatants.id, combatantId),
          eq(battleCombatants.revision, input.expectedRevision),
        ),
      )
      .returning({ id: battleCombatants.id });
    if (!updated) throw new ConflictException('The combatant changed in another session');
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async removeCombatant(userId: string, combatantId: string): Promise<BattleSceneSnapshot> {
    const { scene } = await this.requireCombatant(combatantId);
    await this.access.requireEditor(userId, scene.campaignId);
    await this.database.transaction(async (transaction) => {
      await transaction.delete(battleCombatants).where(eq(battleCombatants.id, combatantId));
      if (scene.activeCombatantId === combatantId) {
        await transaction
          .update(battleScenes)
          .set({ activeCombatantId: null, revision: sql`${battleScenes.revision} + 1` })
          .where(eq(battleScenes.id, scene.id));
      }
    });
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async updateToken(
    userId: string,
    tokenId: string,
    input: UpdateBattleTokenRequest,
  ): Promise<BattleSceneSnapshot> {
    const { token, combatant, scene } = await this.requireToken(tokenId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (input.imageAttachmentId) {
      if (combatant.kind === 'PLAYER') {
        throw new BadRequestException('Player tokens use color circles and cannot have images');
      }
      await this.requireBattleImage(scene.campaignId, input.imageAttachmentId, false);
    }
    if (input.systemAssetId) {
      if (combatant.kind === 'PLAYER') {
        throw new BadRequestException('Player tokens use color circles and cannot have images');
      }
      this.requireSystemAsset(input.systemAssetId, 'TOKEN');
    }
    const nextImageAttachmentId =
      input.imageAttachmentId === undefined ? token.imageAttachmentId : input.imageAttachmentId;
    const nextSystemAssetId =
      input.systemAssetId === undefined ? token.systemAssetId : input.systemAssetId;
    if (nextImageAttachmentId && nextSystemAssetId) {
      throw new BadRequestException('Choose either a system asset or a campaign image');
    }
    const [updated] = await this.database
      .update(battleTokens)
      .set({
        ...(input.imageAttachmentId === undefined
          ? {}
          : { imageAttachmentId: input.imageAttachmentId }),
        ...(input.systemAssetId === undefined ? {} : { systemAssetId: input.systemAssetId }),
        revision: sql`${battleTokens.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(battleTokens.id, tokenId), eq(battleTokens.revision, input.expectedRevision)))
      .returning({ id: battleTokens.id });
    if (!updated || token.sceneId !== scene.id) {
      throw new ConflictException('The battle token changed in another session');
    }
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async moveToken(
    userId: string,
    tokenId: string,
    input: MoveBattleTokenRequest,
  ): Promise<BattleSceneSnapshot> {
    const { token, combatant, scene } = await this.requireToken(tokenId);
    const role = await this.access.requireMembership(userId, scene.campaignId);
    this.assertInsideScene(scene, input.x, input.y, token.size);
    const obstacles = await this.database
      .select()
      .from(battleSceneObstacles)
      .where(eq(battleSceneObstacles.sceneId, scene.id));
    const objects = await this.database
      .select()
      .from(battleSceneObjects)
      .where(eq(battleSceneObjects.sceneId, scene.id));
    const movementObstacles = [...obstacles, ...this.toBlockingObjects(objects)];
    let distance = 0;
    if (role === 'PLAYER') {
      const result = validatePlayerMove({
        scene,
        combatant,
        token,
        userId,
        toX: input.x,
        toY: input.y,
        obstacles: movementObstacles,
      });
      if (!result.ok) throw new ForbiddenException(this.moveRejectionMessage(result.reason));
      distance = result.distance;
    } else {
      // Editors need to be able to reposition any token while running the encounter.
      // Player movement remains turn-, ownership-, and speed-limited above.
      await this.assertNotBlocked(scene, input.x, input.y, token.size, movementObstacles);
    }

    await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(battleTokens)
        .set({
          x: input.x,
          y: input.y,
          revision: sql`${battleTokens.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(battleTokens.id, tokenId), eq(battleTokens.revision, input.expectedRevision)))
        .returning({ id: battleTokens.id });
      if (!updated) throw new ConflictException('The token moved in another session');
      if (scene.status === 'LIVE' && distance > 0) {
        await transaction
          .update(battleCombatants)
          .set({
            movementSpent: sql`${battleCombatants.movementSpent} + ${distance}`,
            revision: sql`${battleCombatants.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(battleCombatants.id, combatant.id));
      }
    });

    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async adjustHp(
    userId: string,
    combatantId: string,
    input: AdjustBattleHpRequest,
  ): Promise<BattleSceneSnapshot> {
    const { combatant, scene } = await this.requireCombatant(combatantId);
    await this.access.requireEditor(userId, scene.campaignId);
    const hp = adjustBattleHp(
      combatant.currentHp,
      combatant.maxHp,
      combatant.temporaryHp,
      input.amount,
      input.mode,
    );
    await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(battleCombatants)
        .set({
          ...hp,
          revision: sql`${battleCombatants.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(battleCombatants.id, combatantId),
            eq(battleCombatants.revision, input.expectedRevision),
          ),
        )
        .returning({ id: battleCombatants.id });
      if (!updated) throw new ConflictException('The combatant changed in another session');

      if (combatant.characterSheetId) {
        const [runtime] = await transaction
          .update(characterRuntimeStates)
          .set({
            currentHitPoints: hp.currentHp,
            temporaryHitPoints: hp.temporaryHp,
            revision: sql`${characterRuntimeStates.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(characterRuntimeStates.sheetId, combatant.characterSheetId))
          .returning({ sheetId: characterRuntimeStates.sheetId });
        if (!runtime)
          throw new ConflictException('The character runtime changed in another session');
      }
    });
    this.events.publishBattleChanged(scene.campaignId);
    if (combatant.characterSheetId) this.events.publishCharactersChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async adjustResource(
    userId: string,
    combatantId: string,
    input: AdjustBattleResourceRequest,
  ): Promise<BattleSceneSnapshot> {
    const { combatant, scene } = await this.requireCombatant(combatantId);
    await this.access.requireEditor(userId, scene.campaignId);
    if (!combatant.characterSheetId) {
      throw new BadRequestException('Only a combatant linked to a character sheet has resources');
    }

    await this.database.transaction(async (transaction) => {
      const [runtime] = await transaction
        .select()
        .from(characterRuntimeStates)
        .where(eq(characterRuntimeStates.sheetId, combatant.characterSheetId!))
        .limit(1);
      if (!runtime) throw new ConflictException('The linked character runtime is missing');

      const field = input.pool === 'RESOURCES' ? 'resources' : 'spellSlots';
      const counters = battleCharacterRuntimeSchema.shape[field].parse(runtime[field]);
      const current = counters[input.resourceId] ?? 0;
      if (input.mode === 'SPEND' && input.amount > current) {
        throw new BadRequestException('The character does not have enough of this resource');
      }
      const next = input.mode === 'SPEND' ? current - input.amount : current + input.amount;
      if (next > 999_999) throw new BadRequestException('The resource value is too large');
      const updatedCounters = { ...counters, [input.resourceId]: next };

      const [updatedCombatant] = await transaction
        .update(battleCombatants)
        .set({ revision: sql`${battleCombatants.revision} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(battleCombatants.id, combatantId),
            eq(battleCombatants.revision, input.expectedRevision),
          ),
        )
        .returning({ id: battleCombatants.id });
      if (!updatedCombatant)
        throw new ConflictException('The combatant changed in another session');

      const [updatedRuntime] = await transaction
        .update(characterRuntimeStates)
        .set({
          [field]: updatedCounters,
          revision: sql`${characterRuntimeStates.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(characterRuntimeStates.sheetId, combatant.characterSheetId!),
            eq(characterRuntimeStates.revision, runtime.revision),
          ),
        )
        .returning({ sheetId: characterRuntimeStates.sheetId });
      if (!updatedRuntime) {
        throw new ConflictException('The character runtime changed in another session');
      }
    });

    this.events.publishBattleChanged(scene.campaignId);
    this.events.publishCharactersChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async nextTurn(
    userId: string,
    sceneId: string,
    input: NextBattleTurnRequest,
  ): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
    const combatants = await this.database
      .select()
      .from(battleCombatants)
      .where(eq(battleCombatants.sceneId, sceneId))
      .orderBy(desc(battleCombatants.initiative), battleCombatants.createdAt);
    if (combatants.length === 0) throw new BadRequestException('Add a combatant first');
    const currentIndex = combatants.findIndex(({ id }) => id === scene.activeCombatantId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % combatants.length;
    const next = combatants[nextIndex];
    if (!next) throw new Error('Next combatant is missing');
    const round = currentIndex >= 0 && nextIndex === 0 ? scene.round + 1 : scene.round;

    await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(battleScenes)
        .set({
          activeCombatantId: next.id,
          round,
          revision: sql`${battleScenes.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(battleScenes.id, sceneId), eq(battleScenes.revision, input.expectedRevision)))
        .returning({ id: battleScenes.id });
      if (!updated) throw new ConflictException('The battle scene changed in another session');
      await transaction
        .update(battleCombatants)
        .set({
          movementSpent: 0,
          revision: sql`${battleCombatants.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(battleCombatants.id, next.id));
    });
    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async background(
    userId: string,
    sceneId: string,
  ): Promise<{ campaignId: string; attachmentId: string }> {
    const scene = await this.requireScene(sceneId);
    const role = await this.access.requireMembership(userId, scene.campaignId);
    if (role === 'PLAYER' && scene.status !== 'LIVE') {
      throw new NotFoundException('Battle background not found');
    }
    if (!scene.backgroundAttachmentId) throw new NotFoundException('Battle background not found');
    return { campaignId: scene.campaignId, attachmentId: scene.backgroundAttachmentId };
  }

  public async tokenImage(
    userId: string,
    tokenId: string,
  ): Promise<{ campaignId: string; attachmentId: string }> {
    const { token, combatant, scene } = await this.requireToken(tokenId);
    const role = await this.access.requireMembership(userId, scene.campaignId);
    if (
      !token.imageAttachmentId ||
      (combatant.kind === 'PLAYER' && !combatant.characterSheetId) ||
      (role === 'PLAYER' && (scene.status !== 'LIVE' || combatant.hidden))
    ) {
      throw new NotFoundException('Battle token image not found');
    }
    return { campaignId: scene.campaignId, attachmentId: token.imageAttachmentId };
  }

  public async objectImage(
    userId: string,
    objectId: string,
  ): Promise<{ campaignId: string; attachmentId: string }> {
    const { object, scene } = await this.requireSceneObject(objectId);
    const role = await this.access.requireMembership(userId, scene.campaignId);
    if (
      !object.imageAttachmentId ||
      (role === 'PLAYER' && (scene.status !== 'LIVE' || !object.visibleToPlayers))
    ) {
      throw new NotFoundException('Battle object image not found');
    }
    return { campaignId: scene.campaignId, attachmentId: object.imageAttachmentId };
  }

  private toSavePayload(
    scene: typeof battleScenes.$inferSelect,
    records: Array<{
      scene: typeof battleScenes.$inferSelect;
      combatant: typeof battleCombatants.$inferSelect | null;
      token: typeof battleTokens.$inferSelect | null;
    }>,
    obstacles: Array<typeof battleSceneObstacles.$inferSelect>,
    objects: Array<typeof battleSceneObjects.$inferSelect>,
  ): BattleSceneSavePayload {
    if (scene.status === 'ARCHIVED') {
      throw new BadRequestException('An archived battle scene cannot be saved');
    }
    const combatants = records.flatMap(({ combatant }) => {
      if (!combatant) return [];
      return [
        {
          sourceId: combatant.id,
          characterSheetId: combatant.characterSheetId,
          name: combatant.name,
          kind: combatant.kind,
          initiative: combatant.initiative,
          currentHp: combatant.currentHp,
          maxHp: combatant.maxHp,
          temporaryHp: combatant.temporaryHp,
          armorClass: combatant.armorClass,
          speed: combatant.speed,
          movementSpent: combatant.movementSpent,
          className: combatant.className,
          species: combatant.species,
          conditions: battleCombatantSchema.shape.conditions.parse(combatant.conditions),
          note: combatant.note,
          hidden: combatant.hidden,
          nameVisibility: combatant.nameVisibility,
          hpVisibility: combatant.hpVisibility,
          showArmorClass: combatant.showArmorClass,
          showClassName: combatant.showClassName,
          showSpecies: combatant.showSpecies,
          conditionsVisibility: combatant.conditionsVisibility,
        },
      ];
    });
    const tokens = records.flatMap(({ token }) => {
      if (!token) return [];
      return [
        {
          combatantSourceId: token.combatantId,
          ownerUserId: token.ownerUserId,
          x: token.x,
          y: token.y,
          size: token.size,
          color: token.color,
          imageAttachmentId: token.imageAttachmentId,
          systemAssetId: token.systemAssetId,
        },
      ];
    });
    return battleSceneSavePayloadSchema.parse({
      version: 1,
      scene: {
        name: scene.name,
        status: scene.status,
        gridColumns: scene.gridColumns,
        gridRows: scene.gridRows,
        shape: scene.shape,
        terrainTheme: scene.terrainTheme,
        backgroundPreset: scene.backgroundPreset,
        lightingTheme: scene.lightingTheme,
        weatherTheme: scene.weatherTheme,
        activeCombatantSourceId: scene.activeCombatantId,
        round: scene.round,
      },
      combatants,
      tokens,
      obstacles: obstacles.map(({ kind, x, y, width, height, movementCost, systemAssetId }) => ({
        kind,
        x,
        y,
        width,
        height,
        movementCost,
        systemAssetId,
      })),
      objects: objects.map(
        ({
          kind,
          name,
          x,
          y,
          width,
          height,
          blocksMovement,
          visibleToPlayers,
          showLabel,
          currentHp,
          maxHp,
          imageAttachmentId,
          systemAssetId,
        }) => ({
          kind,
          name,
          x,
          y,
          width,
          height,
          blocksMovement,
          visibleToPlayers,
          showLabel,
          currentHp,
          maxHp,
          imageAttachmentId,
          systemAssetId,
        }),
      ),
    });
  }

  private readSavePayload(payload: unknown): BattleSceneSavePayload {
    const parsed = battleSceneSavePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException('Battle scene save uses an unsupported format');
    }
    return parsed.data;
  }

  private assertSavePayloadIntegrity(payload: BattleSceneSavePayload): void {
    const combatantIds = new Set(payload.combatants.map(({ sourceId }) => sourceId));
    if (combatantIds.size !== payload.combatants.length) {
      throw new BadRequestException('Battle scene save has duplicate combatants');
    }
    if (
      payload.scene.activeCombatantSourceId &&
      !combatantIds.has(payload.scene.activeCombatantSourceId)
    ) {
      throw new BadRequestException('Battle scene save has an invalid active combatant');
    }
    const tokenCombatants = new Set<string>();
    for (const token of payload.tokens) {
      if (
        !combatantIds.has(token.combatantSourceId) ||
        tokenCombatants.has(token.combatantSourceId)
      ) {
        throw new BadRequestException('Battle scene save has invalid token data');
      }
      if (!isBattlePositionInsideShape(payload.scene, token.x, token.y, token.size)) {
        throw new BadRequestException('Battle scene save has a token outside the scene boundary');
      }
      tokenCombatants.add(token.combatantSourceId);
    }
  }

  private toSave(record: typeof battleSceneSaves.$inferSelect): BattleSceneSave {
    if (record.sceneStatus === 'ARCHIVED') {
      throw new Error('Battle scene save has an invalid status');
    }
    const payload = this.readSavePayload(record.payload);
    return {
      id: record.id,
      campaignId: record.campaignId,
      name: record.name,
      sourceSceneName: record.sourceSceneName,
      sceneStatus: record.sceneStatus,
      gridColumns: record.gridColumns,
      gridRows: record.gridRows,
      combatantCount: record.combatantCount,
      hasBackground:
        record.backgroundAttachmentId !== null || payload.scene.backgroundPreset !== null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private async requireScene(sceneId: string) {
    const [scene] = await this.database
      .select()
      .from(battleScenes)
      .where(eq(battleScenes.id, sceneId))
      .limit(1);
    if (!scene) throw new NotFoundException('Battle scene not found');
    return scene;
  }

  private async requireSave(saveId: string) {
    const [save] = await this.database
      .select()
      .from(battleSceneSaves)
      .where(eq(battleSceneSaves.id, saveId))
      .limit(1);
    if (!save) throw new NotFoundException('Battle scene save not found');
    return save;
  }

  private async requireCombatantPreset(presetId: string) {
    const [preset] = await this.database
      .select()
      .from(battleCombatantPresets)
      .where(eq(battleCombatantPresets.id, presetId))
      .limit(1);
    if (!preset) throw new NotFoundException('Battle combatant preset not found');
    return preset;
  }

  private async requireCombatant(combatantId: string) {
    const [record] = await this.database
      .select({ combatant: battleCombatants, scene: battleScenes })
      .from(battleCombatants)
      .innerJoin(battleScenes, eq(battleScenes.id, battleCombatants.sceneId))
      .where(eq(battleCombatants.id, combatantId))
      .limit(1);
    if (!record) throw new NotFoundException('Battle combatant not found');
    return record;
  }

  private async requireSceneObject(objectId: string) {
    const [record] = await this.database
      .select({ object: battleSceneObjects, scene: battleScenes })
      .from(battleSceneObjects)
      .innerJoin(battleScenes, eq(battleScenes.id, battleSceneObjects.sceneId))
      .where(eq(battleSceneObjects.id, objectId))
      .limit(1);
    if (!record) throw new NotFoundException('Battle scene object not found');
    return record;
  }

  private async requireToken(tokenId: string) {
    const [record] = await this.database
      .select({ token: battleTokens, combatant: battleCombatants, scene: battleScenes })
      .from(battleTokens)
      .innerJoin(battleCombatants, eq(battleCombatants.id, battleTokens.combatantId))
      .innerJoin(battleScenes, eq(battleScenes.id, battleTokens.sceneId))
      .where(eq(battleTokens.id, tokenId))
      .limit(1);
    if (!record) throw new NotFoundException('Battle token not found');
    return record;
  }

  private async requireBackground(campaignId: string, attachmentId: string): Promise<void> {
    const [record] = await this.database
      .select({ mimeType: loreAttachments.mimeType })
      .from(loreAttachments)
      .innerJoin(loreEntries, eq(loreEntries.id, loreAttachments.loreEntryId))
      .where(and(eq(loreAttachments.id, attachmentId), eq(loreEntries.campaignId, campaignId)))
      .limit(1);
    if (!record?.mimeType.startsWith('image/')) {
      throw new BadRequestException('Select an image from this campaign Almanac');
    }
  }

  private async requirePlayer(campaignId: string, userId: string): Promise<void> {
    if (!(await this.isPlayer(campaignId, userId))) {
      throw new BadRequestException('Token owner must be a player in this campaign');
    }
  }

  private async isPlayer(campaignId: string, userId: string): Promise<boolean> {
    const [member] = await this.database
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.userId, userId),
          eq(campaignMembers.role, 'PLAYER'),
        ),
      )
      .limit(1);
    return member !== undefined;
  }

  private async loadAttachmentMimes(
    campaignId: string,
    attachmentIds: string[],
  ): Promise<Map<string, string>> {
    if (!attachmentIds.length) return new Map();
    const records = await this.database
      .select({ id: loreAttachments.id, mimeType: loreAttachments.mimeType })
      .from(loreAttachments)
      .innerJoin(loreEntries, eq(loreEntries.id, loreAttachments.loreEntryId))
      .where(
        and(
          eq(loreEntries.campaignId, campaignId),
          inArray(loreAttachments.id, [...new Set(attachmentIds)]),
        ),
      );
    return new Map(records.map(({ id, mimeType }) => [id, mimeType]));
  }

  private async allocateTokenColor(sceneId: string, preferred: string): Promise<string> {
    const records = await this.database
      .select({ color: battleTokens.color })
      .from(battleTokens)
      .where(eq(battleTokens.sceneId, sceneId));
    const used = new Set(records.map(({ color }) => color.toLowerCase()));
    if (!used.has(preferred.toLowerCase())) return preferred;
    const palette = [
      '#ef5350',
      '#42a5f5',
      '#66bb6a',
      '#ffa726',
      '#ab47bc',
      '#26c6da',
      '#ec407a',
      '#7e57c2',
      '#d4e157',
      '#8d6e63',
      '#29b6f6',
      '#ff7043',
      '#26a69a',
      '#ffca28',
      '#5c6bc0',
      '#9ccc65',
      '#f06292',
      '#78909c',
    ];
    const available = palette.find((color) => !used.has(color));
    if (available) return available;
    // Continue through the full hue range so a large board never receives a
    // color that is already in use once the short curated palette is full.
    for (let hue = 0; hue < 360; hue += 1) {
      const color = hslToHex(hue, 72, 58);
      if (!used.has(color)) return color;
    }
    // This is intentionally only a pathological fallback (over 360 distinct
    // HSL colors already on one board). Search the complete six-digit color
    // space and still guarantee a free value.
    for (let value = 0; value <= 0xffffff; value += 1) {
      const color = `#${value.toString(16).padStart(6, '0')}`;
      if (!used.has(color)) return color;
    }
    throw new BadRequestException('No unused token color is available on this board');
  }

  private numberedEncounterName(name: string, count: number, index: number): string {
    return count === 1 ? name : `${name} ${index + 1}`;
  }

  private battleSizeForMonster(size: string): number {
    switch (size) {
      case 'Large':
        return 2;
      case 'Huge':
        return 3;
      case 'Gargantuan':
        return 4;
      default:
        return 1;
    }
  }

  private async findAvailableTokenPosition(
    scene: { id: string; gridColumns: number; gridRows: number; shape: BattleSceneShape },
    size: number,
  ): Promise<{ x: number; y: number }> {
    const [obstacles, objects, tokens] = await Promise.all([
      this.database
        .select()
        .from(battleSceneObstacles)
        .where(eq(battleSceneObstacles.sceneId, scene.id)),
      this.database
        .select()
        .from(battleSceneObjects)
        .where(eq(battleSceneObjects.sceneId, scene.id)),
      this.database.select().from(battleTokens).where(eq(battleTokens.sceneId, scene.id)),
    ]);
    const movementObstacles = [
      ...obstacles,
      ...this.toBlockingObjects(objects),
    ] as MovementObstacle[];
    for (let y = 0; y <= scene.gridRows - size; y += 1) {
      for (let x = 0; x <= scene.gridColumns - size; x += 1) {
        if (!isBattlePositionInsideShape(scene, x, y, size, size)) continue;
        const blocked = movementObstacles.some(
          (obstacle) =>
            obstacle.kind !== 'DIFFICULT_TERRAIN' &&
            x < obstacle.x + obstacle.width &&
            x + size > obstacle.x &&
            y < obstacle.y + obstacle.height &&
            y + size > obstacle.y,
        );
        const occupied = tokens.some((token) =>
          this.rectanglesIntersect(x, y, size, size, token.x, token.y, token.size, token.size),
        );
        if (!blocked && !occupied) return { x, y };
      }
    }
    throw new BadRequestException('No free cell is available for this token');
  }

  private async requireBattleImage(
    campaignId: string,
    attachmentId: string,
    allowAnimated: boolean,
  ): Promise<void> {
    const [record] = await this.database
      .select({ mimeType: loreAttachments.mimeType })
      .from(loreAttachments)
      .innerJoin(loreEntries, eq(loreEntries.id, loreAttachments.loreEntryId))
      .where(and(eq(loreAttachments.id, attachmentId), eq(loreEntries.campaignId, campaignId)))
      .limit(1);
    const allowed = allowAnimated
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : ['image/jpeg', 'image/png', 'image/webp'];
    if (!record || !allowed.includes(record.mimeType)) {
      throw new BadRequestException(
        allowAnimated
          ? 'Select an image from this campaign Almanac'
          : 'Enemy token images must be JPEG, PNG or WebP from this campaign Almanac',
      );
    }
  }

  private requireSystemAsset(assetId: string, kind: BattleSystemAssetKind): void {
    const asset = battleSystemAssetById(assetId);
    if (!asset || asset.kind !== kind) {
      throw new BadRequestException(`Select a ${kind.toLowerCase()} from the built-in asset pack`);
    }
  }

  private isSystemAsset(
    assetId: string | null | undefined,
    kind: BattleSystemAssetKind,
  ): assetId is string {
    const asset = battleSystemAssetById(assetId);
    return asset?.kind === kind;
  }

  private assertInsideScene(
    scene: { gridColumns: number; gridRows: number },
    x: number,
    y: number,
    width: number,
    height = width,
  ): void {
    if (!isBattlePositionInsideShape(scene, x, y, width, height)) {
      throw new BadRequestException('Token is outside the scene boundary');
    }
  }

  private async assertNotBlocked(
    scene: { id: string },
    x: number,
    y: number,
    size: number,
    existing?: MovementObstacle[],
  ): Promise<void> {
    const obstacles: MovementObstacle[] = existing ?? [
      ...(await this.database
        .select()
        .from(battleSceneObstacles)
        .where(eq(battleSceneObstacles.sceneId, scene.id))),
      ...this.toBlockingObjects(
        await this.database
          .select()
          .from(battleSceneObjects)
          .where(eq(battleSceneObjects.sceneId, scene.id)),
      ),
    ];
    if (
      obstacles.some(
        (obstacle) =>
          obstacle.kind !== 'DIFFICULT_TERRAIN' &&
          x < obstacle.x + obstacle.width &&
          x + size > obstacle.x &&
          y < obstacle.y + obstacle.height &&
          y + size > obstacle.y,
      )
    ) {
      throw new BadRequestException('Token destination is blocked by terrain');
    }
  }

  private rectanglesIntersect(
    leftX: number,
    leftY: number,
    leftWidth: number,
    leftHeight: number,
    rightX: number,
    rightY: number,
    rightWidth: number,
    rightHeight: number,
  ): boolean {
    return (
      leftX < rightX + rightWidth &&
      leftX + leftWidth > rightX &&
      leftY < rightY + rightHeight &&
      leftY + leftHeight > rightY
    );
  }

  private toScene(record: typeof battleScenes.$inferSelect): BattleScene {
    return {
      id: record.id,
      campaignId: record.campaignId,
      name: record.name,
      status: record.status,
      gridColumns: record.gridColumns,
      gridRows: record.gridRows,
      shape: record.shape,
      backgroundAttachmentId: record.backgroundAttachmentId,
      terrainTheme: record.terrainTheme,
      backgroundPreset: record.backgroundPreset as BattleBackgroundPreset | null,
      lightingTheme: record.lightingTheme,
      weatherTheme: record.weatherTheme,
      activeCombatantId: record.activeCombatantId,
      round: record.round,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toMasterCombatant(
    record: typeof battleCombatants.$inferSelect,
    runtime?: typeof characterRuntimeStates.$inferSelect,
  ): BattleCombatant {
    return {
      id: record.id,
      sceneId: record.sceneId,
      name: record.name,
      kind: record.kind,
      initiative: record.initiative,
      currentHp: record.currentHp,
      maxHp: record.maxHp,
      hpPercent: Math.round((record.currentHp / record.maxHp) * 100),
      hpState: battleHpState(record.currentHp, record.maxHp),
      temporaryHp: record.temporaryHp,
      armorClass: record.armorClass,
      speed: record.speed,
      movementSpent: record.movementSpent,
      className: record.className || null,
      species: record.species || null,
      conditions: battleCombatantSchema.shape.conditions.parse(record.conditions),
      hidden: record.hidden,
      nameVisibility: record.nameVisibility,
      hpVisibility: record.hpVisibility,
      showArmorClass: record.showArmorClass,
      showClassName: record.showClassName,
      showSpecies: record.showSpecies,
      conditionsVisibility: record.conditionsVisibility,
      characterRuntime: runtime
        ? battleCharacterRuntimeSchema.parse({
            resources: runtime.resources,
            spellSlots: runtime.spellSlots,
            revision: runtime.revision,
          })
        : null,
      revision: record.revision,
    };
  }

  private toPlayerCombatant(record: typeof battleCombatants.$inferSelect): BattleCombatant {
    const master = this.toMasterCombatant(record);
    const exactHp = record.hpVisibility === 'EXACT';
    const hpPercent = record.hpVisibility === 'BAR';
    const hpState = record.hpVisibility === 'STATE';
    return {
      ...master,
      name:
        record.nameVisibility === 'EXACT'
          ? record.name
          : record.nameVisibility === 'GENERIC'
            ? this.genericName(record.kind)
            : null,
      currentHp: exactHp ? record.currentHp : null,
      maxHp: exactHp ? record.maxHp : null,
      temporaryHp: exactHp ? record.temporaryHp : null,
      hpPercent: hpPercent ? Math.round((record.currentHp / record.maxHp) * 20) * 5 : null,
      hpState: hpState ? battleHpState(record.currentHp, record.maxHp) : null,
      armorClass: record.showArmorClass ? record.armorClass : null,
      className: record.showClassName && record.className ? record.className : null,
      species: record.showSpecies && record.species ? record.species : null,
      conditions:
        record.conditionsVisibility === 'ALL'
          ? battleCombatantSchema.shape.conditions.parse(record.conditions)
          : [],
      characterRuntime: null,
    };
  }

  private toToken(record: typeof battleTokens.$inferSelect): BattleToken {
    return {
      id: record.id,
      sceneId: record.sceneId,
      combatantId: record.combatantId,
      ownerUserId: record.ownerUserId,
      imageAttachmentId: record.imageAttachmentId,
      systemAssetId: record.systemAssetId,
      hasImage: record.imageAttachmentId !== null || record.systemAssetId !== null,
      x: record.x,
      y: record.y,
      size: record.size,
      color: record.color,
      revision: record.revision,
    };
  }

  private toCombatantPreset(
    record: typeof battleCombatantPresets.$inferSelect,
  ): BattleCombatantPreset {
    return {
      id: record.id,
      campaignId: record.campaignId,
      name: record.name,
      kind: record.kind,
      initiative: record.initiative,
      maxHp: record.maxHp,
      armorClass: record.armorClass,
      speed: record.speed,
      className: record.className,
      species: record.species,
      hidden: record.hidden,
      nameVisibility: record.nameVisibility,
      hpVisibility: record.hpVisibility,
      showArmorClass: record.showArmorClass,
      showClassName: record.showClassName,
      showSpecies: record.showSpecies,
      conditionsVisibility: record.conditionsVisibility,
      ownerUserId: record.ownerUserId,
      imageAttachmentId: record.imageAttachmentId,
      systemAssetId: record.systemAssetId,
      hasImage: record.imageAttachmentId !== null || record.systemAssetId !== null,
      size: record.size,
      color: record.color,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toObstacle(record: typeof battleSceneObstacles.$inferSelect): BattleObstacle {
    return {
      id: record.id,
      sceneId: record.sceneId,
      kind: record.kind,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      movementCost: record.movementCost,
      systemAssetId: record.systemAssetId,
      revision: record.revision,
    };
  }

  private toSceneObject(
    record: typeof battleSceneObjects.$inferSelect,
    imageAnimated = false,
  ): BattleSceneObject {
    return {
      id: record.id,
      sceneId: record.sceneId,
      kind: record.kind,
      name: record.name,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      blocksMovement: record.blocksMovement,
      visibleToPlayers: record.visibleToPlayers,
      showLabel: record.showLabel,
      imageAttachmentId: record.imageAttachmentId,
      systemAssetId: record.systemAssetId,
      hasImage: record.imageAttachmentId !== null || record.systemAssetId !== null,
      imageAnimated,
      currentHp: record.currentHp,
      maxHp: record.maxHp,
      hpPercent:
        record.currentHp !== null && record.maxHp !== null
          ? Math.round((record.currentHp / record.maxHp) * 100)
          : null,
      hpState:
        record.currentHp !== null && record.maxHp !== null
          ? battleHpState(record.currentHp, record.maxHp)
          : null,
      revision: record.revision,
    };
  }

  private toBlockingObjects(
    objects: Array<typeof battleSceneObjects.$inferSelect>,
  ): MovementObstacle[] {
    return objects
      .filter(({ blocksMovement, currentHp }) => blocksMovement && currentHp !== 0)
      .map(({ x, y, width, height }) => ({
        kind: 'OBSTACLE',
        x,
        y,
        width,
        height,
        movementCost: 1,
      }));
  }

  private genericName(kind: (typeof battleCombatants.$inferSelect)['kind']): string {
    if (kind === 'MONSTER') return 'Неизвестное существо';
    if (kind === 'OBJECT') return 'Объект';
    if (kind === 'PLAYER') return 'Герой';
    return 'Неизвестный персонаж';
  }

  private moveRejectionMessage(reason: string): string {
    const messages: Record<string, string> = {
      SCENE_NOT_LIVE: 'Battle scene is not live',
      NOT_ACTIVE_TURN: 'Wait for your active turn',
      NOT_TOKEN_OWNER: 'You can move only your own token',
      OUT_OF_BOUNDS: 'Destination is outside the scene',
      BLOCKED: 'Destination is blocked by terrain',
      TOO_FAR: 'Destination exceeds remaining movement',
    };
    return messages[reason] ?? 'Move is not allowed';
  }
}

function generatedBackgroundPreset(terrain: BattleTerrain, seed: string): BattleBackgroundPreset {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return backgroundPresetsByTerrain[terrain][(hash >>> 0) % 2]!;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const match = l - chroma / 2;
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
