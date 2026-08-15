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
import { BoardAccessService } from './board-access.service';
import { BoardEventsService } from './board-events.service';

interface SocketClient {
  handshake: { headers: { cookie?: string } };
  join(room: string): Promise<void> | void;
}

@WebSocketGateway({
  cors: { credentials: true, origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' },
})
export class BoardsGateway implements OnGatewayInit {
  private readonly logger = new Logger(BoardsGateway.name);

  @WebSocketServer()
  private server!: Parameters<BoardEventsService['attach']>[0];

  public constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(BoardAccessService) private readonly access: BoardAccessService,
    @Inject(BoardEventsService) private readonly events: BoardEventsService,
  ) {}

  public afterInit(): void {
    this.events.attach(this.server);
  }

  @SubscribeMessage('board.subscribe')
  public async subscribe(
    @ConnectedSocket() client: SocketClient,
    @MessageBody() body: { boardId?: unknown },
  ): Promise<{ ok: boolean; boardId?: string; error?: string }> {
    const boardId = typeof body?.boardId === 'string' ? body.boardId : '';
    const token = parseSessionToken(client.handshake.headers.cookie);

    if (!token || !isUUID(boardId, '4')) {
      return { ok: false, error: 'Invalid subscription' };
    }

    try {
      const context = await this.auth.authenticate(token);
      const membership = await this.access.requireBoard(context.user.id, boardId);
      const audience = membership.role === 'PLAYER' ? 'players' : 'masters';
      await client.join(`board:${boardId}:${audience}`);
      return { ok: true, boardId };
    } catch (error) {
      this.logger.warn({ boardId, error }, 'Board socket subscription rejected');
      return { ok: false, error: 'Subscription rejected' };
    }
  }
}
