import { Injectable } from '@nestjs/common';
import type { CampaignEventEnvelope } from '@fog-of-lore/contracts';

interface EventServer {
  to(room: string): {
    emit(event: string, envelope: CampaignEventEnvelope): void;
  };
}

@Injectable()
export class CampaignEventsService {
  private server?: EventServer;

  public attach(server: EventServer): void {
    this.server = server;
  }

  public publishLoreChanged(campaignId: string): void {
    this.publish(campaignId, 'campaign.lore.changed');
  }

  public publishCharactersChanged(campaignId: string): void {
    this.publish(campaignId, 'campaign.characters.changed');
  }

  public publishBattleChanged(campaignId: string): void {
    this.publish(campaignId, 'campaign.battle.changed');
  }

  private publish(campaignId: string, eventName: CampaignEventEnvelope['eventName']): void {
    const envelope: CampaignEventEnvelope = {
      contractVersion: 1,
      eventId: globalThis.crypto.randomUUID(),
      eventName,
      occurredAt: new Date().toISOString(),
      campaignId,
    };

    this.server?.to(`campaign:${campaignId}:masters`).emit('campaign.event', envelope);
    this.server?.to(`campaign:${campaignId}:players`).emit('campaign.event', envelope);
  }
}
