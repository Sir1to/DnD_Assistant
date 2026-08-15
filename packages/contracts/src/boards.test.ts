import { describe, expect, it } from 'vitest';

import {
  createWidgetRequestSchema,
  createBoardViewRequestSchema,
  notesStateSchema,
  updateBoardLayoutRequestSchema,
  updateWidgetRequestSchema,
} from './boards';

describe('board contracts', () => {
  it('applies safe defaults for notes and allows registry-provided widget titles', () => {
    expect(notesStateSchema.parse({})).toEqual({ content: '' });
    const widget = createWidgetRequestSchema.parse({
      type: 'NOTES',
      boardViewId: '32c094fd-d15b-4d08-944e-2ad26fc62537',
      initialState: { content: 'Быстрая заметка' },
    });
    expect(widget.title).toBeUndefined();
    expect(widget.initialState).toEqual({ content: 'Быстрая заметка' });
  });

  it('rejects oversized layouts and empty widget updates', () => {
    expect(
      updateBoardLayoutRequestSchema.safeParse({
        placements: [
          {
            id: '22648f7f-2cf0-43de-922d-667eb620c584',
            x: 0,
            y: 0,
            width: 13,
            height: 4,
          },
        ],
      }).success,
    ).toBe(false);
    expect(updateWidgetRequestSchema.safeParse({ expectedRevision: 0 }).success).toBe(false);
  });

  it('keeps new board views master-only unless explicitly published', () => {
    expect(createBoardViewRequestSchema.parse({ name: 'Секреты мастера' }).audience).toBe('MASTER');
    expect(
      createBoardViewRequestSchema.parse({
        name: 'Экран игроков',
        audience: 'PLAYERS',
      }).audience,
    ).toBe('PLAYERS');
  });
});
