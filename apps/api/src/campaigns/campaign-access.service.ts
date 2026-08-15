import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CampaignRole } from '@fog-of-lore/contracts';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { campaignMembers } from '../database/schema';

@Injectable()
export class CampaignAccessService {
  public constructor(@Inject(DATABASE) private readonly database: Database) {}

  public async requireMembership(userId: string, campaignId: string): Promise<CampaignRole> {
    const [membership] = await this.database
      .select({ role: campaignMembers.role })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.userId, userId), eq(campaignMembers.campaignId, campaignId)))
      .limit(1);

    if (!membership) {
      // A not-found response avoids revealing whether another user's campaign exists.
      throw new NotFoundException('Campaign not found');
    }

    return membership.role;
  }

  public async requireOwner(userId: string, campaignId: string): Promise<void> {
    const role = await this.requireMembership(userId, campaignId);

    if (role !== 'OWNER') {
      throw new ForbiddenException('Only the campaign owner can manage players');
    }
  }

  public async requireEditor(userId: string, campaignId: string): Promise<CampaignRole> {
    const role = await this.requireMembership(userId, campaignId);

    if (role === 'PLAYER') {
      throw new ForbiddenException('Only game masters can edit campaign content');
    }

    return role;
  }
}
