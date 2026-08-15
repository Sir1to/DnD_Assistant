import { describe, expect, it } from 'vitest';

import {
  applyDamage,
  applyHealing,
  nextTurn,
  previousTurn,
  removeParticipant,
  type EncounterParticipant,
  type EncounterState,
} from './encounter';

const participants: EncounterParticipant[] = [
  participant('fast', 18, 0),
  participant('slow', 9, 1),
];
const encounter: EncounterState = {
  name: 'Тест',
  status: 'ACTIVE',
  participants,
  activeParticipantId: 'fast',
  round: 1,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};

describe('encounter domain', () => {
  it('advances turns and increments the round after wrapping', () => {
    const slowTurn = nextTurn(encounter, new Date());
    expect(slowTurn.activeParticipantId).toBe('slow');
    const secondRound = nextTurn(slowTurn, new Date());
    expect(secondRound).toMatchObject({ activeParticipantId: 'fast', round: 2 });
  });

  it('moves to the previous turn and previous round', () => {
    const previous = previousTurn({ ...encounter, round: 2 });
    expect(previous).toMatchObject({ activeParticipantId: 'slow', round: 1 });
  });

  it('selects a valid participant after deleting the active one', () => {
    const changed = removeParticipant(encounter, 'fast');
    expect(changed.activeParticipantId).toBe('slow');
  });

  it('applies temporary HP, damage and bounded healing', () => {
    const target = { ...participants[0]!, currentHp: 8, maxHp: 10, temporaryHp: 3 };
    expect(applyDamage(target, 5)).toMatchObject({ currentHp: 6, temporaryHp: 0 });
    expect(applyHealing(target, 50).currentHp).toBe(10);
  });
});

function participant(id: string, initiative: number, order: number): EncounterParticipant {
  return {
    id,
    name: id,
    group: 'ENEMY',
    initiative,
    currentHp: 10,
    maxHp: 10,
    armorClass: null,
    temporaryHp: 0,
    conditions: [],
    note: '',
    hidden: false,
    order,
  };
}
