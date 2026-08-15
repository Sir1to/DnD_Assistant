import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  widgetTypeSchema,
  type WidgetCommandRequest,
  type WidgetInstance,
} from '@fog-of-lore/contracts';
import { randomInt } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { widgetInstances } from '../database/schema';
import { BoardAccessService } from './board-access.service';
import { BoardEventsService } from './board-events.service';
import { WidgetRegistryService } from './widget-registry.service';

@Injectable()
export class WidgetCommandsService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(BoardAccessService) private readonly access: BoardAccessService,
    @Inject(WidgetRegistryService) private readonly registry: WidgetRegistryService,
    @Inject(BoardEventsService) private readonly events: BoardEventsService,
  ) {}

  public async execute(
    userId: string,
    widgetId: string,
    command: WidgetCommandRequest,
  ): Promise<WidgetInstance> {
    const access = await this.access.requireWidget(userId, widgetId);
    if (access.role === 'PLAYER') {
      throw new ForbiddenException('Only game masters can control this widget');
    }

    const [existing] = await this.database
      .select()
      .from(widgetInstances)
      .where(eq(widgetInstances.id, widgetId))
      .limit(1);
    const widgetType = widgetTypeSchema.safeParse(existing?.type);

    if (!existing || !widgetType.success) {
      throw new NotFoundException('Widget not found');
    }

    const result = this.registry.executeCommand(
      widgetType.data,
      this.registry.validateState(widgetType.data, existing.state),
      command,
      {
        now: new Date(),
        random: () => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000,
        randomId: () => globalThis.crypto.randomUUID(),
      },
    );

    const [updated] = await this.database
      .update(widgetInstances)
      .set({
        state: result.state,
        revision: sql`${widgetInstances.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(widgetInstances.id, widgetId),
          eq(widgetInstances.revision, command.expectedRevision),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException('The widget changed in another session');
    }

    const response: WidgetInstance = {
      id: updated.id,
      boardId: updated.boardId,
      type: widgetType.data,
      schemaVersion: updated.schemaVersion,
      title: updated.title,
      config: this.registry.validateConfig(widgetType.data, updated.config),
      state: this.registry.validateState(widgetType.data, updated.state),
      revision: updated.revision,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
    this.events.publish(access.boardId, result.eventName, { widget: response }, response.revision);
    return response;
  }
}
