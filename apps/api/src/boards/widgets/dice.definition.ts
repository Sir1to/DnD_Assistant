import {
  diceConfigSchema,
  diceStateSchema,
  type DiceCommandRequest,
  type DiceState,
} from '@fog-of-lore/contracts';
import { pickRandomItem, rollDice } from '@fog-of-lore/domain';

import type { WidgetDefinition } from './widget-definition';

export const diceDefinition: WidgetDefinition = {
  catalog: {
    type: 'DICE',
    displayName: 'Кубики и таблица',
    defaultTitle: 'Случайности',
    description: 'Безопасные выражения кубиков, история и случайная таблица.',
    schemaVersion: 1,
    defaultWidth: 5,
    defaultHeight: 5,
    minimumWidth: 4,
    minimumHeight: 4,
  },
  configSchema: diceConfigSchema,
  stateSchema: diceStateSchema,
  defaultConfig: {},
  createDefaultState: () => ({ history: [], tableItems: [] }),
  executeCommand: (rawState, rawCommand, context) => {
    const state = diceStateSchema.parse(rawState) as DiceState;
    const command = rawCommand as DiceCommandRequest;

    if (command.command === 'DICE_CLEAR') {
      return { state: { ...state, history: [] }, eventName: 'widget.instance.updated' };
    }

    if (command.command === 'DICE_SET_TABLE') {
      if (!command.tableItems) throw new Error('Random table items are required');
      return {
        state: { ...state, tableItems: command.tableItems },
        eventName: 'widget.instance.updated',
      };
    }

    if (command.command === 'DICE_PICK_TABLE') {
      const result = pickRandomItem(state.tableItems, context.random);
      return {
        state: {
          ...state,
          history: [
            {
              id: context.randomId(),
              kind: 'TABLE',
              label: 'Случайная таблица',
              result,
              details: [],
              occurredAt: context.now.toISOString(),
            },
            ...state.history,
          ].slice(0, 30),
        },
        eventName: 'widget.instance.updated',
      };
    }

    const roll = rollDice(command.expression ?? 'd20', context.random);
    return {
      state: {
        ...state,
        history: [
          {
            id: context.randomId(),
            kind: 'DICE',
            label: roll.expression.normalized,
            result: String(roll.total),
            details: roll.rolls,
            occurredAt: context.now.toISOString(),
          },
          ...state.history,
        ].slice(0, 30),
      },
      eventName: 'widget.instance.updated',
    };
  },
};
