import { describe, expect, it } from 'vitest';

import {
  analyzeDnd5eEncounter,
  dnd5eEncounterBudget,
  dnd5eExperienceForChallengeRating,
} from './dnd5e-encounter';

describe('D&D 5e encounter planning', () => {
  it('uses the SRD 5.2.1 XP budgets for a same-level party', () => {
    expect(dnd5eEncounterBudget([{ level: 1, count: 4 }])).toEqual({
      low: 200,
      moderate: 300,
      high: 400,
    });
    expect(dnd5eEncounterBudget([{ level: 3, count: 5 }])).toEqual({
      low: 750,
      moderate: 1_125,
      high: 2_000,
    });
  });

  it('adds budgets for a mixed-level party', () => {
    expect(
      dnd5eEncounterBudget([
        { level: 3, count: 2 },
        { level: 4, count: 2 },
      ]),
    ).toEqual({ low: 800, moderate: 1_200, high: 1_800 });
  });

  it('maps every CR to its official XP value', () => {
    expect(dnd5eExperienceForChallengeRating('1/8')).toBe(25);
    expect(dnd5eExperienceForChallengeRating('2')).toBe(450);
    expect(dnd5eExperienceForChallengeRating('30')).toBe(155_000);
  });

  it('accepts the alternate 10 XP value used by some CR 0 stat blocks', () => {
    const result = analyzeDnd5eEncounter(
      [{ level: 1, count: 4 }],
      [{ challengeRating: '0', experiencePoints: 10, count: 3 }],
    );

    expect(result.opponentExperience).toBe(30);
    expect(result.difficulty).toBe('LOW');
  });

  it('reproduces the moderate SRD example without a creature-count multiplier', () => {
    const result = analyzeDnd5eEncounter(
      [{ level: 3, count: 5 }],
      [
        { challengeRating: '2', count: 2 },
        { challengeRating: '1/8', count: 9 },
      ],
    );

    expect(result.opponentExperience).toBe(1_125);
    expect(result.difficulty).toBe('MODERATE');
    expect(result.remainingToNextBudget).toBe(875);
  });

  it('warns about oversized groups and opponents above the party level', () => {
    const result = analyzeDnd5eEncounter(
      [{ level: 1, count: 4 }],
      [
        { challengeRating: '1/8', count: 9 },
        { challengeRating: '2', count: 1 },
      ],
    );

    expect(result.difficulty).toBe('ABOVE_HIGH');
    expect(result.warnings).toEqual(['MANY_CREATURES', 'POWERFUL_CREATURE']);
  });

  it('normalizes editable numeric inputs to safe bounds', () => {
    const result = analyzeDnd5eEncounter(
      [
        { level: 0, count: -3 },
        { level: 99, count: 2.8 },
      ],
      [{ challengeRating: '1', count: 1.9 }],
    );

    expect(result.partySize).toBe(2);
    expect(result.budget).toEqual({ low: 12_800, moderate: 26_400, high: 44_000 });
    expect(result.opponentCount).toBe(1);
    expect(result.opponentExperience).toBe(200);
  });
});
