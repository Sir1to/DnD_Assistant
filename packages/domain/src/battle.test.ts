import { describe, expect, it } from 'vitest';

import {
  adjustBattleHp,
  battleHpState,
  findBattleReachableCells,
  squareGridDistance,
  validatePlayerMove,
} from './battle';

const scene = {
  status: 'LIVE' as const,
  gridColumns: 16,
  gridRows: 10,
  activeCombatantId: 'hero',
};
const combatant = { id: 'hero', speed: 6, movementSpent: 1 };
const token = { combatantId: 'hero', ownerUserId: 'player', x: 2, y: 2, size: 1 };

describe('battle movement', () => {
  it('uses square-grid diagonal distance', () => {
    expect(squareGridDistance(2, 2, 6, 5)).toBe(4);
  });

  it('allows only the owner during the active turn and remaining speed', () => {
    expect(
      validatePlayerMove({ scene, combatant, token, userId: 'player', toX: 6, toY: 5 }),
    ).toEqual({ ok: true, distance: 4 });
    expect(
      validatePlayerMove({ scene, combatant, token, userId: 'other', toX: 3, toY: 2 }),
    ).toEqual({ ok: false, reason: 'NOT_TOKEN_OWNER' });
    expect(
      validatePlayerMove({ scene, combatant, token, userId: 'player', toX: 9, toY: 2 }),
    ).toEqual({ ok: false, reason: 'TOO_FAR' });
  });

  it('keeps the whole token inside the scene', () => {
    expect(
      validatePlayerMove({
        scene,
        combatant,
        token: { ...token, size: 2, x: 14, y: 8 },
        userId: 'player',
        toX: 15,
        toY: 9,
      }),
    ).toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
  });

  it('routes around blocking terrain and charges difficult terrain', () => {
    const obstacles = [
      { kind: 'WALL' as const, x: 3, y: 2, width: 1, height: 1, movementCost: 1 },
      { kind: 'DIFFICULT_TERRAIN' as const, x: 2, y: 3, width: 1, height: 1, movementCost: 2 },
    ];
    const reachable = findBattleReachableCells({
      scene,
      token,
      remainingMovement: 2,
      obstacles,
    });
    expect(reachable).not.toContainEqual({ x: 3, y: 2, cost: expect.any(Number) });
    expect(reachable).toContainEqual({ x: 2, y: 3, cost: 2 });
    expect(
      validatePlayerMove({
        scene,
        combatant: { ...combatant, movementSpent: 5 },
        token,
        userId: 'player',
        toX: 2,
        toY: 3,
        obstacles,
      }),
    ).toEqual({ ok: false, reason: 'TOO_FAR' });
  });
});

describe('battle health', () => {
  it('derives public states without exposing exact values', () => {
    expect(battleHpState(10, 10)).toBe('UNHARMED');
    expect(battleHpState(5, 10)).toBe('BLOODIED');
    expect(battleHpState(0, 10)).toBe('DEFEATED');
  });

  it('absorbs damage with temporary hp and caps healing', () => {
    expect(adjustBattleHp(8, 10, 3, 5, 'DAMAGE')).toEqual({ currentHp: 6, temporaryHp: 0 });
    expect(adjustBattleHp(8, 10, 0, 5, 'HEAL')).toEqual({ currentHp: 10, temporaryHp: 0 });
  });
});
