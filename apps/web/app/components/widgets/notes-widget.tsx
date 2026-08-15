'use client';

import type { BoardSnapshot, WidgetInstance } from '@fog-of-lore/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useEffect, useRef, useState } from 'react';

import { ApiError, apiRequest } from '../../lib/api';

export function NotesWidget({
  boardId,
  editMode,
  widget,
}: {
  boardId: string;
  editMode: boolean;
  widget: WidgetInstance;
}) {
  const queryClient = useQueryClient();
  const serverContent = typeof widget.state.content === 'string' ? widget.state.content : '';
  const [draft, setDraft] = useState(serverContent);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(!editMode);
  const [conflict, setConflict] = useState(false);
  const revisionRef = useRef(widget.revision);

  useEffect(() => {
    if (!dirty) {
      setDraft(serverContent);
      revisionRef.current = widget.revision;
    }
  }, [dirty, serverContent, widget.revision]);

  useEffect(() => {
    if (!editMode) setPreview(true);
  }, [editMode]);

  const save = useMutation({
    mutationFn: (content: string) =>
      apiRequest<WidgetInstance>(`/widgets/${widget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: revisionRef.current,
          state: { content },
        }),
      }),
    onSuccess: (updated) => {
      revisionRef.current = updated.revision;
      setDirty(false);
      setConflict(false);
      queryClient.setQueryData<BoardSnapshot>(['board', boardId], (current) =>
        current
          ? {
              ...current,
              widgets: current.widgets.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current,
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setConflict(true);
    },
  });

  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = window.setTimeout(() => save.mutate(draft), 700);
    return () => window.clearTimeout(timer);
  }, [conflict, dirty, draft]);

  useEffect(() => {
    function protect(event: BeforeUnloadEvent): void {
      if (dirty || save.isPending) event.preventDefault();
    }
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, save.isPending]);

  function loadServerVersion(): void {
    setConflict(false);
    setDirty(false);
    void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
  }

  return (
    <div className="notes-widget">
      {editMode && (
        <div className="notes-tabs">
          <button
            className={!preview ? 'active' : ''}
            onClick={() => setPreview(false)}
            type="button"
          >
            Текст
          </button>
          <button
            className={preview ? 'active' : ''}
            onClick={() => setPreview(true)}
            type="button"
          >
            Просмотр
          </button>
          <span>{save.isPending ? 'Сохраняем…' : dirty ? 'Есть изменения' : 'Сохранено'}</span>
        </div>
      )}
      {!preview && editMode ? (
        <textarea
          aria-label={`Текст заметки ${widget.title}`}
          onChange={(event) => {
            setDraft(event.target.value);
            setDirty(true);
            setConflict(false);
          }}
          placeholder={'# Заголовок\n\nЗапишите важную деталь сцены…'}
          value={draft}
        />
      ) : (
        <div className="markdown">
          {draft ? (
            <ReactMarkdown>{draft}</ReactMarkdown>
          ) : (
            <p className="note-placeholder">Пустая заметка</p>
          )}
        </div>
      )}
      {conflict && (
        <div className="conflict-message" role="alert">
          <span>Заметка уже изменилась в другой вкладке.</span>
          <button onClick={loadServerVersion} type="button">
            Загрузить актуальную
          </button>
        </div>
      )}
    </div>
  );
}
