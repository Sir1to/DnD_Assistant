'use client';

import type {
  CampaignDetail,
  BattleSceneSnapshot,
  CharacterOptionsResponse,
  Dnd5eMonsterCatalogueResponse,
  Dnd5eMonsterStatBlock,
  Dnd5eMonsterSummary,
  Dnd5eMonsterType,
  ImportBattleEncounterRequest,
} from '@fog-of-lore/contracts';
import {
  abilityModifier,
  analyzeDnd5eEncounter,
  dnd5eChallengeRatings,
  dnd5eExperienceForChallengeRating,
  dnd5eFormulaGroups,
  type Dnd5eChallengeRating,
  type Dnd5eEncounterDifficulty,
} from '@fog-of-lore/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { CampaignNavigation } from '../../../components/campaign-navigation';
import { apiRequest, readableError } from '../../../lib/api';
import {
  referenceResultAnchor,
  searchReference,
  type ReferenceSearchCategory,
  type ReferenceSearchResponse,
  type ReferenceSearchResult,
} from './reference-search';

type Section = 'RULES' | 'ENCOUNTER' | 'BESTIARY' | 'SPELLS' | 'EQUIPMENT';

export default function ReferencePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [section, setSection] = useState<Section>('RULES');
  const [search, setSearch] = useState('');
  const [spellLevel, setSpellLevel] = useState('ALL');
  const [spellClass, setSpellClass] = useState('ALL');
  const [referenceTarget, setReferenceTarget] = useState<ReferenceSearchResult | null>(null);
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
  const monstersQuery = useQuery({
    queryKey: ['dnd5e-monsters'],
    queryFn: () => apiRequest<Dnd5eMonsterCatalogueResponse>('/rulesets/dnd5e/monsters'),
    enabled: campaignQuery.isSuccess,
    staleTime: Infinity,
  });
  const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
  const unifiedSearch = useMemo(
    () =>
      searchReference(search, {
        monsters: monstersQuery.data?.monsters ?? [],
        spells: optionsQuery.data?.spells ?? [],
        equipment: optionsQuery.data?.equipment ?? [],
        formulaGroups: dnd5eFormulaGroups,
      }),
    [monstersQuery.data?.monsters, optionsQuery.data?.equipment, optionsQuery.data?.spells, search],
  );
  const spells = useMemo(
    () =>
      (optionsQuery.data?.spells ?? []).filter(
        (item) =>
          (spellLevel === 'ALL' || item.level === Number(spellLevel)) &&
          (spellClass === 'ALL' || item.classIds.includes(spellClass)) &&
          (!normalizedSearch ||
            `${item.name} ${item.description}`
              .toLocaleLowerCase('ru-RU')
              .includes(normalizedSearch)),
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
  useEffect(() => {
    if (!referenceTarget || normalizedSearch) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(referenceResultAnchor(referenceTarget))
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [normalizedSearch, referenceTarget, section]);

  if (campaignQuery.isPending || optionsQuery.isPending || monstersQuery.isPending) {
    return (
      <main className="page-status">
        <p>Открываем справочник…</p>
      </main>
    );
  }
  if (campaignQuery.isError || optionsQuery.isError || monstersQuery.isError) {
    return (
      <main className="page-status">
        <p>{readableError(campaignQuery.error ?? optionsQuery.error ?? monstersQuery.error)}</p>
      </main>
    );
  }

  const openSearchResult = (result: ReferenceSearchResult) => {
    setSection(sectionForSearchCategory(result.category));
    setReferenceTarget(result);
    setSearch('');
  };
  const openSection = (nextSection: Section) => {
    setSection(nextSection);
    setReferenceTarget(null);
    setSearch('');
  };

  return (
    <main className="reference-shell">
      <div className="reference-layout">
        <aside className="reference-sidebar">
          <CampaignNavigation campaignId={campaignId} role={campaignQuery.data.role} />
          <div className="reference-sections">
            <button
              className={section === 'RULES' ? 'is-active' : ''}
              onClick={() => openSection('RULES')}
              type="button"
            >
              Правила и формулы
            </button>
            <button
              className={section === 'ENCOUNTER' ? 'is-active' : ''}
              onClick={() => openSection('ENCOUNTER')}
              type="button"
            >
              Encounter Lab
            </button>
            <button
              className={section === 'BESTIARY' ? 'is-active' : ''}
              onClick={() => openSection('BESTIARY')}
              type="button"
            >
              Бестиарий
            </button>
            <button
              className={section === 'SPELLS' ? 'is-active' : ''}
              onClick={() => openSection('SPELLS')}
              type="button"
            >
              Заклинания
            </button>
            <button
              className={section === 'EQUIPMENT' ? 'is-active' : ''}
              onClick={() => openSection('EQUIPMENT')}
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
              <h2>{normalizedSearch ? 'Поиск по справочнику' : sectionTitle(section)}</h2>
            </div>
            <input
              aria-label="Единый поиск в справочнике"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Существа, предметы, заклинания, правила…"
              type="search"
              value={search}
            />
          </div>
          {normalizedSearch ? (
            <UnifiedReferenceSearch response={unifiedSearch} onOpen={openSearchResult} />
          ) : (
            <>
              {section === 'RULES' ? <FormulaCatalogue /> : null}
              {section === 'ENCOUNTER' ? (
                <EncounterLab
                  campaignId={campaignId}
                  canEdit={campaignQuery.data.role !== 'PLAYER'}
                  monsters={monstersQuery.data.monsters}
                />
              ) : null}
              {section === 'BESTIARY' ? (
                <BestiaryCatalogue
                  attribution={monstersQuery.data.attribution}
                  monsters={monstersQuery.data.monsters}
                  targetId={referenceTarget?.category === 'MONSTER' ? referenceTarget.id : null}
                />
              ) : null}
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
                      <article
                        id={referenceResultAnchor({ category: 'SPELL', id: spell.id })}
                        key={spell.id}
                      >
                        <span>{spell.level === 0 ? 'Заговор' : `${spell.level} уровень`}</span>
                        <h3>{spell.name}</h3>
                        {spell.englishName !== spell.name ? (
                          <small>{spell.englishName}</small>
                        ) : null}
                        <p>{spell.description}</p>
                        <small>
                          {spell.classIds
                            .map(
                              (id) =>
                                optionsQuery.data.classes.find((item) => item.id === id)?.name ??
                                id,
                            )
                            .join(', ')}
                        </small>
                        <a href={spell.referenceUrl} rel="noreferrer" target="_blank">
                          Русское описание ↗
                        </a>
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
                    <div
                      className="reference-table-row"
                      id={referenceResultAnchor({ category: 'EQUIPMENT', id: item.id })}
                      key={item.id}
                    >
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
            </>
          )}
          <details className="rules-attribution">
            <summary>Источник и лицензия</summary>
            <p>{optionsQuery.data.attribution}</p>
          </details>
        </section>
      </div>
    </main>
  );
}

function UnifiedReferenceSearch({
  onOpen,
  response,
}: {
  onOpen: (result: ReferenceSearchResult) => void;
  response: ReferenceSearchResponse;
}) {
  return (
    <div className="reference-search-results">
      <p className="reference-lede">
        Один запрос проверяет лёгкий каталог существ, заклинания, предметы и памятку правил. Полный
        статблок существа загрузится только после выбора результата.
      </p>
      <p className="reference-results" role="status">
        {response.total > 0
          ? `Найдено: ${response.total}`
          : `По запросу «${response.query}» ничего не найдено.`}
      </p>
      {response.groups.map((group) => (
        <section className="reference-search-group" key={group.category}>
          <header>
            <h3>{searchCategoryLabel(group.category)}</h3>
            <span>
              {group.results.length < group.total
                ? `${group.results.length} из ${group.total}`
                : group.total}
            </span>
          </header>
          <div className="reference-search-list">
            {group.results.map((result) => (
              <button
                key={`${result.category}:${result.id}`}
                onClick={() => onOpen(result)}
                type="button"
              >
                <span>{result.eyebrow}</span>
                <strong>{result.title}</strong>
                <p>{result.description}</p>
                <small>Открыть в разделе →</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type PartyRow = { id: string; level: number; count: number };
type OpponentRow = {
  id: string;
  monsterId?: string;
  name: string;
  challengeRating: Dnd5eChallengeRating;
  experiencePoints: number;
  count: number;
};

function EncounterLab({
  campaignId,
  canEdit,
  monsters,
}: {
  campaignId: string;
  canEdit: boolean;
  monsters: Dnd5eMonsterSummary[];
}) {
  const router = useRouter();
  const [party, setParty] = useState<PartyRow[]>([{ id: 'party-1', level: 1, count: 4 }]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [monsterType, setMonsterType] = useState<'ALL' | Dnd5eMonsterType>('ALL');
  const [monsterChallengeRating, setMonsterChallengeRating] = useState<
    'ALL' | Dnd5eChallengeRating
  >('ALL');
  const matchingMonsters = useMemo(() => {
    const query = monsterSearch.trim().toLocaleLowerCase('ru-RU');
    return monsters.filter(
      (monster) =>
        (!query ||
          monster.name.toLocaleLowerCase('ru-RU').includes(query) ||
          monster.englishName.toLocaleLowerCase('en-US').includes(query)) &&
        (monsterType === 'ALL' || monster.type === monsterType) &&
        (monsterChallengeRating === 'ALL' || monster.challengeRating === monsterChallengeRating),
    );
  }, [monsterChallengeRating, monsterSearch, monsterType, monsters]);
  const analysis = useMemo(
    () =>
      analyzeDnd5eEncounter(
        party.map(({ level, count }) => ({ level, count })),
        opponents.map(({ challengeRating, experiencePoints, count }) => ({
          challengeRating,
          experiencePoints,
          count,
        })),
      ),
    [opponents, party],
  );
  const highBudget = Math.max(analysis.budget.high, 1);
  const budgetFill = Math.min(100, (analysis.opponentExperience / highBudget) * 100);
  const opponentCount = opponents.reduce((sum, opponent) => sum + opponent.count, 0);
  const transferEncounter = useMutation({
    mutationFn: () => {
      const input: ImportBattleEncounterRequest = {
        opponents: opponents.map((opponent) =>
          opponent.monsterId
            ? { source: 'SRD' as const, monsterId: opponent.monsterId, count: opponent.count }
            : {
                source: 'CUSTOM' as const,
                name: opponent.name,
                count: opponent.count,
                initiative: 10,
                maxHp: 10,
                armorClass: null,
                speed: 6,
                size: 1,
              },
        ),
      };
      return apiRequest<BattleSceneSnapshot>(`/campaigns/${campaignId}/battle/encounter`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => router.push(`/campaigns/${campaignId}/battle`),
  });

  const updateParty = (id: string, patch: Partial<PartyRow>) =>
    setParty((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const updateOpponent = (id: string, patch: Partial<OpponentRow>) =>
    setOpponents((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const addMonster = (monster: Dnd5eMonsterSummary) =>
    setOpponents((rows) => {
      const existing = rows.find((row) => row.monsterId === monster.id);
      if (existing) {
        return rows.map((row) =>
          row.id === existing.id ? { ...row, count: Math.min(100, row.count + 1) } : row,
        );
      }
      return [
        ...rows,
        {
          id: crypto.randomUUID(),
          monsterId: monster.id,
          name: monster.name,
          challengeRating: monster.challengeRating,
          experiencePoints: monster.experiencePoints,
          count: 1,
        },
      ];
    });

  return (
    <div className="encounter-lab">
      <p className="reference-lede">
        Соберите группу и противников. Расчёт использует XP-бюджеты SRD 5.2.1 без старого множителя
        за число существ; значения сложности — верхние границы рекомендуемого бюджета. XP
        подставляется по CR, но его можно поправить для CR 0 или собственного статблока.
      </p>

      <div className="encounter-lab-layout">
        <div className="encounter-lab-editor">
          <section className="encounter-builder-section">
            <header>
              <div>
                <span>Шаг 1</span>
                <h3>Группа</h3>
              </div>
              <button
                onClick={() =>
                  setParty((rows) => [
                    ...rows,
                    { id: crypto.randomUUID(), level: rows.at(-1)?.level ?? 1, count: 1 },
                  ])
                }
                type="button"
              >
                + Другой уровень
              </button>
            </header>
            <div className="encounter-rows">
              {party.map((row) => (
                <div className="encounter-row is-party" key={row.id}>
                  <label>
                    Уровень
                    <input
                      max={20}
                      min={1}
                      onChange={(event) =>
                        updateParty(row.id, { level: numericInput(event.target.value, 1, 20) })
                      }
                      type="number"
                      value={row.level}
                    />
                  </label>
                  <label>
                    Персонажей
                    <input
                      max={20}
                      min={1}
                      onChange={(event) =>
                        updateParty(row.id, { count: numericInput(event.target.value, 1, 20) })
                      }
                      type="number"
                      value={row.count}
                    />
                  </label>
                  <button
                    aria-label={`Удалить группу персонажей ${row.level} уровня`}
                    disabled={party.length === 1}
                    onClick={() => setParty((rows) => rows.filter(({ id }) => id !== row.id))}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="encounter-builder-section">
            <header>
              <div>
                <span>Шаг 2</span>
                <h3>Противники</h3>
              </div>
              <button
                onClick={() =>
                  setOpponents((rows) => [
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      name: 'Противник',
                      challengeRating: rows.at(-1)?.challengeRating ?? '1',
                      experiencePoints: rows.at(-1)?.experiencePoints ?? 200,
                      count: 1,
                    },
                  ])
                }
                type="button"
              >
                + Свой статблок
              </button>
            </header>
            <div className="encounter-monster-picker">
              <div className="encounter-monster-filters">
                <input
                  aria-label="Поиск существа для столкновения"
                  onChange={(event) => setMonsterSearch(event.target.value)}
                  placeholder="Поиск по названию на английском…"
                  type="search"
                  value={monsterSearch}
                />
                <select
                  aria-label="Тип существа"
                  onChange={(event) =>
                    setMonsterType(event.target.value as 'ALL' | Dnd5eMonsterType)
                  }
                  value={monsterType}
                >
                  <option value="ALL">Все типы</option>
                  {monsterTypes(monsters).map((type) => (
                    <option key={type} value={type}>
                      {monsterTypeLabel(type)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="CR существа"
                  onChange={(event) =>
                    setMonsterChallengeRating(event.target.value as 'ALL' | Dnd5eChallengeRating)
                  }
                  value={monsterChallengeRating}
                >
                  <option value="ALL">Любой CR</option>
                  {dnd5eChallengeRatings.map((challengeRating) => (
                    <option key={challengeRating} value={challengeRating}>
                      CR {challengeRating}
                    </option>
                  ))}
                </select>
              </div>
              <div className="encounter-monster-results">
                {matchingMonsters.slice(0, 12).map((monster) => (
                  <button key={monster.id} onClick={() => addMonster(monster)} type="button">
                    <span>
                      <strong>{monster.name}</strong>
                      <small>{monster.englishName}</small>
                      <small>
                        {monsterSizeLabel(monster.size)} · {monsterTypeLabel(monster.type)}
                      </small>
                    </span>
                    <span>
                      CR {monster.challengeRating}
                      <small>{formatExperience(monster.experiencePoints)} XP</small>
                    </span>
                  </button>
                ))}
              </div>
              <small className="encounter-monster-count">
                {matchingMonsters.length > 12
                  ? `Показаны первые 12 из ${matchingMonsters.length}. Уточните поиск.`
                  : `Найдено: ${matchingMonsters.length}`}
              </small>
            </div>
            <div className="encounter-rows">
              {opponents.length === 0 ? (
                <p className="encounter-empty">
                  Выберите существо из SRD или добавьте свой статблок.
                </p>
              ) : null}
              {opponents.map((row) => (
                <div className="encounter-row is-opponent" key={row.id}>
                  <label>
                    Название
                    <input
                      maxLength={80}
                      onChange={(event) =>
                        updateOpponent(row.id, {
                          monsterId: undefined,
                          name: event.target.value,
                        })
                      }
                      type="text"
                      value={row.name}
                    />
                  </label>
                  <label>
                    CR
                    <select
                      onChange={(event) => {
                        const challengeRating = event.target.value as Dnd5eChallengeRating;
                        updateOpponent(row.id, {
                          monsterId: undefined,
                          challengeRating,
                          experiencePoints: dnd5eExperienceForChallengeRating(challengeRating),
                        });
                      }}
                      value={row.challengeRating}
                    >
                      {dnd5eChallengeRatings.map((challengeRating) => (
                        <option key={challengeRating} value={challengeRating}>
                          {challengeRating}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    XP за одного
                    <input
                      max={155000}
                      min={0}
                      onChange={(event) =>
                        updateOpponent(row.id, {
                          monsterId: undefined,
                          experiencePoints: numericInput(event.target.value, 0, 155_000),
                        })
                      }
                      type="number"
                      value={row.experiencePoints}
                    />
                  </label>
                  <label>
                    Количество
                    <input
                      max={100}
                      min={1}
                      onChange={(event) =>
                        updateOpponent(row.id, { count: numericInput(event.target.value, 1, 100) })
                      }
                      type="number"
                      value={row.count}
                    />
                  </label>
                  <strong>{formatExperience(row.experiencePoints * row.count)} XP</strong>
                  <button
                    aria-label={`Удалить ${row.name || 'противника'}`}
                    onClick={() => setOpponents((rows) => rows.filter(({ id }) => id !== row.id))}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className={`encounter-summary is-${analysis.difficulty.toLowerCase()}`}>
          <span>Оценка столкновения</span>
          <strong>{difficultyLabel(analysis.difficulty)}</strong>
          <p>
            {formatExperience(analysis.opponentExperience)} XP против {analysis.partySize}{' '}
            {pluralizeCharacter(analysis.partySize)}
          </p>
          <div className="encounter-budget-track" aria-hidden="true">
            <i style={{ width: `${budgetFill}%` }} />
          </div>
          <dl>
            <div>
              <dt>Низкая</dt>
              <dd>{formatExperience(analysis.budget.low)} XP</dd>
            </div>
            <div>
              <dt>Средняя</dt>
              <dd>{formatExperience(analysis.budget.moderate)} XP</dd>
            </div>
            <div>
              <dt>Высокая</dt>
              <dd>{formatExperience(analysis.budget.high)} XP</dd>
            </div>
          </dl>
          {analysis.remainingToNextBudget !== null ? (
            <small>
              До следующей границы: {formatExperience(analysis.remainingToNextBudget)} XP
            </small>
          ) : (
            <small>Состав превышает высокий бюджет на этой группе.</small>
          )}
          {analysis.warnings.length > 0 ? (
            <ul className="encounter-warnings">
              {analysis.warnings.includes('MANY_CREATURES') ? (
                <li>Противников больше двух на персонажа: серия удачных атак опаснее бюджета.</li>
              ) : null}
              {analysis.warnings.includes('POWERFUL_CREATURE') ? (
                <li>CR хотя бы одного противника выше уровня персонажей.</li>
              ) : null}
            </ul>
          ) : null}
          {canEdit ? (
            <div className="encounter-transfer">
              <button
                disabled={opponents.length === 0 || transferEncounter.isPending}
                onClick={() => transferEncounter.mutate()}
                type="button"
              >
                {transferEncounter.isPending
                  ? 'Расставляем токены…'
                  : `Перенести на поле · ${opponentCount}`}
              </button>
              <small>
                SRD-существа получат HP, КД, скорость и размер из статблока. Свои строки создаются с
                10 HP и могут быть исправлены на поле.
              </small>
              {transferEncounter.isError ? (
                <p className="form-error">{readableError(transferEncounter.error)}</p>
              ) : null}
            </div>
          ) : (
            <small>Только мастер может перенести состав на поле.</small>
          )}
        </aside>
      </div>
      <p className="encounter-lab-note">
        Это ориентир мастера, а не гарантия исхода. Особые способности, местность, внезапность и
        доступные ресурсы группы могут заметно изменить реальную сложность.
      </p>
    </div>
  );
}

function BestiaryCatalogue({
  attribution,
  monsters,
  targetId,
}: {
  attribution: string;
  monsters: Dnd5eMonsterSummary[];
  targetId: string | null;
}) {
  const [type, setType] = useState<'ALL' | Dnd5eMonsterType>('ALL');
  const [challengeRating, setChallengeRating] = useState<'ALL' | Dnd5eChallengeRating>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(targetId);
  const filtered = useMemo(() => {
    return monsters.filter(
      (monster) =>
        (type === 'ALL' || monster.type === type) &&
        (challengeRating === 'ALL' || monster.challengeRating === challengeRating),
    );
  }, [challengeRating, monsters, type]);
  useEffect(() => {
    if (!targetId) return;
    setType('ALL');
    setChallengeRating('ALL');
    setSelectedId(targetId);
  }, [targetId]);
  const statBlockQuery = useQuery({
    queryKey: ['dnd5e-monster', selectedId],
    queryFn: () =>
      apiRequest<Dnd5eMonsterStatBlock>(
        `/rulesets/dnd5e/monsters/${encodeURIComponent(selectedId ?? '')}`,
      ),
    enabled: selectedId !== null,
    staleTime: Infinity,
  });

  return (
    <div className="bestiary-catalogue">
      <p className="reference-lede">
        Полный каталог из 322 существ SRD 5.2.1. Названия и текст статблоков сохранены на языке
        источника; фильтры и ключевые параметры доступны без загрузки полного статблока.
      </p>
      <div className="reference-filters" aria-label="Фильтры бестиария">
        <select
          aria-label="Тип существа"
          onChange={(event) => setType(event.target.value as 'ALL' | Dnd5eMonsterType)}
          value={type}
        >
          <option value="ALL">Все типы</option>
          {monsterTypes(monsters).map((monsterType) => (
            <option key={monsterType} value={monsterType}>
              {monsterTypeLabel(monsterType)}
            </option>
          ))}
        </select>
        <select
          aria-label="Опасность существа"
          onChange={(event) =>
            setChallengeRating(event.target.value as 'ALL' | Dnd5eChallengeRating)
          }
          value={challengeRating}
        >
          <option value="ALL">Любой CR</option>
          {dnd5eChallengeRatings.map((rating) => (
            <option key={rating} value={rating}>
              CR {rating}
            </option>
          ))}
        </select>
      </div>
      <p className="reference-results" role="status">
        Найдено: {filtered.length}
      </p>
      <div className="bestiary-layout">
        <div className="bestiary-list">
          {filtered.map((monster) => (
            <button
              className={selectedId === monster.id ? 'is-active' : ''}
              id={referenceResultAnchor({ category: 'MONSTER', id: monster.id })}
              key={monster.id}
              onClick={() => setSelectedId(monster.id)}
              type="button"
            >
              <span>
                <strong>{monster.name}</strong>
                <small>{monster.englishName}</small>
                <small>
                  {monsterSizeLabel(monster.size)} · {monsterTypeLabel(monster.type)}
                </small>
              </span>
              <span>
                CR {monster.challengeRating}
                <small>{formatExperience(monster.experiencePoints)} XP</small>
              </span>
              <span>
                КД {monster.armorClass}
                <small>{monster.hitPoints} HP</small>
              </span>
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="reference-empty">По этим фильтрам существ не найдено.</p>
          ) : null}
        </div>
        <aside className="bestiary-detail">
          {selectedId === null ? (
            <p>Выберите существо, чтобы открыть полный статблок.</p>
          ) : statBlockQuery.isPending ? (
            <p>Загружаем статблок…</p>
          ) : statBlockQuery.isError ? (
            <p>{readableError(statBlockQuery.error)}</p>
          ) : (
            <MonsterStatBlock monster={statBlockQuery.data} />
          )}
        </aside>
      </div>
      <details className="rules-attribution bestiary-attribution">
        <summary>Источник данных бестиария</summary>
        <p>{attribution}</p>
      </details>
    </div>
  );
}

function MonsterStatBlock({ monster }: { monster: Dnd5eMonsterStatBlock }) {
  const defenses = [
    ['Уязвимости', monster.damageVulnerabilities.map(translateMonsterDamage)],
    ['Сопротивления', monster.damageResistances.map(translateMonsterDamage)],
    ['Иммунитеты к урону', monster.damageImmunities.map(translateMonsterDamage)],
    ['Иммунитеты к состояниям', monster.conditionImmunities.map(translateMonsterCondition)],
  ] as const;

  return (
    <article className="monster-stat-block">
      <header>
        <div>
          <span>
            {monsterSizeLabel(monster.size)} · {monsterTypeLabel(monster.type)}
          </span>
          <h3>{monster.name}</h3>
          <small>{monster.englishName}</small>
        </div>
        <strong>CR {monster.challengeRating}</strong>
      </header>
      <dl className="monster-vitals">
        <div>
          <dt>КД</dt>
          <dd>{monster.armorClass}</dd>
        </div>
        <div>
          <dt>Хиты</dt>
          <dd>
            {monster.hitPoints} ({monster.hitPointFormula})
          </dd>
        </div>
        <div>
          <dt>Инициатива</dt>
          <dd>{formatBonus(monster.initiativeModifier)}</dd>
        </div>
        <div>
          <dt>Скорость</dt>
          <dd>{formatMovement(monster.speed)}</dd>
        </div>
      </dl>
      <div className="monster-abilities">
        {(
          [
            ['СИЛ', 'str'],
            ['ЛОВ', 'dex'],
            ['ТЕЛ', 'con'],
            ['ИНТ', 'int'],
            ['МДР', 'wis'],
            ['ХАР', 'cha'],
          ] as const
        ).map(([label, key]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{monster.abilityScores[key]}</strong>
            <small>{formatBonus(abilityModifier(monster.abilityScores[key]))}</small>
          </div>
        ))}
      </div>
      <dl className="monster-details">
        {Object.keys(monster.savingThrows).length > 0 ? (
          <div>
            <dt>Спасброски</dt>
            <dd>{formatBonusRecord(monster.savingThrows, monsterAbilityLabel)}</dd>
          </div>
        ) : null}
        {Object.keys(monster.skills).length > 0 ? (
          <div>
            <dt>Навыки</dt>
            <dd>{formatBonusRecord(monster.skills, monsterSkillLabel)}</dd>
          </div>
        ) : null}
        {defenses.map(([label, values]) =>
          values.length > 0 ? (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{values.join(', ')}</dd>
            </div>
          ) : null,
        )}
        <div>
          <dt>Чувства</dt>
          <dd>{formatDistanceRecord(monster.senses)}</dd>
        </div>
        <div>
          <dt>Языки</dt>
          <dd>
            {monster.languages.length > 0
              ? monster.languages.map(translateMonsterLanguage).join(', ')
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Опыт</dt>
          <dd>{formatExperience(monster.experiencePoints)} XP</dd>
        </div>
      </dl>
      <MonsterRuleSection items={monster.traits} title="Особенности" />
      <MonsterRuleSection items={monster.actions} title="Действия" />
      <MonsterRuleSection items={monster.reactions} title="Реакции" />
      {monster.legendaryActions ? (
        <section className="monster-rules">
          <h4>Легендарные действия</h4>
          <p>{monster.legendaryActions.description}</p>
          {monster.legendaryActions.actions.map((action) => (
            <p key={action.name}>
              <strong>{action.name}.</strong> {action.description}
            </p>
          ))}
        </section>
      ) : null}
      <small className="monster-source">
        {monster.source} · {monster.license}
      </small>
      <a href={monster.referenceUrl} rel="noreferrer" target="_blank">
        Полное русское описание на dnd.su ↗
      </a>
    </article>
  );
}

function MonsterRuleSection({
  items,
  title,
}: {
  items: Array<{ name: string; description: string }>;
  title: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="monster-rules">
      <h4>{title}</h4>
      {items.map((item) => (
        <p key={item.name}>
          <strong>{item.name}.</strong> {item.description}
        </p>
      ))}
    </section>
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
              <article id={referenceResultAnchor({ category: 'RULE', id: item.id })} key={item.id}>
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
    ENCOUNTER: 'Encounter Lab',
    BESTIARY: 'Бестиарий SRD',
    SPELLS: 'Заклинания',
    EQUIPMENT: 'Цены и предметы',
  }[section];
}

function sectionForSearchCategory(category: ReferenceSearchCategory): Section {
  return {
    MONSTER: 'BESTIARY',
    SPELL: 'SPELLS',
    EQUIPMENT: 'EQUIPMENT',
    RULE: 'RULES',
  }[category] as Section;
}

function searchCategoryLabel(category: ReferenceSearchCategory) {
  return {
    MONSTER: 'Существа',
    SPELL: 'Заклинания',
    EQUIPMENT: 'Предметы',
    RULE: 'Правила и формулы',
  }[category];
}

function numericInput(value: string, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : minimum;
}

function formatExperience(value: number) {
  return value.toLocaleString('ru-RU');
}

function difficultyLabel(difficulty: Dnd5eEncounterDifficulty) {
  return {
    EMPTY: 'Нет противников',
    LOW: 'Низкая сложность',
    MODERATE: 'Средняя сложность',
    HIGH: 'Высокая сложность',
    ABOVE_HIGH: 'Выше высокой',
  }[difficulty];
}

function pluralizeCharacter(count: number) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'персонажей';
  const last = count % 10;
  if (last === 1) return 'персонажа';
  if (last >= 2 && last <= 4) return 'персонажа';
  return 'персонажей';
}

function monsterTypes(monsters: Dnd5eMonsterSummary[]): Dnd5eMonsterType[] {
  return [...new Set(monsters.map(({ type }) => type))].sort((left, right) =>
    monsterTypeLabel(left).localeCompare(monsterTypeLabel(right), 'ru-RU'),
  );
}

function monsterTypeLabel(type: Dnd5eMonsterType) {
  return {
    aberration: 'Аберрация',
    beast: 'Зверь',
    celestial: 'Небожитель',
    construct: 'Конструкт',
    dragon: 'Дракон',
    elemental: 'Элементаль',
    fey: 'Фея',
    fiend: 'Исчадие',
    giant: 'Великан',
    humanoid: 'Гуманоид',
    monstrosity: 'Монстр',
    ooze: 'Слизь',
    plant: 'Растение',
    undead: 'Нежить',
  }[type];
}

function monsterSizeLabel(size: Dnd5eMonsterSummary['size']) {
  return {
    Tiny: 'Крошечный',
    Small: 'Маленький',
    Medium: 'Средний',
    Large: 'Большой',
    Huge: 'Огромный',
    Gargantuan: 'Громадный',
  }[size];
}

function formatBonus(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

function formatMovement(speed: Record<string, number | boolean>) {
  const labels: Record<string, string> = {
    walk: 'ходьба',
    fly: 'полёт',
    swim: 'плавание',
    climb: 'лазание',
    burrow: 'копание',
  };
  return Object.entries(speed)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => `${labels[key] ?? key} ${value} фт.`)
    .join(', ');
}

function formatBonusRecord(
  values: Record<string, number>,
  label: (key: string) => string = (key) => key,
) {
  return Object.entries(values)
    .map(([key, value]) => `${label(key)} ${formatBonus(value)}`)
    .join(', ');
}

function formatDistanceRecord(values: Record<string, number>) {
  return Object.entries(values)
    .map(
      ([key, value]) =>
        `${monsterSenseLabel(key)} ${value}${key === 'passive_perception' ? '' : ' фт.'}`,
    )
    .join(', ');
}

function monsterAbilityLabel(key: string): string {
  return (
    {
      str: 'СИЛ',
      dex: 'ЛОВ',
      con: 'ТЕЛ',
      int: 'ИНТ',
      wis: 'МДР',
      cha: 'ХАР',
    }[key] ?? key
  );
}

function monsterSkillLabel(key: string): string {
  return (
    {
      acrobatics: 'Акробатика',
      arcana: 'Магия',
      athletics: 'Атлетика',
      deception: 'Обман',
      history: 'История',
      insight: 'Проницательность',
      intimidation: 'Запугивание',
      investigation: 'Анализ',
      medicine: 'Медицина',
      nature: 'Природа',
      perception: 'Внимательность',
      performance: 'Выступление',
      persuasion: 'Убеждение',
      religion: 'Религия',
      stealth: 'Скрытность',
      survival: 'Выживание',
    }[key] ?? key
  );
}

function monsterSenseLabel(key: string): string {
  return (
    {
      blindsight: 'слепое зрение',
      darkvision: 'тёмное зрение',
      passive_perception: 'пассивная Внимательность',
      tremorsense: 'чувство вибрации',
      truesight: 'истинное зрение',
    }[key] ?? key
  );
}

function translateMonsterCondition(value: string): string {
  return (
    {
      blinded: 'ослепление',
      charmed: 'очарование',
      deafened: 'глухота',
      exhaustion: 'истощение',
      frightened: 'испуг',
      grappled: 'схваченность',
      paralyzed: 'паралич',
      petrified: 'окаменение',
      poisoned: 'отравление',
      prone: 'сбит с ног',
      restrained: 'опутанность',
      stunned: 'ошеломление',
      unconscious: 'бессознательность',
    }[value] ?? value
  );
}

function translateMonsterDamage(value: string): string {
  const phrases: Array<[RegExp, string]> = [
    [/damage from spells/giu, 'урон от заклинаний'],
    [
      /from nonmagical attacks not made with adamantine weapons/giu,
      'от немагических атак не адамантиновым оружием',
    ],
    [
      /from nonmagical attacks not made with silvered weapons/giu,
      'от немагических атак не посеребрённым оружием',
    ],
    [/from nonmagical attacks/giu, 'от немагических атак'],
    [/from magic weapons wielded by good creatures/giu, 'от магического оружия добрых существ'],
    [/from nonmagical\/nonsilver weapons/giu, 'от немагического непосеребрённого оружия'],
    [/from stoneskin/giu, 'от каменной кожи'],
    [/non magical/giu, 'немагический'],
    [/\bacid\b/giu, 'кислота'],
    [/\bbludgeoning\b/giu, 'дробящий'],
    [/\bcold\b/giu, 'холод'],
    [/\bfire\b/giu, 'огонь'],
    [/\blightning\b/giu, 'электричество'],
    [/\bnecrotic\b/giu, 'некротический'],
    [/\bpiercing\b/giu, 'колющий'],
    [/\bpoison\b/giu, 'яд'],
    [/\bpsychic\b/giu, 'психический'],
    [/\bradiant\b/giu, 'излучение'],
    [/\bslashing\b/giu, 'рубящий'],
    [/\bthunder\b/giu, 'звук'],
    [/\band\b/giu, 'и'],
  ];
  return phrases.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

function translateMonsterLanguage(value: string): string {
  const exact: Record<string, string> = {
    all: 'все языки',
    'any four languages': 'любые четыре языка',
    'any six languages': 'любые шесть языков',
    'any two languages': 'любые два языка',
    'any one language': 'любой один язык',
    'any one language (usually Common)': 'любой один язык (обычно Общий)',
    'any languages it knew in life': 'все языки, известные при жизни',
    'the languages it knew in life': 'языки, известные при жизни',
    'one language known by its creator': 'один язык, известный создателю',
    'Blink Dog': 'язык мерцающих собак',
    'Giant Eagle': 'язык гигантских орлов',
    'Giant Elk': 'язык гигантских лосей',
    'Giant Owl': 'язык гигантских сов',
    Otyugh: 'язык отюгов',
    Sahuagin: 'Сахуагинский',
    Sphinx: 'язык сфинксов',
    'Winter Wolf': 'язык зимних волков',
    Worg: 'язык воргов',
  };
  if (exact[value]) return exact[value];
  const phrases: Array<[RegExp, string]> = [
    [/Thieves' cant/giu, 'воровской жаргон'],
    [/Deep Speech/giu, 'Глубинная Речь'],
    [/Common/giu, 'Общий'],
    [/Abyssal/giu, 'Бездны'],
    [/Aquan/giu, 'Акван'],
    [/Auran/giu, 'Ауран'],
    [/Celestial/giu, 'Небесный'],
    [/Draconic/giu, 'Драконий'],
    [/Druidic/giu, 'Друидический'],
    [/Dwarvish/giu, 'Дварфский'],
    [/Elvish/giu, 'Эльфийский'],
    [/Giant/giu, 'Великаний'],
    [/Gnoll/giu, 'Гнолльский'],
    [/Gnomish/giu, 'Гномий'],
    [/Goblin/giu, 'Гоблинский'],
    [/Ignan/giu, 'Игнан'],
    [/Infernal/giu, 'Инфернальный'],
    [/Orc/giu, 'Орочий'],
    [/Primordial/giu, 'Первичный'],
    [/Sylvan/giu, 'Сильван'],
    [/Terran/giu, 'Терран'],
    [/Undercommon/giu, 'Подземный Общий'],
    [/telepathy/giu, 'телепатия'],
    [/understands/giu, 'понимает'],
    [/all languages it knew in life/giu, 'все языки, известные при жизни'],
    [/the languages it knew in life/giu, 'языки, известные при жизни'],
    [/the languages of its creator/giu, 'языки своего создателя'],
    [/commands given in any language/giu, 'команды на любом языке'],
    [/any two languages/giu, 'любые два языка'],
    [/but can(?:no|')t speak(?: it)?/giu, 'но не говорит'],
    [/can(?:no|')t speak/giu, 'не говорит'],
    [/doesn't speak it/giu, 'не говорит на нём'],
    [/works only with creatures that understand/giu, 'работает только с существами, понимающими'],
    [/plus up to five other languages/giu, 'и до пяти других языков'],
    [/plus any two languages/giu, 'и любые два языка'],
    [/in bear form/giu, 'в облике медведя'],
    [/in boar form/giu, 'в облике кабана'],
    [/in rat form/giu, 'в облике крысы'],
    [/in tiger form/giu, 'в облике тигра'],
    [/in wolf form/giu, 'в облике волка'],
    [/\band\b/giu, 'и'],
    [/ft\./giu, 'фт.'],
  ];
  return phrases.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

function equipmentCategory(category: string) {
  return (
    { WEAPON: 'Оружие', ARMOR: 'Доспех', GEAR: 'Снаряжение', FOCUS: 'Фокус' }[category] ?? category
  );
}
