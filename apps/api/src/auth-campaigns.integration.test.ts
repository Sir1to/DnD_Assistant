import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type {
  BoardSnapshot,
  BattleSceneSnapshot,
  CampaignDetail,
  CampaignListResponse,
  CharacterDocumentResponse,
  CharacterSheetData,
  CombatState,
  CreateWidgetResult,
  DiceState,
  CampaignLoreResponse,
  CharacterSheet,
  DirectConversation,
  DirectConversationsResponse,
  DirectMessage,
  GeneratedRandomBattleMap,
  LoreEntry,
  PortableBattleCombatantPreset,
  PortableCharacterSheet,
  TimerState,
  WidgetInstance,
} from '@fog-of-lore/contracts';
import { migrateCharacterSheetDataV1 } from '@fog-of-lore/domain';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PG_POOL } from './database/database.constants';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeIntegration = testDatabaseUrl ? describe : describe.skip;

describeIntegration('auth and campaigns API integration', () => {
  let app: INestApplication;
  let pool: Pool;
  let testFileStoragePath = '';

  beforeAll(async () => {
    testFileStoragePath = mkdtempSync(join(tmpdir(), 'fog-of-lore-integration-'));
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.FILE_STORAGE_PATH = testFileStoragePath;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.COOKIE_SECURE = 'false';
    process.env.SESSION_TTL_DAYS = '30';
    process.env.LOGIN_RATE_LIMIT_ATTEMPTS = '5';
    process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS = '900';

    const { AppModule } = await import('./app.module.js');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    pool = app.get<Pool>(PG_POOL);
  }, 30_000);

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE character_sheets, lore_entry_recipients, lore_entries, widget_placements, widget_instances, board_views, boards, campaign_invitations, campaign_members, campaigns, sessions, users RESTART IDENTITY CASCADE',
    );
  });

  it('creates, updates, exports and imports an isolated character sheet', async () => {
    const ownerCookie = await register('character-owner@example.test', 'Владелец листа');
    const strangerCookie = await register('character-stranger@example.test', 'Посторонний');
    const campaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Листы героев', description: '' })
      .expect(201);
    const campaign = campaignResponse.body as CampaignDetail;
    const data: CharacterSheetData = {
      level: 1,
      speciesId: 'human',
      classId: 'fighter',
      backgroundId: 'soldier',
      abilityMethod: 'STANDARD_ARRAY',
      abilities: {
        strength: 15,
        dexterity: 13,
        constitution: 14,
        intelligence: 8,
        wisdom: 12,
        charisma: 10,
      },
      skillIds: ['athletics', 'perception'],
      spellIds: [],
      equipment: [],
      hitPoints: 12,
      armorClass: 16,
      speed: 30,
      personality: '',
      appearance: '',
      backstory: '',
      notes: '',
    };

    const createResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/characters`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Рада', ruleset: 'dnd5e-srd-5.2.1', data })
      .expect(201);
    const created = createResponse.body as CharacterSheet;
    expect(created.ownerDisplayName).toBe('Владелец листа');
    expect(created).toMatchObject({
      rulesetVersion: '5.2.1',
      documentVersion: 1,
      creationMode: 'MANUAL',
      status: 'DRAFT',
      portraitAssetId: null,
      runtime: { currentHitPoints: 12, temporaryHitPoints: 0, revision: 0 },
    });

    const runtimeResponse = await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}/runtime`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 0, currentHitPoints: 7, temporaryHitPoints: 3 })
      .expect(200);
    expect(runtimeResponse.body).toMatchObject({
      currentHitPoints: 7,
      temporaryHitPoints: 3,
      revision: 1,
    });
    await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}/runtime`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 0, currentHitPoints: 6 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}/runtime`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 1, currentHitPoints: 13 })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/characters/${created.id}`)
      .set('Cookie', strangerCookie)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 0, name: 'Рада Серый Щит', data })
      .expect(200);
    const afterStaticUpdate = await request(app.getHttpServer())
      .get(`/api/characters/${created.id}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((afterStaticUpdate.body as CharacterSheet).runtime.currentHitPoints).toBe(7);
    await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 0, name: 'Устаревшее имя', data })
      .expect(409);

    const documentViewResponse = await request(app.getHttpServer())
      .get(`/api/characters/${created.id}/document`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const documentView = documentViewResponse.body as CharacterDocumentResponse;
    expect(documentView).toMatchObject({
      storedDocumentVersion: 1,
      revision: 1,
      document: { documentVersion: 2, creation: { mode: 'MANUAL' } },
    });

    const migrated = migrateCharacterSheetDataV1(data, 'GUIDED');
    migrated.document.identity.classId = 'unknown-class';
    await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}/document`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 1,
        name: 'Рада Серый Щит',
        status: 'READY',
        document: migrated.document,
      })
      .expect(400);
    migrated.document.identity.classId = data.classId;
    const migratedResponse = await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}/document`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 1,
        name: 'Рада Серый Щит',
        status: 'READY',
        document: migrated.document,
      })
      .expect(200);
    expect(migratedResponse.body).toMatchObject({
      storedDocumentVersion: 2,
      status: 'READY',
      revision: 2,
      document: { creation: { mode: 'GUIDED' } },
    });
    const projectedV2Response = await request(app.getHttpServer())
      .get(`/api/characters/${created.id}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(projectedV2Response.body).toMatchObject({
      documentVersion: 2,
      creationMode: 'GUIDED',
      status: 'READY',
      data,
      runtime: { currentHitPoints: 7, temporaryHitPoints: 3 },
    });

    const portraitBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const portraitResponse = await request(app.getHttpServer())
      .post(`/api/characters/${created.id}/portrait`)
      .set('Cookie', ownerCookie)
      .attach('file', portraitBytes, { filename: 'rada.png', contentType: 'image/png' })
      .expect(201);
    expect((portraitResponse.body as CharacterSheet).portraitAssetId).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .get(`/api/characters/${created.id}/portrait`)
      .set('Cookie', ownerCookie)
      .expect('Content-Type', /image\/png/)
      .expect(200);

    const sceneResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Проверка roster', gridColumns: 8, gridRows: 8 })
      .expect(201);
    const scene = sceneResponse.body as BattleSceneSnapshot;
    const placedResponse = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${scene.scene!.id}/characters/${created.id}/place`)
      .set('Cookie', ownerCookie)
      .send({ color: '#123abc', size: 1 })
      .expect(201);
    const placed = placedResponse.body as BattleSceneSnapshot;
    expect(placed.combatants[0]).toMatchObject({
      name: 'Рада Серый Щит',
      kind: 'PLAYER',
      currentHp: 7,
      maxHp: 12,
      temporaryHp: 3,
      armorClass: 16,
      speed: 6,
    });
    expect(placed.tokens[0]).toMatchObject({ color: '#123abc', hasImage: true });
    await request(app.getHttpServer())
      .get(`/api/battle-tokens/${placed.tokens[0]!.id}/image`)
      .set('Cookie', ownerCookie)
      .expect('Content-Type', /image\/png/)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/battle-scenes/${scene.scene!.id}/characters/${created.id}/place`)
      .set('Cookie', ownerCookie)
      .send({ color: '#123abc', size: 1 })
      .expect(409);

    const saveResponse = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${scene.scene!.id}/saves`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Герой с портретом' })
      .expect(201);
    const restoredResponse = await request(app.getHttpServer())
      .post(`/api/battle-scene-saves/${saveResponse.body.id as string}/open`)
      .set('Cookie', ownerCookie)
      .expect(201);
    const restored = restoredResponse.body as BattleSceneSnapshot;
    expect(restored.tokens[0]).toMatchObject({ hasImage: true });
    await request(app.getHttpServer())
      .get(`/api/battle-tokens/${restored.tokens[0]!.id}/image`)
      .set('Cookie', ownerCookie)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/characters/${created.id}`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 2, name: 'Нельзя затереть v2', data })
      .expect(409);

    const exportResponse = await request(app.getHttpServer())
      .get(`/api/characters/${created.id}/export`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const exported = exportResponse.body as PortableCharacterSheet;
    expect(exported).not.toHaveProperty('campaignId');
    expect(exported.character).not.toHaveProperty('ownerUserId');

    const importedResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/characters/import`)
      .set('Cookie', ownerCookie)
      .send({ sheet: exported })
      .expect(201);
    expect((importedResponse.body as CharacterSheet).name).toBe('Рада Серый Щит');
  });

  afterAll(async () => {
    await app?.close();
    if (testFileStoragePath) {
      rmSync(testFileStoragePath, { recursive: true, force: true });
    }
  });

  it('registers, authenticates, rotates and invalidates a session', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'Keeper@Example.Test',
        password: 'correct horse battery staple',
        displayName: 'Хранитель',
      })
      .expect(201);
    const cookie = getSessionCookie(registration.headers['set-cookie']);

    expect(registration.body.user).toMatchObject({
      email: 'keeper@example.test',
      displayName: 'Хранитель',
    });
    expect(registration.body.user).not.toHaveProperty('sessionId');

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);

    const refresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(204);
    const rotatedCookie = getSessionCookie(refresh.headers['set-cookie']);

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', rotatedCookie).expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', rotatedCookie)
      .expect(204);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', rotatedCookie).expect(401);
  });

  it('creates campaign defaults atomically and isolates another account', async () => {
    const ownerCookie = await register('owner@example.test', 'Ведущий');
    const strangerCookie = await register('stranger@example.test', 'Чужой пользователь');

    const creation = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({
        name: 'Тени над перевалом',
        description: 'Кампания для интеграционного теста.',
      })
      .expect(201);
    const campaign = creation.body as CampaignDetail;

    expect(campaign.role).toBe('OWNER');
    expect(campaign.boards).toHaveLength(1);
    expect(campaign.boards[0]?.name).toBe('Мастерская');
    expect(campaign.boards[0]?.views[0]?.slug).toBe('gm-laptop');

    const ownerList = await request(app.getHttpServer())
      .get('/api/campaigns')
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((ownerList.body as CampaignListResponse).campaigns).toHaveLength(1);

    const strangerList = await request(app.getHttpServer())
      .get('/api/campaigns')
      .set('Cookie', strangerCookie)
      .expect(200);
    expect((strangerList.body as CampaignListResponse).campaigns).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}`)
      .set('Cookie', strangerCookie)
      .expect(404);
  });

  it('runs the notes widget flow, shares it between views and rejects stale writes', async () => {
    const ownerCookie = await register('board-owner@example.test', 'Ведущий доски');
    const strangerCookie = await register('board-stranger@example.test', 'Посторонний');
    const creation = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Башня туманов', description: '' })
      .expect(201);
    const campaign = creation.body as CampaignDetail;
    const boardId = campaign.boards[0]?.id;
    const firstViewId = campaign.boards[0]?.views[0]?.id;

    expect(boardId).toBeTruthy();
    expect(firstViewId).toBeTruthy();

    const emptySnapshot = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((emptySnapshot.body as BoardSnapshot).widgets).toHaveLength(0);

    const creationResult = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/widgets`)
      .set('Cookie', ownerCookie)
      .send({
        type: 'NOTES',
        title: 'Улики',
        boardViewId: firstViewId,
        initialState: { content: 'Быстрая заметка со сцены' },
      })
      .expect(201);
    const created = creationResult.body as CreateWidgetResult;
    expect(created.widget.state).toEqual({ content: 'Быстрая заметка со сцены' });
    expect(created.placement.boardViewId).toBe(firstViewId);

    await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/widgets`)
      .set('Cookie', ownerCookie)
      .send({
        type: 'TIMER',
        boardViewId: firstViewId,
        initialState: { content: 'state injection' },
      })
      .expect(400);

    const update = await request(app.getHttpServer())
      .patch(`/api/widgets/${created.widget.id}`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 0,
        state: { content: '# След\n\nОн ведёт к старой башне.' },
      })
      .expect(200);
    expect((update.body as WidgetInstance).revision).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/widgets/${created.widget.id}`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 0, state: { content: 'Устаревшая версия' } })
      .expect(409);

    const secondView = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/views`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Экран игроков', description: '' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/views/${secondView.body.id as string}/placements`)
      .set('Cookie', ownerCookie)
      .send({ widgetInstanceId: created.widget.id, x: 0, y: 0 })
      .expect(201);

    const finalSnapshot = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const snapshot = finalSnapshot.body as BoardSnapshot;
    expect(snapshot.views).toHaveLength(2);
    expect(snapshot.placements).toHaveLength(2);
    expect(snapshot.widgets[0]?.state).toEqual({
      content: '# След\n\nОн ведёт к старой башне.',
    });

    await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Cookie', strangerCookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/widgets/${created.widget.id}`)
      .set('Cookie', strangerCookie)
      .send({ expectedRevision: 1, state: { content: 'Не должно сохраниться' } })
      .expect(404);
  });

  it('executes authoritative timer, dice and combat commands and restores their state', async () => {
    const ownerCookie = await register('tools-owner@example.test', 'Мастер инструментов');
    const campaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Инструменты сессии', description: '' })
      .expect(201);
    const campaign = campaignResponse.body as CampaignDetail;
    const boardId = campaign.boards[0]!.id;
    const viewId = campaign.boards[0]!.views[0]!.id;

    const timer = await createWidget(ownerCookie, boardId, viewId, 'TIMER');
    const startedTimer = await commandWidget(ownerCookie, timer.widget.id, {
      widgetType: 'TIMER',
      expectedRevision: 0,
      command: 'TIMER_START',
    });
    expect(startedTimer.revision).toBe(1);
    expect((startedTimer.state as TimerState).status).toBe('RUNNING');
    const pausedTimer = await commandWidget(ownerCookie, timer.widget.id, {
      widgetType: 'TIMER',
      expectedRevision: 1,
      command: 'TIMER_PAUSE',
    });
    expect((pausedTimer.state as TimerState).status).toBe('PAUSED');
    expect((pausedTimer.state as TimerState).accumulatedMs).toBeGreaterThanOrEqual(0);
    await request(app.getHttpServer())
      .post(`/api/widgets/${timer.widget.id}/commands`)
      .set('Cookie', ownerCookie)
      .send({
        widgetType: 'TIMER',
        expectedRevision: 0,
        command: 'TIMER_RESET',
      })
      .expect(409);

    const dice = await createWidget(ownerCookie, boardId, viewId, 'DICE');
    const rolledDice = await commandWidget(ownerCookie, dice.widget.id, {
      widgetType: 'DICE',
      expectedRevision: 0,
      command: 'DICE_ROLL',
      expression: '2d6+3',
    });
    const diceState = rolledDice.state as DiceState;
    expect(diceState.history[0]?.label).toBe('2d6+3');
    expect(Number(diceState.history[0]?.result)).toBeGreaterThanOrEqual(5);

    const tableSet = await commandWidget(ownerCookie, dice.widget.id, {
      widgetType: 'DICE',
      expectedRevision: 1,
      command: 'DICE_SET_TABLE',
      tableItems: ['Туман', 'След', 'Союзник'],
    });
    const tablePick = await commandWidget(ownerCookie, dice.widget.id, {
      widgetType: 'DICE',
      expectedRevision: tableSet.revision,
      command: 'DICE_PICK_TABLE',
    });
    expect(['Туман', 'След', 'Союзник']).toContain(
      (tablePick.state as DiceState).history[0]?.result,
    );

    const combat = await createWidget(ownerCookie, boardId, viewId, 'COMBAT');
    const firstParticipant = await commandWidget(ownerCookie, combat.widget.id, {
      widgetType: 'COMBAT',
      expectedRevision: 0,
      command: 'COMBAT_ADD_PARTICIPANT',
      participant: combatant('Следопыт', 'PLAYER', 17, 20),
    });
    const secondParticipant = await commandWidget(ownerCookie, combat.widget.id, {
      widgetType: 'COMBAT',
      expectedRevision: firstParticipant.revision,
      command: 'COMBAT_ADD_PARTICIPANT',
      participant: combatant('Теневой зверь', 'ENEMY', 12, 15),
    });
    const firstId = (secondParticipant.state as CombatState).participants[0]!.id;
    const turn = await commandWidget(ownerCookie, combat.widget.id, {
      widgetType: 'COMBAT',
      expectedRevision: secondParticipant.revision,
      command: 'COMBAT_NEXT_TURN',
    });
    expect((turn.state as CombatState).activeParticipantId).toBe(firstId);
    const damaged = await commandWidget(ownerCookie, combat.widget.id, {
      widgetType: 'COMBAT',
      expectedRevision: turn.revision,
      command: 'COMBAT_DAMAGE',
      participantId: firstId,
      amount: 4,
    });
    expect(
      (damaged.state as CombatState).participants.find(({ id }) => id === firstId)?.currentHp,
    ).toBe(16);

    const snapshotResponse = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const snapshot = snapshotResponse.body as BoardSnapshot;
    expect(snapshot.widgets.map(({ type }) => type)).toEqual(
      expect.arrayContaining(['TIMER', 'DICE', 'COMBAT']),
    );
    expect(snapshot.widgets.find(({ id }) => id === combat.widget.id)?.revision).toBe(
      damaged.revision,
    );
  });

  it('accepts a single-use player invitation and never exposes master-only views', async () => {
    const ownerCookie = await register('invite-owner@example.test', 'Мастер приглашений');
    const playerCookie = await register('invite-player@example.test', 'Игрок');
    const secondPlayerCookie = await register('invite-second@example.test', 'Другой игрок');
    const campaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Остров забытых имён', description: '' })
      .expect(201);
    const campaign = campaignResponse.body as CampaignDetail;
    const boardId = campaign.boards[0]!.id;
    const masterViewId = campaign.boards[0]!.views[0]!.id;

    const secretWidget = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/widgets`)
      .set('Cookie', ownerCookie)
      .send({
        type: 'NOTES',
        title: 'Секрет мастера',
        boardViewId: masterViewId,
        initialState: { content: 'Истинное имя злодея' },
      })
      .expect(201);
    const publicView = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/views`)
      .set('Cookie', ownerCookie)
      .send({
        name: 'Экран игроков',
        description: '',
        audience: 'PLAYERS',
      })
      .expect(201);
    const publicWidget = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/widgets`)
      .set('Cookie', ownerCookie)
      .send({
        type: 'NOTES',
        title: 'Общая улика',
        boardViewId: publicView.body.id as string,
        initialState: { content: 'На камне вырезан знак луны' },
      })
      .expect(201);

    const invitationResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/invitations`)
      .set('Cookie', ownerCookie)
      .send({ expiresInDays: 7 })
      .expect(201);
    const token = invitationResponse.body.token as string;
    expect(token.length).toBeGreaterThanOrEqual(32);

    const invitationList = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/invitations`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(invitationList.body.invitations[0]).not.toHaveProperty('token');

    await request(app.getHttpServer())
      .post(`/api/invitations/${token}/accept`)
      .set('Cookie', playerCookie)
      .expect(201);

    const playerCampaign = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}`)
      .set('Cookie', playerCookie)
      .expect(200);
    expect((playerCampaign.body as CampaignDetail).role).toBe('PLAYER');
    expect((playerCampaign.body as CampaignDetail).boards[0]?.views).toEqual([
      expect.objectContaining({ id: publicView.body.id, audience: 'PLAYERS' }),
    ]);

    const playerSnapshotResponse = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Cookie', playerCookie)
      .expect(200);
    const playerSnapshot = playerSnapshotResponse.body as BoardSnapshot;
    expect(playerSnapshot.role).toBe('PLAYER');
    expect(playerSnapshot.views.map(({ id }) => id)).toEqual([publicView.body.id]);
    expect(playerSnapshot.widgets.map(({ id }) => id)).toEqual([publicWidget.body.widget.id]);
    expect(playerSnapshot.widgets.map(({ id }) => id)).not.toContain(secretWidget.body.widget.id);

    await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/widgets`)
      .set('Cookie', playerCookie)
      .send({ type: 'NOTES', boardViewId: publicView.body.id })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/invitations/${token}/accept`)
      .set('Cookie', secondPlayerCookie)
      .expect(409);

    const members = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/members`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(members.body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'invite-player@example.test', role: 'PLAYER' }),
      ]),
    );

    await request(app.getHttpServer())
      .patch(`/api/views/${publicView.body.id as string}`)
      .set('Cookie', ownerCookie)
      .send({ audience: 'MASTER' })
      .expect(200);
    const hiddenSnapshot = await request(app.getHttpServer())
      .get(`/api/boards/${boardId}`)
      .set('Cookie', playerCookie)
      .expect(200);
    expect((hiddenSnapshot.body as BoardSnapshot).views).toHaveLength(0);
    expect((hiddenSnapshot.body as BoardSnapshot).widgets).toHaveLength(0);
  });

  it('publishes lore to all or selected players without exposing drafts', async () => {
    const ownerCookie = await register('lore-owner@example.test', 'Хранитель знаний');
    const firstPlayerCookie = await register('lore-first@example.test', 'Первый игрок');
    const secondPlayerCookie = await register('lore-second@example.test', 'Второй игрок');
    const strangerCookie = await register('lore-stranger@example.test', 'Посторонний');
    const campaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Архив Серого берега', description: '' })
      .expect(201);
    const campaign = campaignResponse.body as CampaignDetail;
    await invitePlayer(ownerCookie, campaign.id, firstPlayerCookie);
    await invitePlayer(ownerCookie, campaign.id, secondPlayerCookie);

    const membersResponse = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/members`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const members = membersResponse.body.members as Array<{
      userId: string;
      email: string;
      role: string;
    }>;
    const firstPlayerId = members.find(({ email }) => email === 'lore-first@example.test')!.userId;
    const secondPlayerId = members.find(
      ({ email }) => email === 'lore-second@example.test',
    )!.userId;
    const ownerId = members.find(({ role }) => role === 'OWNER')!.userId;

    const draft = await createLore(ownerCookie, campaign.id, {
      title: 'Тайна маяка',
      content: 'Свет поддерживает пленённый дух.',
      category: 'PLACE',
      isPinned: true,
      status: 'DRAFT',
      audience: 'MASTER',
      recipientUserIds: [],
    });
    const shared = await createLore(ownerCookie, campaign.id, {
      title: 'Карта приливов',
      content: 'Проход открывается на закате.',
      category: 'MAP',
      isPinned: true,
      status: 'PUBLISHED',
      audience: 'ALL_PLAYERS',
      recipientUserIds: [],
    });
    const personal = await createLore(ownerCookie, campaign.id, {
      title: 'Письмо без подписи',
      content: 'Встретимся у старого колодца.',
      category: 'CLUE',
      isPinned: false,
      status: 'PUBLISHED',
      audience: 'SELECTED_PLAYERS',
      recipientUserIds: [firstPlayerId],
    });

    const ownerList = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/lore`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((ownerList.body as CampaignLoreResponse).entries).toHaveLength(3);
    expect(
      (ownerList.body as CampaignLoreResponse).entries.find(({ id }) => id === draft.id)?.isPinned,
    ).toBe(true);

    const firstPlayerList = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/lore`)
      .set('Cookie', firstPlayerCookie)
      .expect(200);
    expect((firstPlayerList.body as CampaignLoreResponse).entries.map(({ id }) => id)).toEqual(
      expect.arrayContaining([shared.id, personal.id]),
    );
    expect(
      (firstPlayerList.body as CampaignLoreResponse).entries.map(({ id }) => id),
    ).not.toContain(draft.id);
    expect(
      (firstPlayerList.body as CampaignLoreResponse).entries.find(({ id }) => id === personal.id)
        ?.recipientUserIds,
    ).toEqual([]);
    expect(
      (firstPlayerList.body as CampaignLoreResponse).entries.find(({ id }) => id === shared.id),
    ).toMatchObject({ category: 'MAP', isPinned: true });

    const secondPlayerList = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/lore`)
      .set('Cookie', secondPlayerCookie)
      .expect(200);
    expect((secondPlayerList.body as CampaignLoreResponse).entries.map(({ id }) => id)).toEqual([
      shared.id,
    ]);
    await request(app.getHttpServer())
      .get(`/api/lore/${personal.id}`)
      .set('Cookie', secondPlayerCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/lore`)
      .set('Cookie', strangerCookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/lore/${shared.id}`)
      .set('Cookie', firstPlayerCookie)
      .send({ expectedRevision: 0, title: 'Подмена' })
      .expect(403);

    const reassigned = await request(app.getHttpServer())
      .patch(`/api/lore/${personal.id}`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: personal.revision,
        recipientUserIds: [secondPlayerId],
      })
      .expect(200);
    expect((reassigned.body as LoreEntry).revision).toBe(1);
    await request(app.getHttpServer())
      .patch(`/api/lore/${personal.id}`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: personal.revision, title: 'Устаревшая правка' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/lore/${personal.id}`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 1, recipientUserIds: [ownerId] })
      .expect(400);

    const firstAfterReassign = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/lore`)
      .set('Cookie', firstPlayerCookie)
      .expect(200);
    expect(
      (firstAfterReassign.body as CampaignLoreResponse).entries.map(({ id }) => id),
    ).not.toContain(personal.id);
    const secondAfterReassign = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/lore`)
      .set('Cookie', secondPlayerCookie)
      .expect(200);
    expect(
      (secondAfterReassign.body as CampaignLoreResponse).entries.map(({ id }) => id),
    ).toContain(personal.id);

    await request(app.getHttpServer())
      .delete(`/api/lore/${draft.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
  });

  it('generates deterministic editable battle drafts on the server', async () => {
    const ownerCookie = await register('generator-owner@example.test', 'Мастер генератора');
    const playerCookie = await register('generator-player@example.test', 'Игрок генератора');
    const firstCampaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Первая случайная карта' })
      .expect(201);
    const secondCampaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Вторая случайная карта' })
      .expect(201);
    const firstCampaign = firstCampaignResponse.body as CampaignDetail;
    const secondCampaign = secondCampaignResponse.body as CampaignDetail;
    await invitePlayer(ownerCookie, firstCampaign.id, playerCookie);

    const description = {
      name: 'Засада у древнего алтаря',
      description: 'Лесная тропа в тумане, старая святыня и стая волков.',
      seed: 'integration-forest-42',
      terrain: 'FOREST',
      size: 'MEDIUM',
      shape: 'HEXAGON',
      playerCount: 4,
      enemies: [{ name: 'Серый волк', count: 4, maxHp: 11, armorClass: 13 }],
      danger: 'HIGH',
      objective: 'DEFEND',
      startingZones: 'OPPOSITE',
      obstacleDensity: 'DENSE',
      difficultTerrain: true,
      lighting: 'DIM',
      weather: 'FOG',
      entrances: 2,
      interactiveObjects: true,
      hazards: true,
    };

    await request(app.getHttpServer())
      .post(`/api/campaigns/${firstCampaign.id}/battle/generate`)
      .set('Cookie', playerCookie)
      .send(description)
      .expect(403);
    const firstResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${firstCampaign.id}/battle/generate`)
      .set('Cookie', ownerCookie)
      .send(description)
      .expect(201);
    const secondResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${secondCampaign.id}/battle/generate`)
      .set('Cookie', ownerCookie)
      .send(description)
      .expect(201);
    const first = firstResponse.body as GeneratedRandomBattleMap;
    const second = secondResponse.body as GeneratedRandomBattleMap;

    expect(first.scene).toMatchObject({
      name: description.name,
      status: 'DRAFT',
      shape: 'HEXAGON',
      activeCombatantId: null,
      round: 1,
    });
    expect(first.generation).toMatchObject({
      seed: description.seed,
      terrain: 'FOREST',
    });
    expect(first.combatants).toHaveLength(4);
    expect(first.tokens).toHaveLength(4);
    expect(first.obstacles.length).toBeGreaterThan(0);
    expect(first.objects.some(({ name }) => name === 'Точка обороны')).toBe(true);
    expect(generatedLayout(first)).toEqual(generatedLayout(second));

    await request(app.getHttpServer())
      .post(`/api/campaigns/${firstCampaign.id}/battle/generate`)
      .set('Cookie', ownerCookie)
      .send({ ...description, seed: 'another-seed' })
      .expect(409);
    const playerDraft = await request(app.getHttpServer())
      .get(`/api/campaigns/${firstCampaign.id}/battle`)
      .set('Cookie', playerCookie)
      .expect(200);
    expect((playerDraft.body as BattleSceneSnapshot).scene).toBeNull();
    expect((playerDraft.body as BattleSceneSnapshot).tokens).toEqual([]);
  });

  it('imports an Encounter Lab composition as independent battle combatants', async () => {
    const ownerCookie = await register('encounter-owner@example.test', 'Encounter master');
    const playerCookie = await register('encounter-player@example.test', 'Encounter player');
    const campaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Encounter Lab transfer' })
      .expect(201);
    const campaign = campaignResponse.body as CampaignDetail;
    await invitePlayer(ownerCookie, campaign.id, playerCookie);

    const composition = {
      opponents: [
        { source: 'SRD', monsterId: 'srd:goblin', count: 2 },
        {
          source: 'CUSTOM',
          name: 'Clockwork guard',
          count: 1,
          initiative: 10,
          maxHp: 10,
          armorClass: null,
          speed: 6,
          size: 1,
        },
      ],
    };
    const withoutScene = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle/encounter`)
      .set('Cookie', ownerCookie)
      .send(composition);
    expect(withoutScene.status, JSON.stringify(withoutScene.body)).toBe(400);

    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Goblin ambush', gridColumns: 12, gridRows: 8, terrainTheme: 'FOREST' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle/encounter`)
      .set('Cookie', playerCookie)
      .send(composition)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle/encounter`)
      .set('Cookie', ownerCookie)
      .send({
        opponents: [
          { source: 'SRD', monsterId: 'srd:goblin', count: 1 },
          { source: 'SRD', monsterId: 'srd:not-a-monster', count: 1 },
        ],
      })
      .expect(400);
    const afterRejected = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((afterRejected.body as BattleSceneSnapshot).combatants).toEqual([]);

    const importedResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle/encounter`)
      .set('Cookie', ownerCookie)
      .send(composition)
      .expect(201);
    const imported = importedResponse.body as BattleSceneSnapshot;
    expect(imported.combatants).toHaveLength(3);
    expect(imported.tokens).toHaveLength(3);
    expect(
      imported.combatants.filter(({ name }) => (name ?? '').startsWith('Goblin')),
    ).toHaveLength(2);
    expect(imported.combatants.find(({ name }) => name === 'Goblin 1')).toMatchObject({
      kind: 'MONSTER',
      initiative: 2,
      currentHp: 7,
      maxHp: 7,
      armorClass: 15,
      speed: 6,
      species: 'humanoid',
      hpVisibility: 'STATE',
    });
    expect(imported.combatants.find(({ name }) => name === 'Clockwork guard')).toMatchObject({
      currentHp: 10,
      maxHp: 10,
      speed: 6,
    });
    expect(new Set(imported.tokens.map(({ x, y }) => `${x}:${y}`)).size).toBe(3);
    expect(imported.tokens.every(({ systemAssetId }) => systemAssetId !== null)).toBe(true);

    const crampedCampaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Cramped encounter field' })
      .expect(201);
    const crampedCampaign = crampedCampaignResponse.body as CampaignDetail;
    await request(app.getHttpServer())
      .post(`/api/campaigns/${crampedCampaign.id}/battle`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Four cells', gridColumns: 4, gridRows: 4 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${crampedCampaign.id}/battle/encounter`)
      .set('Cookie', ownerCookie)
      .send({
        opponents: [{ source: 'SRD', monsterId: 'srd:ancient-red-dragon', count: 2 }],
      })
      .expect(400);
    const crampedSnapshot = await request(app.getHttpServer())
      .get(`/api/campaigns/${crampedCampaign.id}/battle`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((crampedSnapshot.body as BattleSceneSnapshot).combatants).toEqual([]);
    expect((crampedSnapshot.body as BattleSceneSnapshot).tokens).toEqual([]);
  });

  it('serves separate master and player battle projections and validates movement', async () => {
    const ownerCookie = await register('battle-owner@example.test', 'Мастер боя');
    const playerCookie = await register('battle-player@example.test', 'Арден');
    const campaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Испытание тактического стола' })
      .expect(201);
    const campaign = campaignResponse.body as CampaignDetail;
    await invitePlayer(ownerCookie, campaign.id, playerCookie);
    const members = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/members`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const playerId = (members.body.members as Array<{ userId: string; role: string }>).find(
      ({ role }) => role === 'PLAYER',
    )!.userId;
    const sheetResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/characters`)
      .set('Cookie', ownerCookie)
      .send({
        name: 'Арден из листа',
        ownerUserId: playerId,
        ruleset: 'dnd5e-srd-5.2.1',
        data: {
          level: 1,
          speciesId: 'human',
          classId: 'fighter',
          backgroundId: 'soldier',
          abilityMethod: 'STANDARD_ARRAY',
          abilities: {
            strength: 15,
            dexterity: 14,
            constitution: 13,
            intelligence: 8,
            wisdom: 12,
            charisma: 10,
          },
          skillIds: ['athletics'],
          spellIds: [],
          equipment: [],
          hitPoints: 22,
          armorClass: 17,
          speed: 30,
          personality: '',
          appearance: '',
          backstory: '',
          notes: '',
        },
      })
      .expect(201);
    const characterSheet = sheetResponse.body as CharacterSheet;

    const created = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Мост над бездной', gridColumns: 12, gridRows: 8 })
      .expect(201);
    const sceneId = (created.body as BattleSceneSnapshot).scene!.id;
    const visualEntryResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/lore`)
      .set('Cookie', ownerCookie)
      .send({
        title: 'Ассеты испытания',
        content: 'Приватные изображения тактического стола.',
        category: 'GENERAL',
        status: 'DRAFT',
        audience: 'MASTER',
        recipientUserIds: [],
      })
      .expect(201);
    const visualEntry = visualEntryResponse.body as LoreEntry;
    const enemyImageResponse = await request(app.getHttpServer())
      .post(`/api/lore/${visualEntry.id}/attachments`)
      .set('Cookie', ownerCookie)
      .attach(
        'file',
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
        {
          filename: 'enemy.png',
          contentType: 'image/png',
        },
      )
      .expect(201);
    const enemyImageId = (enemyImageResponse.body as { id: string }).id;
    const fireImageResponse = await request(app.getHttpServer())
      .post(`/api/lore/${visualEntry.id}/attachments`)
      .set('Cookie', ownerCookie)
      .attach('file', Buffer.from('GIF89a', 'ascii'), {
        filename: 'fire.gif',
        contentType: 'image/gif',
      })
      .expect(201);
    const fireImageId = (fireImageResponse.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/combatants`)
      .set('Cookie', ownerCookie)
      .send({
        name: 'Недопустимый портрет героя',
        kind: 'PLAYER',
        imageAttachmentId: enemyImageId,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/combatants`)
      .set('Cookie', ownerCookie)
      .send({
        name: 'Арден',
        kind: 'PLAYER',
        initiative: 20,
        currentHp: 18,
        maxHp: 20,
        hpVisibility: 'EXACT',
        ownerUserId: playerId,
        x: 1,
        y: 1,
        color: '#3366ff',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/combatants`)
      .set('Cookie', ownerCookie)
      .send({
        name: 'Теневой зверь',
        kind: 'MONSTER',
        initiative: 10,
        currentHp: 12,
        maxHp: 12,
        hpVisibility: 'BAR',
        armorClass: 15,
        className: 'Хищник',
        species: 'Зверь',
        conditions: ['Скрыт'],
        showArmorClass: true,
        showClassName: true,
        showSpecies: true,
        imageAttachmentId: enemyImageId,
        x: 8,
        y: 4,
      })
      .expect(201);
    const hiddenCreated = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/combatants`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Скрытый наблюдатель', kind: 'NPC', hidden: true, x: 10, y: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/obstacles`)
      .set('Cookie', ownerCookie)
      .send({ kind: 'WALL', x: 5, y: 5, width: 1, height: 1 })
      .expect(201);
    const crateCreated = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/objects`)
      .set('Cookie', ownerCookie)
      .send({
        kind: 'PROP',
        name: 'Старая бочка',
        x: 6,
        y: 5,
        blocksMovement: true,
        visibleToPlayers: true,
        currentHp: 10,
        maxHp: 10,
        imageAttachmentId: fireImageId,
      })
      .expect(201);
    const crate = (crateCreated.body as BattleSceneSnapshot).objects.find(
      ({ name }) => name === 'Старая бочка',
    )!;
    const clueCreated = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/objects`)
      .set('Cookie', ownerCookie)
      .send({
        kind: 'CLUE',
        name: 'Скрытый рычаг',
        x: 9,
        y: 6,
        blocksMovement: false,
        visibleToPlayers: false,
        imageAttachmentId: fireImageId,
      })
      .expect(201);
    const hiddenClue = (clueCreated.body as BattleSceneSnapshot).objects.find(
      ({ name }) => name === 'Скрытый рычаг',
    )!;

    const live = await request(app.getHttpServer())
      .patch(`/api/battle-scenes/${sceneId}`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: 0, status: 'LIVE' })
      .expect(200);
    const turn = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/next-turn`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: (live.body as BattleSceneSnapshot).scene!.revision })
      .expect(201);

    const playerSnapshotResponse = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', playerCookie)
      .expect(200);
    const playerSnapshot = playerSnapshotResponse.body as BattleSceneSnapshot;
    expect(playerSnapshot.combatants.map(({ name }) => name)).not.toContain('Скрытый наблюдатель');
    const monster = playerSnapshot.combatants.find(({ name }) => name === 'Теневой зверь')!;
    expect(monster).toMatchObject({
      currentHp: null,
      maxHp: null,
      hpPercent: 100,
      armorClass: 15,
      className: 'Хищник',
      species: 'Зверь',
    });
    const hero = playerSnapshot.combatants.find(({ name }) => name === 'Арден')!;
    expect(playerSnapshot.scene?.activeCombatantId).toBe(hero.id);
    const heroToken = playerSnapshot.tokens.find(({ combatantId }) => combatantId === hero.id)!;
    expect(heroToken.ownerUserId).toBe(playerId);
    expect(playerSnapshot.obstacles).toHaveLength(1);
    expect(playerSnapshot.objects).toMatchObject([{ name: 'Старая бочка', currentHp: 10 }]);
    expect(playerSnapshot.objects.map(({ name }) => name)).not.toContain('Скрытый рычаг');
    const monsterToken = playerSnapshot.tokens.find(
      ({ combatantId }) => combatantId === monster.id,
    )!;
    expect(monsterToken).toMatchObject({ hasImage: true, imageAttachmentId: null });
    expect(playerSnapshot.objects[0]).toMatchObject({
      hasImage: true,
      imageAnimated: true,
      imageAttachmentId: null,
    });
    await request(app.getHttpServer())
      .get(`/api/battle-tokens/${monsterToken.id}/image`)
      .set('Cookie', playerCookie)
      .expect('Content-Type', /image\/png/)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/battle-scene-objects/${crate.id}/image`)
      .set('Cookie', playerCookie)
      .expect('Content-Type', /image\/gif/)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/battle-scene-objects/${hiddenClue.id}/image`)
      .set('Cookie', playerCookie)
      .expect(404);

    const moved = await request(app.getHttpServer())
      .post(`/api/battle-tokens/${heroToken.id}/move`)
      .set('Cookie', playerCookie)
      .send({ expectedRevision: heroToken.revision, x: 4, y: 4 })
      .expect(201);
    expect(
      (moved.body as BattleSceneSnapshot).tokens.find(({ id }) => id === heroToken.id),
    ).toMatchObject({ x: 4, y: 4 });
    const movedHeroToken = (moved.body as BattleSceneSnapshot).tokens.find(
      ({ id }) => id === heroToken.id,
    )!;
    await request(app.getHttpServer())
      .post(`/api/battle-tokens/${movedHeroToken.id}/move`)
      .set('Cookie', playerCookie)
      .send({ expectedRevision: movedHeroToken.revision, x: 5, y: 5 })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/battle-tokens/${movedHeroToken.id}/move`)
      .set('Cookie', playerCookie)
      .send({ expectedRevision: movedHeroToken.revision, x: 6, y: 5 })
      .expect(403);
    const damagedCrate = await request(app.getHttpServer())
      .post(`/api/battle-scene-objects/${crate.id}/hp`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: crate.revision, mode: 'DAMAGE', amount: 5 })
      .expect(201);
    expect(
      (damagedCrate.body as BattleSceneSnapshot).objects.find(({ id }) => id === crate.id),
    ).toMatchObject({
      currentHp: 5,
      maxHp: 10,
    });
    const ownerMonsterToken = (damagedCrate.body as BattleSceneSnapshot).tokens.find(
      ({ combatantId }) => combatantId === monster.id,
    )!;
    await request(app.getHttpServer())
      .patch(`/api/battle-tokens/${ownerMonsterToken.id}`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: ownerMonsterToken.revision,
        imageAttachmentId: null,
        systemAssetId: 'starter.prop.forest.fallen-tree',
      })
      .expect(400);
    const systemAssetSnapshotResponse = await request(app.getHttpServer())
      .patch(`/api/battle-tokens/${ownerMonsterToken.id}`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: ownerMonsterToken.revision,
        imageAttachmentId: null,
        systemAssetId: 'starter.token.forest.dire-wolf',
      })
      .expect(200);
    expect(
      (systemAssetSnapshotResponse.body as BattleSceneSnapshot).tokens.find(
        ({ id }) => id === ownerMonsterToken.id,
      ),
    ).toMatchObject({
      imageAttachmentId: null,
      systemAssetId: 'starter.token.forest.dire-wolf',
      hasImage: true,
    });
    const playerSystemAssetResponse = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', playerCookie)
      .expect(200);
    expect(
      (playerSystemAssetResponse.body as BattleSceneSnapshot).tokens.find(
        ({ id }) => id === ownerMonsterToken.id,
      ),
    ).toMatchObject({
      imageAttachmentId: null,
      systemAssetId: 'starter.token.forest.dire-wolf',
      hasImage: true,
    });
    const saveResponse = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/saves`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Мост · раунд 1' })
      .expect(201);
    const save = saveResponse.body as { id: string; sceneStatus: string; combatantCount: number };
    expect(save).toMatchObject({
      name: 'Мост · раунд 1',
      sceneStatus: 'LIVE',
      combatantCount: 3,
      gridColumns: 12,
      gridRows: 8,
    });
    await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle-saves`)
      .set('Cookie', playerCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/battle-scene-saves/${save.id}/open`)
      .set('Cookie', playerCookie)
      .expect(403);
    const masterMoved = await request(app.getHttpServer())
      .post(`/api/battle-tokens/${movedHeroToken.id}/move`)
      .set('Cookie', ownerCookie)
      .send({ expectedRevision: movedHeroToken.revision, x: 11, y: 7 })
      .expect(201);
    expect(
      (masterMoved.body as BattleSceneSnapshot).tokens.find(({ id }) => id === heroToken.id),
    ).toMatchObject({ x: 11, y: 7 });
    await request(app.getHttpServer())
      .post(`/api/battle-tokens/${heroToken.id}/move`)
      .set('Cookie', playerCookie)
      .send({ expectedRevision: heroToken.revision + 1, x: 11, y: 7 })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/battle-combatants/${hero.id}/hp`)
      .set('Cookie', playerCookie)
      .send({ expectedRevision: hero.revision, mode: 'DAMAGE', amount: 5 })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/battle-scene-objects/${crate.id}/hp`)
      .set('Cookie', playerCookie)
      .send({ expectedRevision: crate.revision + 1, mode: 'DAMAGE', amount: 5 })
      .expect(403);

    const ownerBeforeSettings = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const ownerSnapshot = ownerBeforeSettings.body as BattleSceneSnapshot;
    const ownerHero = ownerSnapshot.combatants.find(({ name }) => name === 'Арден')!;
    const ownerMonster = ownerSnapshot.combatants.find(({ name }) => name === 'Теневой зверь')!;
    const presetResponse = await request(app.getHttpServer())
      .post(`/api/battle-combatants/${ownerHero.id}/preset`)
      .set('Cookie', ownerCookie)
      .send({})
      .expect(201);
    const heroPreset = presetResponse.body as {
      id: string;
      name: string;
      maxHp: number;
      ownerUserId: string | null;
    };
    expect(heroPreset).toMatchObject({ name: 'Арден', maxHp: 20, ownerUserId: playerId });
    const sheetPresetResponse = await request(app.getHttpServer())
      .post(`/api/characters/${characterSheet.id}/battle-combatant-preset`)
      .set('Cookie', ownerCookie)
      .send({ color: '#445566' })
      .expect(201);
    const sheetPreset = sheetPresetResponse.body as { id: string };
    expect(sheetPresetResponse.body).toMatchObject({
      name: 'Арден из листа',
      kind: 'PLAYER',
      initiative: 2,
      maxHp: 22,
      armorClass: 17,
      speed: 6,
      className: 'Воин',
      species: 'Человек',
      ownerUserId: playerId,
      color: '#445566',
    });
    const updatedPresetResponse = await request(app.getHttpServer())
      .patch(`/api/battle-combatant-presets/${heroPreset.id}`)
      .set('Cookie', ownerCookie)
      .send({
        ...presetResponse.body,
        name: 'Арден-ветеран',
        maxHp: 24,
        imageAttachmentId: null,
      })
      .expect(200);
    expect(updatedPresetResponse.body).toMatchObject({ name: 'Арден-ветеран', maxHp: 24 });
    const duplicatePresetResponse = await request(app.getHttpServer())
      .post(`/api/battle-combatant-presets/${heroPreset.id}/duplicate`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Арден — резерв' })
      .expect(201);
    expect(duplicatePresetResponse.body).toMatchObject({ name: 'Арден — резерв', maxHp: 24 });
    await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle-combatant-presets`)
      .set('Cookie', playerCookie)
      .expect(403);
    const presetList = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle-combatant-presets`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(presetList.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: heroPreset.id, name: 'Арден-ветеран' }),
        expect.objectContaining({ id: sheetPreset.id, name: 'Арден из листа' }),
        expect.objectContaining({ id: duplicatePresetResponse.body.id, name: 'Арден — резерв' }),
      ]),
    );
    const monsterPresetResponse = await request(app.getHttpServer())
      .post(`/api/battle-combatants/${ownerMonster.id}/preset`)
      .set('Cookie', ownerCookie)
      .send({})
      .expect(201);
    const monsterPresetId = (monsterPresetResponse.body as { id: string }).id;
    await request(app.getHttpServer())
      .get(`/api/battle-combatant-presets/${monsterPresetId}/export`)
      .set('Cookie', playerCookie)
      .expect(403);
    const portablePresetResponse = await request(app.getHttpServer())
      .get(`/api/battle-combatant-presets/${monsterPresetId}/export`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const portablePreset = portablePresetResponse.body as PortableBattleCombatantPreset;
    expect(portablePreset).toMatchObject({
      format: 'fog-of-lore.battle-combatant-preset',
      version: 1,
      preset: {
        name: 'Теневой зверь',
        kind: 'MONSTER',
        systemAssetId: 'starter.token.forest.dire-wolf',
      },
      image: null,
    });
    expect(portablePreset.preset).not.toHaveProperty('ownerUserId');
    expect(portablePreset.preset).not.toHaveProperty('imageAttachmentId');
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle-combatant-presets/import`)
      .set('Cookie', playerCookie)
      .send({ preset: portablePreset })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle-combatant-presets/import`)
      .set('Cookie', ownerCookie)
      .send({
        preset: {
          ...portablePreset,
          preset: {
            ...portablePreset.preset,
            systemAssetId: 'starter.prop.forest.fallen-tree',
          },
        },
      })
      .expect(400);
    const importedPortablePresetResponse = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaign.id}/battle-combatant-presets/import`)
      .set('Cookie', ownerCookie)
      .send({ preset: portablePreset })
      .expect(201);
    expect(importedPortablePresetResponse.body).toMatchObject({
      name: 'Теневой зверь',
      kind: 'MONSTER',
      ownerUserId: null,
      hasImage: true,
    });
    await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/combatant-presets/${heroPreset.id}/import`)
      .set('Cookie', playerCookie)
      .send({})
      .expect(403);
    const importedPresetResponse = await request(app.getHttpServer())
      .post(`/api/battle-scenes/${sceneId}/combatant-presets/${heroPreset.id}/import`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Арден на мосту', maxHp: 30, ownerUserId: null, x: 8, y: 6 })
      .expect(201);
    const importedPresetSnapshot = importedPresetResponse.body as BattleSceneSnapshot;
    const importedHero = importedPresetSnapshot.combatants.find(
      ({ name }) => name === 'Арден на мосту',
    )!;
    expect(importedHero).toMatchObject({ currentHp: 30, maxHp: 30, conditions: [] });
    expect(
      importedPresetSnapshot.tokens.find(({ combatantId }) => combatantId === importedHero.id),
    ).toMatchObject({ ownerUserId: null, x: 8, y: 6 });
    await request(app.getHttpServer())
      .delete(`/api/battle-combatant-presets/${heroPreset.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    const afterVisibility = await request(app.getHttpServer())
      .patch(`/api/battle-combatants/${ownerMonster.id}`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: ownerMonster.revision,
        showArmorClass: false,
        showClassName: false,
        showSpecies: false,
        conditionsVisibility: 'HIDDEN',
      })
      .expect(200);
    const afterVisibilitySnapshot = afterVisibility.body as BattleSceneSnapshot;
    const resized = await request(app.getHttpServer())
      .patch(`/api/battle-scenes/${sceneId}`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: afterVisibilitySnapshot.scene!.revision,
        gridColumns: 14,
        gridRows: 9,
      })
      .expect(200);
    expect((resized.body as BattleSceneSnapshot).scene).toMatchObject({
      gridColumns: 14,
      gridRows: 9,
    });

    const playerAfterVisibility = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle`)
      .set('Cookie', playerCookie)
      .expect(200);
    const hiddenStats = (playerAfterVisibility.body as BattleSceneSnapshot).combatants.find(
      ({ id }) => id === ownerMonster.id,
    )!;
    expect(hiddenStats).toMatchObject({
      armorClass: null,
      className: null,
      species: null,
      conditions: [],
    });

    const hiddenCombatantId = (hiddenCreated.body as BattleSceneSnapshot).combatants.find(
      ({ name }) => name === 'Скрытый наблюдатель',
    )!.id;
    const deleted = await request(app.getHttpServer())
      .delete(`/api/battle-combatants/${hiddenCombatantId}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((deleted.body as BattleSceneSnapshot).combatants.map(({ id }) => id)).not.toContain(
      hiddenCombatantId,
    );
    const restoredResponse = await request(app.getHttpServer())
      .post(`/api/battle-scene-saves/${save.id}/open`)
      .set('Cookie', ownerCookie)
      .expect(201);
    const restored = restoredResponse.body as BattleSceneSnapshot;
    expect(restored.scene).toMatchObject({
      name: 'Мост над бездной',
      status: 'LIVE',
      gridColumns: 12,
      gridRows: 8,
      round: 1,
    });
    expect(restored.scene!.id).not.toBe(sceneId);
    const restoredHero = restored.combatants.find(({ name }) => name === 'Арден')!;
    expect(restoredHero).toMatchObject({ currentHp: 18, maxHp: 20, movementSpent: 3 });
    const restoredHeroToken = restored.tokens.find(
      ({ combatantId }) => combatantId === restoredHero.id,
    )!;
    expect(restoredHeroToken).toMatchObject({ x: 4, y: 4, ownerUserId: playerId });
    const restoredMonster = restored.combatants.find(({ name }) => name === 'Теневой зверь')!;
    expect(
      restored.tokens.find(({ combatantId }) => combatantId === restoredMonster.id),
    ).toMatchObject({
      hasImage: true,
      imageAttachmentId: null,
      systemAssetId: 'starter.token.forest.dire-wolf',
    });
    expect(restored.obstacles).toMatchObject([{ kind: 'WALL', x: 5, y: 5 }]);
    expect(restored.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Старая бочка',
          currentHp: 5,
          maxHp: 10,
          hasImage: true,
          imageAttachmentId: fireImageId,
        }),
        expect.objectContaining({ name: 'Скрытый рычаг', visibleToPlayers: false }),
      ]),
    );
    expect(restored.combatants.map(({ name }) => name)).toContain('Скрытый наблюдатель');
    expect(restored.combatants.find(({ name }) => name === 'Теневой зверь')).toMatchObject({
      showArmorClass: true,
      showClassName: true,
      showSpecies: true,
      conditionsVisibility: 'ALL',
    });
    const savesAfterRestore = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/battle-saves`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect((savesAfterRestore.body as Array<{ id: string }>).map(({ id }) => id)).toContain(
      save.id,
    );
    expect((turn.body as BattleSceneSnapshot).role).toBe('OWNER');
  });

  it('keeps direct messages private to the player and campaign masters', async () => {
    const ownerCookie = await register('owner-messages@example.test', 'Ведущий');
    const playerCookie = await register('player-messages@example.test', 'Рейна');
    const otherPlayerCookie = await register('other-player-messages@example.test', 'Торен');
    const campaignResponse = await request(app.getHttpServer())
      .post('/api/campaigns')
      .set('Cookie', ownerCookie)
      .send({ name: 'Личные разговоры' })
      .expect(201);
    const campaign = campaignResponse.body as CampaignDetail;
    await invitePlayer(ownerCookie, campaign.id, playerCookie);
    await invitePlayer(ownerCookie, campaign.id, otherPlayerCookie);
    const playerId = await userId(playerCookie);

    const conversationResponse = await request(app.getHttpServer())
      .put(`/api/campaigns/${campaign.id}/direct-conversations/${playerId}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const conversation = conversationResponse.body as DirectConversation;
    expect(conversation.playerUserId).toBe(playerId);

    const firstMessage = await request(app.getHttpServer())
      .post(`/api/direct-conversations/${conversation.id}/messages`)
      .set('Cookie', ownerCookie)
      .send({ clientMessageId: crypto.randomUUID(), body: 'Твой персонаж замечает следы у ворот.' })
      .expect(201);
    expect((firstMessage.body as DirectMessage).sequence).toBe(1);
    const playerMessage = await request(app.getHttpServer())
      .post(`/api/direct-conversations/${conversation.id}/messages`)
      .set('Cookie', playerCookie)
      .send({ clientMessageId: crypto.randomUUID(), body: 'Я иду по следу.' })
      .expect(201);
    expect((playerMessage.body as DirectMessage).sequence).toBe(2);

    const playerList = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/direct-conversations`)
      .set('Cookie', playerCookie)
      .expect(200);
    expect((playerList.body as DirectConversationsResponse).conversations).toHaveLength(1);
    const outsiderList = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/direct-conversations`)
      .set('Cookie', otherPlayerCookie)
      .expect(200);
    expect((outsiderList.body as DirectConversationsResponse).conversations).toHaveLength(0);
    await request(app.getHttpServer())
      .get(`/api/direct-conversations/${conversation.id}/messages`)
      .set('Cookie', otherPlayerCookie)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/direct-conversations/${conversation.id}/read`)
      .set('Cookie', playerCookie)
      .send({ lastReadSequence: 99 })
      .expect(200);
    const afterRead = await request(app.getHttpServer())
      .get(`/api/campaigns/${campaign.id}/direct-conversations`)
      .set('Cookie', playerCookie)
      .expect(200);
    expect((afterRead.body as DirectConversationsResponse).conversations[0]?.unreadCount).toBe(0);
  });

  async function register(email: string, displayName: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password: 'correct horse battery staple',
        displayName,
      })
      .expect(201);

    return getSessionCookie(response.headers['set-cookie']);
  }

  async function userId(cookie: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    return (response.body as { user: { id: string } }).user.id;
  }

  async function createWidget(
    cookie: string,
    boardId: string,
    viewId: string,
    type: 'TIMER' | 'DICE' | 'COMBAT',
  ): Promise<CreateWidgetResult> {
    const response = await request(app.getHttpServer())
      .post(`/api/boards/${boardId}/widgets`)
      .set('Cookie', cookie)
      .send({ type, boardViewId: viewId })
      .expect(201);
    return response.body as CreateWidgetResult;
  }

  async function commandWidget(
    cookie: string,
    widgetId: string,
    command: Record<string, unknown>,
  ): Promise<WidgetInstance> {
    const response = await request(app.getHttpServer())
      .post(`/api/widgets/${widgetId}/commands`)
      .set('Cookie', cookie)
      .send(command)
      .expect(201);
    return response.body as WidgetInstance;
  }

  async function invitePlayer(
    ownerCookie: string,
    campaignId: string,
    playerCookie: string,
  ): Promise<void> {
    const invitation = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaignId}/invitations`)
      .set('Cookie', ownerCookie)
      .send({ expiresInDays: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${invitation.body.token as string}/accept`)
      .set('Cookie', playerCookie)
      .expect(201);
  }

  async function createLore(
    ownerCookie: string,
    campaignId: string,
    input: Record<string, unknown>,
  ): Promise<LoreEntry> {
    const response = await request(app.getHttpServer())
      .post(`/api/campaigns/${campaignId}/lore`)
      .set('Cookie', ownerCookie)
      .send(input)
      .expect(201);
    return response.body as LoreEntry;
  }
});

function generatedLayout(map: GeneratedRandomBattleMap) {
  return {
    generation: map.generation,
    scene: map.scene
      ? {
          name: map.scene.name,
          status: map.scene.status,
          shape: map.scene.shape,
          gridColumns: map.scene.gridColumns,
          gridRows: map.scene.gridRows,
        }
      : null,
    combatants: sortGeneratedLayout(
      map.combatants.map((item) => ({
        name: item.name,
        kind: item.kind,
        initiative: item.initiative,
        currentHp: item.currentHp,
        maxHp: item.maxHp,
        armorClass: item.armorClass,
        speed: item.speed,
        hidden: item.hidden,
        nameVisibility: item.nameVisibility,
        hpVisibility: item.hpVisibility,
      })),
    ),
    tokens: sortGeneratedLayout(
      map.tokens.map((item) => ({
        ownerUserId: item.ownerUserId,
        imageAttachmentId: item.imageAttachmentId,
        x: item.x,
        y: item.y,
        size: item.size,
        color: item.color,
      })),
    ),
    obstacles: sortGeneratedLayout(
      map.obstacles.map((item) => ({
        kind: item.kind,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        movementCost: item.movementCost,
      })),
    ),
    objects: sortGeneratedLayout(
      map.objects.map((item) => ({
        kind: item.kind,
        name: item.name,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        blocksMovement: item.blocksMovement,
        visibleToPlayers: item.visibleToPlayers,
        showLabel: item.showLabel,
      })),
    ),
  };
}

function sortGeneratedLayout<T>(items: T[]): T[] {
  return items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function getSessionCookie(header: string | string[] | undefined): string {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = values.find((value) => value.startsWith('fog_of_lore_session='));

  if (!cookie) {
    throw new Error('Session cookie was not returned');
  }

  return cookie.split(';', 1)[0] ?? cookie;
}

function combatant(
  name: string,
  group: 'PLAYER' | 'ALLY' | 'ENEMY',
  initiative: number,
  maxHp: number,
) {
  return {
    name,
    group,
    initiative,
    currentHp: maxHp,
    maxHp,
    armorClass: null,
    temporaryHp: 0,
    conditions: [],
    note: '',
    hidden: false,
  };
}
