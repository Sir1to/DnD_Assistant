import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { DirectMessageAccessService } from './direct-message-access.service';
import { DirectMessageEventsService } from './direct-message-events.service';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessagesService } from './direct-messages.service';

@Module({
  imports: [AuthModule, CampaignsModule],
  controllers: [DirectMessagesController],
  providers: [
    DirectMessageAccessService,
    DirectMessageEventsService,
    DirectMessagesGateway,
    DirectMessagesService,
  ],
})
export class DirectMessagesModule {}
