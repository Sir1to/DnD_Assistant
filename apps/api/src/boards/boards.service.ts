import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddWidgetPlacementRequest,
  BoardSnapshot,
  BoardViewDetail,
  CreateBoardViewRequest,
  CreateWidgetRequest,
  CreateWidgetResult,
  UpdateBoardLayoutRequest,
  UpdateBoardViewRequest,
  UpdateWidgetRequest,
  WidgetInstance,
  WidgetPlacement,
} from '@fog-of-lore/contracts';
import { widgetTypeSchema } from '@fog-of-lore/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { boards, boardViews, widgetInstances, widgetPlacements } from '../database/schema';
import { BoardAccessService } from './board-access.service';
import { BoardEventsService } from './board-events.service';
import { WidgetRegistryService } from './widget-registry.service';

@Injectable()
export class BoardsService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(BoardAccessService) private readonly access: BoardAccessService,
    @Inject(WidgetRegistryService) private readonly registry: WidgetRegistryService,
    @Inject(BoardEventsService) private readonly events: BoardEventsService,
  ) {}

  public async getSnapshot(userId: string, boardId: string): Promise<BoardSnapshot> {
    const membership = await this.access.requireBoard(userId, boardId);
    const [board] = await this.database
      .select({ id: boards.id, campaignId: boards.campaignId, name: boards.name })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    const [views, widgets, placements] = await Promise.all([
      this.database
        .select()
        .from(boardViews)
        .where(eq(boardViews.boardId, boardId))
        .orderBy(asc(boardViews.createdAt)),
      this.database
        .select()
        .from(widgetInstances)
        .where(eq(widgetInstances.boardId, boardId))
        .orderBy(asc(widgetInstances.createdAt)),
      this.database
        .select({
          id: widgetPlacements.id,
          boardViewId: widgetPlacements.boardViewId,
          widgetInstanceId: widgetPlacements.widgetInstanceId,
          x: widgetPlacements.x,
          y: widgetPlacements.y,
          width: widgetPlacements.width,
          height: widgetPlacements.height,
          minimumWidth: widgetPlacements.minimumWidth,
          minimumHeight: widgetPlacements.minimumHeight,
          visible: widgetPlacements.visible,
        })
        .from(widgetPlacements)
        .innerJoin(boardViews, eq(boardViews.id, widgetPlacements.boardViewId))
        .where(eq(boardViews.boardId, boardId))
        .orderBy(asc(widgetPlacements.createdAt)),
    ]);

    const accessibleViews =
      membership.role === 'PLAYER' ? views.filter((view) => view.audience === 'PLAYERS') : views;
    const accessibleViewIds = new Set(accessibleViews.map((view) => view.id));
    const accessiblePlacements = placements.filter((placement) =>
      accessibleViewIds.has(placement.boardViewId),
    );
    const accessibleWidgetIds = new Set(
      accessiblePlacements.map((placement) => placement.widgetInstanceId),
    );

    return {
      board,
      role: membership.role,
      views: accessibleViews.map((view) => this.toView(view)),
      widgets: widgets
        .filter((widget) => membership.role !== 'PLAYER' || accessibleWidgetIds.has(widget.id))
        .map((widget) => this.toWidget(widget, membership.role)),
      placements: accessiblePlacements,
    };
  }

  public async createView(
    userId: string,
    boardId: string,
    input: CreateBoardViewRequest,
  ): Promise<BoardViewDetail> {
    const membership = await this.access.requireBoard(userId, boardId);
    this.requireEditor(membership.role);
    const slug = `view-${globalThis.crypto.randomUUID().slice(0, 8)}`;
    const [view] = await this.database
      .insert(boardViews)
      .values({
        boardId,
        name: input.name,
        description: input.description,
        audience: input.audience,
        slug,
      })
      .returning();

    if (!view) {
      throw new Error('Board view insert did not return a row');
    }

    const result = this.toView(view);
    this.events.publish(boardId, 'board.view.created', { view: result });
    return result;
  }

  public async updateView(
    userId: string,
    viewId: string,
    input: UpdateBoardViewRequest,
  ): Promise<BoardViewDetail> {
    const access = await this.access.requireView(userId, viewId);
    this.requireEditor(access.role);
    const [view] = await this.database
      .update(boardViews)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.audience === undefined ? {} : { audience: input.audience }),
        updatedAt: new Date(),
      })
      .where(eq(boardViews.id, viewId))
      .returning();

    if (!view) {
      throw new NotFoundException('Board view not found');
    }

    const result = this.toView(view);
    this.events.publish(access.boardId, 'board.view.updated', { view: result });
    return result;
  }

  public async createWidget(
    userId: string,
    boardId: string,
    input: CreateWidgetRequest,
  ): Promise<CreateWidgetResult> {
    const membership = await this.access.requireBoard(userId, boardId);
    this.requireEditor(membership.role);
    const viewAccess = await this.access.requireView(userId, input.boardViewId);

    if (viewAccess.boardId !== boardId) {
      throw new BadRequestException('The board view belongs to another board');
    }

    const definition = this.registry.require(input.type);
    const initialState =
      input.initialState === undefined
        ? definition.createDefaultState()
        : this.registry.validateState(input.type, input.initialState);
    const result = await this.database.transaction(async (transaction) => {
      const [bottomRecord] = await transaction
        .select({
          bottom: sql<number>`coalesce(max(${widgetPlacements.y} + ${widgetPlacements.height}), 0)`,
        })
        .from(widgetPlacements)
        .where(eq(widgetPlacements.boardViewId, input.boardViewId));
      const [widget] = await transaction
        .insert(widgetInstances)
        .values({
          boardId,
          type: input.type,
          schemaVersion: definition.catalog.schemaVersion,
          title: input.title ?? definition.catalog.defaultTitle,
          config: definition.defaultConfig,
          state: initialState,
        })
        .returning();

      if (!widget) {
        throw new Error('Widget insert did not return a row');
      }

      const [placement] = await transaction
        .insert(widgetPlacements)
        .values({
          boardViewId: input.boardViewId,
          widgetInstanceId: widget.id,
          x: 0,
          y: Number(bottomRecord?.bottom ?? 0),
          width: definition.catalog.defaultWidth,
          height: definition.catalog.defaultHeight,
          minimumWidth: definition.catalog.minimumWidth,
          minimumHeight: definition.catalog.minimumHeight,
        })
        .returning();

      if (!placement) {
        throw new Error('Widget placement insert did not return a row');
      }

      return { widget: this.toWidget(widget), placement: this.toPlacement(placement) };
    });

    this.events.publish(boardId, 'widget.instance.created', result);
    return result;
  }

  public async addPlacement(
    userId: string,
    viewId: string,
    input: AddWidgetPlacementRequest,
  ): Promise<WidgetPlacement> {
    const view = await this.access.requireView(userId, viewId);
    this.requireEditor(view.role);
    const widget = await this.access.requireWidget(userId, input.widgetInstanceId);

    if (view.boardId !== widget.boardId) {
      throw new BadRequestException('The widget belongs to another board');
    }

    const [widgetRecord] = await this.database
      .select({ type: widgetInstances.type })
      .from(widgetInstances)
      .where(eq(widgetInstances.id, input.widgetInstanceId))
      .limit(1);

    const widgetType = widgetTypeSchema.safeParse(widgetRecord?.type);
    if (!widgetRecord || !widgetType.success) {
      throw new NotFoundException('Widget not found');
    }

    const definition = this.registry.require(widgetType.data);

    try {
      const [placement] = await this.database
        .insert(widgetPlacements)
        .values({
          boardViewId: viewId,
          widgetInstanceId: input.widgetInstanceId,
          x: input.x,
          y: input.y,
          width: definition.catalog.defaultWidth,
          height: definition.catalog.defaultHeight,
          minimumWidth: definition.catalog.minimumWidth,
          minimumHeight: definition.catalog.minimumHeight,
        })
        .returning();

      if (!placement) {
        throw new Error('Widget placement insert did not return a row');
      }

      const result = this.toPlacement(placement);
      this.events.publish(view.boardId, 'widget.placement.created', { placement: result });
      return result;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('The widget is already present in this view');
      }

      throw error;
    }
  }

  public async updateLayout(
    userId: string,
    viewId: string,
    input: UpdateBoardLayoutRequest,
  ): Promise<{ placements: WidgetPlacement[] }> {
    const view = await this.access.requireView(userId, viewId);
    this.requireEditor(view.role);

    for (const item of input.placements) {
      if (item.x + item.width > 12) {
        throw new BadRequestException('A widget cannot extend beyond the 12-column board');
      }
    }

    const ids = input.placements.map((item) => item.id);
    const existing = await this.database
      .select({ id: widgetPlacements.id })
      .from(widgetPlacements)
      .where(and(eq(widgetPlacements.boardViewId, viewId), inArray(widgetPlacements.id, ids)));

    if (existing.length !== new Set(ids).size) {
      throw new BadRequestException('The layout contains an unknown placement');
    }

    const placements = await this.database.transaction(async (transaction) => {
      const updated: WidgetPlacement[] = [];

      for (const item of input.placements) {
        const [placement] = await transaction
          .update(widgetPlacements)
          .set({
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            updatedAt: new Date(),
          })
          .where(and(eq(widgetPlacements.id, item.id), eq(widgetPlacements.boardViewId, viewId)))
          .returning();

        if (placement) {
          updated.push(this.toPlacement(placement));
        }
      }

      return updated;
    });

    this.events.publish(view.boardId, 'board.layout.updated', { viewId, placements });
    return { placements };
  }

  public async removePlacement(userId: string, viewId: string, placementId: string): Promise<void> {
    const view = await this.access.requireView(userId, viewId);
    this.requireEditor(view.role);
    const [removed] = await this.database
      .delete(widgetPlacements)
      .where(and(eq(widgetPlacements.id, placementId), eq(widgetPlacements.boardViewId, viewId)))
      .returning({ id: widgetPlacements.id });

    if (!removed) {
      throw new NotFoundException('Widget placement not found');
    }

    this.events.publish(view.boardId, 'widget.placement.deleted', { placementId });
  }

  public async updateWidget(
    userId: string,
    widgetId: string,
    input: UpdateWidgetRequest,
  ): Promise<WidgetInstance> {
    const access = await this.access.requireWidget(userId, widgetId);
    this.requireEditor(access.role);
    const [existing] = await this.database
      .select()
      .from(widgetInstances)
      .where(eq(widgetInstances.id, widgetId))
      .limit(1);

    const widgetType = widgetTypeSchema.safeParse(existing?.type);
    if (!existing || !widgetType.success) {
      throw new NotFoundException('Widget not found');
    }

    const changes: {
      title?: string;
      config?: Record<string, unknown>;
      state?: Record<string, unknown>;
      revision: ReturnType<typeof sql>;
      updatedAt: Date;
    } = {
      revision: sql`${widgetInstances.revision} + 1`,
      updatedAt: new Date(),
    };

    if (input.title !== undefined) changes.title = input.title;
    if (input.config !== undefined) {
      changes.config = this.registry.validateConfig(widgetType.data, input.config);
    }
    if (input.state !== undefined) {
      if (widgetType.data !== 'NOTES') {
        throw new BadRequestException('Use the command endpoint to change this widget state');
      }
      changes.state = this.registry.validateState(widgetType.data, input.state);
    }

    const [updated] = await this.database
      .update(widgetInstances)
      .set(changes)
      .where(
        and(eq(widgetInstances.id, widgetId), eq(widgetInstances.revision, input.expectedRevision)),
      )
      .returning();

    if (!updated) {
      throw new ConflictException('The widget changed in another session');
    }

    const result = this.toWidget(updated);
    this.events.publish(
      access.boardId,
      'widget.instance.updated',
      { widget: result },
      result.revision,
    );
    return result;
  }

  private requireEditor(role: BoardSnapshot['role']): void {
    if (role === 'PLAYER') {
      throw new ForbiddenException('Only game masters can edit this board');
    }
  }

  private toView(view: typeof boardViews.$inferSelect): BoardViewDetail {
    return {
      id: view.id,
      boardId: view.boardId,
      name: view.name,
      slug: view.slug,
      description: view.description,
      audience: view.audience,
    };
  }

  private toWidget(
    widget: typeof widgetInstances.$inferSelect,
    role: BoardSnapshot['role'] = 'OWNER',
  ): WidgetInstance {
    const widgetType = widgetTypeSchema.safeParse(widget.type);
    if (!widgetType.success) {
      throw new Error(`Unknown widget type stored in the database: ${widget.type}`);
    }

    const state = this.registry.validateState(widgetType.data, widget.state);

    return {
      id: widget.id,
      boardId: widget.boardId,
      type: widgetType.data,
      schemaVersion: widget.schemaVersion,
      title: widget.title,
      config: this.registry.validateConfig(widgetType.data, widget.config),
      state: role === 'PLAYER' ? this.toPlayerState(widgetType.data, state) : state,
      revision: widget.revision,
      createdAt: widget.createdAt.toISOString(),
      updatedAt: widget.updatedAt.toISOString(),
    };
  }

  private toPlayerState(
    type: WidgetInstance['type'],
    state: Record<string, unknown>,
  ): Record<string, unknown> {
    if (type === 'DICE') {
      return { ...state, tableItems: [] };
    }

    if (type === 'COMBAT') {
      const participants = Array.isArray(state.participants)
        ? state.participants
            .filter(
              (participant) =>
                typeof participant === 'object' &&
                participant !== null &&
                !('hidden' in participant && participant.hidden === true),
            )
            .map((participant) => ({ ...participant, note: '', hidden: false }))
        : [];
      const participantIds = new Set(
        participants
          .map((participant) => (typeof participant.id === 'string' ? participant.id : undefined))
          .filter((id): id is string => id !== undefined),
      );

      return {
        ...state,
        participants,
        activeParticipantId:
          typeof state.activeParticipantId === 'string' &&
          participantIds.has(state.activeParticipantId)
            ? state.activeParticipantId
            : null,
      };
    }

    return state;
  }

  private toPlacement(placement: typeof widgetPlacements.$inferSelect): WidgetPlacement {
    return {
      id: placement.id,
      boardViewId: placement.boardViewId,
      widgetInstanceId: placement.widgetInstanceId,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      minimumWidth: placement.minimumWidth,
      minimumHeight: placement.minimumHeight,
      visible: placement.visible,
    };
  }

  private isUniqueViolation(error: unknown): error is { code: '23505' } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    );
  }
}
