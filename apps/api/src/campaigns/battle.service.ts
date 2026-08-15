import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  battleCombatantSchema,
  battleSceneSavePayloadSchema,
  type AdjustBattleHpRequest,
  type BattleCombatant,
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
  type MoveBattleTokenRequest,
  type NextBattleTurnRequest,
  type UpdateBattleCombatantRequest,
  type UpdateBattleSceneObjectRequest,
  type UpdateBattleSceneRequest,
  type UpdateBattleTokenRequest,
} from '@fog-of-lore/contracts';
import {
  adjustBattleHp,
  battleMovementCost,
  battleHpState,
  isBattlePositionInsideShape,
  type MovementObstacle,
  validatePlayerMove,
} from '@fog-of-lore/domain';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import {
  battleCombatants,
  battleSceneObstacles,
  battleSceneObjects,
  battleSceneSaves,
  battleScenes,
  battleTokens,
  campaignMembers,
  loreAttachments,
  loreEntries,
} from '../database/schema';
import { CampaignAccessService } from './campaign-access.service';
import { CampaignEventsService } from './campaign-events.service';

@Injectable()
export class BattleService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(CampaignEventsService) private readonly events: CampaignEventsService,
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
        combatants: combatantRecords.map((record) => this.toMasterCombatant(record)),
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
              combatantKinds.get(token.combatantSourceId) !== 'PLAYER'
                ? token.imageAttachmentId
                : null,
          })),
        );
      }
      if (payload.obstacles.length) {
        await transaction
          .insert(battleSceneObstacles)
          .values(payload.obstacles.map((obstacle) => ({ sceneId: scene.id, ...obstacle })));
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
      });
    });

    this.events.publishBattleChanged(scene.campaignId);
    return this.get(userId, scene.campaignId);
  }

  public async addObstacle(
    userId: string,
    sceneId: string,
    input: CreateBattleObstacleRequest,
  ): Promise<BattleSceneSnapshot> {
    const scene = await this.requireScene(sceneId);
    await this.access.requireEditor(userId, scene.campaignId);
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
    const [updated] = await this.database
      .update(battleTokens)
      .set({
        imageAttachmentId: input.imageAttachmentId,
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
    } else if (scene.status === 'LIVE') {
      if (scene.activeCombatantId !== combatant.id) {
        throw new ForbiddenException('Only the active combatant can move during a live scene');
      }
      const pathCost = battleMovementCost({
        scene,
        token,
        toX: input.x,
        toY: input.y,
        obstacles: movementObstacles,
      });
      if (pathCost === null) throw new BadRequestException('Destination is blocked by the terrain');
      distance = pathCost;
      if (distance > Math.max(0, combatant.speed - combatant.movementSpent)) {
        throw new ForbiddenException('This move exceeds the remaining speed');
      }
    }
    if (role !== 'PLAYER' && scene.status !== 'LIVE') {
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
    const [updated] = await this.database
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
    this.events.publishBattleChanged(scene.campaignId);
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
      combatant.kind === 'PLAYER' ||
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
        activeCombatantSourceId: scene.activeCombatantId,
        round: scene.round,
      },
      combatants,
      tokens,
      obstacles: obstacles.map(({ kind, x, y, width, height, movementCost }) => ({
        kind,
        x,
        y,
        width,
        height,
        movementCost,
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
    return {
      id: record.id,
      campaignId: record.campaignId,
      name: record.name,
      sourceSceneName: record.sourceSceneName,
      sceneStatus: record.sceneStatus,
      gridColumns: record.gridColumns,
      gridRows: record.gridRows,
      combatantCount: record.combatantCount,
      hasBackground: record.backgroundAttachmentId !== null,
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
    if (!member) throw new BadRequestException('Token owner must be a player in this campaign');
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
      '#ef5350', '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#26c6da',
      '#ec407a', '#7e57c2', '#d4e157', '#8d6e63', '#29b6f6', '#ff7043',
      '#26a69a', '#ffca28', '#5c6bc0', '#9ccc65', '#f06292', '#78909c',
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

  private async findAvailableTokenPosition(
    scene: { id: string; gridColumns: number; gridRows: number; shape: BattleSceneShape },
    size: number,
  ): Promise<{ x: number; y: number }> {
    const [obstacles, objects] = await Promise.all([
      this.database
        .select()
        .from(battleSceneObstacles)
        .where(eq(battleSceneObstacles.sceneId, scene.id)),
      this.database
        .select()
        .from(battleSceneObjects)
        .where(eq(battleSceneObjects.sceneId, scene.id)),
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
        if (!blocked) return { x, y };
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
      activeCombatantId: record.activeCombatantId,
      round: record.round,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toMasterCombatant(record: typeof battleCombatants.$inferSelect): BattleCombatant {
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
    };
  }

  private toToken(record: typeof battleTokens.$inferSelect): BattleToken {
    return {
      id: record.id,
      sceneId: record.sceneId,
      combatantId: record.combatantId,
      ownerUserId: record.ownerUserId,
      imageAttachmentId: record.imageAttachmentId,
      hasImage: record.imageAttachmentId !== null,
      x: record.x,
      y: record.y,
      size: record.size,
      color: record.color,
      revision: record.revision,
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
      hasImage: record.imageAttachmentId !== null,
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
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}
