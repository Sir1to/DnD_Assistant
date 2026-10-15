import { Injectable, NotFoundException } from '@nestjs/common';
import type { Dnd5eMonsterCatalogueResponse, Dnd5eMonsterStatBlock } from '@fog-of-lore/contracts';
import {
  dnd5eBestiaryAttribution,
  dnd5eMonsterById,
  dnd5eMonsterCatalogue,
} from '@fog-of-lore/domain/dnd5e-bestiary';

@Injectable()
export class RulesetsService {
  public dnd5eMonsters(): Dnd5eMonsterCatalogueResponse {
    return {
      ruleset: 'dnd5e-srd-5.2.1',
      source: 'SRD 5.2.1',
      license: 'CC-BY-4.0',
      attribution: dnd5eBestiaryAttribution,
      monsters: dnd5eMonsterCatalogue(),
    };
  }

  public dnd5eMonster(id: string): Dnd5eMonsterStatBlock {
    const monster = dnd5eMonsterById(id);
    if (!monster) throw new NotFoundException('Monster not found');
    return monster;
  }
}
