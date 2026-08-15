'use client';

import type {
  CampaignDetail,
  CampaignEventEnvelope,
  CampaignLoreResponse,
  CampaignMember,
  CampaignMembersResponse,
  CreateLoreEntryRequest,
  LoreCategory,
  LoreEntry,
  UpdateLoreEntryRequest,
} from '@fog-of-lore/contracts';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { io } from 'socket.io-client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ApiError, apiRequest, apiResourceUrl, readableError } from '../../../lib/api';
import { CampaignNavigation } from '../../../components/campaign-navigation';

const categoryLabels: Record<LoreCategory, string> = {
  GENERAL: 'Общее',
  CLUE: 'Зацепка',
  FACT: 'Факт',
  MAP: 'Карта',
  PERSON: 'Персонаж',
  PLACE: 'Место',
  EVENT: 'Событие',
  ITEM: 'Предмет',
  HANDOUT: 'Раздатка',
};

type AlmanacSection = 'ALL' | 'IMPORTANT' | LoreCategory;

const almanacSections: Array<{ id: AlmanacSection; label: string; icon: string }> = [
  { id: 'ALL', label: 'Все записи', icon: '◇' },
  { id: 'IMPORTANT', label: 'Важное', icon: '★' },
  { id: 'MAP', label: 'Карты', icon: '▧' },
  { id: 'CLUE', label: 'Зацепки', icon: '⌁' },
  { id: 'FACT', label: 'Факты', icon: '◆' },
  { id: 'PERSON', label: 'Персонажи', icon: '♙' },
  { id: 'PLACE', label: 'Места', icon: '⌂' },
  { id: 'EVENT', label: 'События', icon: '◷' },
  { id: 'ITEM', label: 'Предметы', icon: '◈' },
  { id: 'HANDOUT', label: 'Раздатки', icon: '▤' },
  { id: 'GENERAL', label: 'Общее', icon: '○' },
];

type AccessMode = 'DRAFT' | 'ALL_PLAYERS' | 'SELECTED_PLAYERS';

export default function CampaignLorePage() {
  const params = useParams<{ campaignId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<AlmanacSection>('ALL');
  const campaignQuery = useQuery({
    queryKey: ['campaigns', params.campaignId],
    queryFn: () => apiRequest<CampaignDetail>(`/campaigns/${params.campaignId}`),
    retry: false,
  });
  const loreQuery = useQuery({
    queryKey: ['campaign-lore', params.campaignId],
    queryFn: () => apiRequest<CampaignLoreResponse>(`/campaigns/${params.campaignId}/lore`),
    enabled: campaignQuery.isSuccess,
  });
  const canEdit = campaignQuery.data?.role !== 'PLAYER';
  const membersQuery = useQuery({
    queryKey: ['campaign-members', params.campaignId],
    queryFn: () => apiRequest<CampaignMembersResponse>(`/campaigns/${params.campaignId}/members`),
    enabled: campaignQuery.isSuccess && canEdit,
  });
  const createMutation = useMutation({
    mutationFn: (entryCategory: LoreCategory) =>
      apiRequest<LoreEntry>(`/campaigns/${params.campaignId}/lore`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Новый материал',
          content: '',
          category: entryCategory,
          isPinned: section === 'IMPORTANT',
          status: 'DRAFT',
          audience: 'MASTER',
          recipientUserIds: [],
        } satisfies CreateLoreEntryRequest),
      }),
    onSuccess: async (entry) => {
      await queryClient.invalidateQueries({ queryKey: ['campaign-lore', params.campaignId] });
      setSelectedId(entry.id);
    },
  });

  useEffect(() => {
    if (campaignQuery.error instanceof ApiError && campaignQuery.error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(`/campaigns/${params.campaignId}/lore`)}`);
    }
  }, [campaignQuery.error, params.campaignId, router]);

  useEffect(() => {
    if (!campaignQuery.isSuccess) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
      /\/api\/?$/,
      '',
    );
    const socket = io(apiBase, { withCredentials: true });
    socket.on('connect', () => {
      socket.emit('campaign.subscribe', { campaignId: params.campaignId });
      void queryClient.invalidateQueries({ queryKey: ['campaign-lore', params.campaignId] });
    });
    socket.on('campaign.event', (event: CampaignEventEnvelope) => {
      if (event.campaignId === params.campaignId && event.eventName === 'campaign.lore.changed') {
        void queryClient.invalidateQueries({ queryKey: ['campaign-lore', params.campaignId] });
      }
    });
    return () => {
      socket.close();
    };
  }, [campaignQuery.isSuccess, params.campaignId, queryClient]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    return (loreQuery.data?.entries ?? []).filter(
      (entry) =>
        matchesSection(entry, section) &&
        (!normalizedSearch ||
          entry.title.toLocaleLowerCase('ru-RU').includes(normalizedSearch) ||
          entry.content.toLocaleLowerCase('ru-RU').includes(normalizedSearch)),
    );
  }, [loreQuery.data?.entries, search, section]);

  useEffect(() => {
    if (!filteredEntries.some(({ id }) => id === selectedId)) {
      setSelectedId(filteredEntries[0]?.id ?? '');
    }
  }, [filteredEntries, selectedId]);

  const sectionCounts = useMemo(
    () =>
      Object.fromEntries(
        almanacSections.map(({ id }) => [
          id,
          (loreQuery.data?.entries ?? []).filter((entry) => matchesSection(entry, id)).length,
        ]),
      ) as Record<AlmanacSection, number>,
    [loreQuery.data?.entries],
  );
  const selectedEntry = loreQuery.data?.entries.find(({ id }) => id === selectedId);
  const playerMembers = (membersQuery.data?.members ?? []).filter(({ role }) => role === 'PLAYER');

  if (campaignQuery.isPending || loreQuery.isPending) {
    return <LoreStatus message="Открываем библиотеку знаний…" />;
  }
  if (campaignQuery.isError || loreQuery.isError) {
    return <LoreStatus message={readableError(campaignQuery.error ?? loreQuery.error)} />;
  }

  return (
    <main className="lore-shell">
      <div className="lore-layout">
        <aside className="lore-sidebar">
          <CampaignNavigation campaignId={params.campaignId} role={campaignQuery.data.role} />
          <div className="lore-sidebar-heading">
            <div>
              <p className="eyebrow">Знания кампании</p>
              <h2>Альманах</h2>
            </div>
            {canEdit ? (
              <Button
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate(categoryForNewEntry(section))}
              >
                + Материал
              </Button>
            ) : null}
          </div>

          <label className="lore-search">
            <span className="sr-only">Поиск по знаниям</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по знаниям…"
              type="search"
              value={search}
            />
          </label>
          <nav aria-label="Разделы Альманаха" className="almanac-sections">
            {almanacSections.map((item) => (
              <button
                aria-current={section === item.id ? 'page' : undefined}
                className={section === item.id ? 'is-active' : ''}
                key={item.id}
                onClick={() => setSection(item.id)}
                type="button"
              >
                <span aria-hidden="true">{item.icon}</span>
                <strong>{item.label}</strong>
                <small>{sectionCounts[item.id]}</small>
              </button>
            ))}
          </nav>

          <div className="lore-entry-list">
            {filteredEntries.map((entry) => {
              const cover = firstImageAttachment(entry);
              return (
                <button
                  className={`${entry.id === selectedEntry?.id ? 'is-selected' : ''} ${
                    entry.category === 'MAP' ? 'is-map-card' : ''
                  }`}
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  type="button"
                >
                  {entry.category === 'MAP' && cover ? (
                    <img
                      alt=""
                      className="almanac-map-cover"
                      src={apiResourceUrl(`/lore-attachments/${cover.id}/content`)}
                    />
                  ) : null}
                  <span className="almanac-entry-badges">
                    <span className={`lore-category category-${entry.category.toLowerCase()}`}>
                      {categoryLabels[entry.category]}
                    </span>
                    {entry.isPinned ? (
                      <span aria-label="Важное" className="almanac-important-mark">
                        ★
                      </span>
                    ) : null}
                  </span>
                  <strong>{entry.title}</strong>
                  <small>{accessLabel(entry)}</small>
                </button>
              );
            })}
            {filteredEntries.length === 0 ? (
              <div className="lore-list-empty">
                <span aria-hidden="true">◇</span>
                <p>{search || section !== 'ALL' ? 'Ничего не найдено.' : 'Знаний пока нет.'}</p>
              </div>
            ) : null}
          </div>
          {createMutation.isError ? (
            <p className="form-error">{readableError(createMutation.error)}</p>
          ) : null}
        </aside>

        <section className="lore-main">
          <div className="page-campaign-context">
            <div>
              <Link className="campaign-context-back" href={`/campaigns/${params.campaignId}`}>
                ← К кампании
              </Link>
              <strong>{campaignQuery.data.name}</strong>
            </div>
            <span className="role-badge">
              {canEdit ? 'Альманах мастера' : 'Альманах · Известное'}
            </span>
          </div>
          {selectedEntry ? (
            canEdit ? (
              <LoreEditor
                campaignId={params.campaignId}
                entry={selectedEntry}
                key={`${selectedEntry.id}:${selectedEntry.revision}`}
                members={playerMembers}
                onDeleted={() => setSelectedId('')}
              />
            ) : (
              <LoreReader entry={selectedEntry} />
            )
          ) : (
            <div className="lore-main-empty">
              <span aria-hidden="true">◇</span>
              <h2>{canEdit ? 'Создайте первый материал' : 'Мастер пока ничего не открыл'}</h2>
              <p>
                {canEdit
                  ? 'Здесь можно хранить сведения о мире и выдавать раздатки игрокам.'
                  : 'Опубликованные знания и персональные раздатки появятся здесь автоматически.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LoreEditor({
  campaignId,
  entry,
  members,
  onDeleted,
}: {
  campaignId: string;
  entry: LoreEntry;
  members: CampaignMember[];
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [category, setCategory] = useState(entry.category);
  const [isPinned, setIsPinned] = useState(entry.isPinned);
  const [accessMode, setAccessMode] = useState<AccessMode>(modeOf(entry));
  const [recipientUserIds, setRecipientUserIds] = useState(entry.recipientUserIds);
  const [preview, setPreview] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File>();
  const updateMutation = useMutation({
    mutationFn: (input: UpdateLoreEntryRequest) =>
      apiRequest<LoreEntry>(`/lore/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaign-lore', campaignId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest<void>(`/lore/${entry.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      onDeleted();
      await queryClient.invalidateQueries({ queryKey: ['campaign-lore', campaignId] });
    },
  });
  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set('file', file);
      return apiRequest(`/lore/${entry.id}/attachments`, { method: 'POST', body: form });
    },
    onSuccess: async () => {
      setAttachmentFile(undefined);
      await queryClient.invalidateQueries({ queryKey: ['campaign-lore', campaignId] });
    },
  });
  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      apiRequest<void>(`/lore-attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaign-lore', campaignId] });
    },
  });

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (accessMode === 'SELECTED_PLAYERS' && recipientUserIds.length === 0) return;
    updateMutation.mutate({
      expectedRevision: entry.revision,
      title,
      content,
      category,
      isPinned,
      status: accessMode === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
      audience: accessMode === 'DRAFT' ? 'MASTER' : accessMode,
      recipientUserIds: accessMode === 'SELECTED_PLAYERS' ? recipientUserIds : [],
    });
  }

  function toggleRecipient(userId: string): void {
    setRecipientUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  function remove(): void {
    if (window.confirm(`Удалить материал «${entry.title}»? Это действие нельзя отменить.`)) {
      deleteMutation.mutate();
    }
  }

  return (
    <form className="lore-editor" onSubmit={save}>
      <div className="lore-editor-toolbar">
        <div>
          <p className="eyebrow">Редактор материала</p>
          <span>{updateMutation.isPending ? 'Сохраняем…' : `Версия ${entry.revision + 1}`}</span>
        </div>
        <div>
          <button
            aria-pressed={isPinned}
            className={`lore-pin-toggle ${isPinned ? 'is-active' : ''}`}
            onClick={() => setIsPinned((current) => !current)}
            type="button"
          >
            <span aria-hidden="true">★</span>
            {isPinned ? 'Важное' : 'В важное'}
          </button>
          <button
            className="lore-delete"
            disabled={deleteMutation.isPending}
            onClick={remove}
            type="button"
          >
            Удалить
          </button>
          <Button disabled={updateMutation.isPending || !title.trim()} type="submit">
            Сохранить
          </Button>
        </div>
      </div>

      <div className="lore-editor-fields">
        <label className="lore-title-field">
          Название
          <input
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label>
          Категория
          <select
            onChange={(event) => setCategory(event.target.value as LoreCategory)}
            value={category}
          >
            {(Object.keys(categoryLabels) as LoreCategory[]).map((item) => (
              <option key={item} value={item}>
                {categoryLabels[item]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="lore-access">
        <legend>Кому доступен материал</legend>
        <label>
          <input
            checked={accessMode === 'DRAFT'}
            name="lore-access"
            onChange={() => setAccessMode('DRAFT')}
            type="radio"
          />
          <span>
            <strong>Черновик</strong>
            <small>Только владельцу и мастерам</small>
          </span>
        </label>
        <label>
          <input
            checked={accessMode === 'ALL_PLAYERS'}
            name="lore-access"
            onChange={() => setAccessMode('ALL_PLAYERS')}
            type="radio"
          />
          <span>
            <strong>Всем игрокам</strong>
            <small>Появится у каждого участника</small>
          </span>
        </label>
        <label>
          <input
            checked={accessMode === 'SELECTED_PLAYERS'}
            name="lore-access"
            onChange={() => setAccessMode('SELECTED_PLAYERS')}
            type="radio"
          />
          <span>
            <strong>Выбранным игрокам</strong>
            <small>Персональная раздатка или секрет</small>
          </span>
        </label>
      </fieldset>

      {accessMode === 'SELECTED_PLAYERS' ? (
        <fieldset className="lore-recipients">
          <legend>Получатели</legend>
          {members.length === 0 ? (
            <p>Сначала пригласите в кампанию хотя бы одного игрока.</p>
          ) : (
            members.map((member) => (
              <label key={member.userId}>
                <input
                  checked={recipientUserIds.includes(member.userId)}
                  onChange={() => toggleRecipient(member.userId)}
                  type="checkbox"
                />
                <span className="member-avatar" aria-hidden="true">
                  {member.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{member.displayName}</strong>
                  <small>{member.email}</small>
                </span>
              </label>
            ))
          )}
        </fieldset>
      ) : null}

      <div className="lore-content-heading">
        <label>Содержание</label>
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
        </div>
      </div>
      {preview ? (
        <div className="lore-markdown markdown">
          {content ? <ReactMarkdown>{content}</ReactMarkdown> : <p>Пустой материал</p>}
        </div>
      ) : (
        <textarea
          aria-label="Содержание материала"
          maxLength={100_000}
          onChange={(event) => setContent(event.target.value)}
          placeholder={'# Заголовок\n\nОпишите место, персонажа или подготовьте раздатку…'}
          value={content}
        />
      )}
      <section className="lore-attachments">
        <div className="lore-content-heading">
          <label>Файлы и изображения</label>
          <span>JPEG, PNG, WebP, GIF или PDF · до 10 МБ</span>
        </div>
        <div className="lore-attachment-upload">
          <input
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(event) => setAttachmentFile(event.target.files?.[0])}
            type="file"
          />
          <Button
            disabled={!attachmentFile || uploadAttachmentMutation.isPending}
            onClick={() => attachmentFile && uploadAttachmentMutation.mutate(attachmentFile)}
            tone="quiet"
            type="button"
          >
            Прикрепить
          </Button>
        </div>
        <AttachmentList
          attachments={entry.attachments}
          canDelete
          deleting={deleteAttachmentMutation.isPending}
          onDelete={(id) => deleteAttachmentMutation.mutate(id)}
        />
      </section>
      {accessMode === 'SELECTED_PLAYERS' && recipientUserIds.length === 0 ? (
        <p className="form-error">Выберите хотя бы одного игрока.</p>
      ) : null}
      {(updateMutation.isError ||
        deleteMutation.isError ||
        uploadAttachmentMutation.isError ||
        deleteAttachmentMutation.isError) && (
        <p className="form-error" role="alert">
          {readableError(
            updateMutation.error ??
              deleteMutation.error ??
              uploadAttachmentMutation.error ??
              deleteAttachmentMutation.error,
          )}
        </p>
      )}
    </form>
  );
}

function LoreReader({ entry }: { entry: LoreEntry }) {
  return (
    <article className="lore-reader">
      <div className="lore-reader-heading">
        <span className="almanac-entry-badges">
          <span className={`lore-category category-${entry.category.toLowerCase()}`}>
            {categoryLabels[entry.category]}
          </span>
          {entry.isPinned ? (
            <span aria-label="Важное" className="almanac-important-mark">
              ★ Важное
            </span>
          ) : null}
        </span>
        <h2>{entry.title}</h2>
        <p>
          Открыто {new Date(entry.publishedAt ?? entry.updatedAt).toLocaleDateString('ru-RU')}
          {entry.authorDisplayName ? ` · ${entry.authorDisplayName}` : ''}
        </p>
      </div>
      <div className="lore-markdown markdown">
        {entry.content ? <ReactMarkdown>{entry.content}</ReactMarkdown> : <p>Пустой материал</p>}
      </div>
      <AttachmentList attachments={entry.attachments} />
    </article>
  );
}

function AttachmentList({
  attachments,
  canDelete = false,
  deleting = false,
  onDelete,
}: {
  attachments: LoreEntry['attachments'];
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="lore-attachment-grid">
      {attachments.map((attachment) => {
        const href = apiResourceUrl(`/lore-attachments/${attachment.id}/content`);
        return (
          <div className="lore-attachment-card" key={attachment.id}>
            {attachment.mimeType.startsWith('image/') ? (
              <a href={href} rel="noreferrer" target="_blank">
                {/* User-uploaded authenticated content is intentionally not passed through Next image optimization. */}
                <img alt={attachment.originalName} src={href} />
              </a>
            ) : (
              <a className="lore-pdf-card" href={href} rel="noreferrer" target="_blank">
                <span aria-hidden="true">PDF</span>
              </a>
            )}
            <div>
              <a href={href} rel="noreferrer" target="_blank">
                {attachment.originalName}
              </a>
              <small>{formatBytes(attachment.size)}</small>
            </div>
            {canDelete ? (
              <button
                disabled={deleting}
                onClick={() => onDelete?.(attachment.id)}
                type="button"
                aria-label={`Удалить ${attachment.originalName}`}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function formatBytes(size: number): string {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} КБ`
    : `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function modeOf(entry: LoreEntry): AccessMode {
  if (entry.status === 'DRAFT' || entry.audience === 'MASTER') return 'DRAFT';
  return entry.audience;
}

function accessLabel(entry: LoreEntry): string {
  if (entry.status === 'DRAFT' || entry.audience === 'MASTER') return 'Черновик';
  if (entry.audience === 'ALL_PLAYERS') return 'Всем игрокам';
  if (entry.recipientUserIds.length === 0) return 'Персонально для вас';
  const playerWord =
    entry.recipientUserIds.length % 10 === 1 && entry.recipientUserIds.length % 100 !== 11
      ? 'игрока'
      : 'игроков';
  return `Для ${entry.recipientUserIds.length} ${playerWord}`;
}

function matchesSection(entry: LoreEntry, section: AlmanacSection): boolean {
  if (section === 'ALL') return true;
  if (section === 'IMPORTANT') return entry.isPinned;
  return entry.category === section;
}

function categoryForNewEntry(section: AlmanacSection): LoreCategory {
  return section === 'ALL' || section === 'IMPORTANT' ? 'GENERAL' : section;
}

function firstImageAttachment(entry: LoreEntry): LoreEntry['attachments'][number] | undefined {
  return entry.attachments.find(({ mimeType }) => mimeType.startsWith('image/'));
}

function LoreStatus({ message }: { message: string }) {
  return (
    <main className="page-status" role="status">
      <span className="brand-mark" aria-hidden="true">
        F
      </span>
      <p>{message}</p>
      <Link href="/dashboard">Вернуться к кампаниям</Link>
    </main>
  );
}
