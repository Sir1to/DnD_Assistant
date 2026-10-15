import { describe, expect, it } from 'vitest';

import { searchReference, type ReferenceSearchSource } from './reference-search';

const source: ReferenceSearchSource = {
  monsters: [
    {
      id: 'srd:goblin',
      name: 'Goblin',
      size: 'Small',
      type: 'humanoid',
      challengeRating: '1/4',
      experiencePoints: 50,
      armorClass: 15,
      hitPoints: 7,
      hitPointFormula: '2d6',
      initiativeModifier: 2,
    },
  ],
  spells: [
    {
      id: 'fire-bolt',
      name: 'Огненный снаряд',
      description: 'Дальнобойная атака огнём.',
      level: 0,
      classIds: ['wizard'],
    },
  ],
  equipment: [
    {
      id: 'longsword',
      name: 'Длинный меч',
      description: '1к8 рубящего урона.',
      category: 'WEAPON',
      cost: '15 зм',
    },
  ],
  formulaGroups: [
    {
      id: 'attacks',
      title: 'Атаки и защита',
      summary: 'Короткая памятка.',
      formulas: [
        {
          id: 'critical-hit',
          title: 'Критическое попадание',
          formula: 'Бросить кости урона дважды',
          explanation: 'Натуральная 20 всегда попадает.',
        },
      ],
    },
  ],
};

describe('searchReference', () => {
  it('searches all reference categories with one query', () => {
    expect(searchReference('урона', source).groups.map(({ category }) => category)).toEqual([
      'EQUIPMENT',
      'RULE',
    ]);
    expect(searchReference('wizard', source).groups[0]?.results[0]).toMatchObject({
      category: 'SPELL',
      id: 'fire-bolt',
    });
    expect(searchReference('CR 1/4', source).groups[0]?.results[0]).toMatchObject({
      category: 'MONSTER',
      id: 'srd:goblin',
    });
  });

  it('is insensitive to case, accents and Russian е/ё', () => {
    expect(searchReference('ОГНЕМ', source).total).toBe(1);
    expect(searchReference('gObLiN', source).total).toBe(1);
  });

  it('requires every token and ranks title matches first', () => {
    expect(searchReference('урона дважды', source).groups[0]?.results[0]?.id).toBe('critical-hit');
    expect(searchReference('урона неизвестно', source).total).toBe(0);
  });

  it('limits visible results while preserving the total count', () => {
    const repeated = {
      ...source,
      spells: Array.from({ length: 8 }, (_, index) => ({
        ...source.spells[0]!,
        id: `fire-bolt-${index}`,
        name: `Огненный снаряд ${index}`,
      })),
    };
    const result = searchReference('огненный', repeated, 3);

    expect(result.groups[0]).toMatchObject({ category: 'SPELL', total: 8 });
    expect(result.groups[0]?.results).toHaveLength(3);
  });
});
