import { describe, expect, it } from 'vitest';

import {
  deriveCharacterDocumentV2,
  dnd5eCharacterRuleCoverage,
  migrateCharacterSheetDataV1,
  projectCharacterDocumentV2ToV1,
  validateCharacterDocumentV2,
  type CharacterSheetDataV1,
} from './character-document-v2';

const legacyFighter: CharacterSheetDataV1 = {
  level: 1,
  speciesId: 'dwarf',
  classId: 'fighter',
  backgroundId: 'soldier',
  abilityMethod: 'STANDARD_ARRAY',
  abilities: {
    strength: 15,
    dexterity: 10,
    constitution: 14,
    intelligence: 8,
    wisdom: 12,
    charisma: 13,
  },
  skillIds: ['athletics', 'intimidation', 'perception'],
  spellIds: [],
  equipment: [
    { optionId: 'chain-mail', name: 'Кольчуга', quantity: 1, notes: '' },
    { optionId: 'shield', name: 'Щит', quantity: 1, notes: '' },
  ],
  hitPoints: 12,
  armorClass: 18,
  speed: 30,
  personality: 'Держит слово.',
  appearance: 'Старый шрам.',
  backstory: 'Защищал караваны.',
  notes: 'Боится высоты.',
};

describe('character document v2', () => {
  it('migrates a v1 sheet without mutating or silently recalculating it', () => {
    const source = structuredClone(legacyFighter);
    source.armorClass = 19;
    source.speed = 25;

    const migration = migrateCharacterSheetDataV1(source, 'GUIDED');

    expect(source).toEqual({ ...legacyFighter, armorClass: 19, speed: 25 });
    expect(migration.document).toMatchObject({
      documentVersion: 2,
      ruleset: { id: 'dnd5e-srd-5.2.1', version: '5.2.1' },
      creation: { mode: 'GUIDED', decisions: [] },
      identity: { level: 1, speciesId: 'dwarf', classId: 'fighter', backgroundId: 'soldier' },
      profile: { notes: 'Боится высоты.' },
    });
    expect(migration.document.ruleOverrides).toEqual([
      expect.objectContaining({ path: '/derived/armorClass', value: 19, source: 'LEGACY_V1' }),
      expect.objectContaining({ path: '/derived/speed', value: 25, source: 'LEGACY_V1' }),
    ]);
    expect(migration.runtimeSeed).toEqual({ currentHitPoints: 12, temporaryHitPoints: 0 });

    const zeroHitPoints = migrateCharacterSheetDataV1({ ...legacyFighter, hitPoints: 0 });
    expect(zeroHitPoints.document.ruleOverrides).toContainEqual(
      expect.objectContaining({ path: '/derived/hitPointMaximum', value: 0 }),
    );
  });

  it('derives a level-one fighter from choices and equipment', () => {
    const { document } = migrateCharacterSheetDataV1(legacyFighter);
    expect(deriveCharacterDocumentV2(document)).toEqual({
      abilityModifiers: {
        strength: 2,
        dexterity: 0,
        constitution: 2,
        intelligence: -1,
        wisdom: 1,
        charisma: 1,
      },
      proficiencyBonus: 2,
      hitPointMaximum: 12,
      armorClass: 18,
      speed: 30,
      initiative: 0,
      passivePerception: 13,
    });
  });

  it('projects a v2 document into the legacy read model without sharing mutable arrays', () => {
    const { document } = migrateCharacterSheetDataV1(legacyFighter, 'GUIDED');
    const projected = projectCharacterDocumentV2ToV1(document);

    expect(projected).toEqual(legacyFighter);
    projected.skillIds.push('stealth');
    projected.equipment[0]!.name = 'Изменено';
    expect(document.choices.skillIds).not.toContain('stealth');
    expect(document.inventory.equipment[0]!.name).toBe('Кольчуга');
  });

  it('rejects incompatible choices with stable issue codes and paths', () => {
    const { document } = migrateCharacterSheetDataV1(legacyFighter);
    document.abilities.method = 'POINT_BUY';
    document.abilities.scores.charisma = 12;
    document.choices.skillIds = [
      'athletics',
      'arcana',
      'arcana',
      'stealth',
      'perception',
      'intimidation',
    ];
    document.choices.spellIds = ['fireball'];
    document.inventory.equipment.push({
      optionId: 'artifact-from-homebrew',
      name: 'Артефакт',
      quantity: 1,
      notes: '',
    });

    const issues = validateCharacterDocumentV2(document);
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'ability.point-buy.invalid',
        'skill.duplicate',
        'skill.not-allowed',
        'skill.too-many',
        'spell.not-allowed',
        'equipment.unknown',
      ]),
    );
    expect(issues.every(({ path }) => path.startsWith('/'))).toBe(true);
  });

  it('keeps the SRD coverage matrix auditable and explicit about gaps', () => {
    const ids = dnd5eCharacterRuleCoverage.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(dnd5eCharacterRuleCoverage.every(({ source }) => source.startsWith('SRD 5.2.1:'))).toBe(
      true,
    );
    expect(dnd5eCharacterRuleCoverage.every(({ license }) => license === 'CC-BY-4.0')).toBe(true);
    expect(
      dnd5eCharacterRuleCoverage
        .filter(({ status }) => status === 'IMPLEMENTED')
        .every(({ tests }) => tests.length > 0),
    ).toBe(true);
    expect(dnd5eCharacterRuleCoverage.some(({ status }) => status === 'PLANNED')).toBe(true);
  });

  it('rejects equipment outside the guided starting package', () => {
    const { document } = migrateCharacterSheetDataV1(legacyFighter, 'GUIDED');
    document.inventory.equipment.push({
      optionId: 'spellbook',
      name: 'Книга заклинаний',
      quantity: 1,
      notes: '',
    });

    expect(validateCharacterDocumentV2(document)).toContainEqual(
      expect.objectContaining({
        code: 'equipment.not-starting-option',
        path: '/inventory/equipment/2/optionId',
        severity: 'ERROR',
      }),
    );
  });

  it('rejects equipment outside the starting package in manual mode too', () => {
    const { document } = migrateCharacterSheetDataV1(legacyFighter, 'MANUAL');
    document.inventory.equipment.push({
      optionId: 'spellbook',
      name: 'Книга заклинаний',
      quantity: 1,
      notes: '',
    });

    expect(validateCharacterDocumentV2(document)).toContainEqual(
      expect.objectContaining({
        code: 'equipment.not-starting-option',
        path: '/inventory/equipment/2/optionId',
        severity: 'ERROR',
      }),
    );
  });

  it('rejects a class spell above the character spell level', () => {
    const { document } = migrateCharacterSheetDataV1(legacyFighter, 'GUIDED');
    document.identity.classId = 'wizard';
    document.choices.spellIds = ['wish'];

    expect(validateCharacterDocumentV2(document)).toContainEqual(
      expect.objectContaining({
        code: 'spell.level-too-high',
        path: '/choices/spellIds',
        severity: 'ERROR',
      }),
    );
  });
});
