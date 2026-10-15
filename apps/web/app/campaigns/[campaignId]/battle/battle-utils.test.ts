import { describe, expect, it } from 'vitest';

import { cellStyle, drawnRectangle, initials, nextUnusedTokenColor } from './battle-utils';

describe('battle UI helpers', () => {
  it('selects the first unused token color case-insensitively', () => {
    expect(nextUnusedTokenColor([])).toBe('#7c5cff');
    expect(nextUnusedTokenColor([{ color: '#7C5CFF' }])).toBe('#ef5350');
  });

  it('builds a rectangle regardless of drag direction', () => {
    expect(drawnRectangle({ x: 5, y: 4 }, { x: 2, y: 1 })).toEqual({
      x: 2,
      y: 1,
      width: 4,
      height: 4,
    });
  });

  it('converts grid coordinates to percentage positioning', () => {
    expect(cellStyle(2, 1, 2, 10, 5)).toEqual({
      left: '20%',
      top: '20%',
      width: '20%',
      height: '40%',
    });
  });

  it('creates compact initials and handles hidden names', () => {
    expect(initials('Серый Страж')).toBe('СС');
    expect(initials(null)).toBe('?');
  });
});
