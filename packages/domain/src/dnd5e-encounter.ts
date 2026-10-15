export const dnd5eChallengeRatings = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
] as const;

export type Dnd5eChallengeRating = (typeof dnd5eChallengeRatings)[number];
export type Dnd5eEncounterDifficulty = 'EMPTY' | 'LOW' | 'MODERATE' | 'HIGH' | 'ABOVE_HIGH';

export type Dnd5ePartyGroup = {
  level: number;
  count: number;
};

export type Dnd5eOpponentGroup = {
  challengeRating: Dnd5eChallengeRating;
  count: number;
  experiencePoints?: number;
};

export type Dnd5eEncounterBudget = {
  low: number;
  moderate: number;
  high: number;
};

export type Dnd5eEncounterAnalysis = {
  partySize: number;
  opponentCount: number;
  opponentExperience: number;
  budget: Dnd5eEncounterBudget;
  difficulty: Dnd5eEncounterDifficulty;
  remainingToNextBudget: number | null;
  warnings: Array<'MANY_CREATURES' | 'POWERFUL_CREATURE'>;
};

const experienceByChallengeRating: Record<Dnd5eChallengeRating, number> = {
  '0': 0,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1_100,
  '5': 1_800,
  '6': 2_300,
  '7': 2_900,
  '8': 3_900,
  '9': 5_000,
  '10': 5_900,
  '11': 7_200,
  '12': 8_400,
  '13': 10_000,
  '14': 11_500,
  '15': 13_000,
  '16': 15_000,
  '17': 18_000,
  '18': 20_000,
  '19': 22_000,
  '20': 25_000,
  '21': 33_000,
  '22': 41_000,
  '23': 50_000,
  '24': 62_000,
  '25': 75_000,
  '26': 90_000,
  '27': 105_000,
  '28': 120_000,
  '29': 135_000,
  '30': 155_000,
};

const budgetByLevel: Record<number, Dnd5eEncounterBudget> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1_100 },
  6: { low: 600, moderate: 1_000, high: 1_400 },
  7: { low: 750, moderate: 1_300, high: 1_700 },
  8: { low: 1_000, moderate: 1_700, high: 2_100 },
  9: { low: 1_300, moderate: 2_000, high: 2_600 },
  10: { low: 1_600, moderate: 2_300, high: 3_100 },
  11: { low: 1_900, moderate: 2_900, high: 4_100 },
  12: { low: 2_200, moderate: 3_700, high: 4_700 },
  13: { low: 2_600, moderate: 4_200, high: 5_400 },
  14: { low: 2_900, moderate: 4_900, high: 6_200 },
  15: { low: 3_300, moderate: 5_400, high: 7_800 },
  16: { low: 3_800, moderate: 6_100, high: 9_800 },
  17: { low: 4_500, moderate: 7_200, high: 11_700 },
  18: { low: 5_000, moderate: 8_700, high: 14_200 },
  19: { low: 5_500, moderate: 10_700, high: 17_200 },
  20: { low: 6_400, moderate: 13_200, high: 22_000 },
};

export function dnd5eExperienceForChallengeRating(challengeRating: Dnd5eChallengeRating): number {
  return experienceByChallengeRating[challengeRating];
}

export function dnd5eEncounterBudget(party: Dnd5ePartyGroup[]): Dnd5eEncounterBudget {
  return party.reduce<Dnd5eEncounterBudget>(
    (total, group) => {
      const levelBudget = budgetByLevel[normalizeInteger(group.level, 1, 20)];
      if (!levelBudget) return total;
      const count = normalizeInteger(group.count, 0, 20);
      return {
        low: total.low + levelBudget.low * count,
        moderate: total.moderate + levelBudget.moderate * count,
        high: total.high + levelBudget.high * count,
      };
    },
    { low: 0, moderate: 0, high: 0 },
  );
}

export function analyzeDnd5eEncounter(
  party: Dnd5ePartyGroup[],
  opponents: Dnd5eOpponentGroup[],
): Dnd5eEncounterAnalysis {
  const normalizedParty = party.map((group) => ({
    level: normalizeInteger(group.level, 1, 20),
    count: normalizeInteger(group.count, 0, 20),
  }));
  const budget = dnd5eEncounterBudget(normalizedParty);
  const partySize = normalizedParty.reduce((total, group) => total + group.count, 0);
  const normalizedOpponents = opponents.map((group) => ({
    challengeRating: group.challengeRating,
    count: normalizeInteger(group.count, 0, 100),
    experiencePoints:
      group.experiencePoints === undefined
        ? dnd5eExperienceForChallengeRating(group.challengeRating)
        : normalizeInteger(group.experiencePoints, 0, 155_000),
  }));
  const opponentCount = normalizedOpponents.reduce((total, group) => total + group.count, 0);
  const opponentExperience = normalizedOpponents.reduce(
    (total, group) => total + group.experiencePoints * group.count,
    0,
  );
  const difficulty = difficultyForExperience(opponentExperience, budget);
  const warnings: Dnd5eEncounterAnalysis['warnings'] = [];

  if (partySize > 0 && opponentCount > partySize * 2) warnings.push('MANY_CREATURES');

  const highestPartyLevel = normalizedParty.reduce(
    (highest, group) => (group.count > 0 ? Math.max(highest, group.level) : highest),
    0,
  );
  if (
    highestPartyLevel > 0 &&
    normalizedOpponents.some(
      (group) =>
        group.count > 0 && challengeRatingAsNumber(group.challengeRating) > highestPartyLevel,
    )
  ) {
    warnings.push('POWERFUL_CREATURE');
  }

  return {
    partySize,
    opponentCount,
    opponentExperience,
    budget,
    difficulty,
    remainingToNextBudget: remainingToNextBudget(opponentExperience, budget),
    warnings,
  };
}

function difficultyForExperience(
  experience: number,
  budget: Dnd5eEncounterBudget,
): Dnd5eEncounterDifficulty {
  if (experience <= 0) return 'EMPTY';
  if (experience <= budget.low) return 'LOW';
  if (experience <= budget.moderate) return 'MODERATE';
  if (experience <= budget.high) return 'HIGH';
  return 'ABOVE_HIGH';
}

function remainingToNextBudget(experience: number, budget: Dnd5eEncounterBudget): number | null {
  if (experience < budget.low) return budget.low - experience;
  if (experience < budget.moderate) return budget.moderate - experience;
  if (experience < budget.high) return budget.high - experience;
  return null;
}

function challengeRatingAsNumber(challengeRating: Dnd5eChallengeRating): number {
  const [numerator, denominator] = challengeRating.split('/').map(Number);
  return denominator ? numerator! / denominator : numerator!;
}

function normalizeInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}
