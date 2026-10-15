import { describe, expect, it } from 'vitest';

import {
  characterDocumentV2Schema,
  characterDocumentResponseSchema,
  characterRuntimeStateSchema,
  characterSheetDataSchema,
  importCharacterSheetRequestSchema,
  portableCharacterSheetSchema,
  updateCharacterDocumentRequestSchema,
} from './characters';

const data = characterSheetDataSchema.parse({});

describe('character sheet contracts', () => {
  it('provides a complete new-sheet document', () => {
    expect(data.level).toBe(1);
    expect(data.abilities.strength).toBe(15);
    expect(data.equipment).toEqual([]);
  });

  it('accepts the portable version 1 envelope', () => {
    const sheet = portableCharacterSheetSchema.parse({
      format: 'fog-of-lore.character-sheet',
      version: 1,
      exportedAt: new Date().toISOString(),
      ruleset: {
        id: 'dnd5e-srd-5.2.1',
        system: 'D&D 5e',
        source: 'SRD 5.2.1',
        license: 'CC-BY-4.0',
      },
      character: { name: 'Mira', data },
    });
    expect(importCharacterSheetRequestSchema.parse({ sheet }).sheet.character.name).toBe('Mira');
  });

  it('rejects a future or foreign sheet format', () => {
    expect(() => portableCharacterSheetSchema.parse({ format: 'unknown', version: 99 })).toThrow();
  });

  it('validates versioned documents and isolated runtime state', () => {
    const document = characterDocumentV2Schema.parse({
      documentVersion: 2,
      ruleset: { id: 'dnd5e-srd-5.2.1', version: '5.2.1' },
      creation: { mode: 'GUIDED', decisions: [] },
      identity: { level: 1, speciesId: 'human', classId: 'fighter', backgroundId: 'soldier' },
      abilities: { method: 'STANDARD_ARRAY', scores: data.abilities },
      choices: { skillIds: [], spellIds: [] },
      inventory: { equipment: [] },
      profile: { personality: '', appearance: '', backstory: '', notes: '' },
      ruleOverrides: [],
    });
    expect(document.documentVersion).toBe(2);
    expect(
      updateCharacterDocumentRequestSchema.parse({
        expectedRevision: 0,
        name: 'Mira',
        status: 'DRAFT',
        document,
      }).status,
    ).toBe('DRAFT');
    expect(
      characterDocumentResponseSchema.parse({
        sheetId: '10000000-0000-4000-8000-000000000001',
        campaignId: '10000000-0000-4000-8000-000000000002',
        ownerUserId: '10000000-0000-4000-8000-000000000003',
        ownerDisplayName: 'Owner',
        name: 'Mira',
        status: 'DRAFT',
        storedDocumentVersion: 1,
        document,
        derived: {
          abilityModifiers: {
            strength: 2,
            dexterity: 2,
            constitution: 1,
            intelligence: 1,
            wisdom: 0,
            charisma: -1,
          },
          proficiencyBonus: 2,
          hitPointMaximum: 11,
          armorClass: 12,
          speed: 30,
          initiative: 2,
          passivePerception: 10,
        },
        issues: [],
        revision: 0,
        updatedAt: new Date().toISOString(),
      }).storedDocumentVersion,
    ).toBe(1);
    expect(
      characterRuntimeStateSchema.parse({
        currentHitPoints: 10,
        temporaryHitPoints: 0,
        resources: {},
        spellSlots: {},
        conditions: [],
        inspiration: false,
        deathSaveSuccesses: 0,
        deathSaveFailures: 0,
        revision: 0,
        updatedAt: new Date().toISOString(),
      }).currentHitPoints,
    ).toBe(10);
  });

  it('does not allow archived status through the document editor command', () => {
    expect(() =>
      updateCharacterDocumentRequestSchema.parse({
        expectedRevision: 0,
        name: 'Mira',
        status: 'ARCHIVED',
        document: {},
      }),
    ).toThrow();
  });
});
