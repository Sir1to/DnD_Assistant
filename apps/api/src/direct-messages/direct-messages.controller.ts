import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateDirectMessageRequest,
  DirectConversation,
  DirectConversationsResponse,
  DirectMessage,
  DirectMessagesPage,
  ListDirectMessagesQuery,
  MarkDirectConversationReadRequest,
} from '@fog-of-lore/contracts';
import {
  createDirectMessageRequestSchema,
  listDirectMessagesQuerySchema,
  markDirectConversationReadRequestSchema,
} from '@fog-of-lore/contracts';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DirectMessagesService } from './direct-messages.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class DirectMessagesController {
  public constructor(
    @Inject(DirectMessagesService) private readonly messages: DirectMessagesService,
  ) {}

  @Get('campaigns/:campaignId/direct-conversations')
  public listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<DirectConversationsResponse> {
    return this.messages.listConversations(user.id, campaignId);
  }

  @Put('campaigns/:campaignId/direct-conversations/:playerUserId')
  public ensureConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Param('playerUserId', new ParseUUIDPipe({ version: '4' })) playerUserId: string,
  ): Promise<DirectConversation> {
    return this.messages.ensureConversation(user.id, campaignId, playerUserId);
  }

  @Get('direct-conversations/:conversationId/messages')
  public listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @Query(new ZodValidationPipe(listDirectMessagesQuerySchema)) query: ListDirectMessagesQuery,
  ): Promise<DirectMessagesPage> {
    return this.messages.listMessages(user.id, conversationId, query);
  }

  @Post('direct-conversations/:conversationId/messages')
  public send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @Body(new ZodValidationPipe(createDirectMessageRequestSchema))
    input: CreateDirectMessageRequest,
  ): Promise<DirectMessage> {
    return this.messages.send(user.id, conversationId, input);
  }

  @Patch('direct-conversations/:conversationId/read')
  public markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @Body(new ZodValidationPipe(markDirectConversationReadRequestSchema))
    input: MarkDirectConversationReadRequest,
  ): Promise<void> {
    return this.messages.markRead(user.id, conversationId, input.lastReadSequence);
  }
}
