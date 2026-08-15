import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { canAccessDirectConversation } from '@fog-of-lore/domain';
import type { CampaignRole } from '@fog-of-lore/contracts';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { campaignMembers, directConversations } from '../database/schema';
import { CampaignAccessService } from '../campaigns/campaign-access.service';

export type DirectConversationAccess = {
  campaignId: string;
  conversationId: string;
  playerUserId: string;
  role: CampaignRole;
  lastSequence: number;
};

@Injectable()
export class DirectMessageAccessService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly campaignAccess: CampaignAccessService,
  ) {}

  public async requireConversation(
    userId: string,
    conversationId: string,
  ): Promise<DirectConversationAccess> {
    const [record] = await this.database
      .select({
        campaignId: directConversations.campaignId,
        conversationId: directConversations.id,
        playerUserId: directConversations.playerUserId,
        role: campaignMembers.role,
        lastSequence: directConversations.lastSequence,
      })
      .from(directConversations)
      .innerJoin(
        campaignMembers,
        and(
          eq(campaignMembers.campaignId, directConversations.campaignId),
          eq(campaignMembers.userId, userId),
        ),
      )
      .where(eq(directConversations.id, conversationId))
      .limit(1);

    if (!record || !canAccessDirectConversation(record.role, userId, record.playerUserId)) {
      throw new NotFoundException('Direct conversation not found');
    }

    return record;
  }

  public async requirePlayerTarget(
    userId: string,
    campaignId: string,
    playerUserId: string,
  ): Promise<CampaignRole> {
    const role = await this.campaignAccess.requireMembership(userId, campaignId);

    if (!canAccessDirectConversation(role, userId, playerUserId)) {
      throw new NotFoundException('Player not found');
    }

    const [player] = await this.database
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.userId, playerUserId),
          eq(campaignMembers.role, 'PLAYER'),
        ),
      )
      .limit(1);

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return role;
  }
}
