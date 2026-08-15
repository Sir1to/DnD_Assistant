export interface ParsedDiceExpression {
  count: number;
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  modifier: number;
  normalized: string;
}

export interface DiceRoll {
  total: number;
  rolls: number[];
  expression: ParsedDiceExpression;
}

const diceExpression = /^(\d{0,3})d(4|6|8|10|12|20|100)([+-]\d{1,4})?$/i;

export function parseDiceExpression(input: string): ParsedDiceExpression {
  const compact = input.replace(/\s+/g, '');

  if (compact.length === 0 || compact.length > 16) {
    throw new RangeError('Dice expression must contain between 1 and 16 characters');
  }

  const match = diceExpression.exec(compact);
  if (!match) throw new SyntaxError('Unsupported dice expression');

  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]) as ParsedDiceExpression['sides'];
  const modifier = match[3] ? Number(match[3]) : 0;

  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new RangeError('A roll must use between 1 and 100 dice');
  }

  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > 9999) {
    throw new RangeError('Dice modifier is too large');
  }

  return {
    count,
    sides,
    modifier,
    normalized: `${count}d${sides}${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : modifier}`,
  };
}

export function rollDice(input: string, random: () => number = Math.random): DiceRoll {
  const expression = parseDiceExpression(input);
  const rolls = Array.from(
    { length: expression.count },
    () => Math.floor(clampRandom(random()) * expression.sides) + 1,
  );
  return {
    expression,
    rolls,
    total: rolls.reduce((sum, value) => sum + value, expression.modifier),
  };
}

export function pickRandomItem<T>(items: readonly T[], random: () => number = Math.random): T {
  if (items.length === 0) throw new RangeError('The random table is empty');
  return items[Math.floor(clampRandom(random()) * items.length)] as T;
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Random source returned a non-finite value');
  return Math.max(0, Math.min(0.9999999999999999, value));
}
