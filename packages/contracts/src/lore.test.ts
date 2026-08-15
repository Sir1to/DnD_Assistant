import { describe, expect, it } from 'vitest';

import { createLoreEntryRequestSchema, updateLoreEntryRequestSchema } from './lore';

describe('lore contracts', () => {
  it('creates safe master-only drafts by default', () => {
    expect(createLoreEntryRequestSchema.parse({ title: 'Старая башня' })).toEqual({
      title: 'Старая башня',
      content: '',
      category: 'GENERAL',
      isPinned: false,
      status: 'DRAFT',
      audience: 'MASTER',
      recipientUserIds: [],
    });
  });

  it('deduplicates recipients and rejects empty updates', () => {
    const playerId = '32c094fd-d15b-4d08-944e-2ad26fc62537';
    expect(
      createLoreEntryRequestSchema.parse({
        title: 'Личное письмо',
        audience: 'SELECTED_PLAYERS',
        recipientUserIds: [playerId, playerId],
      }).recipientUserIds,
    ).toEqual([playerId]);
    expect(updateLoreEntryRequestSchema.safeParse({ expectedRevision: 0 }).success).toBe(false);
  });

  it('rejects oversized material content', () => {
    expect(
      createLoreEntryRequestSchema.safeParse({
        title: 'Слишком длинный материал',
        content: 'x'.repeat(100_001),
      }).success,
    ).toBe(false);
  });

  it('supports almanac sections and an independent important marker', () => {
    expect(
      createLoreEntryRequestSchema.parse({
        title: 'Карта затопленного храма',
        category: 'MAP',
        isPinned: true,
      }),
    ).toMatchObject({ category: 'MAP', isPinned: true });
    expect(updateLoreEntryRequestSchema.parse({ expectedRevision: 2, isPinned: false })).toEqual({
      expectedRevision: 2,
      isPinned: false,
    });
  });
});
