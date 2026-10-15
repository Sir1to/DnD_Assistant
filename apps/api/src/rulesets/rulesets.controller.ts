import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { Dnd5eMonsterCatalogueResponse, Dnd5eMonsterStatBlock } from '@fog-of-lore/contracts';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RulesetsService } from './rulesets.service';

@Controller('rulesets/dnd5e')
@UseGuards(SessionAuthGuard)
export class RulesetsController {
  public constructor(@Inject(RulesetsService) private readonly rulesets: RulesetsService) {}

  @Get('monsters')
  public monsters(): Dnd5eMonsterCatalogueResponse {
    return this.rulesets.dnd5eMonsters();
  }

  @Get('monsters/:monsterId')
  public monster(@Param('monsterId') monsterId: string): Dnd5eMonsterStatBlock {
    return this.rulesets.dnd5eMonster(monsterId);
  }
}
