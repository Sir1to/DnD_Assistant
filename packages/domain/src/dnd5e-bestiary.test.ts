import { describe, expect, it } from 'vitest';

import {
  dnd5eBestiary,
  dnd5eMonsterById,
  dnd5eMonsterCatalogue,
  searchDnd5eMonsters,
} from './dnd5e-bestiary';

describe('D&D 5e SRD 5.2.1 bestiary', () => {
  it('contains a stable normalized catalogue without duplicate ids', () => {
    const catalogue = dnd5eMonsterCatalogue();

    expect(catalogue).toHaveLength(322);
    expect(new Set(catalogue.map(({ id }) => id)).size).toBe(322);
    expect(catalogue.every(({ experiencePoints }) => experiencePoints >= 0)).toBe(true);
  });

  it('returns a complete stat block by stable id', () => {
    const goblin = dnd5eMonsterById('srd:goblin');

    expect(goblin).toMatchObject({
      name: 'Goblin',
      challengeRating: '1/4',
      experiencePoints: 50,
      armorClass: 15,
      hitPoints: 7,
      source: 'SRD 5.2.1',
      license: 'CC-BY-4.0',
    });
    expect(goblin?.actions.length).toBeGreaterThan(0);
  });

  it('filters summaries by name, type, and challenge rating', () => {
    expect(searchDnd5eMonsters({ query: 'goblin' }).map(({ name }) => name)).toContain('Goblin');
    expect(searchDnd5eMonsters({ type: 'dragon', challengeRating: '17' })).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Adult Red Dragon' })]),
    );
  });

  it('keeps all stored entries addressable', () => {
    expect(dnd5eBestiary.every(({ id }) => dnd5eMonsterById(id)?.id === id)).toBe(true);
  });
});
