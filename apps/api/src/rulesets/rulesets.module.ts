import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RulesetsController } from './rulesets.controller';
import { RulesetsService } from './rulesets.service';

@Module({
  imports: [AuthModule],
  controllers: [RulesetsController],
  providers: [RulesetsService],
})
export class RulesetsModule {}
