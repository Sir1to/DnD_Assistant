import {
  dnd5eMonsterCatalogueResponseSchema,
  dnd5eMonsterStatBlockSchema,
} from '@fog-of-lore/contracts';
import { describe, expect, it } from 'vitest';

import { RulesetsService } from './rulesets.service';

describe('RulesetsService', () => {
  const service = new RulesetsService();

  it('serves the complete SRD catalogue through the public contract', () => {
    const result = dnd5eMonsterCatalogueResponseSchema.parse(service.dnd5eMonsters());

    expect(result.monsters).toHaveLength(322);
    expect(result.source).toBe('SRD 5.2.1');
    expect(result.license).toBe('CC-BY-4.0');
  });

  it('serves normalized stat blocks and rejects unknown ids', () => {
    const goblin = dnd5eMonsterStatBlockSchema.parse(service.dnd5eMonster('srd:goblin'));

    expect(goblin).toMatchObject({
      name: 'Гоблин',
      englishName: 'Goblin',
      challengeRating: '1/4',
      experiencePoints: 50,
    });
    expect(() => service.dnd5eMonster('srd:not-a-monster')).toThrow('Monster not found');
  });
});
