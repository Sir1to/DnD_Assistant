import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CampaignDetail,
  CampaignListResponse,
  CampaignSummary,
  CreateCampaignRequest,
} from '@fog-of-lore/contracts';
import { desc, eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { boardViews, boards, campaignMembers, campaigns } from '../database/schema';
import { CampaignAccessService } from './campaign-access.service';

@Injectable()
export class CampaignsService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
  ) {}

  public async create(userId: string, input: CreateCampaignRequest): Promise<CampaignDetail> {
    return this.database.transaction(async (transaction) => {
      const [campaign] = await transaction
        .insert(campaigns)
        .values({
          name: input.name,
          description: input.description,
          ownerId: userId,
        })
        .returning();

      if (!campaign) {
        throw new Error('Campaign insert did not return a row');
      }

      await transaction.insert(campaignMembers).values({
        campaignId: campaign.id,
        userId,
        role: 'OWNER',
      });

      const [board] = await transaction
        .insert(boards)
        .values({
          campaignId: campaign.id,
          name: 'Мастерская',
        })
        .returning();

      if (!board) {
        throw new Error('Board insert did not return a row');
      }

      const [view] = await transaction
        .insert(boardViews)
        .values({
          boardId: board.id,
          name: 'Ноутбук мастера',
          slug: 'gm-laptop',
          description: 'Основной вид мастерской доски.',
        })
        .returning();

      if (!view) {
        throw new Error('Board view insert did not return a row');
      }

      return {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        role: 'OWNER',
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
        boards: [
          {
            id: board.id,
            name: board.name,
            views: [
              {
                id: view.id,
                name: view.name,
                slug: view.slug,
                description: view.description,
                audience: view.audience,
              },
            ],
          },
        ],
      };
    });
  }

  public async list(userId: string): Promise<CampaignListResponse> {
    const records = await this.database
      .select({
        id: campaigns.id,
        name: campaigns.name,
        description: campaigns.description,
        role: campaignMembers.role,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
      })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(eq(campaignMembers.userId, userId))
      .orderBy(desc(campaigns.updatedAt));

    return {
      campaigns: records.map((record) => this.toSummary(record)),
    };
  }

  public async get(userId: string, campaignId: string): Promise<CampaignDetail> {
    const role = await this.access.requireMembership(userId, campaignId);
    const [campaign] = await this.database
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const boardRecords = await this.database
      .select({
        boardId: boards.id,
        boardName: boards.name,
        viewId: boardViews.id,
        viewName: boardViews.name,
        viewSlug: boardViews.slug,
        viewDescription: boardViews.description,
        viewAudience: boardViews.audience,
      })
      .from(boards)
      .leftJoin(boardViews, eq(boardViews.boardId, boards.id))
      .where(eq(boards.campaignId, campaignId))
      .orderBy(boards.createdAt, boardViews.createdAt);

    const boardMap = new Map<string, CampaignDetail['boards'][number]>();

    for (const record of boardRecords) {
      const board = boardMap.get(record.boardId) ?? {
        id: record.boardId,
        name: record.boardName,
        views: [],
      };

      if (
        record.viewId &&
        record.viewName &&
        record.viewSlug &&
        record.viewDescription !== null &&
        (role !== 'PLAYER' || record.viewAudience === 'PLAYERS')
      ) {
        board.views.push({
          id: record.viewId,
          name: record.viewName,
          slug: record.viewSlug,
          description: record.viewDescription,
          audience: record.viewAudience ?? 'MASTER',
        });
      }

      boardMap.set(record.boardId, board);
    }

    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      role,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      boards: [...boardMap.values()],
    };
  }

  private toSummary(record: {
    id: string;
    name: string;
    description: string;
    role: CampaignSummary['role'];
    createdAt: Date;
    updatedAt: Date;
  }): CampaignSummary {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      role: record.role,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
