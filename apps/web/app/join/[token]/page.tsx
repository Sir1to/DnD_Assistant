'use client';

import type {
  AuthResponse,
  CampaignInvitationPreview,
  CampaignSummary,
} from '@fog-of-lore/contracts';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ApiError, apiRequest, readableError } from '../../lib/api';

export default function JoinCampaignPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const nextPath = `/join/${params.token}`;
  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthResponse>('/auth/me'),
    retry: false,
  });
  const invitationQuery = useQuery({
    queryKey: ['invitation', params.token],
    queryFn: () => apiRequest<CampaignInvitationPreview>(`/invitations/${params.token}`),
    enabled: meQuery.isSuccess,
    retry: false,
  });
  const acceptMutation = useMutation({
    mutationFn: () =>
      apiRequest<CampaignSummary>(`/invitations/${params.token}/accept`, {
        method: 'POST',
      }),
    onSuccess: async (campaign) => {
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      router.replace(`/campaigns/${campaign.id}`);
    },
  });

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
    }
  }, [meQuery.error, nextPath, router]);

  if (meQuery.isPending || invitationQuery.isPending) {
    return <JoinStatus message="Проверяем приглашение…" />;
  }

  if (meQuery.isError) {
    return <JoinStatus message="Перенаправляем на страницу входа…" />;
  }

  if (invitationQuery.isError) {
    return <JoinStatus message={readableError(invitationQuery.error)} />;
  }

  const invitation = invitationQuery.data;
  const unavailable = invitation.status !== 'AVAILABLE';

  return (
    <main className="join-shell">
      <section className="join-card">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Fog of Lore</span>
        </Link>
        <p className="eyebrow">Приглашение игрока</p>
        <h1>{invitation.campaignName}</h1>
        <p>
          Мастер приглашает вас присоединиться к кампании. Вы увидите только те виды доски, которые
          он откроет для игроков.
        </p>
        {unavailable ? (
          <div className="join-notice" role="status">
            {invitationStatusLabel(invitation.status)}
          </div>
        ) : (
          <Button
            className="join-button"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
          >
            {acceptMutation.isPending ? 'Присоединяем…' : 'Присоединиться к кампании'}
          </Button>
        )}
        {acceptMutation.isError ? (
          <p className="form-error" role="alert">
            {readableError(acceptMutation.error)}
          </p>
        ) : null}
        <Link className="join-back" href="/dashboard">
          Вернуться к кампаниям
        </Link>
      </section>
    </main>
  );
}

function invitationStatusLabel(status: CampaignInvitationPreview['status']): string {
  if (status === 'ACCEPTED') return 'Это приглашение уже использовано.';
  if (status === 'EXPIRED') return 'Срок действия приглашения истёк.';
  if (status === 'REVOKED') return 'Мастер отозвал это приглашение.';
  return '';
}

function JoinStatus({ message }: { message: string }) {
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
