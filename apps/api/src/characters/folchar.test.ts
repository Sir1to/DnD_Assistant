import { createDnd5eGuidedCharacterDocument } from '@fog-of-lore/domain';
import { describe, expect, it } from 'vitest';

import { buildFolchar, parseFolchar } from './folchar';

const runtime = {
  currentHitPoints: 10,
  temporaryHitPoints: 2,
  resources: { inspirationDice: 1 },
  spellSlots: { '1': 2 },
  conditions: [],
  inspiration: false,
  deathSaveSuccesses: 0,
  deathSaveFailures: 0,
};

describe('.folchar container', () => {
  it('round-trips a versioned v2 document and optional portrait', () => {
    const archive = buildFolchar({
      exportedAt: '2026-10-16T18:00:00.000Z',
      character: {
        name: 'Рада Серый Щит',
        status: 'DRAFT',
        document: createDnd5eGuidedCharacterDocument(),
        runtime,
      },
      portrait: Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBPdata', 'binary'),
    });
    const parsed = parseFolchar(archive);
    expect(parsed.character.name).toBe('Рада Серый Щит');
    expect(parsed.character.document.documentVersion).toBe(2);
    expect(parsed.character.runtime.temporaryHitPoints).toBe(2);
    expect(parsed.portrait?.subarray(8, 12).toString()).toBe('WEBP');
  });

  it('rejects changed payload bytes before parsing the character', () => {
    const archive = buildFolchar({
      exportedAt: '2026-10-16T18:00:00.000Z',
      character: {
        name: 'Безопасный лист',
        status: 'DRAFT',
        document: createDnd5eGuidedCharacterDocument(),
        runtime,
      },
    });
    const marker = Buffer.from('Безопасный лист');
    const position = archive.indexOf(marker);
    expect(position).toBeGreaterThan(0);
    archive[position] = (archive[position] ?? 0) ^ 1;
    expect(() => parseFolchar(archive)).toThrow(/CRC mismatch/);
  });
});
