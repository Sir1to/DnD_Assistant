import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createCharacterSheetRequestSchema,
  createCharacterShareGrantRequestSchema,
  importCharacterSheetRequestSchema,
  updateCharacterDocumentRequestSchema,
  updateCharacterRuntimeRequestSchema,
  updateCharacterSheetRequestSchema,
  type CampaignCharacterSheetsResponse,
  type CharacterDocumentRevisionListResponse,
  type CharacterDocumentResponse,
  type CharacterFolcharImportPreview,
  type CharacterOptionsResponse,
  type CharacterRuntimeState,
  type CharacterSheet,
  type CharacterShareGrantsResponse,
  type CreateCharacterSheetRequest,
  type CreateCharacterShareGrantRequest,
  type CreatedCharacterShareGrant,
  type ImportCharacterSheetRequest,
  type PortableCharacterSheet,
  restoreCharacterDocumentRevisionRequestSchema,
  type RestoreCharacterDocumentRevisionRequest,
  type UpdateCharacterRuntimeRequest,
  type UpdateCharacterDocumentRequest,
  type UpdateCharacterSheetRequest,
} from '@fog-of-lore/contracts';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  LoreAttachmentsService,
  type UploadedAttachment,
} from '../campaigns/lore-attachments.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CharactersService } from './characters.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class CharactersController {
  public constructor(
    @Inject(CharactersService) private readonly characters: CharactersService,
    @Inject(LoreAttachmentsService) private readonly attachments: LoreAttachmentsService,
  ) {}

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

  @Get('characters/:sheetId/document')
  public getDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
  ): Promise<CharacterDocumentResponse> {
    return this.characters.getDocument(user.id, sheetId);
  }

  @Patch('characters/:sheetId/document')
  public updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Body(new ZodValidationPipe(updateCharacterDocumentRequestSchema))
    input: UpdateCharacterDocumentRequest,
  ): Promise<CharacterDocumentResponse> {
    return this.characters.updateDocument(user.id, sheetId, input);
  }

  @Get('characters/:sheetId/document-revisions')
  public listDocumentRevisions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
  ): Promise<CharacterDocumentRevisionListResponse> {
    return this.characters.listDocumentRevisions(user.id, sheetId);
  }

  @Post('characters/:sheetId/document-revisions/:documentRevision/restore')
  public restoreDocumentRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Param('documentRevision', ParseIntPipe) documentRevision: number,
    @Body(new ZodValidationPipe(restoreCharacterDocumentRevisionRequestSchema))
    input: RestoreCharacterDocumentRevisionRequest,
  ): Promise<CharacterDocumentResponse> {
    return this.characters.restoreDocumentRevision(user.id, sheetId, documentRevision, input);
  }

  @Patch('characters/:sheetId/runtime')
  public updateRuntime(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Body(new ZodValidationPipe(updateCharacterRuntimeRequestSchema))
    input: UpdateCharacterRuntimeRequest,
  ): Promise<CharacterRuntimeState> {
    return this.characters.updateRuntime(user.id, sheetId, input);
  }

  @Post('characters/:sheetId/portrait')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  public setPortrait(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @UploadedFile() file?: UploadedAttachment,
  ): Promise<CharacterSheet> {
    return this.characters.setPortrait(user.id, sheetId, file);
  }

  @Get('characters/:sheetId/portrait')
  public async portrait(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const reference = await this.characters.portraitReference(user.id, sheetId);
    const { attachment, buffer } = await this.attachments.readForBattleScene(
      reference.attachmentId,
      reference.campaignId,
    );
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', String(attachment.size));
    response.setHeader('Cache-Control', 'private, max-age=60');
    return new StreamableFile(buffer);
  }

  @Get('characters/:sheetId/export/folchar')
  public async exportFolchar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.characters.exportFolchar(user.id, sheetId);
    response.setHeader('Content-Type', 'application/vnd.fog-of-lore.character+zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    );
    response.setHeader('Content-Length', String(result.archive.length));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(result.archive);
  }

  @Post('campaigns/:campaignId/characters/import/folchar')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 6 * 1024 * 1024 } }))
  public importFolchar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @UploadedFile() file: UploadedAttachment | undefined,
    @Body('ownerUserId') ownerUserId?: string,
  ): Promise<CharacterSheet> {
    return this.characters.importFolchar(user.id, campaignId, file, ownerUserId);
  }

  @Post('campaigns/:campaignId/characters/import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 6 * 1024 * 1024 } }))
  public previewFolchar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @UploadedFile() file: UploadedAttachment | undefined,
  ): Promise<CharacterFolcharImportPreview> {
    return this.characters.previewFolchar(user.id, campaignId, file);
  }

  @Get('characters/:sheetId/share-grants')
  public listShareGrants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
  ): Promise<CharacterShareGrantsResponse> {
    return this.characters.listShareGrants(user.id, sheetId);
  }

  @Post('characters/:sheetId/share-grants')
  public createShareGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Body(new ZodValidationPipe(createCharacterShareGrantRequestSchema))
    input: CreateCharacterShareGrantRequest,
  ): Promise<CreatedCharacterShareGrant> {
    return this.characters.createShareGrant(user.id, sheetId, input);
  }

  @Delete('character-share-grants/:grantId')
  @HttpCode(204)
  public revokeShareGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('grantId', new ParseUUIDPipe({ version: '4' })) grantId: string,
  ): Promise<void> {
    return this.characters.revokeShareGrant(user.id, grantId);
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
