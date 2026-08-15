import { notesConfigSchema, notesStateSchema } from '@fog-of-lore/contracts';

import type { WidgetDefinition } from './widget-definition';

export const notesDefinition: WidgetDefinition = {
  catalog: {
    type: 'NOTES',
    displayName: 'Заметка',
    defaultTitle: 'Новая заметка',
    description: 'Текст с поддержкой Markdown и безопасным автосохранением.',
    schemaVersion: 1,
    defaultWidth: 5,
    defaultHeight: 4,
    minimumWidth: 3,
    minimumHeight: 3,
  },
  configSchema: notesConfigSchema,
  stateSchema: notesStateSchema,
  defaultConfig: { markdown: true },
  createDefaultState: () => ({ content: '' }),
};
