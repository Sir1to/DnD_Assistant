import { Controller, Get, Inject, Ip, Param, Res, StreamableFile } from '@nestjs/common';
import type { PublicCharacterCard } from '@fog-of-lore/contracts';
import type { Response } from 'express';

import { LoreAttachmentsService } from '../campaigns/lore-attachments.service';
import { CharactersService } from './characters.service';
import { PublicShareRateLimiter } from './public-share-rate-limiter.service';

@Controller('character-shares')
export class PublicCharactersController {
  public constructor(
    @Inject(CharactersService) private readonly characters: CharactersService,
    @Inject(LoreAttachmentsService) private readonly attachments: LoreAttachmentsService,
    @Inject(PublicShareRateLimiter) private readonly limiter: PublicShareRateLimiter,
  ) {}

  @Get(':token')
  public card(@Param('token') token: string, @Ip() ip: string): Promise<PublicCharacterCard> {
    this.limiter.consume(ip);
    return this.characters.publicCard(token);
  }

  @Get(':token/portrait')
  public async portrait(
    @Param('token') token: string,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    this.limiter.consume(ip);
    const reference = await this.characters.publicPortraitReference(token);
    const { attachment, buffer } = await this.attachments.readForBattleScene(
      reference.attachmentId,
      reference.campaignId,
    );
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', String(attachment.size));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(buffer);
  }
}
