import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDirectMessageRequest,
  DirectConversation,
  DirectConversationsResponse,
  DirectMessage,
  DirectMessagesPage,
  ListDirectMessagesQuery,
} from '@fog-of-lore/contracts';
import { nextReadSequence } from '@fog-of-lore/domain';
import { and, asc, desc, eq, gt, lt, ne, sql } from 'drizzle-orm';

import { CampaignAccessService } from '../campaigns/campaign-access.service';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import {
  campaignMembers,
  directConversationReads,
  directConversations,
  directMessages,
  users,
} from '../database/schema';
import { DirectMessageAccessService } from './direct-message-access.service';
import { DirectMessageEventsService } from './direct-message-events.service';

@Injectable()
export class DirectMessagesService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly campaignAccess: CampaignAccessService,
    @Inject(DirectMessageAccessService) private readonly access: DirectMessageAccessService,
    @Inject(DirectMessageEventsService) private readonly events: DirectMessageEventsService,
  ) {}

  public async listConversations(
    userId: string,
    campaignId: string,
  ): Promise<DirectConversationsResponse> {
    const membership = await this.campaignAccess.requireMembership(userId, campaignId);
    const conversationRows = await this.database
      .select({
        id: directConversations.id,
        campaignId: directConversations.campaignId,
        playerUserId: directConversations.playerUserId,
        playerDisplayName: users.displayName,
        lastSequence: directConversations.lastSequence,
        lastMessageAt: directConversations.lastMessageAt,
        createdAt: directConversations.createdAt,
        updatedAt: directConversations.updatedAt,
        lastReadSequence: directConversationReads.lastReadSequence,
      })
      .from(directConversations)
      .innerJoin(users, eq(users.id, directConversations.playerUserId))
      .leftJoin(
        directConversationReads,
        and(
          eq(directConversationReads.conversationId, directConversations.id),
          eq(directConversationReads.userId, userId),
        ),
      )
      .where(
        membership === 'PLAYER'
          ? and(
              eq(directConversations.campaignId, campaignId),
              eq(directConversations.playerUserId, userId),
            )
          : eq(directConversations.campaignId, campaignId),
      )
      .orderBy(desc(directConversations.lastMessageAt), desc(directConversations.createdAt));

    return {
      campaignId,
      role: membership,
      conversations: conversationRows.map((row) => this.toConversation(row)),
    };
  }

  public async ensureConversation(
    userId: string,
    campaignId: string,
    playerUserId: string,
  ): Promise<DirectConversation> {
    await this.access.requirePlayerTarget(userId, campaignId, playerUserId);
    const [existing] = await this.database
      .select()
      .from(directConversations)
      .where(
        and(
          eq(directConversations.campaignId, campaignId),
          eq(directConversations.playerUserId, playerUserId),
        ),
      )
      .limit(1);

    if (!existing) {
      await this.database
        .insert(directConversations)
        .values({ campaignId, playerUserId })
        .onConflictDoNothing();
    }

    const [conversation] = await this.database
      .select({
        id: directConversations.id,
        campaignId: directConversations.campaignId,
        playerUserId: directConversations.playerUserId,
        playerDisplayName: users.displayName,
        lastSequence: directConversations.lastSequence,
        lastMessageAt: directConversations.lastMessageAt,
        createdAt: directConversations.createdAt,
        updatedAt: directConversations.updatedAt,
        lastReadSequence: directConversationReads.lastReadSequence,
      })
      .from(directConversations)
      .innerJoin(users, eq(users.id, directConversations.playerUserId))
      .leftJoin(
        directConversationReads,
        and(
          eq(directConversationReads.conversationId, directConversations.id),
          eq(directConversationReads.userId, userId),
        ),
      )
      .where(
        and(
          eq(directConversations.campaignId, campaignId),
          eq(directConversations.playerUserId, playerUserId),
        ),
      )
      .limit(1);

    if (!conversation) {
      throw new NotFoundException('Direct conversation not found');
    }

    if (!existing) {
      this.events.publish(
        await this.recipientUserIds(campaignId, playerUserId),
        'direct.conversation.created',
        campaignId,
        conversation.id,
      );
    }

    return this.toConversation(conversation);
  }

  public async listMessages(
    userId: string,
    conversationId: string,
    query: ListDirectMessagesQuery,
  ): Promise<DirectMessagesPage> {
    const conversation = await this.access.requireConversation(userId, conversationId);
    const where =
      query.beforeSequence === undefined
        ? query.afterSequence === undefined
          ? eq(directMessages.conversationId, conversationId)
          : and(
              eq(directMessages.conversationId, conversationId),
              gt(directMessages.sequence, query.afterSequence),
            )
        : and(
            eq(directMessages.conversationId, conversationId),
            lt(directMessages.sequence, query.beforeSequence),
          );
    const ascending = query.afterSequence !== undefined;
    const rows = await this.database
      .select({
        id: directMessages.id,
        conversationId: directMessages.conversationId,
        sequence: directMessages.sequence,
        senderUserId: directMessages.senderUserId,
        senderDisplayName: users.displayName,
        senderRole: directMessages.senderRole,
        body: directMessages.body,
        createdAt: directMessages.createdAt,
      })
      .from(directMessages)
      .innerJoin(users, eq(users.id, directMessages.senderUserId))
      .where(where)
      .orderBy(ascending ? asc(directMessages.sequence) : desc(directMessages.sequence))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);

    return {
      conversationId,
      messages: (ascending ? page : page.reverse()).map((row) => this.toMessage(row)),
      hasMore,
      lastSequence: conversation.lastSequence,
    };
  }

  public async send(
    userId: string,
    conversationId: string,
    input: CreateDirectMessageRequest,
  ): Promise<DirectMessage> {
    const conversation = await this.access.requireConversation(userId, conversationId);
    const [alreadySent] = await this.database
      .select({
        id: directMessages.id,
        conversationId: directMessages.conversationId,
        sequence: directMessages.sequence,
        senderUserId: directMessages.senderUserId,
        senderDisplayName: users.displayName,
        senderRole: directMessages.senderRole,
        body: directMessages.body,
        createdAt: directMessages.createdAt,
      })
      .from(directMessages)
      .innerJoin(users, eq(users.id, directMessages.senderUserId))
      .where(
        and(
          eq(directMessages.conversationId, conversationId),
          eq(directMessages.senderUserId, userId),
          eq(directMessages.clientMessageId, input.clientMessageId),
        ),
      )
      .limit(1);
    if (alreadySent) {
      return this.toMessage(alreadySent);
    }

    const result = await this.database.transaction(async (transaction) => {
      const [updatedConversation] = await transaction
        .update(directConversations)
        .set({
          lastSequence: sql`${directConversations.lastSequence} + 1`,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(directConversations.id, conversationId))
        .returning({ lastSequence: directConversations.lastSequence });
      if (!updatedConversation) {
        throw new NotFoundException('Direct conversation not found');
      }

      const [message] = await transaction
        .insert(directMessages)
        .values({
          conversationId,
          sequence: updatedConversation.lastSequence,
          senderUserId: userId,
          senderRole: conversation.role,
          clientMessageId: input.clientMessageId,
          body: input.body,
        })
        .returning();
      if (!message) {
        throw new Error('Direct message insert did not return a row');
      }

      await transaction
        .insert(directConversationReads)
        .values({
          conversationId,
          userId,
          lastReadSequence: message.sequence,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [directConversationReads.conversationId, directConversationReads.userId],
          set: { lastReadSequence: message.sequence, updatedAt: new Date() },
        });

      const [sender] = await transaction
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!sender) {
        throw new NotFoundException('User not found');
      }
      return this.toMessage({ ...message, senderDisplayName: sender.displayName });
    });

    this.events.publish(
      await this.recipientUserIds(conversation.campaignId, conversation.playerUserId),
      'direct.message.created',
      conversation.campaignId,
      conversationId,
      result.sequence,
    );
    return result;
  }

  public async markRead(
    userId: string,
    conversationId: string,
    requestedSequence: number,
  ): Promise<void> {
    const conversation = await this.access.requireConversation(userId, conversationId);
    const [current] = await this.database
      .select({ lastReadSequence: directConversationReads.lastReadSequence })
      .from(directConversationReads)
      .where(
        and(
          eq(directConversationReads.conversationId, conversationId),
          eq(directConversationReads.userId, userId),
        ),
      )
      .limit(1);
    const lastReadSequence = nextReadSequence(
      current?.lastReadSequence ?? 0,
      requestedSequence,
      conversation.lastSequence,
    );

    await this.database
      .insert(directConversationReads)
      .values({ conversationId, userId, lastReadSequence, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [directConversationReads.conversationId, directConversationReads.userId],
        set: { lastReadSequence, updatedAt: new Date() },
      });
    this.events.publish(
      [userId],
      'direct.read.updated',
      conversation.campaignId,
      conversationId,
      lastReadSequence,
    );
  }

  private async recipientUserIds(campaignId: string, playerUserId: string): Promise<string[]> {
    const members = await this.database
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), ne(campaignMembers.role, 'PLAYER')));
    return [...members.map((member) => member.userId), playerUserId];
  }

  private toConversation(row: {
    id: string;
    campaignId: string;
    playerUserId: string;
    playerDisplayName: string;
    lastSequence: number;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    lastReadSequence: number | null;
  }): DirectConversation {
    return {
      id: row.id,
      campaignId: row.campaignId,
      playerUserId: row.playerUserId,
      playerDisplayName: row.playerDisplayName,
      lastSequence: row.lastSequence,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      unreadCount: Math.max(0, row.lastSequence - (row.lastReadSequence ?? 0)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toMessage(row: {
    id: string;
    conversationId: string;
    sequence: number;
    senderUserId: string;
    senderDisplayName: string;
    senderRole: 'OWNER' | 'GM' | 'PLAYER';
    body: string;
    createdAt: Date;
  }): DirectMessage {
    return { ...row, createdAt: row.createdAt.toISOString() };
  }
}
