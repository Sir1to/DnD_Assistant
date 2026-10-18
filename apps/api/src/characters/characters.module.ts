import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { CharactersController } from './characters.controller';
import { PublicCharactersController } from './public-characters.controller';
import { PublicShareRateLimiter } from './public-share-rate-limiter.service';
import { CharactersService } from './characters.service';

@Module({
  imports: [AuthModule, CampaignsModule],
  controllers: [CharactersController, PublicCharactersController],
  providers: [CharactersService, PublicShareRateLimiter],
})
export class CharactersModule {}
