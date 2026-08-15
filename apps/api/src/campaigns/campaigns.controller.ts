import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createCampaignRequestSchema,
  type CampaignDetail,
  type CampaignListResponse,
  type CreateCampaignRequest,
} from '@fog-of-lore/contracts';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
@UseGuards(SessionAuthGuard)
export class CampaignsController {
  public constructor(
    @Inject(CampaignsService) private readonly campaignsService: CampaignsService,
  ) {}

  @Get()
  public list(@CurrentUser() user: AuthenticatedUser): Promise<CampaignListResponse> {
    return this.campaignsService.list(user.id);
  }

  @Post()
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCampaignRequestSchema)) input: CreateCampaignRequest,
  ): Promise<CampaignDetail> {
    return this.campaignsService.create(user.id, input);
  }

  @Get(':campaignId')
  public get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<CampaignDetail> {
    return this.campaignsService.get(user.id, campaignId);
  }
}
