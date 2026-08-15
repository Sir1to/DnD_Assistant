import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CampaignRole } from '@fog-of-lore/contracts';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { boards, boardViews, campaignMembers, widgetInstances } from '../database/schema';

@Injectable()
export class BoardAccessService {
  public constructor(@Inject(DATABASE) private readonly database: Database) {}

  public async requireBoard(
    userId: string,
    boardId: string,
  ): Promise<{ boardId: string; campaignId: string; role: CampaignRole }> {
    const [record] = await this.database
      .select({
        boardId: boards.id,
        campaignId: boards.campaignId,
        role: campaignMembers.role,
      })
      .from(boards)
      .innerJoin(
        campaignMembers,
        and(eq(campaignMembers.campaignId, boards.campaignId), eq(campaignMembers.userId, userId)),
      )
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('Board not found');
    }

    return record;
  }

  public async requireView(
    userId: string,
    viewId: string,
  ): Promise<{ boardId: string; campaignId: string; role: CampaignRole }> {
    const [record] = await this.database
      .select({
        boardId: boardViews.boardId,
        campaignId: boards.campaignId,
        role: campaignMembers.role,
        audience: boardViews.audience,
      })
      .from(boardViews)
      .innerJoin(boards, eq(boards.id, boardViews.boardId))
      .innerJoin(
        campaignMembers,
        and(eq(campaignMembers.campaignId, boards.campaignId), eq(campaignMembers.userId, userId)),
      )
      .where(eq(boardViews.id, viewId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('Board view not found');
    }

    if (record.role === 'PLAYER' && record.audience !== 'PLAYERS') {
      throw new NotFoundException('Board view not found');
    }

    return {
      boardId: record.boardId,
      campaignId: record.campaignId,
      role: record.role,
    };
  }

  public async requireWidget(
    userId: string,
    widgetId: string,
  ): Promise<{ boardId: string; campaignId: string; role: CampaignRole }> {
    const [record] = await this.database
      .select({
        boardId: widgetInstances.boardId,
        campaignId: boards.campaignId,
        role: campaignMembers.role,
      })
      .from(widgetInstances)
      .innerJoin(boards, eq(boards.id, widgetInstances.boardId))
      .innerJoin(
        campaignMembers,
        and(eq(campaignMembers.campaignId, boards.campaignId), eq(campaignMembers.userId, userId)),
      )
      .where(eq(widgetInstances.id, widgetId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('Widget not found');
    }

    return record;
  }
}
