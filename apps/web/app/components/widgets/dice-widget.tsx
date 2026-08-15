'use client';

import {
  diceStateSchema,
  type DiceCommandRequest,
  type WidgetInstance,
} from '@fog-of-lore/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { readableError } from '../../lib/api';
import { useWidgetCommand } from './use-widget-command';

const quickDice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;

export function DiceWidget({ boardId, widget }: { boardId: string; widget: WidgetInstance }) {
  const state = diceStateSchema.parse(widget.state);
  const command = useWidgetCommand(boardId, widget.id);
  const [expression, setExpression] = useState('d20');
  const persistedTableText = state.tableItems.join('\n');
  const [tableText, setTableText] = useState(persistedTableText);

  useEffect(() => setTableText(persistedTableText), [persistedTableText]);

  function send(input: Omit<DiceCommandRequest, 'widgetType' | 'expectedRevision'>): void {
    command.mutate({
      widgetType: 'DICE',
      expectedRevision: widget.revision,
      ...input,
    });
  }

  function roll(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    send({ command: 'DICE_ROLL', expression });
  }

  function saveTable(): void {
    const tableItems = tableText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    send({ command: 'DICE_SET_TABLE', tableItems });
  }

  return (
    <div className="dice-widget">
      <div className="quick-dice" aria-label="Быстрый бросок">
        {quickDice.map((die) => (
          <button
            disabled={command.isPending}
            key={die}
            onClick={() => send({ command: 'DICE_ROLL', expression: die })}
            type="button"
          >
            {die}
          </button>
        ))}
      </div>

      <form className="dice-expression" onSubmit={roll}>
        <label>
          Выражение
          <input
            aria-label="Выражение кубиков"
            maxLength={16}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="2d6+3"
            value={expression}
          />
        </label>
        <button className="primary-control" disabled={command.isPending} type="submit">
          Бросить
        </button>
      </form>

      {command.isError && <p className="widget-error">{readableError(command.error)}</p>}

      <div className="dice-columns">
        <section className="roll-history">
          <div className="widget-section-heading">
            <strong>История</strong>
            {state.history.length > 0 && (
              <button
                disabled={command.isPending}
                onClick={() => send({ command: 'DICE_CLEAR' })}
                type="button"
              >
                Очистить
              </button>
            )}
          </div>
          {state.history.length === 0 ? (
            <p className="compact-empty">Бросков пока нет.</p>
          ) : (
            <ol>
              {state.history.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.label}</span>
                  <strong>{entry.result}</strong>
                  {entry.details.length > 1 && <small>[{entry.details.join(', ')}]</small>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="random-table">
          <strong>Случайная таблица</strong>
          <textarea
            aria-label="Элементы случайной таблицы"
            onChange={(event) => setTableText(event.target.value)}
            placeholder={'Таинственный след\nНеожиданный союзник\nОпасная находка'}
            value={tableText}
          />
          <div>
            <button disabled={command.isPending} onClick={saveTable} type="button">
              Сохранить
            </button>
            <button
              className="primary-control"
              disabled={command.isPending || state.tableItems.length === 0}
              onClick={() => send({ command: 'DICE_PICK_TABLE' })}
              type="button"
            >
              Выбрать
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
