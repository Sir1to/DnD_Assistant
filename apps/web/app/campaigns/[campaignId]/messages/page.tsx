'use client';

import type {
  AuthResponse,
  CampaignDetail,
  CampaignMembersResponse,
  DirectConversation,
  DirectConversationsResponse,
  DirectMessage,
  DirectMessageEventEnvelope,
  DirectMessagesPage,
} from '@fog-of-lore/contracts';
import { hasMessageSequenceGap } from '@fog-of-lore/domain';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { io } from 'socket.io-client';

import { ApiError, apiRequest, readableError } from '../../../lib/api';
import { CampaignNavigation } from '../../../components/campaign-navigation';

export default function MessagesPage() {
  const params = useParams<{ campaignId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [body, setBody] = useState('');
  const campaignQuery = useQuery({
    queryKey: ['campaigns', params.campaignId],
    queryFn: () => apiRequest<CampaignDetail>(`/campaigns/${params.campaignId}`),
    retry: false,
  });
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<AuthResponse>('/auth/me'),
    retry: false,
  });
  const conversationsQuery = useQuery({
    queryKey: ['direct-conversations', params.campaignId],
    queryFn: () =>
      apiRequest<DirectConversationsResponse>(
        `/campaigns/${params.campaignId}/direct-conversations`,
      ),
    retry: false,
  });
  const membersQuery = useQuery({
    queryKey: ['campaign-members', params.campaignId],
    queryFn: () => apiRequest<CampaignMembersResponse>(`/campaigns/${params.campaignId}/members`),
    enabled: campaignQuery.data?.role !== 'PLAYER',
  });
  const createConversation = useMutation({
    mutationFn: (playerUserId: string) =>
      apiRequest<DirectConversation>(
        `/campaigns/${params.campaignId}/direct-conversations/${playerUserId}`,
        { method: 'PUT' },
      ),
    onSuccess: async (conversation) => {
      setSelectedConversationId(conversation.id);
      await queryClient.invalidateQueries({
        queryKey: ['direct-conversations', params.campaignId],
      });
    },
  });
  const messagesQuery = useQuery({
    queryKey: ['direct-messages', selectedConversationId],
    queryFn: () =>
      apiRequest<DirectMessagesPage>(
        `/direct-conversations/${selectedConversationId}/messages?limit=100`,
      ),
    enabled: Boolean(selectedConversationId),
    retry: false,
  });
  const sendMessage = useMutation({
    mutationFn: (conversationId: string) =>
      apiRequest<DirectMessage>(`/direct-conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ clientMessageId: crypto.randomUUID(), body }),
      }),
    onSuccess: async (message: DirectMessage) => {
      setBody('');
      queryClient.setQueryData<DirectMessagesPage>(
        ['direct-messages', message.conversationId],
        (current) => {
          if (!current || current.messages.some((item) => item.id === message.id)) return current;
          return {
            ...current,
            lastSequence: Math.max(current.lastSequence, message.sequence),
            messages: [...current.messages, message].sort(
              (left, right) => left.sequence - right.sequence,
            ),
          };
        },
      );
      await queryClient.invalidateQueries({
        queryKey: ['direct-messages', message.conversationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['direct-conversations', params.campaignId],
      });
    },
  });
  const markRead = useMutation({
    mutationFn: ({
      conversationId,
      lastReadSequence,
    }: {
      conversationId: string;
      lastReadSequence: number;
    }) =>
      apiRequest<void>(`/direct-conversations/${conversationId}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ lastReadSequence }),
      }),
  });

  const conversations = conversationsQuery.data?.conversations ?? [];
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId);
  const players = useMemo(
    () => (membersQuery.data?.members ?? []).filter((member) => member.role === 'PLAYER'),
    [membersQuery.data?.members],
  );

  useEffect(() => {
    if (!selectedConversationId && conversations[0]) setSelectedConversationId(conversations[0].id);
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (
      campaignQuery.data?.role === 'PLAYER' &&
      meQuery.data?.user.id &&
      !conversationsQuery.isPending &&
      conversations.length === 0 &&
      !createConversation.isPending
    ) {
      createConversation.mutate(meQuery.data.user.id);
    }
  }, [
    campaignQuery.data?.role,
    createConversation,
    conversations.length,
    conversationsQuery.isPending,
    meQuery.data?.user.id,
  ]);

  useEffect(() => {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
      /\/api\/?$/,
      '',
    );
    const socket = io(apiBase, { withCredentials: true, reconnection: true });
    const refresh = (): void => {
      socket.emit('direct-messages.subscribe', { campaignId: params.campaignId });
      void queryClient.invalidateQueries({ queryKey: ['direct-conversations', params.campaignId] });
      if (selectedConversationId) {
        void queryClient.invalidateQueries({
          queryKey: ['direct-messages', selectedConversationId],
        });
      }
    };
    socket.on('connect', refresh);
    socket.on('direct-messages.event', (event: DirectMessageEventEnvelope) => {
      if (event.campaignId !== params.campaignId) return;
      void queryClient.invalidateQueries({ queryKey: ['direct-conversations', params.campaignId] });
      if (event.conversationId === selectedConversationId) {
        const knownSequence = messagesQuery.data?.lastSequence ?? 0;
        if (event.sequence === undefined || hasMessageSequenceGap(knownSequence, event.sequence)) {
          void queryClient.invalidateQueries({
            queryKey: ['direct-messages', selectedConversationId],
          });
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: ['direct-messages', selectedConversationId],
        });
      }
    });
    return () => {
      socket.close();
    };
  }, [messagesQuery.data?.lastSequence, params.campaignId, queryClient, selectedConversationId]);

  useEffect(() => {
    const lastMessage = messagesQuery.data?.messages.at(-1);
    if (selectedConversationId && lastMessage) {
      markRead.mutate({
        conversationId: selectedConversationId,
        lastReadSequence: lastMessage.sequence,
      });
    }
  }, [messagesQuery.data?.messages, markRead, selectedConversationId]);

  useEffect(() => {
    if (campaignQuery.error instanceof ApiError && campaignQuery.error.status === 401) {
      router.replace(
        `/login?next=${encodeURIComponent(`/campaigns/${params.campaignId}/messages`)}`,
      );
    }
  }, [campaignQuery.error, params.campaignId, router]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (selectedConversationId && body.trim()) sendMessage.mutate(selectedConversationId);
  }

  if (campaignQuery.isPending || conversationsQuery.isPending) {
    return <MessagesStatus message="Открываем беседы…" />;
  }
  if (campaignQuery.isError || conversationsQuery.isError) {
    return (
      <MessagesStatus message={readableError(campaignQuery.error ?? conversationsQuery.error)} />
    );
  }

  const campaign = campaignQuery.data;
  return (
    <main className="messages-shell">
      <div className="messages-layout">
        <aside className="messages-sidebar" aria-label="Список бесед">
          <CampaignNavigation campaignId={params.campaignId} role={campaign.role} />
          <div className="messages-sidebar-heading">
            <div>
              <p className="eyebrow">Личные сообщения</p>
              <h2>{campaign.role === 'PLAYER' ? 'С мастером' : 'Игроки'}</h2>
            </div>
          </div>
          {conversations.map((conversation) => (
            <button
              className={`conversation-item ${conversation.id === selectedConversationId ? 'is-active' : ''}`}
              key={conversation.id}
              onClick={() => setSelectedConversationId(conversation.id)}
              type="button"
            >
              <span>{conversation.playerDisplayName}</span>
              {conversation.unreadCount ? <b>{conversation.unreadCount}</b> : null}
            </button>
          ))}
          {campaign.role !== 'PLAYER' ? (
            <div className="conversation-start-list">
              <p>Начать беседу</p>
              {players.map((player) => {
                const existing = conversations.find((item) => item.playerUserId === player.userId);
                return (
                  <button
                    disabled={createConversation.isPending}
                    key={player.userId}
                    onClick={() =>
                      existing
                        ? setSelectedConversationId(existing.id)
                        : createConversation.mutate(player.userId)
                    }
                    type="button"
                  >
                    {player.displayName}
                  </button>
                );
              })}
            </div>
          ) : null}
        </aside>
        <section className="messages-main" aria-live="polite">
          <div className="page-campaign-context">
            <div>
              <Link className="campaign-context-back" href={`/campaigns/${campaign.id}`}>
                ← К кампании
              </Link>
              <strong>{campaign.name}</strong>
            </div>
            <span className="role-badge">Беседы</span>
          </div>
          {selectedConversation ? (
            <>
              <header className="messages-thread-heading">
                <div>
                  <p className="eyebrow">Личная беседа</p>
                  <h2>
                    {campaign.role === 'PLAYER' ? 'Мастер' : selectedConversation.playerDisplayName}
                  </h2>
                </div>
              </header>
              <div className="message-list">
                {(messagesQuery.data?.messages ?? []).map((message) => (
                  <article
                    className={`message-bubble ${message.senderUserId === meQuery.data?.user.id ? 'is-own' : ''}`}
                    key={message.id}
                  >
                    <strong>{message.senderDisplayName}</strong>
                    <p>{message.body}</p>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleString('ru-RU', {
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        month: 'short',
                      })}
                    </time>
                  </article>
                ))}
                {messagesQuery.isPending ? (
                  <p className="messages-empty">Загружаем историю…</p>
                ) : null}
                {!messagesQuery.isPending && (messagesQuery.data?.messages.length ?? 0) === 0 ? (
                  <p className="messages-empty">Здесь пока тихо. Напишите первым.</p>
                ) : null}
              </div>
              <form className="message-compose" onSubmit={submit}>
                <label>
                  <span className="sr-only">Текст сообщения</span>
                  <textarea
                    disabled={sendMessage.isPending}
                    maxLength={10000}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Напишите сообщение…"
                    value={body}
                  />
                </label>
                <Button disabled={sendMessage.isPending || !body.trim()} type="submit">
                  {sendMessage.isPending ? 'Отправляем…' : 'Отправить'}
                </Button>
              </form>
              {sendMessage.isError || createConversation.isError ? (
                <p className="form-error">
                  {readableError(sendMessage.error ?? createConversation.error)}
                </p>
              ) : null}
            </>
          ) : (
            <div className="messages-empty messages-empty-panel">
              {campaign.role === 'PLAYER'
                ? 'Готовим личную беседу…'
                : 'Выберите игрока слева, чтобы начать беседу.'}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MessagesStatus({ message }: { message: string }) {
  return (
    <main className="page-status" role="status">
      <p>{message}</p>
      <Link href="/dashboard">Вернуться к кампаниям</Link>
    </main>
  );
}
