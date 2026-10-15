import {
  abilityKeys,
  abilityModifier,
  dnd5eBackgrounds,
  dnd5eClasses,
  dnd5eEquipment,
  dnd5eSpecies,
  dnd5eSpells,
  pointBuySpent,
  type AbilityKey,
  type AbilityScores,
} from './dnd5e';

export const characterDocumentVersion = 2 as const;
export const dnd5eCharacterRulesetId = 'dnd5e-srd-5.2.1' as const;
export const dnd5eCharacterRulesetVersion = '5.2.1' as const;

export type CharacterCreationMode = 'AUTOMATIC' | 'GUIDED' | 'MANUAL';
export type CharacterAbilityMethod =
  'STANDARD_ARRAY' | 'POINT_BUY' | 'ROLL' | 'MANUAL' | 'CAMPAIGN';

export interface CharacterEquipmentItemV2 {
  optionId?: string;
  name: string;
  quantity: number;
  notes: string;
}

export interface CharacterDecisionV2 {
  stepId: string;
  optionIds: string[];
}

export type CharacterDerivedOverridePath =
  '/derived/armorClass' | '/derived/hitPointMaximum' | '/derived/speed';

export interface CharacterRuleOverrideV2 {
  path: CharacterDerivedOverridePath;
  value: number;
  reason: string;
  source: 'CAMPAIGN' | 'LEGACY_V1';
}

export interface CharacterDocumentV2 {
  documentVersion: typeof characterDocumentVersion;
  ruleset: {
    id: typeof dnd5eCharacterRulesetId;
    version: typeof dnd5eCharacterRulesetVersion;
  };
  creation: {
    mode: CharacterCreationMode;
    decisions: CharacterDecisionV2[];
  };
  identity: {
    level: number;
    speciesId: string;
    classId: string;
    backgroundId: string;
  };
  abilities: {
    method: CharacterAbilityMethod;
    scores: AbilityScores;
  };
  choices: {
    skillIds: string[];
    spellIds: string[];
  };
  inventory: {
    equipment: CharacterEquipmentItemV2[];
  };
  profile: {
    personality: string;
    appearance: string;
    backstory: string;
    notes: string;
  };
  ruleOverrides: CharacterRuleOverrideV2[];
}

export interface CharacterRuntimeSeedV2 {
  currentHitPoints: number;
  temporaryHitPoints: 0;
}

export interface CharacterSheetDataV1 {
  level: number;
  speciesId: string;
  classId: string;
  backgroundId: string;
  abilityMethod: CharacterAbilityMethod;
  abilities: AbilityScores;
  skillIds: string[];
  spellIds: string[];
  equipment: CharacterEquipmentItemV2[];
  hitPoints: number;
  armorClass: number;
  speed: number;
  personality: string;
  appearance: string;
  backstory: string;
  notes: string;
}

export interface CharacterDerivedValuesV2 {
  abilityModifiers: Record<AbilityKey, number>;
  proficiencyBonus: number;
  hitPointMaximum: number;
  armorClass: number;
  speed: number;
  initiative: number;
  passivePerception: number;
}

export interface CharacterRuleIssue {
  code: string;
  path: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface CharacterRuleCoverageEntry {
  id: string;
  area: 'ABILITY' | 'ANCESTRY' | 'BACKGROUND' | 'CLASS' | 'COMBAT' | 'EQUIPMENT' | 'SPELL';
  status: 'IMPLEMENTED' | 'PLANNED';
  source: string;
  license: 'CC-BY-4.0';
  tests: string[];
}

export const dnd5eCharacterRuleCoverage: readonly CharacterRuleCoverageEntry[] = [
  {
    id: 'ability.modifier',
    area: 'ABILITY',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Ability Scores and Modifiers',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: derives a level-one fighter'],
  },
  {
    id: 'ability.standard-array',
    area: 'ABILITY',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Standard Array',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: rejects incompatible choices'],
  },
  {
    id: 'ability.point-buy',
    area: 'ABILITY',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Point Cost table',
    license: 'CC-BY-4.0',
    tests: ['dnd5e: point buy', 'character-document-v2: rejects incompatible choices'],
  },
  {
    id: 'ancestry.speed',
    area: 'ANCESTRY',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Character Species',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: derives a level-one fighter'],
  },
  {
    id: 'background.skills',
    area: 'BACKGROUND',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Backgrounds',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: rejects incompatible choices'],
  },
  {
    id: 'class.hit-points',
    area: 'CLASS',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Classes and Hit Points',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: derives a level-one fighter'],
  },
  {
    id: 'class.skill-choices',
    area: 'CLASS',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Class Proficiencies',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: rejects incompatible choices'],
  },
  {
    id: 'class.level-features',
    area: 'CLASS',
    status: 'PLANNED',
    source: 'SRD 5.2.1: Class Features by Level',
    license: 'CC-BY-4.0',
    tests: [],
  },
  {
    id: 'combat.armor-class',
    area: 'COMBAT',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Armor Class and Armor table',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: derives a level-one fighter'],
  },
  {
    id: 'combat.saving-throws',
    area: 'COMBAT',
    status: 'PLANNED',
    source: 'SRD 5.2.1: Saving Throws',
    license: 'CC-BY-4.0',
    tests: [],
  },
  {
    id: 'equipment.catalog',
    area: 'EQUIPMENT',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Equipment',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: rejects incompatible choices'],
  },
  {
    id: 'spell.class-availability',
    area: 'SPELL',
    status: 'IMPLEMENTED',
    source: 'SRD 5.2.1: Spell Lists',
    license: 'CC-BY-4.0',
    tests: ['character-document-v2: rejects incompatible choices'],
  },
  {
    id: 'spell.preparation-and-slots',
    area: 'SPELL',
    status: 'PLANNED',
    source: 'SRD 5.2.1: Spellcasting and Class tables',
    license: 'CC-BY-4.0',
    tests: [],
  },
];

export function migrateCharacterSheetDataV1(
  legacy: CharacterSheetDataV1,
  mode: CharacterCreationMode = 'MANUAL',
): { document: CharacterDocumentV2; runtimeSeed: CharacterRuntimeSeedV2 } {
  const document: CharacterDocumentV2 = {
    documentVersion: characterDocumentVersion,
    ruleset: { id: dnd5eCharacterRulesetId, version: dnd5eCharacterRulesetVersion },
    creation: { mode, decisions: [] },
    identity: {
      level: legacy.level,
      speciesId: legacy.speciesId,
      classId: legacy.classId,
      backgroundId: legacy.backgroundId,
    },
    abilities: { method: legacy.abilityMethod, scores: { ...legacy.abilities } },
    choices: { skillIds: [...legacy.skillIds], spellIds: [...legacy.spellIds] },
    inventory: { equipment: legacy.equipment.map((item) => ({ ...item })) },
    profile: {
      personality: legacy.personality,
      appearance: legacy.appearance,
      backstory: legacy.backstory,
      notes: legacy.notes,
    },
    ruleOverrides: [],
  };

  const derived = deriveCharacterDocumentV2(document);
  const candidates: Array<[CharacterDerivedOverridePath, number, number]> = [
    ['/derived/hitPointMaximum', legacy.hitPoints, derived.hitPointMaximum],
    ['/derived/armorClass', legacy.armorClass, derived.armorClass],
    ['/derived/speed', legacy.speed, derived.speed],
  ];
  for (const [path, value, calculated] of candidates) {
    if (value !== calculated) {
      document.ruleOverrides.push({
        path,
        value,
        reason: 'Значение перенесено из листа версии 1 без скрытого пересчёта.',
        source: 'LEGACY_V1',
      });
    }
  }

  return {
    document,
    runtimeSeed: { currentHitPoints: legacy.hitPoints, temporaryHitPoints: 0 },
  };
}

export function deriveCharacterDocumentV2(document: CharacterDocumentV2): CharacterDerivedValuesV2 {
  const abilityModifiers = Object.fromEntries(
    abilityKeys.map((key) => [key, abilityModifier(document.abilities.scores[key])]),
  ) as Record<AbilityKey, number>;
  const characterClass = dnd5eClasses.find(({ id }) => id === document.identity.classId);
  const species = dnd5eSpecies.find(({ id }) => id === document.identity.speciesId);
  const level = Math.max(1, Math.min(20, document.identity.level));
  const constitution = abilityModifiers.constitution;
  const hitPointMaximum = characterClass
    ? Math.max(
        1,
        characterClass.hitDie +
          constitution +
          (level - 1) * Math.max(1, Math.floor(characterClass.hitDie / 2) + 1 + constitution),
      )
    : 0;
  const optionIds = new Set(
    document.inventory.equipment.flatMap(({ optionId }) => (optionId ? [optionId] : [])),
  );
  const armorClass = calculateArmorClass(optionIds, abilityModifiers.dexterity);
  const speed = species?.speed ?? 0;
  const proficiencyBonus = 2 + Math.floor((level - 1) / 4);
  const passivePerception =
    10 +
    abilityModifiers.wisdom +
    (document.choices.skillIds.includes('perception') ? proficiencyBonus : 0);
  const calculated = {
    abilityModifiers,
    proficiencyBonus,
    hitPointMaximum,
    armorClass,
    speed,
    initiative: abilityModifiers.dexterity,
    passivePerception,
  };

  for (const override of document.ruleOverrides) {
    if (override.path === '/derived/hitPointMaximum') calculated.hitPointMaximum = override.value;
    if (override.path === '/derived/armorClass') calculated.armorClass = override.value;
    if (override.path === '/derived/speed') calculated.speed = override.value;
  }
  return calculated;
}

export function projectCharacterDocumentV2ToV1(
  document: CharacterDocumentV2,
): CharacterSheetDataV1 {
  const derived = deriveCharacterDocumentV2(document);
  return {
    level: document.identity.level,
    speciesId: document.identity.speciesId,
    classId: document.identity.classId,
    backgroundId: document.identity.backgroundId,
    abilityMethod: document.abilities.method,
    abilities: { ...document.abilities.scores },
    skillIds: [...document.choices.skillIds],
    spellIds: [...document.choices.spellIds],
    equipment: document.inventory.equipment.map((item) => ({ ...item })),
    hitPoints: derived.hitPointMaximum,
    armorClass: derived.armorClass,
    speed: derived.speed,
    personality: document.profile.personality,
    appearance: document.profile.appearance,
    backstory: document.profile.backstory,
    notes: document.profile.notes,
  };
}

export function validateCharacterDocumentV2(document: CharacterDocumentV2): CharacterRuleIssue[] {
  const issues: CharacterRuleIssue[] = [];
  const characterClass = dnd5eClasses.find(({ id }) => id === document.identity.classId);
  const species = dnd5eSpecies.find(({ id }) => id === document.identity.speciesId);
  const background = dnd5eBackgrounds.find(({ id }) => id === document.identity.backgroundId);

  if (
    !Number.isInteger(document.identity.level) ||
    document.identity.level < 1 ||
    document.identity.level > 20
  ) {
    issues.push(
      issue(
        'level.invalid',
        '/identity/level',
        'ERROR',
        'Уровень должен быть целым числом от 1 до 20.',
      ),
    );
  }
  if (!species)
    issues.push(
      issue('species.unknown', '/identity/speciesId', 'ERROR', 'Выбран неизвестный вид.'),
    );
  if (!characterClass)
    issues.push(issue('class.unknown', '/identity/classId', 'ERROR', 'Выбран неизвестный класс.'));
  if (!background)
    issues.push(
      issue(
        'background.unknown',
        '/identity/backgroundId',
        'ERROR',
        'Выбрана неизвестная предыстория.',
      ),
    );

  for (const key of abilityKeys) {
    const score = document.abilities.scores[key];
    if (!Number.isInteger(score) || score < 1 || score > 30) {
      issues.push(
        issue(
          'ability.out-of-range',
          `/abilities/scores/${key}`,
          'ERROR',
          'Значение характеристики должно быть от 1 до 30.',
        ),
      );
    }
  }
  if (
    document.abilities.method === 'POINT_BUY' &&
    pointBuySpent(document.abilities.scores) !== 27
  ) {
    issues.push(
      issue(
        'ability.point-buy.invalid',
        '/abilities/scores',
        'ERROR',
        'Покупка характеристик должна использовать ровно 27 очков и значения от 8 до 15.',
      ),
    );
  }
  if (document.abilities.method === 'STANDARD_ARRAY') {
    const scores = Object.values(document.abilities.scores).sort((left, right) => right - left);
    if (scores.join(',') !== '15,14,13,12,10,8') {
      issues.push(
        issue(
          'ability.standard-array.invalid',
          '/abilities/scores',
          'ERROR',
          'Стандартный массив должен содержать 15, 14, 13, 12, 10 и 8.',
        ),
      );
    }
  }

  const skillIds = unique(
    document.choices.skillIds,
    '/choices/skillIds',
    'skill.duplicate',
    issues,
  );
  const backgroundSkills = new Set(background?.skillIds ?? []);
  const classSkills = skillIds.filter((id) => !backgroundSkills.has(id));
  if (characterClass) {
    const allowed = new Set(characterClass.allowedSkillIds);
    for (const skillId of classSkills) {
      if (!allowed.has(skillId)) {
        issues.push(
          issue(
            'skill.not-allowed',
            '/choices/skillIds',
            'ERROR',
            `Навык «${skillId}» недоступен выбранному классу.`,
          ),
        );
      }
    }
    if (classSkills.length > characterClass.skillChoices) {
      issues.push(
        issue(
          'skill.too-many',
          '/choices/skillIds',
          'ERROR',
          `Класс позволяет выбрать не более ${characterClass.skillChoices} навыков.`,
        ),
      );
    }
  }
  for (const required of backgroundSkills) {
    if (!skillIds.includes(required)) {
      issues.push(
        issue(
          'skill.background-missing',
          '/choices/skillIds',
          'WARNING',
          `Предыстория добавляет навык «${required}».`,
        ),
      );
    }
  }

  const spellIds = unique(
    document.choices.spellIds,
    '/choices/spellIds',
    'spell.duplicate',
    issues,
  );
  for (const spellId of spellIds) {
    const spell = dnd5eSpells.find(({ id }) => id === spellId);
    if (!spell)
      issues.push(
        issue(
          'spell.unknown',
          '/choices/spellIds',
          'ERROR',
          `Заклинание «${spellId}» отсутствует в rule pack.`,
        ),
      );
    else if (characterClass && !spell.classIds.includes(characterClass.id)) {
      issues.push(
        issue(
          'spell.not-allowed',
          '/choices/spellIds',
          'ERROR',
          `Заклинание «${spellId}» недоступно выбранному классу.`,
        ),
      );
    }
  }

  const equipmentIds = new Set(dnd5eEquipment.map(({ id }) => id));
  for (const [index, item] of document.inventory.equipment.entries()) {
    if (item.optionId && !equipmentIds.has(item.optionId)) {
      issues.push(
        issue(
          'equipment.unknown',
          `/inventory/equipment/${index}/optionId`,
          'ERROR',
          `Предмет «${item.optionId}» отсутствует в rule pack.`,
        ),
      );
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
      issues.push(
        issue(
          'equipment.quantity.invalid',
          `/inventory/equipment/${index}/quantity`,
          'ERROR',
          'Количество предмета должно быть от 1 до 999.',
        ),
      );
    }
  }
  return issues;
}

function calculateArmorClass(optionIds: Set<string>, dexterityModifier: number): number {
  let armorClass = 10 + dexterityModifier;
  if (optionIds.has('leather-armor')) armorClass = Math.max(armorClass, 11 + dexterityModifier);
  if (optionIds.has('scale-mail'))
    armorClass = Math.max(armorClass, 14 + Math.min(2, dexterityModifier));
  if (optionIds.has('chain-mail')) armorClass = Math.max(armorClass, 16);
  if (optionIds.has('shield')) armorClass += 2;
  return armorClass;
}

function issue(
  code: string,
  path: string,
  severity: CharacterRuleIssue['severity'],
  message: string,
): CharacterRuleIssue {
  return { code, path, severity, message };
}

function unique(
  values: string[],
  path: string,
  code: string,
  issues: CharacterRuleIssue[],
): string[] {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length !== values.length)
    issues.push(issue(code, path, 'ERROR', 'Выбор не должен содержать повторов.'));
  return uniqueValues;
}
