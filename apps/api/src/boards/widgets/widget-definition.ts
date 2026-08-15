import type {
  EventEnvelope,
  WidgetCatalogItem,
  WidgetCommandRequest,
} from '@fog-of-lore/contracts';
import type { ZodType } from 'zod';

export interface WidgetCommandContext {
  now: Date;
  random: () => number;
  randomId: () => string;
}

export interface WidgetCommandResult {
  state: unknown;
  eventName: EventEnvelope['eventName'];
}

export interface WidgetDefinition {
  catalog: WidgetCatalogItem;
  configSchema: ZodType<Record<string, unknown>>;
  stateSchema: ZodType<Record<string, unknown>>;
  defaultConfig: Record<string, unknown>;
  createDefaultState(): Record<string, unknown>;
  executeCommand?(
    state: Record<string, unknown>,
    command: WidgetCommandRequest,
    context: WidgetCommandContext,
  ): WidgetCommandResult;
}
