import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { LoreAttachment } from '@fog-of-lore/contracts';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { LoreAttachmentsService } from './lore-attachments.service';

interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller()
@UseGuards(SessionAuthGuard)
export class LoreAttachmentsController {
  public constructor(
    @Inject(LoreAttachmentsService) private readonly attachments: LoreAttachmentsService,
  ) {}

  @Post('lore/:entryId/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 10 * 1024 * 1024 } }))
  public upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entryId', new ParseUUIDPipe({ version: '4' })) entryId: string,
    @UploadedFile() file?: UploadedAttachment,
  ): Promise<LoreAttachment> {
    return this.attachments.upload(user.id, entryId, file);
  }

  @Get('lore-attachments/:attachmentId/content')
  public async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' })) attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { attachment, buffer } = await this.attachments.read(user.id, attachmentId);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', String(attachment.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    return new StreamableFile(buffer);
  }

  @Delete('lore-attachments/:attachmentId')
  @HttpCode(204)
  public async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' })) attachmentId: string,
  ): Promise<void> {
    await this.attachments.delete(user.id, attachmentId);
  }
}
