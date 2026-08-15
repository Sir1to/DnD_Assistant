import { describe, expect, it } from 'vitest';

import { displayedTimerMs, executeTimerCommand, type TimerState } from './timer';

const baseState: TimerState = {
  mode: 'COUNTDOWN',
  status: 'IDLE',
  durationMs: 60_000,
  accumulatedMs: 0,
  startedAt: null,
  lastChangedAt: '2026-01-01T00:00:00.000Z',
};

describe('timer domain', () => {
  it('computes remaining time from timestamps without per-second writes', () => {
    const running = executeTimerCommand(
      baseState,
      { command: 'TIMER_START' },
      new Date('2026-01-01T00:00:10.000Z'),
    );
    expect(displayedTimerMs(running, new Date('2026-01-01T00:00:25.000Z'))).toBe(45_000);
  });

  it('pauses and resumes from accumulated elapsed time', () => {
    const running = executeTimerCommand(
      baseState,
      { command: 'TIMER_START' },
      new Date('2026-01-01T00:00:10.000Z'),
    );
    const paused = executeTimerCommand(
      running,
      { command: 'TIMER_PAUSE' },
      new Date('2026-01-01T00:00:25.000Z'),
    );
    const resumed = executeTimerCommand(
      paused,
      { command: 'TIMER_START' },
      new Date('2026-01-01T00:01:00.000Z'),
    );
    expect(displayedTimerMs(resumed, new Date('2026-01-01T00:01:05.000Z'))).toBe(40_000);
  });

  it('resets timer state', () => {
    const reset = executeTimerCommand(
      { ...baseState, status: 'PAUSED', accumulatedMs: 15_000 },
      { command: 'TIMER_RESET' },
      new Date('2026-01-01T00:02:00.000Z'),
    );
    expect(reset).toMatchObject({ status: 'IDLE', accumulatedMs: 0, startedAt: null });
  });
});
