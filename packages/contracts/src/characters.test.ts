import { describe, expect, it } from 'vitest';

import {
  characterFolcharImportPreviewSchema,
  characterDocumentV2Schema,
  characterDocumentResponseSchema,
  characterDocumentRevisionListResponseSchema,
  characterOptionsResponseSchema,
  characterRuntimeStateSchema,
  characterSheetDataSchema,
  createCharacterSheetRequestSchema,
  importCharacterSheetRequestSchema,
  portableCharacterSheetSchema,
  restoreCharacterDocumentRevisionRequestSchema,
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

  it('validates a safe .folchar import preview', () => {
    const preview = characterFolcharImportPreviewSchema.parse({
      exportedAt: '2026-10-16T18:00:00.000Z',
      ruleset: 'dnd5e-srd-5.2.1',
      rulesetVersion: '5.2.1',
      name: 'Рада Серый Щит',
      status: 'READY',
      creationMode: 'GUIDED',
      identity: {
        level: 1,
        speciesId: 'human',
        classId: 'fighter',
        backgroundId: 'soldier',
      },
      derived: {
        abilityModifiers: {
          strength: 2,
          dexterity: 1,
          constitution: 1,
          intelligence: 0,
          wisdom: 0,
          charisma: -1,
        },
        proficiencyBonus: 2,
        hitPointMaximum: 11,
        armorClass: 11,
        speed: 30,
        initiative: 1,
        passivePerception: 10,
      },
      issues: [],
      runtime: {
        currentHitPoints: 10,
        temporaryHitPoints: 2,
        resourceCount: 1,
        spellSlotCount: 0,
        conditions: [],
        inspiration: false,
      },
      hasPortrait: true,
    });

    expect(preview.name).toBe('Рада Серый Щит');
    expect(preview.hasPortrait).toBe(true);
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
        masterCorrections: [],
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

  it('validates immutable document history and restore commands', () => {
    const response = characterDocumentRevisionListResponseSchema.parse({
      sheetId: '10000000-0000-4000-8000-000000000001',
      currentRevision: 3,
      revisions: [
        {
          id: '10000000-0000-4000-8000-000000000004',
          documentRevision: 3,
          name: 'Mira',
          status: 'READY',
          actorKind: 'GAME_MASTER',
          kind: 'UPDATED',
          summary: 'Уточнена предыстория',
          changedByUserId: '10000000-0000-4000-8000-000000000003',
          changedByDisplayName: 'GM',
          masterCorrectionPaths: ['/profile/backstory'],
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(response.revisions[0]?.masterCorrectionPaths).toEqual(['/profile/backstory']);
    expect(
      restoreCharacterDocumentRevisionRequestSchema.parse({
        expectedRevision: 3,
        summary: 'Возврат к исходной версии',
      }),
    ).toMatchObject({ expectedRevision: 3 });
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

  it('requires a versioned guided-creation graph in character options', () => {
    expect(() =>
      characterOptionsResponseSchema.parse({
        ruleset: 'dnd5e-srd-5.2.1',
        attribution: 'SRD attribution',
        guided: {
          version: 1,
          steps: [{ id: 'concept', title: 'Концепция', description: 'Начальный шаг.' }],
          abilityMethods: [
            { id: 'STANDARD_ARRAY', name: 'Массив', description: 'Готовые значения.' },
          ],
        },
        classes: [],
        species: [],
        backgrounds: [],
        skills: [],
        spells: [],
        equipment: [],
        builds: [],
      }),
    ).not.toThrow();
  });

  it('accepts atomic creation of a version 2 character document', () => {
    expect(() =>
      createCharacterSheetRequestSchema.parse({
        name: 'Арина',
        status: 'READY',
        document: {
          documentVersion: 2,
          ruleset: { id: 'dnd5e-srd-5.2.1', version: '5.2.1' },
          creation: { mode: 'GUIDED', decisions: [] },
          identity: { level: 1, speciesId: 'human', classId: 'fighter', backgroundId: 'soldier' },
          abilities: {
            method: 'STANDARD_ARRAY',
            scores: {
              strength: 15,
              dexterity: 14,
              constitution: 13,
              intelligence: 12,
              wisdom: 10,
              charisma: 8,
            },
          },
          choices: { skillIds: ['athletics', 'intimidation'], spellIds: [] },
          inventory: { equipment: [] },
          profile: { personality: '', appearance: '', backstory: '', notes: '' },
          ruleOverrides: [],
        },
      }),
    ).not.toThrow();
  });
});
