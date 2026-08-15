'use client';

import {
  combatStateSchema,
  type CombatCommandRequest,
  type EncounterParticipant,
  type WidgetInstance,
} from '@fog-of-lore/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { readableError } from '../../lib/api';
import { useWidgetCommand } from './use-widget-command';

type CombatCommandInput = Omit<CombatCommandRequest, 'widgetType' | 'expectedRevision'>;
type NewParticipant = Omit<EncounterParticipant, 'id' | 'order'>;

const groupLabels = {
  PLAYER: 'Игрок',
  ALLY: 'Союзник',
  ENEMY: 'Противник',
} as const;

export function CombatWidget({ boardId, widget }: { boardId: string; widget: WidgetInstance }) {
  const state = combatStateSchema.parse(widget.state);
  const command = useWidgetCommand(boardId, widget.id);
  const [name, setName] = useState(state.name);
  const [participant, setParticipant] = useState<NewParticipant>({
    name: '',
    group: 'ENEMY',
    initiative: 10,
    currentHp: 10,
    maxHp: 10,
    armorClass: null as number | null,
    temporaryHp: 0,
    conditions: [] as string[],
    note: '',
    hidden: false,
  });

  useEffect(() => setName(state.name), [state.name]);

  function send(input: CombatCommandInput): void {
    command.mutate({
      widgetType: 'COMBAT',
      expectedRevision: widget.revision,
      ...input,
    });
  }

  function addParticipant(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!participant.name.trim()) return;
    send({ command: 'COMBAT_ADD_PARTICIPANT', participant });
    setParticipant((current) => ({ ...current, name: '' }));
  }

  return (
    <div className="combat-widget">
      <div className="encounter-toolbar">
        <label>
          Название боя
          <input
            maxLength={160}
            onBlur={() => {
              if (name.trim() && name.trim() !== state.name) {
                send({ command: 'COMBAT_RENAME', name: name.trim() });
              }
            }}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <div className="round-indicator">
          <span>Раунд</span>
          <strong>{state.round}</strong>
        </div>
        <div className="turn-controls">
          <button
            disabled={command.isPending || state.participants.length === 0}
            onClick={() => send({ command: 'COMBAT_PREVIOUS_TURN' })}
            type="button"
          >
            ← Предыдущий
          </button>
          <button
            className="primary-control"
            disabled={command.isPending || state.participants.length === 0}
            onClick={() => send({ command: 'COMBAT_NEXT_TURN' })}
            type="button"
          >
            Следующий ход →
          </button>
        </div>
      </div>

      {state.status === 'FINISHED' && (
        <div className="encounter-finished">
          <span>Бой завершён</span>
          <button
            disabled={command.isPending}
            onClick={() => send({ command: 'COMBAT_REOPEN' })}
            type="button"
          >
            Возобновить
          </button>
        </div>
      )}

      <form className="combatant-form" onSubmit={addParticipant}>
        <label className="combatant-name-field">
          Участник
          <input
            maxLength={120}
            onChange={(event) =>
              setParticipant((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Имя"
            value={participant.name}
          />
        </label>
        <label>
          Группа
          <select
            onChange={(event) =>
              setParticipant((current) => ({
                ...current,
                group: event.target.value as EncounterParticipant['group'],
              }))
            }
            value={participant.group}
          >
            <option value="PLAYER">Игрок</option>
            <option value="ALLY">Союзник</option>
            <option value="ENEMY">Противник</option>
          </select>
        </label>
        <NumberField
          label="Инициатива"
          onChange={(initiative) => setParticipant((current) => ({ ...current, initiative }))}
          value={participant.initiative}
        />
        <NumberField
          label="HP"
          min={-999999}
          onChange={(currentHp) => setParticipant((current) => ({ ...current, currentHp }))}
          value={participant.currentHp}
        />
        <NumberField
          label="Макс. HP"
          min={1}
          onChange={(maxHp) => setParticipant((current) => ({ ...current, maxHp }))}
          value={participant.maxHp}
        />
        <label>
          Защита
          <input
            onChange={(event) =>
              setParticipant((current) => ({
                ...current,
                armorClass: event.target.value === '' ? null : Number(event.target.value),
              }))
            }
            type="number"
            value={participant.armorClass ?? ''}
          />
        </label>
        <button className="primary-control" disabled={command.isPending} type="submit">
          + Добавить
        </button>
      </form>

      {command.isError && <p className="widget-error">{readableError(command.error)}</p>}

      <div className="combatant-list">
        {state.participants.length === 0 ? (
          <p className="compact-empty">Добавьте участников и начните первый ход.</p>
        ) : (
          state.participants.map((item) => (
            <CombatantRow
              active={item.id === state.activeParticipantId}
              commandPending={command.isPending}
              key={item.id}
              participant={item}
              send={send}
            />
          ))
        )}
      </div>

      {state.status === 'ACTIVE' && state.participants.length > 0 && (
        <button
          className="finish-encounter"
          disabled={command.isPending}
          onClick={() => send({ command: 'COMBAT_FINISH' })}
          type="button"
        >
          Завершить бой
        </button>
      )}
    </div>
  );
}

function CombatantRow({
  participant,
  active,
  commandPending,
  send,
}: {
  participant: EncounterParticipant;
  active: boolean;
  commandPending: boolean;
  send: (input: CombatCommandInput) => void;
}) {
  const [amount, setAmount] = useState(1);
  const [conditions, setConditions] = useState(participant.conditions.join(', '));
  const [note, setNote] = useState(participant.note);
  const [hidden, setHidden] = useState(participant.hidden);

  useEffect(() => {
    setConditions(participant.conditions.join(', '));
    setNote(participant.note);
    setHidden(participant.hidden);
  }, [participant.conditions, participant.hidden, participant.note]);

  function saveDetails(): void {
    send({
      command: 'COMBAT_UPDATE_PARTICIPANT',
      participantId: participant.id,
      changes: {
        conditions: conditions
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        note,
        hidden,
      },
    });
  }

  return (
    <article
      className={`combatant-row group-${participant.group.toLowerCase()} ${active ? 'is-active' : ''}`}
    >
      <div className="initiative-cell">
        <strong>{participant.initiative}</strong>
        <span>иниц.</span>
      </div>
      <div className="combatant-identity">
        <span className="group-label">{groupLabels[participant.group]}</span>
        <strong>
          {participant.hidden && '◌ '}
          {participant.name}
        </strong>
        {active && <small>Активный ход</small>}
      </div>
      <div className="health-cell">
        <span>
          HP <strong>{participant.currentHp}</strong> / {participant.maxHp}
        </span>
        {participant.temporaryHp > 0 && <small>+{participant.temporaryHp} врем.</small>}
        {participant.armorClass !== null && <small>Защита {participant.armorClass}</small>}
      </div>
      <div className="health-actions">
        <input
          aria-label={`Количество для ${participant.name}`}
          min={0}
          onChange={(event) => setAmount(Number(event.target.value))}
          type="number"
          value={amount}
        />
        <button
          disabled={commandPending}
          onClick={() => send({ command: 'COMBAT_DAMAGE', participantId: participant.id, amount })}
          type="button"
        >
          Урон
        </button>
        <button
          disabled={commandPending}
          onClick={() => send({ command: 'COMBAT_HEAL', participantId: participant.id, amount })}
          type="button"
        >
          Лечение
        </button>
        <button
          disabled={commandPending}
          onClick={() =>
            send({ command: 'COMBAT_SET_TEMP_HP', participantId: participant.id, amount })
          }
          type="button"
        >
          Врем. HP
        </button>
      </div>
      <div className="combatant-order">
        <button
          aria-label={`Поднять ${participant.name}`}
          disabled={commandPending}
          onClick={() =>
            send({
              command: 'COMBAT_MOVE_PARTICIPANT',
              participantId: participant.id,
              direction: 'UP',
            })
          }
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={`Опустить ${participant.name}`}
          disabled={commandPending}
          onClick={() =>
            send({
              command: 'COMBAT_MOVE_PARTICIPANT',
              participantId: participant.id,
              direction: 'DOWN',
            })
          }
          type="button"
        >
          ↓
        </button>
        <button
          aria-label={`Удалить ${participant.name}`}
          disabled={commandPending}
          onClick={() =>
            send({ command: 'COMBAT_REMOVE_PARTICIPANT', participantId: participant.id })
          }
          type="button"
        >
          ×
        </button>
      </div>
      <details className="combatant-details">
        <summary>
          Состояния и заметка
          {participant.conditions.length > 0 && ` · ${participant.conditions.join(', ')}`}
        </summary>
        <label>
          Временные состояния через запятую
          <input onChange={(event) => setConditions(event.target.value)} value={conditions} />
        </label>
        <label>
          Заметка мастера
          <textarea onChange={(event) => setNote(event.target.value)} value={note} />
        </label>
        <label className="sound-toggle">
          <input
            checked={hidden}
            onChange={(event) => setHidden(event.target.checked)}
            type="checkbox"
          />
          Скрытый участник
        </label>
        <button disabled={commandPending} onClick={saveDetails} type="button">
          Сохранить детали
        </button>
      </details>
    </article>
  );
}

function NumberField({
  label,
  value,
  min = -1000,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}
