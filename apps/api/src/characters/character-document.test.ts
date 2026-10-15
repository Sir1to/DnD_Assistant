import { migrateCharacterSheetDataV1 } from '@fog-of-lore/domain';
import { describe, expect, it } from 'vitest';

import { projectStoredCharacterData, readStoredCharacterDocument } from './character-document';

const legacy = {
  level: 1,
  speciesId: 'human',
  classId: 'fighter',
  backgroundId: 'soldier',
  abilityMethod: 'STANDARD_ARRAY' as const,
  abilities: {
    strength: 15,
    dexterity: 13,
    constitution: 14,
    intelligence: 8,
    wisdom: 12,
    charisma: 10,
  },
  skillIds: ['athletics', 'perception'],
  spellIds: [],
  equipment: [],
  hitPoints: 12,
  armorClass: 16,
  speed: 30,
  personality: '',
  appearance: '',
  backstory: '',
  notes: '',
};

describe('stored character document projection', () => {
  it('reads a legacy document only when its metadata says v1', () => {
    expect(projectStoredCharacterData(legacy, 1)).toEqual(legacy);
    expect(projectStoredCharacterData(legacy, 2)).toBeUndefined();
  });

  it('projects a v2 document without accepting it as v1', () => {
    const { document } = migrateCharacterSheetDataV1(legacy, 'GUIDED');
    expect(projectStoredCharacterData(document, 2)).toEqual(legacy);
    expect(projectStoredCharacterData(document, 1)).toBeUndefined();
  });

  it('returns an editable v2 view for legacy and stored v2 documents', () => {
    const migrated = migrateCharacterSheetDataV1(legacy, 'GUIDED').document;
    expect(readStoredCharacterDocument(legacy, 1, 'GUIDED')).toEqual(migrated);
    expect(readStoredCharacterDocument(migrated, 2, 'MANUAL')).toEqual(migrated);
  });

  it('rejects unknown versions and malformed data', () => {
    expect(projectStoredCharacterData({ level: 0 }, 1)).toBeUndefined();
    expect(projectStoredCharacterData({}, 2)).toBeUndefined();
    expect(projectStoredCharacterData(legacy, 3)).toBeUndefined();
    expect(readStoredCharacterDocument({ level: 0 }, 1, 'MANUAL')).toBeUndefined();
    expect(readStoredCharacterDocument({}, 2, 'MANUAL')).toBeUndefined();
    expect(readStoredCharacterDocument(legacy, 3, 'MANUAL')).toBeUndefined();
  });
});
