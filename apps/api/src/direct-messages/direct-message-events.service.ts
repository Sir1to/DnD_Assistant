import { Injectable } from '@nestjs/common';
import type { DirectMessageEventEnvelope, DirectMessageEventName } from '@fog-of-lore/contracts';

interface EventServer {
  to(room: string): {
    emit(event: string, envelope: DirectMessageEventEnvelope): void;
  };
}

@Injectable()
export class DirectMessageEventsService {
  private server?: EventServer;

  public attach(server: EventServer): void {
    this.server = server;
  }

  public publish(
    recipientUserIds: string[],
    eventName: DirectMessageEventName,
    campaignId: string,
    conversationId: string,
    sequence?: number,
  ): void {
    const envelope: DirectMessageEventEnvelope = {
      contractVersion: 1,
      eventId: globalThis.crypto.randomUUID(),
      eventName,
      occurredAt: new Date().toISOString(),
      campaignId,
      conversationId,
      ...(sequence === undefined ? {} : { sequence }),
    };

    for (const userId of new Set(recipientUserIds)) {
      this.server
        ?.to(`campaign:${campaignId}:direct-messages:user:${userId}`)
        .emit('direct-messages.event', envelope);
    }
  }
}
