import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BattleController } from './battle.controller';
import { BattleService } from './battle.service';
import { CampaignAccessService } from './campaign-access.service';
import { CampaignEventsService } from './campaign-events.service';
import { CampaignInvitationsController } from './campaign-invitations.controller';
import { CampaignInvitationsService } from './campaign-invitations.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsGateway } from './campaigns.gateway';
import { CampaignsService } from './campaigns.service';
import { LoreController } from './lore.controller';
import { LoreAttachmentsController } from './lore-attachments.controller';
import { LoreAttachmentsService } from './lore-attachments.service';
import { LoreService } from './lore.service';

@Module({
  imports: [AuthModule],
  controllers: [
    CampaignsController,
    CampaignInvitationsController,
    BattleController,
    LoreController,
    LoreAttachmentsController,
  ],
  providers: [
    CampaignAccessService,
    CampaignEventsService,
    CampaignInvitationsService,
    CampaignsGateway,
    CampaignsService,
    BattleService,
    LoreService,
    LoreAttachmentsService,
  ],
  exports: [CampaignAccessService, CampaignEventsService],
})
export class CampaignsModule {}
