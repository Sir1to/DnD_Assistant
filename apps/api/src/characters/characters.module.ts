import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';

@Module({
  imports: [AuthModule, CampaignsModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
