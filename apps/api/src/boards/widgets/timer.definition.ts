import {
  timerConfigSchema,
  timerStateSchema,
  type TimerCommandRequest,
  type TimerState,
} from '@fog-of-lore/contracts';
import { executeTimerCommand, type TimerCommand } from '@fog-of-lore/domain';

import type { WidgetDefinition } from './widget-definition';

export const timerDefinition: WidgetDefinition = {
  catalog: {
    type: 'TIMER',
    displayName: 'Таймер',
    defaultTitle: 'Таймер сцены',
    description: 'Обратный отсчёт или секундомер, общий для всех экранов.',
    schemaVersion: 1,
    defaultWidth: 4,
    defaultHeight: 4,
    minimumWidth: 3,
    minimumHeight: 3,
  },
  configSchema: timerConfigSchema,
  stateSchema: timerStateSchema,
  defaultConfig: { soundEnabled: false },
  createDefaultState: () => ({
    mode: 'COUNTDOWN',
    status: 'IDLE',
    durationMs: 300_000,
    accumulatedMs: 0,
    startedAt: null,
    lastChangedAt: new Date().toISOString(),
  }),
  executeCommand: (rawState, rawCommand, { now }) => {
    const state = timerStateSchema.parse(rawState) as TimerState;
    const command = rawCommand as TimerCommandRequest;
    let domainCommand: TimerCommand;

    switch (command.command) {
      case 'TIMER_SET_DURATION':
        if (command.durationMs === undefined) throw new Error('Timer duration is required');
        domainCommand = { command: command.command, durationMs: command.durationMs };
        break;
      case 'TIMER_SET_MODE':
        if (!command.mode) throw new Error('Timer mode is required');
        domainCommand = { command: command.command, mode: command.mode };
        break;
      default:
        domainCommand = { command: command.command };
    }

    return {
      state: executeTimerCommand(state, domainCommand, now),
      eventName: 'timer.command.executed',
    };
  },
};
