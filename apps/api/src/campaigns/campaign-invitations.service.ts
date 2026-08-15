import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CampaignInvitation,
  CampaignInvitationPreview,
  CampaignInvitationStatus,
  CampaignInvitationsResponse,
  CampaignMembersResponse,
  CampaignSummary,
  CreateCampaignInvitationRequest,
  CreatedCampaignInvitation,
  UpdateCampaignMemberRoleRequest,
} from '@fog-of-lore/contracts';
import { and, asc, eq, gt, isNull, ne } from 'drizzle-orm';

import { hashSessionToken } from '../auth/session-token';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { campaignInvitations, campaignMembers, campaigns, users } from '../database/schema';
import { CampaignAccessService } from './campaign-access.service';

@Injectable()
export class CampaignInvitationsService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
  ) {}

  public async create(
    userId: string,
    campaignId: string,
    input: CreateCampaignInvitationRequest,
  ): Promise<CreatedCampaignInvitation> {
    await this.access.requireOwner(userId, campaignId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    const [invitation] = await this.database
      .insert(campaignInvitations)
      .values({
        campaignId,
        createdById: userId,
        tokenHash: hashSessionToken(token),
        role: 'PLAYER',
        expiresAt,
      })
      .returning();

    if (!invitation) {
      throw new Error('Campaign invitation insert did not return a row');
    }

    return { ...this.toInvitation(invitation), token };
  }

  public async list(userId: string, campaignId: string): Promise<CampaignInvitationsResponse> {
    await this.access.requireOwner(userId, campaignId);
    const records = await this.database
      .select()
      .from(campaignInvitations)
      .where(eq(campaignInvitations.campaignId, campaignId))
      .orderBy(asc(campaignInvitations.createdAt));

    return { invitations: records.map((record) => this.toInvitation(record)) };
  }

  public async listMembers(userId: string, campaignId: string): Promise<CampaignMembersResponse> {
    await this.access.requireEditor(userId, campaignId);
    const records = await this.database
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        role: campaignMembers.role,
        joinedAt: campaignMembers.joinedAt,
      })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(eq(campaignMembers.campaignId, campaignId))
      .orderBy(asc(campaignMembers.joinedAt));

    return {
      members: records.map((record) => ({
        ...record,
        joinedAt: record.joinedAt.toISOString(),
      })),
    };
  }

  public async updateMemberRole(
    userId: string,
    campaignId: string,
    memberUserId: string,
    input: UpdateCampaignMemberRoleRequest,
  ): Promise<CampaignMembersResponse['members'][number]> {
    await this.access.requireOwner(userId, campaignId);

    const [member] = await this.database
      .update(campaignMembers)
      .set({ role: input.role })
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.userId, memberUserId),
          ne(campaignMembers.role, 'OWNER'),
        ),
      )
      .returning({
        userId: campaignMembers.userId,
        role: campaignMembers.role,
        joinedAt: campaignMembers.joinedAt,
      });

    if (!member) {
      throw new NotFoundException('Campaign member not found');
    }

    const [user] = await this.database
      .select({ displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, member.userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Campaign member not found');
    }

    return {
      userId: member.userId,
      displayName: user.displayName,
      email: user.email,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    };
  }

  public async preview(userId: string, token: string): Promise<CampaignInvitationPreview> {
    void userId;
    this.assertTokenShape(token);
    const [record] = await this.database
      .select({
        campaignId: campaignInvitations.campaignId,
        campaignName: campaigns.name,
        role: campaignInvitations.role,
        expiresAt: campaignInvitations.expiresAt,
        acceptedAt: campaignInvitations.acceptedAt,
        revokedAt: campaignInvitations.revokedAt,
      })
      .from(campaignInvitations)
      .innerJoin(campaigns, eq(campaigns.id, campaignInvitations.campaignId))
      .where(eq(campaignInvitations.tokenHash, hashSessionToken(token)))
      .limit(1);

    if (!record || record.role !== 'PLAYER') {
      throw new NotFoundException('Invitation not found');
    }

    return {
      campaignId: record.campaignId,
      campaignName: record.campaignName,
      role: record.role,
      status: this.statusOf(record),
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  public async accept(userId: string, token: string): Promise<CampaignSummary> {
    this.assertTokenShape(token);
    const now = new Date();
    const tokenHash = hashSessionToken(token);

    const campaignId = await this.database.transaction(async (transaction) => {
      const [claimed] = await transaction
        .update(campaignInvitations)
        .set({ acceptedAt: now, acceptedById: userId })
        .where(
          and(
            eq(campaignInvitations.tokenHash, tokenHash),
            isNull(campaignInvitations.acceptedAt),
            isNull(campaignInvitations.revokedAt),
            gt(campaignInvitations.expiresAt, now),
          ),
        )
        .returning({
          campaignId: campaignInvitations.campaignId,
          role: campaignInvitations.role,
        });

      if (claimed) {
        await transaction
          .insert(campaignMembers)
          .values({
            campaignId: claimed.campaignId,
            userId,
            role: claimed.role,
          })
          .onConflictDoNothing();
        return claimed.campaignId;
      }

      const [existing] = await transaction
        .select()
        .from(campaignInvitations)
        .where(eq(campaignInvitations.tokenHash, tokenHash))
        .limit(1);

      if (!existing) {
        throw new NotFoundException('Invitation not found');
      }

      if (existing.acceptedById === userId) {
        return existing.campaignId;
      }

      const status = this.statusOf(existing);
      if (status === 'EXPIRED' || status === 'REVOKED') {
        throw new GoneException('The invitation is no longer active');
      }

      throw new ConflictException('The invitation has already been accepted');
    });

    const [campaign] = await this.database
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
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
      .limit(1);

    if (!campaign) {
      throw new Error('Accepted campaign membership was not found');
    }

    return {
      ...campaign,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  public async revoke(userId: string, campaignId: string, invitationId: string): Promise<void> {
    await this.access.requireOwner(userId, campaignId);
    const [revoked] = await this.database
      .update(campaignInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(campaignInvitations.id, invitationId),
          eq(campaignInvitations.campaignId, campaignId),
          isNull(campaignInvitations.acceptedAt),
          isNull(campaignInvitations.revokedAt),
        ),
      )
      .returning({ id: campaignInvitations.id });

    if (!revoked) {
      throw new NotFoundException('Active invitation not found');
    }
  }

  private toInvitation(invitation: typeof campaignInvitations.$inferSelect): CampaignInvitation {
    return {
      id: invitation.id,
      campaignId: invitation.campaignId,
      role: 'PLAYER',
      status: this.statusOf(invitation),
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
    };
  }

  private statusOf(invitation: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  }): CampaignInvitationStatus {
    if (invitation.acceptedAt) return 'ACCEPTED';
    if (invitation.revokedAt) return 'REVOKED';
    if (invitation.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
    return 'AVAILABLE';
  }

  private assertTokenShape(token: string): void {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new NotFoundException('Invitation not found');
    }
  }
}
