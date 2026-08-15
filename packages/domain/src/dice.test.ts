import { describe, expect, it } from 'vitest';

import { parseDiceExpression, pickRandomItem, rollDice } from './dice';

describe('dice domain', () => {
  it('parses safe dice expressions without eval', () => {
    expect(parseDiceExpression('2d6 + 3')).toEqual({
      count: 2,
      sides: 6,
      modifier: 3,
      normalized: '2d6+3',
    });
  });

  it('rolls using an injected random source', () => {
    const values = [0, 0.999];
    expect(rollDice('2d6+3', () => values.shift() ?? 0)).toMatchObject({
      rolls: [1, 6],
      total: 10,
    });
    expect(pickRandomItem(['a', 'b', 'c'], () => 0.5)).toBe('b');
  });

  it('rejects unsupported dice and excessive load', () => {
    expect(() => parseDiceExpression('101d20')).toThrow(RangeError);
    expect(() => parseDiceExpression('2d7')).toThrow(SyntaxError);
    expect(() => parseDiceExpression('2d20;process.exit()')).toThrow();
  });
});
