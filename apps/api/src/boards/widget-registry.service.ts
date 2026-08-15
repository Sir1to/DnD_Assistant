import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type WidgetCatalogItem,
  type WidgetCommandRequest,
  type WidgetType,
} from '@fog-of-lore/contracts';
import type { ZodType } from 'zod';

import { combatDefinition } from './widgets/combat.definition';
import { diceDefinition } from './widgets/dice.definition';
import { notesDefinition } from './widgets/notes.definition';
import { timerDefinition } from './widgets/timer.definition';
import type {
  WidgetCommandContext,
  WidgetCommandResult,
  WidgetDefinition,
} from './widgets/widget-definition';

@Injectable()
export class WidgetRegistryService {
  private readonly definitions = new Map<WidgetType, WidgetDefinition>([
    ['NOTES', notesDefinition],
    ['TIMER', timerDefinition],
    ['DICE', diceDefinition],
    ['COMBAT', combatDefinition],
  ]);

  public catalog(): WidgetCatalogItem[] {
    return [...this.definitions.values()].map(({ catalog }) => catalog);
  }

  public require(type: WidgetType): WidgetDefinition {
    const definition = this.definitions.get(type);

    if (!definition) {
      throw new BadRequestException(`Unsupported widget type: ${type}`);
    }

    return definition;
  }

  public validateConfig(type: WidgetType, value: unknown): Record<string, unknown> {
    return this.parse(this.require(type).configSchema, value, 'config');
  }

  public validateState(type: WidgetType, value: unknown): Record<string, unknown> {
    return this.parse(this.require(type).stateSchema, value, 'state');
  }

  public executeCommand(
    type: WidgetType,
    state: Record<string, unknown>,
    command: WidgetCommandRequest,
    context: WidgetCommandContext,
  ): WidgetCommandResult {
    const definition = this.require(type);

    if (!definition.executeCommand || command.widgetType !== type) {
      throw new BadRequestException('This command does not match the widget type');
    }

    try {
      const result = definition.executeCommand(state, command, context);
      return {
        ...result,
        state: this.validateState(type, result.state),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid widget command',
      );
    }
  }

  private parse(
    schema: ZodType<Record<string, unknown>>,
    value: unknown,
    field: string,
  ): Record<string, unknown> {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(`Invalid widget ${field}`);
    }

    return result.data;
  }
}
