'use client';

import type {
  CampaignInvitationsResponse,
  CampaignMember,
  CampaignMembersResponse,
  CreatedCampaignInvitation,
} from '@fog-of-lore/contracts';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiRequest, readableError } from '../lib/api';

export function CampaignPeoplePanel({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [createdLink, setCreatedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const membersQuery = useQuery({
    queryKey: ['campaign-members', campaignId],
    queryFn: () => apiRequest<CampaignMembersResponse>(`/campaigns/${campaignId}/members`),
  });
  const invitationsQuery = useQuery({
    queryKey: ['campaign-invitations', campaignId],
    queryFn: () => apiRequest<CampaignInvitationsResponse>(`/campaigns/${campaignId}/invitations`),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest<CreatedCampaignInvitation>(`/campaigns/${campaignId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ expiresInDays }),
      }),
    onSuccess: async (invitation) => {
      setCreatedLink(`${window.location.origin}/join/${invitation.token}`);
      setCopied(false);
      await queryClient.invalidateQueries({ queryKey: ['campaign-invitations', campaignId] });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiRequest<void>(`/campaigns/${campaignId}/invitations/${invitationId}`, {
        method: 'DELETE',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['campaign-invitations', campaignId] }),
  });
  const roleMutation = useMutation({
    mutationFn: ({ member, role }: { member: CampaignMember; role: 'GM' | 'PLAYER' }) =>
      apiRequest<CampaignMember>(`/campaigns/${campaignId}/members/${member.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign-members', campaignId] }),
  });

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(createdLink);
    setCopied(true);
  }

  return (
    <section className="people-panel" aria-labelledby="people-title">
      <div className="people-panel-heading">
        <div>
          <p className="eyebrow">Доступ к кампании</p>
          <h2 id="people-title">Игроки и приглашения</h2>
        </div>
        <button aria-label="Закрыть панель игроков" onClick={onClose} type="button">
          ×
        </button>
      </div>

      <div className="people-columns">
        <section>
          <h3>Создать одноразовую ссылку</h3>
          <p>Ссылка работает для одного игрока. После принятия она автоматически закрывается.</p>
          <div className="invitation-create">
            <label>
              Срок действия
              <select
                onChange={(event) => setExpiresInDays(Number(event.target.value))}
                value={expiresInDays}
              >
                <option value={1}>1 день</option>
                <option value={3}>3 дня</option>
                <option value={7}>7 дней</option>
                <option value={14}>14 дней</option>
                <option value={30}>30 дней</option>
              </select>
            </label>
            <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Создаём…' : 'Создать ссылку'}
            </Button>
          </div>
          {createdLink ? (
            <div className="created-invitation" role="status">
              <label>
                Новая ссылка
                <input readOnly value={createdLink} />
              </label>
              <Button onClick={() => void copyLink()} tone="quiet">
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
              <small>
                Сохраните её сейчас: из соображений безопасности токен больше не показывается.
              </small>
            </div>
          ) : null}
          {createMutation.isError ? (
            <p className="form-error">{readableError(createMutation.error)}</p>
          ) : null}
        </section>

        <section>
          <h3>Участники</h3>
          {membersQuery.isPending ? <p>Загружаем…</p> : null}
          <div className="member-list">
            {(membersQuery.data?.members ?? []).map((member) => (
              <article key={member.userId}>
                <span className="member-avatar" aria-hidden="true">
                  {member.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{member.displayName}</strong>
                  <small>{member.email}</small>
                </div>
                {member.role === 'OWNER' ? (
                  <span className="role-badge">Владелец</span>
                ) : (
                  <label className="member-role-select">
                    <span className="sr-only">Роль {member.displayName}</span>
                    <select
                      aria-label={`Роль ${member.displayName}`}
                      disabled={roleMutation.isPending}
                      onChange={(event) =>
                        roleMutation.mutate({
                          member,
                          role: event.target.value as 'GM' | 'PLAYER',
                        })
                      }
                      value={member.role}
                    >
                      <option value="PLAYER">Игрок</option>
                      <option value="GM">Мастер</option>
                    </select>
                  </label>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="invitation-history">
        <h3>История приглашений</h3>
        {(invitationsQuery.data?.invitations ?? []).length === 0 ? (
          <p>Приглашений пока нет.</p>
        ) : (
          <div>
            {(invitationsQuery.data?.invitations ?? [])
              .slice()
              .reverse()
              .map((invitation) => (
                <article key={invitation.id}>
                  <span>{invitationStatusLabel(invitation.status)}</span>
                  <small>до {new Date(invitation.expiresAt).toLocaleDateString('ru-RU')}</small>
                  {invitation.status === 'AVAILABLE' ? (
                    <button
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(invitation.id)}
                      type="button"
                    >
                      Отозвать
                    </button>
                  ) : null}
                </article>
              ))}
          </div>
        )}
        {(membersQuery.isError ||
          invitationsQuery.isError ||
          revokeMutation.isError ||
          roleMutation.isError) && (
          <p className="form-error">
            {readableError(
              membersQuery.error ??
                invitationsQuery.error ??
                revokeMutation.error ??
                roleMutation.error,
            )}
          </p>
        )}
      </section>
    </section>
  );
}

function invitationStatusLabel(status: 'AVAILABLE' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED') {
  if (status === 'AVAILABLE') return 'Активно';
  if (status === 'ACCEPTED') return 'Принято';
  if (status === 'EXPIRED') return 'Истекло';
  return 'Отозвано';
}
