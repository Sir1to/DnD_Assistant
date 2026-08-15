import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createCampaignInvitationRequestSchema,
  type CampaignInvitationPreview,
  type CampaignInvitationsResponse,
  type CampaignMembersResponse,
  type CampaignSummary,
  type CreateCampaignInvitationRequest,
  type CreatedCampaignInvitation,
  type CampaignMember,
  type UpdateCampaignMemberRoleRequest,
  updateCampaignMemberRoleRequestSchema,
} from '@fog-of-lore/contracts';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CampaignInvitationsService } from './campaign-invitations.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class CampaignInvitationsController {
  public constructor(
    @Inject(CampaignInvitationsService)
    private readonly invitations: CampaignInvitationsService,
  ) {}

  @Post('campaigns/:campaignId/invitations')
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(createCampaignInvitationRequestSchema))
    input: CreateCampaignInvitationRequest,
  ): Promise<CreatedCampaignInvitation> {
    return this.invitations.create(user.id, campaignId, input);
  }

  @Get('campaigns/:campaignId/invitations')
  public list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<CampaignInvitationsResponse> {
    return this.invitations.list(user.id, campaignId);
  }

  @Get('campaigns/:campaignId/members')
  public members(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<CampaignMembersResponse> {
    return this.invitations.listMembers(user.id, campaignId);
  }

  @Patch('campaigns/:campaignId/members/:memberUserId')
  public updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Param('memberUserId', new ParseUUIDPipe({ version: '4' })) memberUserId: string,
    @Body(new ZodValidationPipe(updateCampaignMemberRoleRequestSchema))
    input: UpdateCampaignMemberRoleRequest,
  ): Promise<CampaignMember> {
    return this.invitations.updateMemberRole(user.id, campaignId, memberUserId, input);
  }

  @Delete('campaigns/:campaignId/invitations/:invitationId')
  @HttpCode(204)
  public async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Param('invitationId', new ParseUUIDPipe({ version: '4' })) invitationId: string,
  ): Promise<void> {
    await this.invitations.revoke(user.id, campaignId, invitationId);
  }

  @Get('invitations/:token')
  public preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<CampaignInvitationPreview> {
    return this.invitations.preview(user.id, token);
  }

  @Post('invitations/:token/accept')
  public accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<CampaignSummary> {
    return this.invitations.accept(user.id, token);
  }
}
