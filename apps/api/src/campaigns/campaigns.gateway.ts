import { Inject, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { OnGatewayInit } from '@nestjs/websockets';

import { AuthService } from '../auth/auth.service';
import { parseSessionToken } from '../auth/session-token';
import { CampaignAccessService } from './campaign-access.service';
import { CampaignEventsService } from './campaign-events.service';

interface SocketClient {
  handshake: { headers: { cookie?: string } };
  join(room: string): Promise<void> | void;
}

@WebSocketGateway({
  cors: { credentials: true, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' },
})
export class CampaignsGateway implements OnGatewayInit {
  private readonly logger = new Logger(CampaignsGateway.name);

  @WebSocketServer()
  private server!: Parameters<CampaignEventsService['attach']>[0];

  public constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(CampaignEventsService) private readonly events: CampaignEventsService,
  ) {}

  public afterInit(): void {
    this.events.attach(this.server);
  }

  @SubscribeMessage('campaign.subscribe')
  public async subscribe(
    @ConnectedSocket() client: SocketClient,
    @MessageBody() body: { campaignId?: unknown },
  ): Promise<{ ok: boolean; campaignId?: string; error?: string }> {
    const campaignId = typeof body?.campaignId === 'string' ? body.campaignId : '';
    const token = parseSessionToken(client.handshake.headers.cookie);

    if (!token || !isUUID(campaignId, '4')) {
      return { ok: false, error: 'Invalid subscription' };
    }

    try {
      const context = await this.auth.authenticate(token);
      const role = await this.access.requireMembership(context.user.id, campaignId);
      const audience = role === 'PLAYER' ? 'players' : 'masters';
      await client.join(`campaign:${campaignId}:${audience}`);
      return { ok: true, campaignId };
    } catch (error) {
      this.logger.warn({ campaignId, error }, 'Campaign socket subscription rejected');
      return { ok: false, error: 'Subscription rejected' };
    }
  }
}
