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
  addWidgetPlacementRequestSchema,
  createBoardViewRequestSchema,
  createWidgetRequestSchema,
  updateBoardLayoutRequestSchema,
  updateBoardViewRequestSchema,
  updateWidgetRequestSchema,
  widgetCommandRequestSchema,
  type AddWidgetPlacementRequest,
  type BoardSnapshot,
  type BoardViewDetail,
  type CreateBoardViewRequest,
  type CreateWidgetRequest,
  type CreateWidgetResult,
  type UpdateBoardLayoutRequest,
  type UpdateBoardViewRequest,
  type UpdateWidgetRequest,
  type WidgetCatalogItem,
  type WidgetCommandRequest,
  type WidgetInstance,
  type WidgetPlacement,
} from '@fog-of-lore/contracts';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BoardsService } from './boards.service';
import { WidgetRegistryService } from './widget-registry.service';
import { WidgetCommandsService } from './widget-commands.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class BoardsController {
  public constructor(
    @Inject(BoardsService) private readonly boards: BoardsService,
    @Inject(WidgetRegistryService) private readonly registry: WidgetRegistryService,
    @Inject(WidgetCommandsService) private readonly commands: WidgetCommandsService,
  ) {}

  @Get('widgets/catalog')
  public catalog(): { widgets: WidgetCatalogItem[] } {
    return { widgets: this.registry.catalog() };
  }

  @Get('boards/:boardId')
  public getSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
  ): Promise<BoardSnapshot> {
    return this.boards.getSnapshot(user.id, boardId);
  }

  @Post('boards/:boardId/views')
  public createView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Body(new ZodValidationPipe(createBoardViewRequestSchema)) input: CreateBoardViewRequest,
  ): Promise<BoardViewDetail> {
    return this.boards.createView(user.id, boardId, input);
  }

  @Post('boards/:boardId/widgets')
  public createWidget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Body(new ZodValidationPipe(createWidgetRequestSchema)) input: CreateWidgetRequest,
  ): Promise<CreateWidgetResult> {
    return this.boards.createWidget(user.id, boardId, input);
  }

  @Patch('views/:viewId')
  public updateView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('viewId', new ParseUUIDPipe({ version: '4' })) viewId: string,
    @Body(new ZodValidationPipe(updateBoardViewRequestSchema)) input: UpdateBoardViewRequest,
  ): Promise<BoardViewDetail> {
    return this.boards.updateView(user.id, viewId, input);
  }

  @Post('views/:viewId/placements')
  public addPlacement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('viewId', new ParseUUIDPipe({ version: '4' })) viewId: string,
    @Body(new ZodValidationPipe(addWidgetPlacementRequestSchema))
    input: AddWidgetPlacementRequest,
  ): Promise<WidgetPlacement> {
    return this.boards.addPlacement(user.id, viewId, input);
  }

  @Patch('views/:viewId/layout')
  public updateLayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('viewId', new ParseUUIDPipe({ version: '4' })) viewId: string,
    @Body(new ZodValidationPipe(updateBoardLayoutRequestSchema))
    input: UpdateBoardLayoutRequest,
  ): Promise<{ placements: WidgetPlacement[] }> {
    return this.boards.updateLayout(user.id, viewId, input);
  }

  @Delete('views/:viewId/placements/:placementId')
  @HttpCode(204)
  public removePlacement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('viewId', new ParseUUIDPipe({ version: '4' })) viewId: string,
    @Param('placementId', new ParseUUIDPipe({ version: '4' })) placementId: string,
  ): Promise<void> {
    return this.boards.removePlacement(user.id, viewId, placementId);
  }

  @Patch('widgets/:widgetId')
  public updateWidget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('widgetId', new ParseUUIDPipe({ version: '4' })) widgetId: string,
    @Body(new ZodValidationPipe(updateWidgetRequestSchema)) input: UpdateWidgetRequest,
  ): Promise<WidgetInstance> {
    return this.boards.updateWidget(user.id, widgetId, input);
  }

  @Post('widgets/:widgetId/commands')
  public executeWidgetCommand(
    @CurrentUser() user: AuthenticatedUser,
    @Param('widgetId', new ParseUUIDPipe({ version: '4' })) widgetId: string,
    @Body(new ZodValidationPipe(widgetCommandRequestSchema)) input: WidgetCommandRequest,
  ): Promise<WidgetInstance> {
    return this.commands.execute(user.id, widgetId, input);
  }
}
