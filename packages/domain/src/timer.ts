export type TimerMode = 'COUNTDOWN' | 'STOPWATCH';
export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED';

export interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  durationMs: number;
  accumulatedMs: number;
  startedAt: string | null;
  lastChangedAt: string;
}

export type TimerCommand =
  | { command: 'TIMER_START' }
  | { command: 'TIMER_PAUSE' }
  | { command: 'TIMER_RESET' }
  | { command: 'TIMER_SET_DURATION'; durationMs: number }
  | { command: 'TIMER_SET_MODE'; mode: TimerMode };

export function elapsedTimerMs(state: TimerState, now: Date): number {
  const runningMs =
    state.status === 'RUNNING' && state.startedAt
      ? Math.max(0, now.getTime() - new Date(state.startedAt).getTime())
      : 0;
  return Math.max(0, state.accumulatedMs + runningMs);
}

export function displayedTimerMs(state: TimerState, now: Date): number {
  const elapsed = elapsedTimerMs(state, now);
  return state.mode === 'COUNTDOWN' ? Math.max(0, state.durationMs - elapsed) : elapsed;
}

export function executeTimerCommand(
  state: TimerState,
  command: TimerCommand,
  now: Date,
): TimerState {
  const changedAt = now.toISOString();

  switch (command.command) {
    case 'TIMER_START':
      if (state.status === 'RUNNING') return state;
      if (state.mode === 'COUNTDOWN' && elapsedTimerMs(state, now) >= state.durationMs) {
        return {
          ...state,
          accumulatedMs: 0,
          startedAt: changedAt,
          status: 'RUNNING',
          lastChangedAt: changedAt,
        };
      }
      return { ...state, startedAt: changedAt, status: 'RUNNING', lastChangedAt: changedAt };
    case 'TIMER_PAUSE':
      if (state.status !== 'RUNNING') return state;
      return {
        ...state,
        accumulatedMs: elapsedTimerMs(state, now),
        startedAt: null,
        status: 'PAUSED',
        lastChangedAt: changedAt,
      };
    case 'TIMER_RESET':
      return {
        ...state,
        accumulatedMs: 0,
        startedAt: null,
        status: 'IDLE',
        lastChangedAt: changedAt,
      };
    case 'TIMER_SET_DURATION':
      return {
        ...state,
        durationMs: command.durationMs,
        accumulatedMs: 0,
        startedAt: null,
        status: 'IDLE',
        lastChangedAt: changedAt,
      };
    case 'TIMER_SET_MODE':
      return {
        ...state,
        mode: command.mode,
        accumulatedMs: 0,
        startedAt: null,
        status: 'IDLE',
        lastChangedAt: changedAt,
      };
  }
}
