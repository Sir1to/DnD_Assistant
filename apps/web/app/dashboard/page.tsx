'use client';

import type { AuthResponse, CampaignDetail, CampaignListResponse } from '@fog-of-lore/contracts';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiRequest, readableError } from '../lib/api';
import { useTheme } from '../components/theme-provider';

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthResponse>('/auth/me'),
    retry: false,
  });

  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiRequest<CampaignListResponse>('/campaigns'),
    enabled: meQuery.isSuccess,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest<CampaignDetail>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      }),
    onSuccess: async (campaign) => {
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      router.push(`/campaigns/${campaign.id}`);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      router.replace('/login');
    }
  }, [meQuery.error, router]);

  function submitCampaign(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    createMutation.reset();
    createMutation.mutate();
  }

  if (meQuery.isPending) {
    return <PageStatus message="Открываем мастерскую…" />;
  }

  if (meQuery.isError) {
    return <PageStatus message={readableError(meQuery.error)} />;
  }

  const campaigns = campaignsQuery.data?.campaigns ?? [];

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Fog of Lore</span>
        </Link>
        <div className="account-actions">
          <span>{meQuery.data.user.displayName}</span>
          <button className="header-theme-switch" onClick={toggleTheme} type="button">
            {theme === 'tavern' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
          <Button
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            tone="quiet"
          >
            Выйти
          </Button>
        </div>
      </header>

      <section className="campaigns-section">
        <div className="campaigns-heading">
          <div>
            <p className="eyebrow">Кампании</p>
            <h1>Ваши миры и истории</h1>
          </div>
          <Button onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? 'Закрыть форму' : 'Создать кампанию'}
          </Button>
        </div>

        {showCreate ? (
          <form className="campaign-form" onSubmit={submitCampaign}>
            <div>
              <p className="eyebrow">Новая кампания</p>
              <h2>С чего начинается история?</h2>
            </div>
            <label>
              Название
              <input
                autoFocus
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label>
              Краткое описание
              <textarea
                maxLength={4000}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                value={description}
              />
            </label>
            {createMutation.isError ? (
              <p className="form-error" role="alert">
                {readableError(createMutation.error)}
              </p>
            ) : null}
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? 'Создаём…' : 'Создать и открыть'}
            </Button>
          </form>
        ) : null}

        {campaignsQuery.isPending ? <p className="muted-message">Загружаем кампании…</p> : null}
        {campaignsQuery.isError ? (
          <p className="form-error" role="alert">
            {readableError(campaignsQuery.error)}
          </p>
        ) : null}

        {!campaignsQuery.isPending && campaigns.length === 0 ? (
          <div className="empty-state">
            <span aria-hidden="true">✦</span>
            <h2>Первая страница пока пуста</h2>
            <p>Создайте кампанию — доска и основной вид появятся автоматически.</p>
          </div>
        ) : (
          <div className="campaign-grid">
            {campaigns.map((campaign) => (
              <Link className="campaign-card" href={`/campaigns/${campaign.id}`} key={campaign.id}>
                <span className="role-badge">{roleLabel(campaign.role)}</span>
                <h2>{campaign.name}</h2>
                <p>{campaign.description || 'Описание можно будет дополнить позднее.'}</p>
                <span className="open-label">
                  {campaign.role === 'PLAYER' ? 'Открыть доску игрока →' : 'Открыть мастерскую →'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function roleLabel(role: 'OWNER' | 'GM' | 'PLAYER'): string {
  if (role === 'OWNER') return 'Владелец';
  if (role === 'GM') return 'Мастер';
  return 'Игрок';
}

function PageStatus({ message }: { message: string }) {
  return (
    <main className="page-status" role="status">
      <span className="brand-mark" aria-hidden="true">
        F
      </span>
      <p>{message}</p>
    </main>
  );
}
