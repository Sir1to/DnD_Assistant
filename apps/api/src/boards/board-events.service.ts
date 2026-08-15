import { Injectable } from '@nestjs/common';
import type { EventEnvelope, WebsocketEventName } from '@fog-of-lore/contracts';

interface EventServer {
  to(room: string): {
    emit(event: string, envelope: EventEnvelope): void;
  };
}

@Injectable()
export class BoardEventsService {
  private server?: EventServer;

  public attach(server: EventServer): void {
    this.server = server;
  }

  public publish(
    boardId: string,
    eventName: WebsocketEventName,
    data: Record<string, unknown>,
    revision?: number,
  ): void {
    const envelope: EventEnvelope = {
      contractVersion: 1,
      eventId: globalThis.crypto.randomUUID(),
      eventName,
      occurredAt: new Date().toISOString(),
      boardId,
      data,
      ...(revision === undefined ? {} : { revision }),
    };

    this.server?.to(`board:${boardId}:masters`).emit('board.event', envelope);
    this.server?.to(`board:${boardId}:players`).emit('board.event', {
      ...envelope,
      data: {},
    });
  }
}
