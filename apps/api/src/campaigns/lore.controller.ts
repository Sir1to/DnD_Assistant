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
  createLoreEntryRequestSchema,
  updateLoreEntryRequestSchema,
  type CampaignLoreResponse,
  type CreateLoreEntryRequest,
  type LoreEntry,
  type UpdateLoreEntryRequest,
} from '@fog-of-lore/contracts';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LoreService } from './lore.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class LoreController {
  public constructor(@Inject(LoreService) private readonly lore: LoreService) {}

  @Get('campaigns/:campaignId/lore')
  public list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<CampaignLoreResponse> {
    return this.lore.list(user.id, campaignId);
  }

  @Post('campaigns/:campaignId/lore')
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(createLoreEntryRequestSchema)) input: CreateLoreEntryRequest,
  ): Promise<LoreEntry> {
    return this.lore.create(user.id, campaignId, input);
  }

  @Get('lore/:entryId')
  public get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe({ version: '4' })) entryId: string,
  ): Promise<LoreEntry> {
    return this.lore.get(user.id, entryId);
  }

  @Patch('lore/:entryId')
  public update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe({ version: '4' })) entryId: string,
    @Body(new ZodValidationPipe(updateLoreEntryRequestSchema)) input: UpdateLoreEntryRequest,
  ): Promise<LoreEntry> {
    return this.lore.update(user.id, entryId, input);
  }

  @Delete('lore/:entryId')
  @HttpCode(204)
  public async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe({ version: '4' })) entryId: string,
  ): Promise<void> {
    await this.lore.delete(user.id, entryId);
  }
}
