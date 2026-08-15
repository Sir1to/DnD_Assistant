import { describe, expect, it } from 'vitest';

import {
  characterSheetDataSchema,
  importCharacterSheetRequestSchema,
  portableCharacterSheetSchema,
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
});
