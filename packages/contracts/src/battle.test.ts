import { describe, expect, it } from 'vitest';

import {
  battleSceneSavePayloadSchema,
  createBattleSceneSaveRequestSchema,
  createBattleCombatantRequestSchema,
  createBattleSceneObjectRequestSchema,
  createBattleSceneRequestSchema,
  moveBattleTokenRequestSchema,
} from './battle';

describe('battle contracts', () => {
  it('creates a bounded square scene with useful defaults', () => {
    expect(createBattleSceneRequestSchema.parse({})).toEqual({
      name: 'Боевая сцена',
      gridColumns: 16,
      gridRows: 10,
      shape: 'RECTANGLE',
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
      createBattleSceneObjectRequestSchema.parse({
        kind: 'PROP',
        name: 'Горящая жаровня',
        x: 2,
        y: 3,
        imageAttachmentId: attachmentId,
      }),
    ).toMatchObject({ imageAttachmentId: attachmentId, visibleToPlayers: true });
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
});
