import {
  dnd5eAttribution,
  dnd5eBackgrounds,
  dnd5eBuilds,
  dnd5eClasses,
  dnd5eEquipment,
  dnd5eSkills,
  dnd5eSpecies,
  dnd5eSpells,
  maximumDnd5eSpellLevel,
  type AbilityScores,
} from './dnd5e';
import type { CharacterAbilityMethod, CharacterDocumentV2 } from './character-document-v2';

export const dnd5eGuidedCreationVersion = 1 as const;

export const dnd5eGuidedCreationSteps = [
  { id: 'concept', title: 'Концепция', description: 'Имя и режим создания героя.' },
  { id: 'origin', title: 'Вид и прошлое', description: 'Вид и предыстория персонажа.' },
  { id: 'class', title: 'Класс', description: 'Класс и уровень.' },
  { id: 'abilities', title: 'Характеристики', description: 'Метод и значения характеристик.' },
  { id: 'skills', title: 'Навыки', description: 'Навыки от класса и предыстории.' },
  { id: 'spells', title: 'Заклинания', description: 'Заклинания выбранного класса.' },
  { id: 'equipment', title: 'Снаряжение', description: 'Стартовое снаряжение.' },
  { id: 'story', title: 'История', description: 'Внешность, личность и история.' },
  { id: 'review', title: 'Проверка', description: 'Итоговая проверка правил.' },
] as const;

export const dnd5eGuidedAbilityMethods = [
  { id: 'STANDARD_ARRAY', name: 'Стандартный массив', description: '15, 14, 13, 12, 10 и 8.' },
  { id: 'POINT_BUY', name: 'Покупка за 27 очков', description: 'Распределите ровно 27 очков.' },
  { id: 'ROLL', name: 'Броски', description: 'Результаты бросков проверяет мастер.' },
  { id: 'MANUAL', name: 'Ручной ввод', description: 'Введите согласованные значения.' },
  { id: 'CAMPAIGN', name: 'Правила кампании', description: 'Используйте значения кампании.' },
] as const satisfies readonly {
  id: CharacterAbilityMethod;
  name: string;
  description: string;
}[];

export type Dnd5eBeginnerGoal = 'FRONTLINE' | 'SUPPORT' | 'EXPLORATION' | 'MAGIC';
export type Dnd5eBeginnerComplexity = 'SIMPLE' | 'BALANCED' | 'TACTICAL';

export interface Dnd5eBeginnerPreferences {
  goal: Dnd5eBeginnerGoal;
  complexity: Dnd5eBeginnerComplexity;
}

export interface Dnd5eBuildRecommendation {
  buildId: string;
  score: number;
  reasons: string[];
}

const beginnerBuildProfiles: Record<
  string,
  {
    goals: Record<Dnd5eBeginnerGoal, number>;
    complexities: Record<Dnd5eBeginnerComplexity, number>;
    goalReasons: Partial<Record<Dnd5eBeginnerGoal, string>>;
    complexityReasons: Record<Dnd5eBeginnerComplexity, string>;
  }
> = {
  'guardian-fighter': {
    goals: { FRONTLINE: 5, SUPPORT: 2, EXPLORATION: 1, MAGIC: 0 },
    complexities: { SIMPLE: 4, BALANCED: 3, TACTICAL: 1 },
    goalReasons: {
      FRONTLINE: 'держит передовую и прикрывает союзников',
      SUPPORT: 'защищает группу от прямых угроз',
    },
    complexityReasons: {
      SIMPLE: 'понятный ход без управления заклинаниями',
      BALANCED: 'даёт тактический выбор без лишней нагрузки',
      TACTICAL: 'позиционирование на передовой всё равно требует решений',
    },
  },
  'field-cleric': {
    goals: { FRONTLINE: 3, SUPPORT: 5, EXPLORATION: 1, MAGIC: 3 },
    complexities: { SIMPLE: 1, BALANCED: 4, TACTICAL: 3 },
    goalReasons: {
      FRONTLINE: 'может оставаться рядом с передовой',
      SUPPORT: 'лечит и усиливает союзников',
      MAGIC: 'сочетает заклинания с надёжной защитой',
    },
    complexityReasons: {
      SIMPLE: 'готовый набор сокращает выбор заклинаний на старте',
      BALANCED: 'чередует оружие, поддержку и заклинания',
      TACTICAL: 'требует выбирать между лечением, усилением и атакой',
    },
  },
  'quiet-scout': {
    goals: { FRONTLINE: 1, SUPPORT: 1, EXPLORATION: 5, MAGIC: 0 },
    complexities: { SIMPLE: 3, BALANCED: 4, TACTICAL: 3 },
    goalReasons: {
      EXPLORATION: 'замечает опасность, скрывается и работает с ловушками',
      SUPPORT: 'помогает группе разведкой и полезными навыками',
    },
    complexityReasons: {
      SIMPLE: 'основные действия легко повторять из хода в ход',
      BALANCED: 'сочетает бой, скрытность и исследование',
      TACTICAL: 'вознаграждает выбор позиции и подходящего момента',
    },
  },
  'careful-wizard': {
    goals: { FRONTLINE: 0, SUPPORT: 2, EXPLORATION: 2, MAGIC: 5 },
    complexities: { SIMPLE: 0, BALANCED: 2, TACTICAL: 5 },
    goalReasons: {
      MAGIC: 'управляет полем и решает задачи заклинаниями',
      EXPLORATION: 'использует знания и магические инструменты вне боя',
      SUPPORT: 'контролирует противников и создаёт возможности для группы',
    },
    complexityReasons: {
      SIMPLE: 'готовая книга заклинаний помогает начать без долгой настройки',
      BALANCED: 'даёт несколько готовых решений для разных ситуаций',
      TACTICAL: 'предлагает больше всего выбора заклинаний и контроля поля',
    },
  },
};

export function recommendDnd5eBuilds(
  preferences: Dnd5eBeginnerPreferences,
): Dnd5eBuildRecommendation[] {
  return dnd5eBuilds
    .map((build, index) => {
      const profile = beginnerBuildProfiles[build.id];
      if (!profile) return { buildId: build.id, score: 0, reasons: [build.summary], index };
      const goalScore = profile.goals[preferences.goal];
      const complexityScore = profile.complexities[preferences.complexity];
      const reasons = [
        profile.goalReasons[preferences.goal],
        profile.complexityReasons[preferences.complexity],
      ].filter((reason): reason is string => Boolean(reason));
      return {
        buildId: build.id,
        score: goalScore * 2 + complexityScore,
        reasons: reasons.length > 0 ? reasons : [build.summary],
        index,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ buildId, score, reasons }) => ({ buildId, score, reasons }));
}

const defaultAbilityScores: AbilityScores = {
  strength: 15,
  dexterity: 14,
  constitution: 13,
  intelligence: 12,
  wisdom: 10,
  charisma: 8,
};

export function dnd5eCharacterOptions() {
  return {
    ruleset: 'dnd5e-srd-5.2.1' as const,
    attribution: dnd5eAttribution,
    guided: {
      version: dnd5eGuidedCreationVersion,
      steps: dnd5eGuidedCreationSteps.map((step) => ({ ...step })),
      abilityMethods: dnd5eGuidedAbilityMethods.map((method) => ({ ...method })),
    },
    classes: dnd5eClasses,
    species: dnd5eSpecies,
    backgrounds: dnd5eBackgrounds,
    skills: dnd5eSkills,
    spells: dnd5eSpells,
    equipment: dnd5eEquipment,
    builds: dnd5eBuilds,
  };
}

export function createDnd5eGuidedCharacterDocument(): CharacterDocumentV2 {
  return {
    documentVersion: 2,
    ruleset: { id: 'dnd5e-srd-5.2.1', version: '5.2.1' },
    creation: { mode: 'GUIDED', decisions: [] },
    identity: { level: 1, speciesId: '', classId: '', backgroundId: '' },
    abilities: { method: 'STANDARD_ARRAY', scores: { ...defaultAbilityScores } },
    choices: { skillIds: [], spellIds: [] },
    inventory: { equipment: [] },
    profile: { personality: '', appearance: '', backstory: '', notes: '' },
    ruleOverrides: [],
  };
}

export function createDnd5eManualCharacterDocument(): CharacterDocumentV2 {
  return {
    ...createDnd5eGuidedCharacterDocument(),
    creation: { mode: 'MANUAL', decisions: [] },
    abilities: {
      method: 'MANUAL',
      scores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
    },
  };
}

export function createDnd5eAutomaticCharacterDocument(
  buildId: string,
  speciesId: string,
  abilityMethod: CharacterAbilityMethod,
  preferences?: Dnd5eBeginnerPreferences,
): CharacterDocumentV2 | null {
  const build = dnd5eBuilds.find(({ id }) => id === buildId);
  const species = dnd5eSpecies.find(({ id }) => id === speciesId);
  if (!build || !species) return null;
  const background = dnd5eBackgrounds.find(({ id }) => id === build.backgroundId);
  const equipmentIds = [...new Set([...build.equipmentIds, ...(background?.equipmentIds ?? [])])];

  return {
    documentVersion: 2,
    ruleset: { id: 'dnd5e-srd-5.2.1', version: '5.2.1' },
    creation: {
      mode: 'AUTOMATIC',
      decisions: [
        ...(preferences
          ? [
              { stepId: 'beginner-goal', optionIds: [preferences.goal] },
              { stepId: 'beginner-complexity', optionIds: [preferences.complexity] },
            ]
          : []),
        { stepId: 'party-role', optionIds: [build.id] },
        { stepId: 'species', optionIds: [species.id] },
        { stepId: 'ability-method', optionIds: [abilityMethod] },
      ],
    },
    identity: {
      level: 1,
      speciesId: species.id,
      classId: build.classId,
      backgroundId: build.backgroundId,
    },
    abilities: { method: abilityMethod, scores: { ...build.abilities } },
    choices: {
      skillIds: [...new Set([...(background?.skillIds ?? []), ...build.skillIds])],
      spellIds: [...build.spellIds],
    },
    inventory: {
      equipment: equipmentIds.map((optionId) => ({
        optionId,
        name: dnd5eEquipment.find(({ id }) => id === optionId)?.name ?? optionId,
        quantity: 1,
        notes: '',
      })),
    },
    profile: { personality: '', appearance: '', backstory: '', notes: '' },
    ruleOverrides: [],
  };
}

export function applyDnd5eGuidedIdentity(
  document: CharacterDocumentV2,
  field: 'speciesId' | 'classId' | 'backgroundId' | 'level',
  value: string | number,
): CharacterDocumentV2 {
  const next = {
    ...document,
    identity: { ...document.identity, [field]: value },
  } as CharacterDocumentV2;
  if (field === 'backgroundId') {
    const previous = dnd5eBackgrounds.find(({ id }) => id === document.identity.backgroundId);
    const selected = dnd5eBackgrounds.find(({ id }) => id === value);
    const retained = next.choices.skillIds.filter((id) => !previous?.skillIds.includes(id));
    next.choices = {
      ...next.choices,
      skillIds: [...new Set([...retained, ...(selected?.skillIds ?? [])])],
    };
  }
  if (field === 'classId' || field === 'level') {
    const choices = resolveDnd5eGuidedChoices(next);
    next.choices = {
      ...next.choices,
      skillIds: next.choices.skillIds.filter((id) => choices.allowedSkillIds.includes(id)),
      spellIds: next.choices.spellIds.filter((id) => choices.availableSpellIds.includes(id)),
    };
  }
  if (field === 'classId' || field === 'backgroundId') {
    const equipmentIds = guidedStartingEquipmentIds(next);
    const previousById = new Map(
      document.inventory.equipment.flatMap((item) =>
        item.optionId ? [[item.optionId, item]] : [],
      ),
    );
    next.inventory = {
      equipment: equipmentIds.map((optionId) => {
        const previous = previousById.get(optionId);
        return (
          previous ?? {
            optionId,
            name: dnd5eEquipment.find(({ id }) => id === optionId)?.name ?? optionId,
            quantity: 1,
            notes: '',
          }
        );
      }),
    };
  }
  return next;
}

export function resolveDnd5eGuidedChoices(document: CharacterDocumentV2) {
  const characterClass = dnd5eClasses.find(({ id }) => id === document.identity.classId);
  const background = dnd5eBackgrounds.find(({ id }) => id === document.identity.backgroundId);
  const backgroundSkillIds = [...(background?.skillIds ?? [])];
  const allowedSkillIds = [
    ...new Set([...(characterClass?.allowedSkillIds ?? []), ...backgroundSkillIds]),
  ];
  const selectedClassSkillIds = document.choices.skillIds.filter(
    (id) => characterClass?.allowedSkillIds.includes(id) && !backgroundSkillIds.includes(id),
  );
  return {
    backgroundSkillIds,
    allowedSkillIds,
    maxClassSkills: characterClass?.skillChoices ?? 0,
    selectedClassSkillIds,
    availableSpellIds: dnd5eSpells
      .filter(
        ({ classIds, level }) =>
          classIds.includes(document.identity.classId) &&
          level <= maximumDnd5eSpellLevel(document.identity.classId, document.identity.level),
      )
      .map(({ id }) => id),
    availableEquipmentIds: guidedStartingEquipmentIds(document),
  };
}

export function guidedStartingEquipmentIds(document: CharacterDocumentV2): string[] {
  const characterClass = dnd5eClasses.find(({ id }) => id === document.identity.classId);
  const background = dnd5eBackgrounds.find(({ id }) => id === document.identity.backgroundId);
  return [
    ...new Set([
      ...(characterClass?.starterEquipmentIds ?? []),
      ...(background?.equipmentIds ?? []),
    ]),
  ];
}

export function recordDnd5eGuidedDecisions(document: CharacterDocumentV2): CharacterDocumentV2 {
  if (document.creation.mode !== 'GUIDED') return document;

  return {
    ...document,
    creation: {
      mode: 'GUIDED',
      decisions: [
        {
          stepId: 'origin',
          optionIds: [document.identity.speciesId, document.identity.backgroundId].filter(Boolean),
        },
        { stepId: 'class', optionIds: [document.identity.classId].filter(Boolean) },
        { stepId: 'abilities', optionIds: [document.abilities.method] },
        { stepId: 'skills', optionIds: [...document.choices.skillIds] },
        { stepId: 'spells', optionIds: [...document.choices.spellIds] },
        {
          stepId: 'equipment',
          optionIds: document.inventory.equipment.flatMap(({ optionId }) =>
            optionId ? [optionId] : [],
          ),
        },
      ],
    },
  };
}
