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
import { CampaignAccessService } from '../campaigns/campaign-access.service';
import { DirectMessageEventsService } from './direct-message-events.service';

interface SocketClient {
  handshake: { headers: { cookie?: string } };
  join(room: string): Promise<void> | void;
}

@WebSocketGateway({
  cors: { credentials: true, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' },
})
export class DirectMessagesGateway implements OnGatewayInit {
  private readonly logger = new Logger(DirectMessagesGateway.name);

  @WebSocketServer()
  private server!: Parameters<DirectMessageEventsService['attach']>[0];

  public constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(DirectMessageEventsService) private readonly events: DirectMessageEventsService,
  ) {}

  public afterInit(): void {
    this.events.attach(this.server);
  }

  @SubscribeMessage('direct-messages.subscribe')
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
      await this.access.requireMembership(context.user.id, campaignId);
      await client.join(`campaign:${campaignId}:direct-messages:user:${context.user.id}`);
      return { ok: true, campaignId };
    } catch (error) {
      this.logger.warn({ campaignId, error }, 'Direct-message socket subscription rejected');
      return { ok: false, error: 'Subscription rejected' };
    }
  }
}
