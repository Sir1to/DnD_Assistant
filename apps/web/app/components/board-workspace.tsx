'use client';

import type {
  BoardSnapshot,
  BoardViewDetail,
  CreateWidgetResult,
  EventEnvelope,
  WidgetCatalogItem,
  WidgetPlacement,
  WidgetType,
} from '@fog-of-lore/contracts';
import { Button, resolveObjectTheme, themeStyle } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { Layout, LayoutItem } from 'react-grid-layout';
import { GridLayout } from 'react-grid-layout';
import { io } from 'socket.io-client';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { apiRequest, readableError } from '../lib/api';
import { CampaignNavigation } from './campaign-navigation';
import { WidgetRenderer } from './widgets/widget-renderer';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type ConnectionState = 'connecting' | 'online' | 'offline';

export function BoardWorkspace({
  boardId,
  campaignId,
  campaignName,
  campaignRole,
  sessionMode,
  onEnterSession,
  onExitSession,
}: {
  boardId: string;
  campaignId: string;
  campaignName: string;
  campaignRole: BoardSnapshot['role'];
  sessionMode: boolean;
  onEnterSession: () => void;
  onExitSession: () => void;
}) {
  const queryClient = useQueryClient();
  const canEdit = campaignRole !== 'PLAYER';
  const boardQuery = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => apiRequest<BoardSnapshot>(`/boards/${boardId}`),
    refetchOnReconnect: true,
    staleTime: 10_000,
  });
  const catalogQuery = useQuery({
    queryKey: ['widget-catalog'],
    queryFn: () => apiRequest<{ widgets: WidgetCatalogItem[] }>('/widgets/catalog'),
    enabled: canEdit,
  });
  const [selectedViewId, setSelectedViewId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [newViewName, setNewViewName] = useState('');
  const [newViewForPlayers, setNewViewForPlayers] = useState(false);
  const [showViewForm, setShowViewForm] = useState(false);
  const [boardElement, setBoardElement] = useState<HTMLDivElement | null>(null);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNoteTitle, setQuickNoteTitle] = useState('');
  const [quickNoteContent, setQuickNoteContent] = useState('');
  const quickNoteTitleId = useId();
  const quickNoteDialog = useRef<HTMLElement>(null);
  const quickNoteTextarea = useRef<HTMLTextAreaElement>(null);
  const quickNoteReturnFocus = useRef<HTMLElement | null>(null);
  const width = useElementWidth(boardElement);

  useEffect(() => {
    const firstView = boardQuery.data?.views[0];
    if (!selectedViewId && firstView) setSelectedViewId(firstView.id);
  }, [boardQuery.data?.views, selectedViewId]);

  useEffect(() => {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
      /\/api\/?$/,
      '',
    );
    const socket = io(apiBase, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.4,
      timeout: 8_000,
    });

    socket.on('connect', () => {
      setConnection('online');
      socket.emit('board.subscribe', { boardId });
      void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.io.on('reconnect_attempt', () => setConnection('connecting'));
    socket.on('board.event', (event: EventEnvelope) => {
      if (event.boardId === boardId) {
        void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      }
    });

    return () => {
      socket.close();
    };
  }, [boardId, queryClient]);

  useEffect(() => {
    function refreshAfterConnectivityChange(): void {
      setConnection('connecting');
      void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    }

    function refreshVisibleBoard(): void {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      }
    }

    window.addEventListener('online', refreshAfterConnectivityChange);
    document.addEventListener('visibilitychange', refreshVisibleBoard);
    return () => {
      window.removeEventListener('online', refreshAfterConnectivityChange);
      document.removeEventListener('visibilitychange', refreshVisibleBoard);
    };
  }, [boardId, queryClient]);

  const createView = useMutation({
    mutationFn: () =>
      apiRequest<BoardViewDetail>(`/boards/${boardId}/views`, {
        method: 'POST',
        body: JSON.stringify({
          name: newViewName,
          description: '',
          audience: newViewForPlayers ? 'PLAYERS' : 'MASTER',
        }),
      }),
    onSuccess: async (view) => {
      setNewViewName('');
      setNewViewForPlayers(false);
      setShowViewForm(false);
      setSelectedViewId(view.id);
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const updateView = useMutation({
    mutationFn: ({ viewId, audience }: { viewId: string; audience: BoardViewDetail['audience'] }) =>
      apiRequest<BoardViewDetail>(`/views/${viewId}`, {
        method: 'PATCH',
        body: JSON.stringify({ audience }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const createWidget = useMutation({
    mutationFn: ({
      type,
      title,
      initialState,
    }: {
      type: WidgetType;
      title: string;
      initialState?: Record<string, unknown>;
    }) =>
      apiRequest<CreateWidgetResult>(`/boards/${boardId}/widgets`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          title,
          boardViewId: selectedViewId,
          initialState,
        }),
      }),
    onSuccess: async (_created, variables) => {
      if (variables.initialState) {
        setQuickNoteOpen(false);
        setQuickNoteTitle('');
        setQuickNoteContent('');
      }
      await queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  useEffect(() => {
    if (!sessionMode || !canEdit) return;

    function openQuickNote(event: KeyboardEvent): void {
      const target = event.target;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n') {
        if (isEditing || event.repeat) return;
        event.preventDefault();
        setQuickNoteOpen(true);
      }
    }

    window.addEventListener('keydown', openQuickNote);
    return () => window.removeEventListener('keydown', openQuickNote);
  }, [canEdit, sessionMode]);

  useEffect(() => {
    if (!quickNoteOpen) return;

    quickNoteReturnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    quickNoteTextarea.current?.focus();

    function keepDialogFocus(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setQuickNoteOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = quickNoteDialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    window.addEventListener('keydown', keepDialogFocus, true);
    return () => {
      window.removeEventListener('keydown', keepDialogFocus, true);
      quickNoteReturnFocus.current?.focus();
    };
  }, [quickNoteOpen]);

  const updateLayout = useMutation({
    mutationFn: ({ viewId, layout }: { viewId: string; layout: Layout }) =>
      apiRequest<{ placements: WidgetPlacement[] }>(`/views/${viewId}/layout`, {
        method: 'PATCH',
        body: JSON.stringify({
          placements: layout.map((item) => ({
            id: item.i,
            x: item.x,
            y: item.y,
            width: item.w,
            height: item.h,
          })),
        }),
      }),
    onMutate: () => setSaveState('saving'),
    onSuccess: ({ placements }) => {
      setSaveState('saved');
      queryClient.setQueryData<BoardSnapshot>(['board', boardId], (current) =>
        current
          ? {
              ...current,
              placements: current.placements.map(
                (item) => placements.find(({ id }) => id === item.id) ?? item,
              ),
            }
          : current,
      );
    },
    onError: () => setSaveState('error'),
  });
  const removePlacement = useMutation({
    mutationFn: ({ viewId, placementId }: { viewId: string; placementId: string }) =>
      apiRequest<void>(`/views/${viewId}/placements/${placementId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', boardId] }),
  });

  if (boardQuery.isPending) {
    return <BoardMessage>Подготавливаем рабочую доску…</BoardMessage>;
  }

  if (boardQuery.isError) {
    return <BoardMessage>{readableError(boardQuery.error)}</BoardMessage>;
  }

  const board = boardQuery.data;
  const selectedView = board.views.find(({ id }) => id === selectedViewId) ?? board.views[0];
  const placements = selectedView
    ? board.placements.filter(({ boardViewId }) => boardViewId === selectedView.id)
    : [];
  const widgetsById = new Map(board.widgets.map((widget) => [widget.id, widget]));
  const layout: Layout = placements.map((placement) => ({
    i: placement.id,
    x: placement.x,
    y: placement.y,
    w: placement.width,
    h: placement.height,
    minW: placement.minimumWidth,
    minH: placement.minimumHeight,
    static: !editMode,
  }));
  const placedWidgetIds = new Set(placements.map(({ widgetInstanceId }) => widgetInstanceId));
  const unplacedWidgets = board.widgets.filter(({ id }) => !placedWidgetIds.has(id));
  const nextBottom = placements.reduce(
    (bottom, placement) => Math.max(bottom, placement.y + placement.height),
    0,
  );

  const addPlacement = (widgetInstanceId: string): void => {
    void apiRequest<WidgetPlacement>(`/views/${selectedView?.id}/placements`, {
      method: 'POST',
      body: JSON.stringify({ widgetInstanceId, x: 0, y: nextBottom }),
    }).then(() => queryClient.invalidateQueries({ queryKey: ['board', boardId] }));
  };

  function submitView(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (newViewName.trim()) createView.mutate();
  }

  function submitQuickNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const content = quickNoteContent.trim();
    if (!content || !selectedViewId) return;

    createWidget.mutate({
      type: 'NOTES',
      title: quickNoteTitle.trim() || 'Быстрая заметка',
      initialState: { content },
    });
  }

  function saveLayout(nextLayout: Layout): void {
    if (selectedView) updateLayout.mutate({ viewId: selectedView.id, layout: nextLayout });
  }

  function movePlacement(placementId: string, change: Partial<LayoutItem>): void {
    const changed = layout.map((item) =>
      item.i === placementId
        ? {
            ...item,
            x: Math.max(0, Math.min(12 - (change.w ?? item.w), change.x ?? item.x)),
            y: Math.max(0, change.y ?? item.y),
            w: Math.max(item.minW ?? 1, Math.min(12 - item.x, change.w ?? item.w)),
            h: Math.max(item.minH ?? 1, change.h ?? item.h),
          }
        : item,
    );
    saveLayout(changed);
  }

  return (
    <div className="board-workspace">
      <aside className="board-sidebar">
        <CampaignNavigation campaignId={campaignId} role={campaignRole} />
        <div>
          <p className="eyebrow">Вид доски</p>
          {board.views.length > 0 ? (
            <select
              aria-label="Текущий вид доски"
              onChange={(event) => setSelectedViewId(event.target.value)}
              value={selectedView?.id ?? ''}
            >
              {board.views.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="sidebar-empty">Нет открытых видов</p>
          )}
        </div>

        {canEdit && (
          <div className="mode-switch" aria-label="Режим доски">
            <button
              className={!editMode ? 'active' : ''}
              onClick={() => setEditMode(false)}
              type="button"
            >
              Использование
            </button>
            <button
              className={editMode ? 'active' : ''}
              onClick={() => setEditMode(true)}
              type="button"
            >
              Редактирование
            </button>
          </div>
        )}

        {editMode && (
          <>
            <section className="sidebar-section">
              <p className="eyebrow">Каталог</p>
              <h3>Виджеты</h3>
              {(catalogQuery.data?.widgets ?? []).map((item) => (
                <div className="catalog-card" key={item.type}>
                  <div className="catalog-icon" aria-hidden="true">
                    {catalogIcon(item.type)}
                  </div>
                  <strong>{item.displayName}</strong>
                  <p>{item.description}</p>
                  <Button
                    disabled={createWidget.isPending || !selectedView}
                    onClick={() =>
                      createWidget.mutate({ type: item.type, title: item.defaultTitle })
                    }
                  >
                    + Добавить
                  </Button>
                </div>
              ))}
            </section>

            {unplacedWidgets.length > 0 && (
              <section className="sidebar-section">
                <p className="eyebrow">Уже на доске</p>
                <h3>Добавить в этот вид</h3>
                {unplacedWidgets.map((widget) => (
                  <button
                    className="existing-widget"
                    key={widget.id}
                    onClick={() => addPlacement(widget.id)}
                    type="button"
                  >
                    <span>{widget.title}</span>
                    <strong>Добавить →</strong>
                  </button>
                ))}
              </section>
            )}

            <section className="sidebar-section">
              {!showViewForm ? (
                <Button className="full-button" onClick={() => setShowViewForm(true)} tone="quiet">
                  + Новый вид
                </Button>
              ) : (
                <form className="new-view-form" onSubmit={submitView}>
                  <label>
                    Название вида
                    <input
                      autoFocus
                      maxLength={120}
                      onChange={(event) => setNewViewName(event.target.value)}
                      value={newViewName}
                    />
                  </label>
                  <label className="view-audience-field">
                    <input
                      checked={newViewForPlayers}
                      onChange={(event) => setNewViewForPlayers(event.target.checked)}
                      type="checkbox"
                    />
                    Сразу показать игрокам
                  </label>
                  <div>
                    <Button disabled={createView.isPending} type="submit">
                      Создать
                    </Button>
                    <Button onClick={() => setShowViewForm(false)} tone="quiet">
                      Отмена
                    </Button>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
      </aside>

      <section className="board-canvas-section">
        <div className="canvas-toolbar">
          <div>
            <div className="campaign-context">
              <Link className="campaign-context-back" href="/dashboard">
                ← Все кампании
              </Link>
              <strong>{campaignName}</strong>
            </div>
            <p className="eyebrow">{editMode ? 'Редактирование' : 'Доска'}</p>
            <h2>{selectedView?.name ?? board.board.name}</h2>
          </div>
          <div className="canvas-toolbar-actions">
            {canEdit && selectedView ? (
              <button
                className={`audience-button ${
                  selectedView.audience === 'PLAYERS' ? 'is-public' : ''
                }`}
                disabled={updateView.isPending}
                onClick={() =>
                  updateView.mutate({
                    viewId: selectedView.id,
                    audience: selectedView.audience === 'PLAYERS' ? 'MASTER' : 'PLAYERS',
                  })
                }
                type="button"
              >
                <span aria-hidden="true">{selectedView.audience === 'PLAYERS' ? '◉' : '○'}</span>
                {selectedView.audience === 'PLAYERS' ? 'Виден игрокам' : 'Только для мастеров'}
              </button>
            ) : null}
            <div className="board-indicators">
              <StatusBadge state={connection} />
              <SaveBadge state={saveState} />
            </div>
            <button className="session-mode-button" onClick={onEnterSession} type="button">
              <span aria-hidden="true">⛶</span>
              Полный экран
            </button>
          </div>
        </div>
        <nav className="board-tool-shelf" aria-label="Инструменты кампании">
          {canEdit ? (
            <button onClick={() => setQuickNoteOpen(true)} type="button">
              <span aria-hidden="true">＋</span>
              Заметка
            </button>
          ) : null}
          {canEdit ? (
            <button
              aria-pressed={editMode}
              className={editMode ? 'is-active' : ''}
              onClick={() => setEditMode((current) => !current)}
              type="button"
            >
              <span aria-hidden="true">⌗</span>
              {editMode ? 'Готово' : 'Править доску'}
            </button>
          ) : null}
          <Link href={`/campaigns/${campaignId}/lore`}>
            <span aria-hidden="true">◇</span>
            Знания
          </Link>
          <Link href={`/campaigns/${campaignId}/messages`}>
            <span aria-hidden="true">✉</span>
            Беседы
          </Link>
        </nav>

        <div
          className={`board-canvas ${editMode ? 'is-editing' : ''}`}
          data-object-type="board.canvas"
          ref={setBoardElement}
          style={themeStyle(resolveObjectTheme('tavern', 'board.canvas'))}
        >
          {!selectedView && !canEdit ? (
            <div className="board-empty player-empty">
              <span aria-hidden="true">◌</span>
              <h3>Нет доступных видов</h3>
              <p>Мастер ещё не открыл вид доски для игроков.</p>
            </div>
          ) : (
            placements.length === 0 && (
              <div className="board-empty">
                <span aria-hidden="true">✦</span>
                <h3>На доске пока ничего нет</h3>
                <p>
                  {canEdit
                    ? 'Включите режим редактирования и добавьте первую заметку из каталога.'
                    : 'Мастер пока не добавил сюда виджеты.'}
                </p>
              </div>
            )
          )}
          {width > 0 && placements.length > 0 && (
            <GridLayout
              dragConfig={{
                enabled: editMode,
                handle: '.widget-drag-handle',
                cancel: 'button, textarea, input, select, summary, details',
              }}
              gridConfig={{
                cols: 12,
                containerPadding: [0, 0],
                margin: [16, 16],
                rowHeight: 72,
              }}
              layout={layout}
              onDragStop={saveLayout}
              onResizeStop={saveLayout}
              resizeConfig={{ enabled: editMode, handles: ['se'] }}
              width={width}
            >
              {placements.map((placement) => {
                const widget = widgetsById.get(placement.widgetInstanceId);
                return (
                  <div
                    className="widget-shell"
                    data-object-type={`widget.${widget?.type.toLowerCase() ?? 'unknown'}`}
                    key={placement.id}
                    style={
                      widget
                        ? themeStyle(
                            resolveObjectTheme('tavern', `widget.${widget.type.toLowerCase()}`),
                          )
                        : undefined
                    }
                  >
                    {widget && (
                      <>
                        <div className="widget-drag-handle">
                          <span>{widget.title}</span>
                          {editMode && <span aria-hidden="true">⠿</span>}
                        </div>
                        <WidgetRenderer
                          boardId={boardId}
                          editMode={editMode}
                          readOnly={!canEdit}
                          widget={widget}
                        />
                        {editMode && (
                          <PlacementControls
                            remove={() =>
                              selectedView &&
                              removePlacement.mutate({
                                viewId: selectedView.id,
                                placementId: placement.id,
                              })
                            }
                            removeDisabled={removePlacement.isPending}
                            move={(change) => movePlacement(placement.id, change)}
                            placement={placement}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </GridLayout>
          )}
        </div>
      </section>

      {sessionMode && (
        <div className="session-controls" aria-label="Управление режимом сессии" role="toolbar">
          {canEdit && (
            <button aria-keyshortcuts="Alt+N" onClick={() => setQuickNoteOpen(true)} type="button">
              <span aria-hidden="true">＋</span>
              Заметка <kbd>Alt+N</kbd>
            </button>
          )}
          {canEdit && (
            <button
              aria-pressed={editMode}
              onClick={() => setEditMode((current) => !current)}
              type="button"
            >
              <span aria-hidden="true">⌗</span>
              {editMode ? 'Готово' : 'Править'}
            </button>
          )}
          <button onClick={onExitSession} type="button">
            <span aria-hidden="true">×</span>
            Выйти <kbd>Esc</kbd>
          </button>
        </div>
      )}

      {quickNoteOpen && (
        <div className="quick-note-backdrop">
          <section
            aria-labelledby={quickNoteTitleId}
            aria-modal="true"
            className="quick-note-dialog"
            ref={quickNoteDialog}
            role="dialog"
          >
            <div className="quick-note-heading">
              <div>
                <p className="eyebrow">Alt + N</p>
                <h2 id={quickNoteTitleId}>Быстрая заметка</h2>
              </div>
              <button
                aria-label="Закрыть быструю заметку"
                onClick={() => setQuickNoteOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form onSubmit={submitQuickNote}>
              <label>
                Название
                <input
                  maxLength={160}
                  onChange={(event) => setQuickNoteTitle(event.target.value)}
                  placeholder="Быстрая заметка"
                  value={quickNoteTitle}
                />
              </label>
              <label>
                Текст заметки
                <textarea
                  maxLength={100_000}
                  onChange={(event) => setQuickNoteContent(event.target.value)}
                  placeholder="Запишите деталь сцены, имя или решение…"
                  ref={quickNoteTextarea}
                  required
                  value={quickNoteContent}
                />
              </label>
              {createWidget.isError && (
                <p className="widget-error" role="alert">
                  {readableError(createWidget.error)}
                </p>
              )}
              <div className="quick-note-actions">
                <button onClick={() => setQuickNoteOpen(false)} type="button">
                  Отмена
                </button>
                <Button disabled={createWidget.isPending || !quickNoteContent.trim()} type="submit">
                  {createWidget.isPending ? 'Сохраняем…' : 'Добавить на доску'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function PlacementControls({
  placement,
  move,
  remove,
  removeDisabled,
}: {
  placement: WidgetPlacement;
  move: (change: Partial<LayoutItem>) => void;
  remove: () => void;
  removeDisabled: boolean;
}) {
  return (
    <div className="placement-controls" aria-label="Точное управление виджетом">
      <button
        aria-label="Сдвинуть влево"
        onClick={() => move({ x: placement.x - 1 })}
        type="button"
      >
        ←
      </button>
      <button
        aria-label="Сдвинуть вправо"
        onClick={() => move({ x: placement.x + 1 })}
        type="button"
      >
        →
      </button>
      <button
        aria-label="Сдвинуть вверх"
        onClick={() => move({ y: placement.y - 1 })}
        type="button"
      >
        ↑
      </button>
      <button aria-label="Сдвинуть вниз" onClick={() => move({ y: placement.y + 1 })} type="button">
        ↓
      </button>
      <button
        aria-label="Увеличить ширину"
        onClick={() => move({ w: placement.width + 1 })}
        type="button"
      >
        Ш+
      </button>
      <button
        aria-label="Увеличить высоту"
        onClick={() => move({ h: placement.height + 1 })}
        type="button"
      >
        В+
      </button>
      <button
        aria-label="Убрать виджет из этого вида доски"
        className="placement-remove"
        disabled={removeDisabled}
        onClick={remove}
        type="button"
      >
        Убрать
      </button>
    </div>
  );
}

function catalogIcon(type: WidgetType): string {
  return (
    {
      NOTES: 'Aa',
      TIMER: '00',
      DICE: 'D20',
      COMBAT: '⚔',
    } satisfies Record<WidgetType, string>
  )[type];
}

function StatusBadge({ state }: { state: ConnectionState }) {
  const label =
    state === 'online' ? 'В сети' : state === 'connecting' ? 'Подключаемся…' : 'Нет связи';
  return (
    <span className={`indicator indicator-${state}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const label =
    state === 'saving' ? 'Сохраняется…' : state === 'saved' ? 'Сохранено' : 'Ошибка сохранения';
  return <span className={`indicator save-${state}`}>{label}</span>;
}

function BoardMessage({ children }: { children: ReactNode }) {
  return (
    <div className="board-message" role="status">
      {children}
    </div>
  );
}

function useElementWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return width;
}
