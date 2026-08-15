'use client';

import {
  timerConfigSchema,
  timerStateSchema,
  type BoardSnapshot,
  type TimerCommandRequest,
  type WidgetInstance,
} from '@fog-of-lore/contracts';
import { displayedTimerMs } from '@fog-of-lore/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { apiRequest, readableError } from '../../lib/api';
import { useWidgetCommand } from './use-widget-command';

export function TimerWidget({ boardId, widget }: { boardId: string; widget: WidgetInstance }) {
  const state = timerStateSchema.parse(widget.state);
  const config = timerConfigSchema.parse(widget.config);
  const command = useWidgetCommand(boardId, widget.id);
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [minutes, setMinutes] = useState(() => Math.floor(state.durationMs / 60_000));
  const [seconds, setSeconds] = useState(() => Math.floor((state.durationMs % 60_000) / 1000));
  const previousDisplay = useRef(displayedTimerMs(state, now));
  const displayMs = displayedTimerMs(state, now);

  useEffect(() => {
    setMinutes(Math.floor(state.durationMs / 60_000));
    setSeconds(Math.floor((state.durationMs % 60_000) / 1000));
  }, [state.durationMs]);

  useEffect(() => {
    if (state.status !== 'RUNNING') return;
    const interval = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(interval);
  }, [state.status, state.startedAt]);

  useEffect(() => {
    if (
      config.soundEnabled &&
      state.mode === 'COUNTDOWN' &&
      state.status === 'RUNNING' &&
      previousDisplay.current > 0 &&
      displayMs === 0
    ) {
      playSignal();
    }
    previousDisplay.current = displayMs;
  }, [config.soundEnabled, displayMs, state.mode, state.status]);

  const updateConfig = useMutation({
    mutationFn: (soundEnabled: boolean) =>
      apiRequest<WidgetInstance>(`/widgets/${widget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: widget.revision,
          config: { soundEnabled },
        }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<BoardSnapshot>(['board', boardId], (current) =>
        current
          ? {
              ...current,
              widgets: current.widgets.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current,
      );
    },
  });

  function send(input: Omit<TimerCommandRequest, 'widgetType' | 'expectedRevision'>): void {
    command.mutate({
      widgetType: 'TIMER',
      expectedRevision: widget.revision,
      ...input,
    });
  }

  function saveDuration(): void {
    const durationMs = Math.max(1, minutes * 60 + seconds) * 1000;
    send({ command: 'TIMER_SET_DURATION', durationMs });
  }

  return (
    <div className="timer-widget">
      <div className={`timer-display timer-${state.status.toLowerCase()}`}>
        <span>{state.mode === 'COUNTDOWN' ? 'Осталось' : 'Прошло'}</span>
        <strong>{formatDuration(displayMs)}</strong>
        <small>
          {state.status === 'RUNNING' ? 'Идёт' : state.status === 'PAUSED' ? 'Пауза' : 'Готов'}
        </small>
      </div>

      <div className="timer-actions">
        {state.status === 'RUNNING' ? (
          <button
            disabled={command.isPending}
            onClick={() => send({ command: 'TIMER_PAUSE' })}
            type="button"
          >
            Пауза
          </button>
        ) : (
          <button
            className="primary-control"
            disabled={command.isPending}
            onClick={() => send({ command: 'TIMER_START' })}
            type="button"
          >
            {state.status === 'PAUSED' ? 'Продолжить' : 'Запустить'}
          </button>
        )}
        <button
          disabled={command.isPending}
          onClick={() => send({ command: 'TIMER_RESET' })}
          type="button"
        >
          Сброс
        </button>
      </div>

      <div className="timer-settings">
        <label>
          Режим
          <select
            disabled={command.isPending}
            onChange={(event) =>
              send({
                command: 'TIMER_SET_MODE',
                mode: event.target.value as 'COUNTDOWN' | 'STOPWATCH',
              })
            }
            value={state.mode}
          >
            <option value="COUNTDOWN">Обратный отсчёт</option>
            <option value="STOPWATCH">Секундомер</option>
          </select>
        </label>
        {state.mode === 'COUNTDOWN' && (
          <div className="duration-editor">
            <label>
              Мин
              <input
                min={0}
                onChange={(event) => setMinutes(Number(event.target.value))}
                type="number"
                value={minutes}
              />
            </label>
            <label>
              Сек
              <input
                max={59}
                min={0}
                onChange={(event) => setSeconds(Number(event.target.value))}
                type="number"
                value={seconds}
              />
            </label>
            <button disabled={command.isPending} onClick={saveDuration} type="button">
              Применить
            </button>
          </div>
        )}
        <label className="sound-toggle">
          <input
            checked={config.soundEnabled}
            disabled={updateConfig.isPending}
            onChange={(event) => updateConfig.mutate(event.target.checked)}
            type="checkbox"
          />
          Звуковой сигнал
        </label>
      </div>

      {(command.isError || updateConfig.isError) && (
        <p className="widget-error">{readableError(command.error ?? updateConfig.error)}</p>
      )}
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function playSignal(): void {
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.6);
  } catch {
    // Audio is an optional enhancement and may be blocked by browser policy.
  }
}
