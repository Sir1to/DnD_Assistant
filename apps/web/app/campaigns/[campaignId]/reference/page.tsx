'use client';

import type { CampaignDetail, CharacterOptionsResponse } from '@fog-of-lore/contracts';
import { dnd5eFormulaGroups } from '@fog-of-lore/domain';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { CampaignNavigation } from '../../../components/campaign-navigation';
import { apiRequest, readableError } from '../../../lib/api';

type Section = 'RULES' | 'SPELLS' | 'EQUIPMENT';

export default function ReferencePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [section, setSection] = useState<Section>('RULES');
  const [search, setSearch] = useState('');
  const [spellLevel, setSpellLevel] = useState('ALL');
  const [spellClass, setSpellClass] = useState('ALL');
  const campaignQuery = useQuery({
    queryKey: ['campaigns', campaignId],
    queryFn: () => apiRequest<CampaignDetail>(`/campaigns/${campaignId}`),
    retry: false,
  });
  const optionsQuery = useQuery({
    queryKey: ['dnd5e-character-options'],
    queryFn: () => apiRequest<CharacterOptionsResponse>('/rulesets/dnd5e/character-options'),
    enabled: campaignQuery.isSuccess,
    staleTime: Infinity,
  });
  const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
  const spells = useMemo(
    () =>
      (optionsQuery.data?.spells ?? []).filter(
        (item) =>
          (spellLevel === 'ALL' || item.level === Number(spellLevel)) &&
          (spellClass === 'ALL' || item.classIds.includes(spellClass)) &&
          (!normalizedSearch ||
            `${item.name} ${item.description}`.toLocaleLowerCase('ru-RU').includes(normalizedSearch)),
      ),
    [normalizedSearch, optionsQuery.data?.spells, spellClass, spellLevel],
  );
  const equipment = useMemo(
    () =>
      (optionsQuery.data?.equipment ?? []).filter(
        (item) =>
          !normalizedSearch ||
          `${item.name} ${item.description} ${item.cost}`
            .toLocaleLowerCase('ru-RU')
            .includes(normalizedSearch),
      ),
    [normalizedSearch, optionsQuery.data?.equipment],
  );

  if (campaignQuery.isPending || optionsQuery.isPending) {
    return (
      <main className="page-status">
        <p>Открываем справочник…</p>
      </main>
    );
  }
  if (campaignQuery.isError || optionsQuery.isError) {
    return (
      <main className="page-status">
        <p>{readableError(campaignQuery.error ?? optionsQuery.error)}</p>
      </main>
    );
  }

  return (
    <main className="reference-shell">
      <div className="reference-layout">
        <aside className="reference-sidebar">
          <CampaignNavigation campaignId={campaignId} role={campaignQuery.data.role} />
          <div className="reference-sections">
            <button
              className={section === 'RULES' ? 'is-active' : ''}
              onClick={() => setSection('RULES')}
              type="button"
            >
              Правила и формулы
            </button>
            <button
              className={section === 'SPELLS' ? 'is-active' : ''}
              onClick={() => setSection('SPELLS')}
              type="button"
            >
              Заклинания
            </button>
            <button
              className={section === 'EQUIPMENT' ? 'is-active' : ''}
              onClick={() => setSection('EQUIPMENT')}
              type="button"
            >
              Цены и предметы
            </button>
          </div>
        </aside>
        <section className="reference-main">
          <div className="page-campaign-context">
            <div>
              <Link className="campaign-context-back" href={`/campaigns/${campaignId}`}>
                ← К кампании
              </Link>
              <strong>{campaignQuery.data.name}</strong>
            </div>
            <span className="role-badge">SRD 5.2.1</span>
          </div>
          <div className="reference-heading">
            <div>
              <p className="eyebrow">D&D 5e</p>
              <h2>{sectionTitle(section)}</h2>
            </div>
            {section === 'SPELLS' || section === 'EQUIPMENT' ? (
              <input
                aria-label="Поиск в справочнике"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск…"
                type="search"
                value={search}
              />
            ) : null}
          </div>
          {section === 'RULES' ? <FormulaCatalogue /> : null}
          {section === 'SPELLS' ? (
            <>
              <div className="reference-filters" aria-label="Фильтры заклинаний">
                <select
                  aria-label="Уровень заклинания"
                  onChange={(event) => setSpellLevel(event.target.value)}
                  value={spellLevel}
                >
                  <option value="ALL">Все уровни</option>
                  <option value="0">Заговоры</option>
                  {Array.from({ length: 9 }, (_, index) => index + 1).map((level) => (
                    <option key={level} value={level}>
                      {level} уровень
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Класс заклинателя"
                  onChange={(event) => setSpellClass(event.target.value)}
                  value={spellClass}
                >
                  <option value="ALL">Все классы</option>
                  {optionsQuery.data.classes.map((characterClass) => (
                    <option key={characterClass.id} value={characterClass.id}>
                      {characterClass.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="reference-results" role="status">
                Найдено: {spells.length}
              </p>
              <div className="reference-cards">
                {spells.map((spell) => (
                  <article key={spell.id}>
                    <span>{spell.level === 0 ? 'Заговор' : `${spell.level} уровень`}</span>
                    <h3>{spell.name}</h3>
                    <p>{spell.description}</p>
                    <small>
                      {spell.classIds
                        .map(
                          (id) =>
                            optionsQuery.data.classes.find((item) => item.id === id)?.name ?? id,
                        )
                        .join(', ')}
                    </small>
                  </article>
                ))}
              </div>
              {spells.length === 0 ? (
                <p className="reference-empty">По этому запросу ничего не нашлось.</p>
              ) : null}
            </>
          ) : null}
          {section === 'EQUIPMENT' ? (
            <div className="reference-table">
              <div className="reference-table-row is-heading">
                <span>Предмет</span>
                <span>Тип</span>
                <span>Цена</span>
              </div>
              {equipment.map((item) => (
                <div className="reference-table-row" key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span>{equipmentCategory(item.category)}</span>
                  <span>{item.cost}</span>
                </div>
              ))}
            </div>
          ) : null}
          <details className="rules-attribution">
            <summary>Источник и лицензия</summary>
            <p>{optionsQuery.data.attribution}</p>
          </details>
        </section>
      </div>
    </main>
  );
}

function FormulaCatalogue() {
  return (
    <div className="formula-catalogue">
      <p className="reference-lede">
        Здесь собраны постоянные правила SRD 5.2.1. У конкретного заклинания, предмета, особенности
        класса или статблока может быть собственное исключение — его текст важнее общей формулы.
      </p>
      {dnd5eFormulaGroups.map((group) => (
        <section className="formula-group" key={group.id}>
          <div className="formula-group-heading">
            <h3>{group.title}</h3>
            <p>{group.summary}</p>
          </div>
          <div className="formula-grid">
            {group.formulas.map((item) => (
              <article key={item.id}>
                <span>{item.title}</span>
                <strong>{item.formula}</strong>
                <p>{item.explanation}</p>
                {item.note ? <small>{item.note}</small> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function sectionTitle(section: Section) {
  return {
    RULES: 'Правила и формулы',
    SPELLS: 'Заклинания',
    EQUIPMENT: 'Цены и предметы',
  }[section];
}

function equipmentCategory(category: string) {
  return (
    { WEAPON: 'Оружие', ARMOR: 'Доспех', GEAR: 'Снаряжение', FOCUS: 'Фокус' }[category] ??
    category
  );
}
