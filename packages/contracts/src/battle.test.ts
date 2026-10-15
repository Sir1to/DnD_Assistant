import { describe, expect, it } from 'vitest';

import {
  battleSceneSavePayloadSchema,
  createBattleSceneSaveRequestSchema,
  createBattleCombatantRequestSchema,
  createBattleObstacleRequestSchema,
  createBattleSceneObjectRequestSchema,
  createBattleSceneRequestSchema,
  duplicateBattleCombatantPresetRequestSchema,
  generateRandomBattleMapRequestSchema,
  importBattleEncounterRequestSchema,
  importBattleCombatantPresetRequestSchema,
  importPortableBattleCombatantPresetRequestSchema,
  moveBattleTokenRequestSchema,
  placeCharacterOnBattleRequestSchema,
  portableBattleCombatantPresetSchema,
  saveBattleCombatantPresetRequestSchema,
  saveCharacterSheetAsBattlePresetRequestSchema,
  updateBattleCombatantPresetRequestSchema,
  updateBattleTokenRequestSchema,
} from './battle';

describe('battle contracts', () => {
  it('creates a bounded square scene with useful defaults', () => {
    expect(createBattleSceneRequestSchema.parse({})).toEqual({
      name: 'Боевая сцена',
      gridColumns: 16,
      gridRows: 10,
      shape: 'RECTANGLE',
      terrainTheme: null,
      backgroundPreset: null,
      lightingTheme: null,
      weatherTheme: null,
    });
  });

  it('accepts a built-in landscape preset for manual map creation', () => {
    expect(
      createBattleSceneRequestSchema.parse({
        name: 'Лесная засада',
        terrainTheme: 'FOREST',
        backgroundPreset: 'FOREST_CREEK',
        lightingTheme: 'DIM',
        weatherTheme: 'FOG',
      }),
    ).toMatchObject({
      backgroundPreset: 'FOREST_CREEK',
      terrainTheme: 'FOREST',
      lightingTheme: 'DIM',
      weatherTheme: 'FOG',
    });
  });

  it('keeps exact hp private by default for a new arbitrary combatant', () => {
    expect(
      createBattleCombatantRequestSchema.parse({ name: 'Теневой зверь', kind: 'MONSTER' }),
    ).toMatchObject({
      hpVisibility: 'STATE',
      showArmorClass: false,
      speed: 6,
      imageAttachmentId: null,
    });
  });

  it('bounds an Encounter Lab transfer and applies custom combatant defaults', () => {
    expect(
      importBattleEncounterRequestSchema.parse({
        opponents: [
          { source: 'SRD', monsterId: 'srd:goblin', count: 3 },
          { source: 'CUSTOM', name: 'Clockwork guard', count: 1 },
        ],
      }),
    ).toEqual({
      opponents: [
        { source: 'SRD', monsterId: 'srd:goblin', count: 3 },
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
    });
    expect(
      importBattleEncounterRequestSchema.safeParse({
        opponents: [
          { source: 'SRD', monsterId: 'srd:goblin', count: 60 },
          { source: 'CUSTOM', name: 'Guard', count: 41 },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps player markers circular and accepts animated environment assets', () => {
    const attachmentId = '11111111-1111-4111-8111-111111111111';
    expect(
      createBattleCombatantRequestSchema.safeParse({
        name: 'Арден',
        kind: 'PLAYER',
        imageAttachmentId: attachmentId,
      }).success,
    ).toBe(false);
    expect(
      createBattleCombatantRequestSchema.safeParse({
        name: 'Арден',
        kind: 'PLAYER',
        systemAssetId: 'starter.token.forest.raider',
      }).success,
    ).toBe(false);
    expect(
      createBattleSceneObjectRequestSchema.parse({
        kind: 'PROP',
        name: 'Горящая жаровня',
        x: 2,
        y: 3,
        imageAttachmentId: attachmentId,
      }),
    ).toMatchObject({ imageAttachmentId: attachmentId, visibleToPlayers: true });
  });

  it('validates placement overrides for a linked character', () => {
    expect(placeCharacterOnBattleRequestSchema.parse({})).toEqual({
      size: 1,
      color: '#7c5cff',
    });
    expect(placeCharacterOnBattleRequestSchema.safeParse({ x: 3 }).success).toBe(false);
    expect(
      placeCharacterOnBattleRequestSchema.parse({ x: 3, y: 4, initiative: 7, color: '#123abc' }),
    ).toMatchObject({ x: 3, y: 4, initiative: 7, color: '#123abc' });
  });

  it('accepts stable system asset identifiers and keeps them exclusive with uploads', () => {
    const attachmentId = '11111111-1111-4111-8111-111111111111';
    expect(
      createBattleCombatantRequestSchema.parse({
        name: 'Страж леса',
        kind: 'MONSTER',
        systemAssetId: 'starter.token.forest.raider',
      }),
    ).toMatchObject({
      imageAttachmentId: null,
      systemAssetId: 'starter.token.forest.raider',
    });
    expect(
      createBattleObstacleRequestSchema.parse({
        kind: 'WALL',
        x: 2,
        y: 3,
        systemAssetId: 'starter.obstacle.forest.wall',
      }),
    ).toMatchObject({ systemAssetId: 'starter.obstacle.forest.wall' });
    expect(
      createBattleSceneObjectRequestSchema.safeParse({
        kind: 'PROP',
        name: 'Сундук',
        x: 2,
        y: 3,
        imageAttachmentId: attachmentId,
        systemAssetId: 'starter.prop.dungeon.locked-chest',
      }).success,
    ).toBe(false);
    expect(
      updateBattleTokenRequestSchema.safeParse({
        expectedRevision: 0,
        imageAttachmentId: attachmentId,
        systemAssetId: 'starter.token.forest.raider',
      }).success,
    ).toBe(false);
    expect(
      createBattleCombatantRequestSchema.safeParse({
        name: 'Сломанный ID',
        kind: 'MONSTER',
        systemAssetId: '../private/file',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid colors and oversized destinations', () => {
    expect(
      createBattleCombatantRequestSchema.safeParse({
        name: 'Страж',
        kind: 'NPC',
        color: 'purple',
      }).success,
    ).toBe(false);
    expect(
      moveBattleTokenRequestSchema.safeParse({ expectedRevision: 0, x: -1, y: 0 }).success,
    ).toBe(false);
  });

  it('validates a named, restorable battle scene save', () => {
    expect(createBattleSceneSaveRequestSchema.parse({ name: 'Засада у моста' })).toEqual({
      name: 'Засада у моста',
    });
    expect(
      battleSceneSavePayloadSchema.safeParse({
        version: 1,
        scene: {
          name: 'Мост',
          status: 'LIVE',
          gridColumns: 12,
          gridRows: 8,
          activeCombatantSourceId: null,
          round: 2,
        },
        combatants: [],
        tokens: [],
      }).success,
    ).toBe(true);
    expect(
      battleSceneSavePayloadSchema.safeParse({
        version: 1,
        scene: {
          name: 'Архив',
          status: 'ARCHIVED',
          gridColumns: 12,
          gridRows: 8,
          activeCombatantSourceId: null,
          round: 2,
        },
        combatants: [],
        tokens: [],
      }).success,
    ).toBe(false);
  });

  it('validates saving and importing a reusable battle character', () => {
    expect(saveBattleCombatantPresetRequestSchema.parse({})).toEqual({});
    expect(saveBattleCombatantPresetRequestSchema.parse({ name: '  Арден  ' })).toEqual({
      name: 'Арден',
    });
    expect(importBattleCombatantPresetRequestSchema.parse({})).toEqual({});
    expect(
      importBattleCombatantPresetRequestSchema.parse({
        name: 'Арден на мосту',
        maxHp: 24,
        armorClass: null,
        speed: 7,
        size: 2,
      }),
    ).toMatchObject({ name: 'Арден на мосту', maxHp: 24, armorClass: null, size: 2 });
    expect(importBattleCombatantPresetRequestSchema.safeParse({ x: 1, y: -1 }).success).toBe(false);
    expect(importBattleCombatantPresetRequestSchema.safeParse({ x: 1 }).success).toBe(false);
    expect(duplicateBattleCombatantPresetRequestSchema.parse({})).toEqual({});
    expect(saveCharacterSheetAsBattlePresetRequestSchema.parse({})).toEqual({
      color: '#7c5cff',
      size: 1,
    });
    expect(
      updateBattleCombatantPresetRequestSchema.safeParse({
        name: 'Арден',
        kind: 'PLAYER',
        initiative: 2,
        maxHp: 20,
        armorClass: 16,
        speed: 6,
        className: 'Воин',
        species: 'Человек',
        hidden: false,
        nameVisibility: 'EXACT',
        hpVisibility: 'EXACT',
        showArmorClass: true,
        showClassName: true,
        showSpecies: true,
        conditionsVisibility: 'ALL',
        ownerUserId: null,
        imageAttachmentId: '11111111-1111-4111-8111-111111111111',
        size: 1,
        color: '#7c5cff',
      }).success,
    ).toBe(false);
  });

  it('validates a versioned portable battle preset without internal identifiers', () => {
    const portable = {
      format: 'fog-of-lore.battle-combatant-preset',
      version: 1,
      exportedAt: '2026-10-02T12:00:00.000Z',
      preset: {
        name: 'Теневой зверь',
        kind: 'MONSTER',
        initiative: 3,
        maxHp: 18,
        armorClass: 14,
        speed: 6,
        className: '',
        species: 'Зверь',
        hidden: false,
        nameVisibility: 'GENERIC',
        hpVisibility: 'STATE',
        showArmorClass: false,
        showClassName: false,
        showSpecies: false,
        conditionsVisibility: 'ALL',
        size: 1,
        color: '#445566',
      },
      image: {
        fileName: 'shadow.png',
        mimeType: 'image/png',
        byteLength: 68,
        width: 1,
        height: 1,
        dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      },
    } as const;

    expect(portableBattleCombatantPresetSchema.parse(portable).preset.name).toBe('Теневой зверь');
    expect(
      importPortableBattleCombatantPresetRequestSchema.parse({ preset: portable }),
    ).toMatchObject({
      preset: portable,
    });
    expect(
      portableBattleCombatantPresetSchema.safeParse({
        ...portable,
        preset: { ...portable.preset, ownerUserId: '11111111-1111-4111-8111-111111111111' },
      }).success,
    ).toBe(false);
    expect(portableBattleCombatantPresetSchema.safeParse({ ...portable, version: 2 }).success).toBe(
      false,
    );
    expect(
      portableBattleCombatantPresetSchema.safeParse({
        ...portable,
        preset: { ...portable.preset, kind: 'PLAYER' },
      }).success,
    ).toBe(false);
  });

  it('normalizes a random map description and bounds custom enemy groups', () => {
    expect(generateRandomBattleMapRequestSchema.parse({ seed: 'forest-42' })).toMatchObject({
      name: 'Случайная карта',
      seed: 'forest-42',
      terrain: 'RANDOM',
      size: 'MEDIUM',
      playerCount: 4,
      danger: 'MEDIUM',
      objective: 'SKIRMISH',
      obstacleDensity: 'BALANCED',
      difficultTerrain: true,
      entrances: 2,
    });
    expect(generateRandomBattleMapRequestSchema.safeParse({ gridColumns: 20 }).success).toBe(false);
    expect(
      generateRandomBattleMapRequestSchema.safeParse({
        enemies: [
          { name: 'Гоблины', count: 20 },
          { name: 'Кобольды', count: 20 },
          { name: 'Скелеты', count: 20 },
        ],
      }).success,
    ).toBe(false);
    expect(
      generateRandomBattleMapRequestSchema.safeParse({
        enemyCount: 2,
        enemies: [{ name: 'Волк', count: 2 }],
      }).success,
    ).toBe(false);
  });
});
