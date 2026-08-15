import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createCharacterSheetRequestSchema,
  importCharacterSheetRequestSchema,
  updateCharacterSheetRequestSchema,
  type CampaignCharacterSheetsResponse,
  type CharacterOptionsResponse,
  type CharacterSheet,
  type CreateCharacterSheetRequest,
  type ImportCharacterSheetRequest,
  type PortableCharacterSheet,
  type UpdateCharacterSheetRequest,
} from '@fog-of-lore/contracts';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CharactersService } from './characters.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class CharactersController {
  public constructor(@Inject(CharactersService) private readonly characters: CharactersService) {}

  @Get('rulesets/dnd5e/character-options')
  public options(): CharacterOptionsResponse {
    return this.characters.options();
  }

  @Get('campaigns/:campaignId/characters')
  public list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<CampaignCharacterSheetsResponse> {
    return this.characters.list(user.id, campaignId);
  }

  @Post('campaigns/:campaignId/characters')
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(createCharacterSheetRequestSchema))
    input: CreateCharacterSheetRequest,
  ): Promise<CharacterSheet> {
    return this.characters.create(user.id, campaignId, input);
  }

  @Post('campaigns/:campaignId/characters/import')
  public import(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(importCharacterSheetRequestSchema))
    input: ImportCharacterSheetRequest,
  ): Promise<CharacterSheet> {
    return this.characters.import(user.id, campaignId, input);
  }

  @Get('characters/:sheetId')
  public get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
  ): Promise<CharacterSheet> {
    return this.characters.get(user.id, sheetId);
  }

  @Patch('characters/:sheetId')
  public update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Body(new ZodValidationPipe(updateCharacterSheetRequestSchema))
    input: UpdateCharacterSheetRequest,
  ): Promise<CharacterSheet> {
    return this.characters.update(user.id, sheetId, input);
  }

  @Delete('characters/:sheetId')
  @HttpCode(204)
  public async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
  ): Promise<void> {
    await this.characters.delete(user.id, sheetId);
  }

  @Get('characters/:sheetId/export')
  @Header('Content-Disposition', 'attachment; filename="character.fol-character.json"')
  public export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
  ): Promise<PortableCharacterSheet> {
    return this.characters.export(user.id, sheetId);
  }
}
