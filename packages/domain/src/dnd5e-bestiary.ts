import bestiaryData from './data/dnd5e-srd-5.2.1-bestiary.json';
import bestiaryRussianNames from './data/dnd5e-srd-5.2.1-bestiary-ru.json';
import {
  dnd5eChallengeRatings,
  dnd5eExperienceForChallengeRating,
  type Dnd5eChallengeRating,
} from './dnd5e-encounter';

export const dnd5eMonsterSizes = [
  'Tiny',
  'Small',
  'Medium',
  'Large',
  'Huge',
  'Gargantuan',
] as const;

export const dnd5eMonsterTypes = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const;

export type Dnd5eMonsterSize = (typeof dnd5eMonsterSizes)[number];
export type Dnd5eMonsterType = (typeof dnd5eMonsterTypes)[number];

export type Dnd5eMonsterSummary = {
  id: string;
  name: string;
  englishName: string;
  referenceUrl: string;
  size: Dnd5eMonsterSize;
  type: Dnd5eMonsterType;
  challengeRating: Dnd5eChallengeRating;
  experiencePoints: number;
  armorClass: number;
  hitPoints: number;
  hitPointFormula: string;
  initiativeModifier: number;
};

export type Dnd5eNamedRule = { name: string; description: string };

export type Dnd5eMonsterStatBlock = Dnd5eMonsterSummary & {
  abilityScores: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>;
  speed: Record<string, number | boolean>;
  savingThrows: Record<string, number>;
  skills: Record<string, number>;
  senses: Record<string, number>;
  languages: string[];
  damageVulnerabilities: string[];
  damageResistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  traits: Dnd5eNamedRule[];
  actions: Array<
    Dnd5eNamedRule & {
      attackBonus?: number;
      damage?: Array<{ dice: string; type: string }>;
    }
  >;
  reactions: Dnd5eNamedRule[];
  legendaryActions: {
    description: string;
    perRound: number;
    actions: Array<Dnd5eNamedRule & { cost: number }>;
  } | null;
  source: 'SRD 5.2.1';
  license: 'CC-BY-4.0';
};

export type Dnd5eMonsterSearch = {
  query?: string;
  challengeRating?: Dnd5eChallengeRating;
  type?: Dnd5eMonsterType;
};

type StoredMonster = Omit<
  Dnd5eMonsterStatBlock,
  'experiencePoints' | 'source' | 'license' | 'englishName' | 'referenceUrl'
>;
type StoredBestiary = {
  schemaVersion: number;
  ruleset: string;
  source: string;
  license: string;
  attribution: string;
  monsters: StoredMonster[];
};

const storedBestiary = bestiaryData as unknown as StoredBestiary;

type StoredRussianNames = {
  schemaVersion: number;
  ruleset: string;
  source: string;
  monsters: Array<{
    id: string;
    name: string;
    englishName: string;
    referenceUrl: string;
    traits?: Dnd5eNamedRule[];
    actions?: Dnd5eNamedRule[];
    reactions?: Dnd5eNamedRule[];
    legendaryActions?: { description: string; actions: Dnd5eNamedRule[] };
  }>;
};
const storedRussianNames = bestiaryRussianNames as StoredRussianNames;

validateBestiary(storedBestiary);
if (
  storedRussianNames.schemaVersion !== 1 ||
  storedRussianNames.ruleset !== storedBestiary.ruleset
) {
  throw new Error('Unsupported D&D 5e bestiary localization dataset');
}

const russianNameById = new Map(
  storedRussianNames.monsters.map((monster) => [monster.id, monster]),
);

export const dnd5eBestiaryAttribution = `${storedBestiary.attribution} Русские названия и совместимые тексты статблоков сверены с dnd.su; ссылка на соответствующую русскую карточку приводится в каждом статблоке.`;

export const dnd5eBestiary: Dnd5eMonsterStatBlock[] = storedBestiary.monsters.map((monster) => {
  const localized = russianNameById.get(monster.id);
  return {
    ...monster,
    name: localized?.name ?? monster.name,
    englishName: localized?.englishName ?? monster.name,
    referenceUrl: localized?.referenceUrl ?? 'https://dnd.su/bestiary/',
    traits: mergeLocalizedRules(monster.traits, localized?.traits),
    actions: mergeLocalizedRules(monster.actions, localized?.actions),
    reactions: mergeLocalizedRules(monster.reactions, localized?.reactions),
    legendaryActions: monster.legendaryActions
      ? {
          ...monster.legendaryActions,
          description:
            localized?.legendaryActions?.description ?? monster.legendaryActions.description,
          actions: mergeLocalizedRules(
            monster.legendaryActions.actions,
            localized?.legendaryActions?.actions,
          ),
        }
      : null,
    experiencePoints: dnd5eExperienceForChallengeRating(monster.challengeRating),
    source: 'SRD 5.2.1',
    license: 'CC-BY-4.0',
  };
});

const monsterById = new Map(dnd5eBestiary.map((monster) => [monster.id, monster]));

export function dnd5eMonsterCatalogue(): Dnd5eMonsterSummary[] {
  return dnd5eBestiary.map(toSummary);
}

export function dnd5eMonsterById(id: string): Dnd5eMonsterStatBlock | undefined {
  return monsterById.get(id);
}

export function searchDnd5eMonsters(input: Dnd5eMonsterSearch = {}): Dnd5eMonsterSummary[] {
  const query = input.query?.trim().toLocaleLowerCase('ru-RU') ?? '';
  return dnd5eBestiary
    .filter(
      (monster) =>
        (!query ||
          monster.name.toLocaleLowerCase('ru-RU').includes(query) ||
          monster.englishName.toLocaleLowerCase('en-US').includes(query)) &&
        (!input.challengeRating || monster.challengeRating === input.challengeRating) &&
        (!input.type || monster.type === input.type),
    )
    .map(toSummary);
}

function toSummary(monster: Dnd5eMonsterStatBlock): Dnd5eMonsterSummary {
  const {
    id,
    name,
    englishName,
    referenceUrl,
    size,
    type,
    challengeRating,
    experiencePoints,
    armorClass,
    hitPoints,
    hitPointFormula,
    initiativeModifier,
  } = monster;
  return {
    id,
    name,
    englishName,
    referenceUrl,
    size,
    type,
    challengeRating,
    experiencePoints,
    armorClass,
    hitPoints,
    hitPointFormula,
    initiativeModifier,
  };
}

function mergeLocalizedRules<T extends Dnd5eNamedRule>(
  original: T[],
  localized: Dnd5eNamedRule[] | undefined,
): T[] {
  if (!localized || localized.length !== original.length) return original;
  return original.map((rule, index) => ({ ...rule, ...localized[index]! }));
}

function validateBestiary(data: StoredBestiary): void {
  if (
    data.schemaVersion !== 1 ||
    data.ruleset !== 'dnd5e-srd-5.2.1' ||
    data.source !== 'SRD 5.2.1' ||
    data.license !== 'CC-BY-4.0'
  ) {
    throw new Error('Unsupported D&D 5e bestiary dataset');
  }

  const validRatings = new Set<string>(dnd5eChallengeRatings);
  const ids = new Set<string>();
  for (const monster of data.monsters) {
    if (ids.has(monster.id)) throw new Error(`Duplicate D&D 5e monster id: ${monster.id}`);
    if (!validRatings.has(monster.challengeRating)) {
      throw new Error(`Unsupported challenge rating for ${monster.id}: ${monster.challengeRating}`);
    }
    ids.add(monster.id);
  }
}
