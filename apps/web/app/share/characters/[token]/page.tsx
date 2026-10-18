'use client';

import type { AbilityKey, PublicCharacterCard } from '@fog-of-lore/contracts';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';

import { apiRequest, apiResourceUrl, readableError } from '../../../lib/api';

const abilityLabels: Record<AbilityKey, string> = {
  strength: 'Сила',
  dexterity: 'Ловкость',
  constitution: 'Телосложение',
  intelligence: 'Интеллект',
  wisdom: 'Мудрость',
  charisma: 'Харизма',
};

export default function SharedCharacterPage() {
  const { token } = useParams<{ token: string }>();
  const cardQuery = useQuery({
    queryKey: ['public-character-card', token],
    queryFn: () => apiRequest<PublicCharacterCard>(`/character-shares/${token}`),
    retry: false,
  });

  if (cardQuery.isPending) {
    return <SharedStatus>Открываем карточку персонажа…</SharedStatus>;
  }
  if (cardQuery.isError || !cardQuery.data) {
    return (
      <SharedStatus>
        <strong>Ссылка недействительна</strong>
        <span>{readableError(cardQuery.error)}</span>
      </SharedStatus>
    );
  }

  const card = cardQuery.data;
  return (
    <main className="public-character-page">
      <article className="public-character-card">
        <header className="public-character-hero">
          <div className="public-character-portrait">
            {card.hasPortrait ? (
              <img
                alt={`Портрет ${card.name}`}
                src={apiResourceUrl(`/character-shares/${token}/portrait`)}
              />
            ) : (
              <span>{characterInitials(card.name)}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">Fog of Lore · карточка только для чтения</p>
            <h1>{card.name}</h1>
            <p className="public-character-subtitle">
              {card.identity.species} · {card.identity.characterClass} · уровень{' '}
              {card.identity.level}
            </p>
            <span className="role-badge">{card.identity.background}</span>
          </div>
        </header>

        {card.combat ? (
          <section className="public-character-combat">
            <Metric value={card.combat.hitPointMaximum} label="макс. HP" />
            <Metric value={card.combat.armorClass} label="класс доспеха" />
            <Metric value={card.combat.speed} label="скорость" />
            <Metric value={formatModifier(card.combat.initiative)} label="инициатива" />
            <Metric value={card.combat.passivePerception} label="пасс. восприятие" />
            <Metric value={formatModifier(card.combat.proficiencyBonus)} label="мастерство" />
          </section>
        ) : null}

        {card.abilities ? (
          <CardSection title="Характеристики">
            <div className="public-character-abilities">
              {(Object.keys(abilityLabels) as AbilityKey[]).map((ability) => (
                <div key={ability}>
                  <span>{abilityLabels[ability]}</span>
                  <strong>{card.abilities!.scores[ability]}</strong>
                  <small>{formatModifier(card.abilities!.modifiers[ability])}</small>
                </div>
              ))}
            </div>
          </CardSection>
        ) : null}

        {card.runtime ? (
          <CardSection title="Текущее состояние">
            <div className="public-character-runtime">
              <Metric
                value={`${card.runtime.currentHitPoints}/${card.combat?.hitPointMaximum ?? '—'}`}
                label="текущие HP"
              />
              <Metric value={card.runtime.temporaryHitPoints} label="временные HP" />
              <Metric value={card.runtime.inspiration ? 'Есть' : 'Нет'} label="вдохновение" />
            </div>
            {card.runtime.conditions.length ? (
              <p>Состояния: {card.runtime.conditions.join(', ')}</p>
            ) : null}
            <RuntimeCounters title="Ресурсы" counters={card.runtime.resources} />
            <RuntimeCounters title="Ячейки заклинаний" counters={card.runtime.spellSlots} />
          </CardSection>
        ) : null}

        <div className="public-character-columns">
          {card.skills ? (
            <CardSection title="Навыки">
              <TagList items={card.skills} empty="Навыки не выбраны." />
            </CardSection>
          ) : null}
          {card.spells ? (
            <CardSection title="Заклинания">
              <TagList
                items={card.spells.map((spell) =>
                  spell.level === 0
                    ? `${spell.name} · заговор`
                    : `${spell.name} · ${spell.level} круг`,
                )}
                empty="Заклинания не выбраны."
              />
            </CardSection>
          ) : null}
        </div>

        {card.inventory ? (
          <CardSection title="Инвентарь">
            {card.inventory.length ? (
              <div className="public-character-inventory">
                {card.inventory.map((item, index) => (
                  <article key={`${item.name}:${index}`}>
                    <strong>{item.name}</strong>
                    <span>× {item.quantity}</span>
                    {item.notes ? <p>{item.notes}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p>Инвентарь пуст.</p>
            )}
          </CardSection>
        ) : null}

        {card.profile ? (
          <CardSection title="История героя">
            <Story label="Характер" value={card.profile.personality} />
            <Story label="Внешность" value={card.profile.appearance} />
            <Story label="Предыстория" value={card.profile.backstory} />
          </CardSection>
        ) : null}
        {card.notes !== null ? (
          <CardSection title="Заметки">
            <p className="public-character-prose">{card.notes || 'Заметок нет.'}</p>
          </CardSection>
        ) : null}

        <footer>
          <span>
            SRD {card.rulesetVersion} · {card.status === 'READY' ? 'готовый лист' : 'черновик'}
          </span>
          <span>Ссылка действует до {new Date(card.expiresAt).toLocaleString('ru-RU')}</span>
        </footer>
      </article>
    </main>
  );
}

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="public-character-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="public-character-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TagList({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    <div className="public-character-tags">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  ) : (
    <p>{empty}</p>
  );
}

function Story({ label, value }: { label: string; value: string }) {
  return value ? (
    <div className="public-character-story">
      <h3>{label}</h3>
      <p>{value}</p>
    </div>
  ) : null;
}

function RuntimeCounters({ title, counters }: { title: string; counters: Record<string, number> }) {
  const entries = Object.entries(counters);
  return entries.length ? (
    <div className="public-character-counters">
      <strong>{title}</strong>
      {entries.map(([name, value]) => (
        <span key={name}>
          {name}: {value}
        </span>
      ))}
    </div>
  ) : null;
}

function SharedStatus({ children }: { children: ReactNode }) {
  return <main className="public-character-status">{children}</main>;
}

function characterInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('');
}

function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
