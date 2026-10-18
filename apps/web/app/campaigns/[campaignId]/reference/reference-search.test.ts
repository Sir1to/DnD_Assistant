import { describe, expect, it } from 'vitest';

import {
  filterFormulaGroups,
  searchReference,
  type ReferenceSearchSource,
} from './reference-search';

const source: ReferenceSearchSource = {
  monsters: [
    {
      id: 'srd:goblin',
      name: 'Гоблин',
      englishName: 'Goblin',
      referenceUrl: 'https://dnd.su/bestiary/438-goblin/',
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
      englishName: 'Fire Bolt',
      description: 'Дальнобойная атака огнём.',
      level: 0,
      classIds: ['wizard'],
      referenceUrl: 'https://dnd.su/spells/204-fire-bolt/',
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

describe('filterFormulaGroups', () => {
  it('filters by category until a query searches across every formula group', () => {
    const groups = [
      ...source.formulaGroups,
      {
        id: 'movement',
        title: 'Движение',
        summary: 'Памятка по карте.',
        formulas: [
          {
            id: 'falling',
            title: 'Падение',
            formula: '1к6 за каждые 10 футов',
            explanation: 'Максимум 20к6.',
          },
        ],
      },
    ];

    expect(filterFormulaGroups(groups, '', 'movement').map(({ id }) => id)).toEqual(['movement']);
    expect(filterFormulaGroups(groups, 'крит урон', 'movement')[0]?.formulas[0]?.id).toBe(
      'critical-hit',
    );
  });

  it('matches formulas by explanation and normalizes е/ё', () => {
    expect(filterFormulaGroups(source.formulaGroups, 'натуральная 20')[0]?.formulas[0]?.id).toBe(
      'critical-hit',
    );
    expect(filterFormulaGroups(source.formulaGroups, 'неизвестная формула')).toEqual([]);
  });
});
