'use client';

import type { CampaignDetail } from '@fog-of-lore/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { BoardWorkspace } from '../../components/board-workspace';
import { CampaignPeoplePanel } from '../../components/campaign-people-panel';
import { ApiError, apiRequest, readableError } from '../../lib/api';

export default function CampaignPage() {
  const params = useParams<{ campaignId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardShell = useRef<HTMLElement>(null);
  const [sessionMode, setSessionMode] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const campaignQuery = useQuery({
    queryKey: ['campaigns', params.campaignId],
    queryFn: () => apiRequest<CampaignDetail>(`/campaigns/${params.campaignId}`),
    retry: false,
  });

  useEffect(() => {
    if (campaignQuery.error instanceof ApiError && campaignQuery.error.status === 401) {
      router.replace('/login');
    }
  }, [campaignQuery.error, router]);

  useEffect(() => {
    if (searchParams.get('people') === '1') setPeopleOpen(true);
  }, [searchParams]);

  useEffect(() => {
    function syncFullscreenState(): void {
      if (!document.fullscreenElement) setSessionMode(false);
    }

    function exitFallbackSession(event: KeyboardEvent): void {
      if (event.key === 'Escape' && sessionMode && !document.fullscreenElement) {
        setSessionMode(false);
      }
    }

    document.addEventListener('fullscreenchange', syncFullscreenState);
    window.addEventListener('keydown', exitFallbackSession);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      window.removeEventListener('keydown', exitFallbackSession);
    };
  }, [sessionMode]);

  async function enterSession(): Promise<void> {
    setSessionMode(true);

    try {
      await boardShell.current?.requestFullscreen();
    } catch {
      // CSS-only mode remains available when the browser blocks the Fullscreen API.
    }
  }

  async function exitSession(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
    setSessionMode(false);
  }

  if (campaignQuery.isPending) {
    return <CampaignStatus message="Открываем кампанию…" />;
  }

  if (campaignQuery.isError) {
    return <CampaignStatus message={readableError(campaignQuery.error)} />;
  }

  const campaign = campaignQuery.data;

  return (
    <main className={`board-shell ${sessionMode ? 'session-mode' : ''}`} ref={boardShell}>
      {peopleOpen && campaign.role === 'OWNER' ? (
        <CampaignPeoplePanel
          campaignId={campaign.id}
          onClose={() => {
            setPeopleOpen(false);
            router.replace(`/campaigns/${campaign.id}`);
          }}
        />
      ) : null}

      {campaign.boards[0] ? (
        <BoardWorkspace
          boardId={campaign.boards[0].id}
          campaignId={campaign.id}
          campaignName={campaign.name}
          campaignRole={campaign.role}
          onEnterSession={() => void enterSession()}
          onExitSession={() => void exitSession()}
          sessionMode={sessionMode}
        />
      ) : (
        <CampaignStatus message="У кампании пока нет рабочей доски." />
      )}
    </main>
  );
}

function CampaignStatus({ message }: { message: string }) {
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
