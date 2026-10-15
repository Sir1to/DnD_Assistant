'use client';

import type {
  AbilityKey,
  AbilityMethod,
  CampaignCharacterSheetsResponse,
  CampaignDetail,
  CampaignEventEnvelope,
  CampaignMembersResponse,
  CharacterBuildTemplate,
  CharacterOptionsResponse,
  CharacterSheet,
  CharacterSheetData,
  CreateCharacterSheetRequest,
  ImportCharacterSheetRequest,
  PortableCharacterSheet,
  UpdateCharacterSheetRequest,
} from '@fog-of-lore/contracts';
import { abilityModifier, pointBuySpent } from '@fog-of-lore/domain';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

import { CampaignNavigation } from '../../../components/campaign-navigation';
import { ApiError, apiRequest, apiResourceUrl, readableError } from '../../../lib/api';

const abilityLabels: Record<AbilityKey, string> = {
  strength: 'Сила',
  dexterity: 'Ловкость',
  constitution: 'Телосложение',
  intelligence: 'Интеллект',
  wisdom: 'Мудрость',
  charisma: 'Харизма',
};
const abilityKeys = Object.keys(abilityLabels) as AbilityKey[];
const defaultData: CharacterSheetData = {
  level: 1,
  speciesId: '',
  classId: '',
  backgroundId: '',
  abilityMethod: 'STANDARD_ARRAY',
  abilities: {
    strength: 15,
    dexterity: 14,
    constitution: 13,
    intelligence: 12,
    wisdom: 10,
    charisma: 8,
  },
  skillIds: [],
  spellIds: [],
  equipment: [],
  hitPoints: 0,
  armorClass: 10,
  speed: 30,
  personality: '',
  appearance: '',
  backstory: '',
  notes: '',
};

export default function CharactersPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const campaignQuery = useQuery({
    queryKey: ['campaigns', campaignId],
    queryFn: () => apiRequest<CampaignDetail>(`/campaigns/${campaignId}`),
    retry: false,
  });
  const sheetsQuery = useQuery({
    queryKey: ['campaign-characters', campaignId],
    queryFn: () =>
      apiRequest<CampaignCharacterSheetsResponse>(`/campaigns/${campaignId}/characters`),
    enabled: campaignQuery.isSuccess,
  });
  const optionsQuery = useQuery({
    queryKey: ['dnd5e-character-options'],
    queryFn: () => apiRequest<CharacterOptionsResponse>('/rulesets/dnd5e/character-options'),
    enabled: campaignQuery.isSuccess,
    staleTime: Infinity,
  });
  const membersQuery = useQuery({
    queryKey: ['campaign-members', campaignId],
    queryFn: () => apiRequest<CampaignMembersResponse>(`/campaigns/${campaignId}/members`),
    enabled: campaignQuery.data?.role !== 'PLAYER',
  });
  const createMutation = useMutation({
    mutationFn: (input: CreateCharacterSheetRequest) =>
      apiRequest<CharacterSheet>(`/campaigns/${campaignId}/characters`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async (sheet) => {
      await queryClient.invalidateQueries({ queryKey: ['campaign-characters', campaignId] });
      setSelectedId(sheet.id);
      setWizardOpen(false);
    },
  });
  const importMutation = useMutation({
    mutationFn: (input: ImportCharacterSheetRequest) =>
      apiRequest<CharacterSheet>(`/campaigns/${campaignId}/characters/import`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async (sheet) => {
      await queryClient.invalidateQueries({ queryKey: ['campaign-characters', campaignId] });
      setSelectedId(sheet.id);
      setNotice('Лист импортирован. Проверьте его перед игрой.');
    },
  });

  useEffect(() => {
    if (campaignQuery.error instanceof ApiError && campaignQuery.error.status === 401)
      router.replace(`/login?next=${encodeURIComponent(`/campaigns/${campaignId}/characters`)}`);
  }, [campaignId, campaignQuery.error, router]);
  useEffect(() => {
    const sheets = sheetsQuery.data?.sheets ?? [];
    if (!sheets.some(({ id }) => id === selectedId)) setSelectedId(sheets[0]?.id ?? '');
  }, [selectedId, sheetsQuery.data?.sheets]);
  useEffect(() => {
    if (!campaignQuery.isSuccess) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
      /\/api\/?$/,
      '',
    );
    const socket = io(apiBase, { withCredentials: true });
    socket.on('connect', () => {
      socket.emit('campaign.subscribe', { campaignId });
      void queryClient.invalidateQueries({ queryKey: ['campaign-characters', campaignId] });
    });
    socket.on('campaign.event', (event: CampaignEventEnvelope) => {
      if (event.campaignId === campaignId && event.eventName === 'campaign.characters.changed')
        void queryClient.invalidateQueries({ queryKey: ['campaign-characters', campaignId] });
    });
    return () => {
      socket.close();
    };
  }, [campaignId, campaignQuery.isSuccess, queryClient]);

  async function importFile(file: File) {
    setNotice('');
    try {
      if (file.size > 300_000) throw new Error('Файл слишком большой. Максимум — 300 КБ.');
      const sheet = JSON.parse(await file.text()) as PortableCharacterSheet;
      await importMutation.mutateAsync({ sheet });
    } catch (error) {
      setNotice(
        error instanceof SyntaxError
          ? 'Это не JSON-файл листа Fog of Lore.'
          : error instanceof Error
            ? error.message
            : 'Не удалось прочитать файл.',
      );
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  if (campaignQuery.isPending || sheetsQuery.isPending || optionsQuery.isPending)
    return <Status text="Открываем листы персонажей…" />;
  if (campaignQuery.isError || sheetsQuery.isError || optionsQuery.isError)
    return (
      <Status
        text={readableError(campaignQuery.error ?? sheetsQuery.error ?? optionsQuery.error)}
      />
    );

  const selected = sheetsQuery.data.sheets.find(({ id }) => id === selectedId);
  return (
    <main className="characters-shell">
      <div className="characters-layout">
        <aside className="characters-sidebar">
          <CampaignNavigation campaignId={campaignId} role={campaignQuery.data.role} />
          <div className="characters-sidebar-heading">
            <div>
              <p className="eyebrow">D&D 5e</p>
              <h2>Персонажи</h2>
            </div>
          </div>
          <div className="character-actions">
            <Button
              onClick={() =>
                createMutation.mutate({
                  name: 'Новый персонаж',
                  ruleset: 'dnd5e-srd-5.2.1',
                  data: defaultData,
                })
              }
            >
              + Новый лист
            </Button>
            <Button tone="quiet" onClick={() => setWizardOpen(true)}>
              Для новичка
            </Button>
            <Button tone="quiet" onClick={() => importRef.current?.click()}>
              Импорт
            </Button>
            <input
              ref={importRef}
              hidden
              accept="application/json,.json,.fol-character.json"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
          </div>
          {notice ? <p className="character-notice">{notice}</p> : null}
          {createMutation.error || importMutation.error ? (
            <p className="form-error">
              {readableError(createMutation.error ?? importMutation.error)}
            </p>
          ) : null}
          <div className="character-list">
            {sheetsQuery.data.sheets.map((sheet) => (
              <button
                className={sheet.id === selectedId ? 'is-selected' : ''}
                key={sheet.id}
                onClick={() => setSelectedId(sheet.id)}
                type="button"
              >
                <strong>{sheet.name}</strong>
                <span>
                  {sheet.data.level} уровень · {sheet.ownerDisplayName}
                </span>
              </button>
            ))}
            {sheetsQuery.data.sheets.length === 0 ? (
              <p className="empty-copy">
                Создайте первый лист вручную или пройдите короткий опрос.
              </p>
            ) : null}
          </div>
        </aside>
        <section className="characters-main">
          <div className="page-campaign-context">
            <div>
              <Link className="campaign-context-back" href={`/campaigns/${campaignId}`}>
                ← К кампании
              </Link>
              <strong>{campaignQuery.data.name}</strong>
            </div>
            <span className="role-badge">Листы персонажей</span>
          </div>
          {selected ? (
            <CharacterEditor
              key={`${selected.id}:${selected.revision}`}
              sheet={selected}
              options={optionsQuery.data}
              campaignId={campaignId}
              onDeleted={() => setSelectedId('')}
            />
          ) : (
            <div className="character-empty">
              <h2>Здесь появится лист персонажа</h2>
              <p>Начните с пустого листа, готовой сборки или опроса для новичка.</p>
            </div>
          )}
        </section>
      </div>
      {wizardOpen ? (
        <BeginnerWizard
          builds={optionsQuery.data.builds}
          options={optionsQuery.data}
          members={membersQuery.data?.members ?? []}
          canAssign={campaignQuery.data.role !== 'PLAYER'}
          pending={createMutation.isPending}
          onCancel={() => setWizardOpen(false)}
          onCreate={(input) => createMutation.mutate(input)}
        />
      ) : null}
    </main>
  );
}

function CharacterEditor({
  sheet,
  options,
  campaignId,
  onDeleted,
}: {
  sheet: CharacterSheet;
  options: CharacterOptionsResponse;
  campaignId: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(sheet.name);
  const [data, setData] = useState(sheet.data);
  const [message, setMessage] = useState('');
  const [portraitEditorOpen, setPortraitEditorOpen] = useState(false);
  const classOption = options.classes.find(({ id }) => id === data.classId);
  const background = options.backgrounds.find(({ id }) => id === data.backgroundId);
  const allowedSkillIds = new Set([
    ...(classOption?.allowedSkillIds ?? []),
    ...(background?.skillIds ?? []),
  ]);
  const classChosenSkills = data.skillIds.filter(
    (id) => classOption?.allowedSkillIds.includes(id) && !background?.skillIds.includes(id),
  );
  const availableSpells = options.spells.filter(({ classIds }) => classIds.includes(data.classId));
  const points = pointBuySpent(data.abilities);
  const pointBuyInvalid = data.abilityMethod === 'POINT_BUY' && points !== 27;
  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest<CharacterSheet>(`/characters/${sheet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: sheet.revision,
          name,
          data,
        } satisfies UpdateCharacterSheetRequest),
      }),
    onSuccess: async () => {
      setMessage('Сохранено');
      await queryClient.invalidateQueries({ queryKey: ['campaign-characters', campaignId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest<void>(`/characters/${sheet.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      onDeleted();
      await queryClient.invalidateQueries({ queryKey: ['campaign-characters', campaignId] });
    },
  });
  const portraitMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiRequest<CharacterSheet>(`/characters/${sheet.id}/portrait`, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: async () => {
      setPortraitEditorOpen(false);
      setMessage('Портрет сохранён');
      await queryClient.invalidateQueries({ queryKey: ['campaign-characters', campaignId] });
    },
  });

  function patchData(patch: Partial<CharacterSheetData>) {
    setData((current) => ({ ...current, ...patch }));
    setMessage('');
  }
  function applyBuild(build: CharacterBuildTemplate) {
    patchData({
      classId: build.classId,
      speciesId: build.speciesId,
      backgroundId: build.backgroundId,
      abilities: build.abilities,
      abilityMethod: 'STANDARD_ARRAY',
      skillIds: build.skillIds,
      spellIds: build.spellIds,
      equipment: build.equipmentIds.map((id) => ({
        optionId: id,
        name: options.equipment.find((item) => item.id === id)?.name ?? id,
        quantity: 1,
        notes: '',
      })),
      speed: options.species.find(({ id }) => id === build.speciesId)?.speed ?? 30,
    });
  }
  function rollAbilities() {
    const roll = () =>
      Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
        .sort((a, b) => a - b)
        .slice(1)
        .reduce((sum, value) => sum + value, 0);
    patchData({
      abilities: Object.fromEntries(
        abilityKeys.map((key) => [key, roll()]),
      ) as CharacterSheetData['abilities'],
    });
  }
  async function exportSheet() {
    const exported = await apiRequest<PortableCharacterSheet>(`/characters/${sheet.id}/export`);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-zа-яё0-9_-]+/gi, '-') || 'character'}.fol-character.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="character-editor">
      <div className="character-editor-toolbar">
        <input
          className="character-name"
          value={name}
          maxLength={160}
          onChange={(event) => setName(event.target.value)}
          aria-label="Имя персонажа"
        />
        <div>
          <Button
            disabled={saveMutation.isPending || pointBuyInvalid || !name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            Сохранить
          </Button>
          <Button tone="quiet" onClick={() => void exportSheet()}>
            Экспорт
          </Button>
          <Button
            tone="quiet"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (confirm(`Удалить лист «${name}»?`)) deleteMutation.mutate();
            }}
          >
            Удалить
          </Button>
        </div>
      </div>
      {message ? <p className="save-message">{message}</p> : null}
      {saveMutation.error || deleteMutation.error || portraitMutation.error ? (
        <p className="form-error">
          {readableError(saveMutation.error ?? deleteMutation.error ?? portraitMutation.error)}
        </p>
      ) : null}
      <section className="character-section">
        <div className="character-identity-layout">
          <button
            aria-label="Изменить портрет персонажа"
            className="character-portrait-button"
            onClick={() => setPortraitEditorOpen(true)}
            type="button"
          >
            {sheet.portraitAssetId ? (
              <img
                alt={`Портрет ${sheet.name}`}
                src={apiResourceUrl(`/characters/${sheet.id}/portrait?v=${sheet.revision}`)}
              />
            ) : (
              <span>{characterInitials(sheet.name)}</span>
            )}
            <small>{sheet.portraitAssetId ? 'Изменить' : 'Добавить портрет'}</small>
          </button>
          <div className="character-identity-fields">
            <div className="section-title">
              <h3>Основа</h3>
              <span>Владелец: {sheet.ownerDisplayName}</span>
            </div>
            <div className="character-grid character-grid-four">
              <Field label="Уровень">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={data.level}
                  onChange={(event) => patchData({ level: Number(event.target.value) })}
                />
              </Field>
              <Field label="Вид">
                <select
                  value={data.speciesId}
                  onChange={(event) => {
                    const speciesId = event.target.value;
                    patchData({
                      speciesId,
                      speed:
                        options.species.find(({ id }) => id === speciesId)?.speed ?? data.speed,
                    });
                  }}
                >
                  <option value="">Не выбран</option>
                  {options.species.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Класс">
                <select
                  value={data.classId}
                  onChange={(event) =>
                    patchData({ classId: event.target.value, skillIds: [], spellIds: [] })
                  }
                >
                  <option value="">Не выбран</option>
                  {options.classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Предыстория">
                <select
                  value={data.backgroundId}
                  onChange={(event) => {
                    const value = event.target.value;
                    const previousBackgroundSkills = new Set(
                      options.backgrounds.flatMap(({ skillIds }) => skillIds),
                    );
                    const next = options.backgrounds.find(({ id }) => id === value);
                    patchData({
                      backgroundId: value,
                      skillIds: [
                        ...new Set([
                          ...data.skillIds.filter((id) => !previousBackgroundSkills.has(id)),
                          ...(next?.skillIds ?? []),
                        ]),
                      ],
                    });
                  }}
                >
                  <option value="">Не выбрана</option>
                  {options.backgrounds.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {classOption ? <p className="choice-help">{classOption.description}</p> : null}
          </div>
        </div>
      </section>
      <section className="character-section">
        <div className="section-title">
          <h3>Характеристики</h3>
          <Field label="Способ распределения">
            <select
              value={data.abilityMethod}
              onChange={(event) =>
                patchData({ abilityMethod: event.target.value as AbilityMethod })
              }
            >
              <option value="STANDARD_ARRAY">Стандартный массив</option>
              <option value="POINT_BUY">Покупка за 27 очков</option>
              <option value="ROLL">Броски 4к6</option>
              <option value="MANUAL">Вручную</option>
              <option value="CAMPAIGN" disabled>
                Правило кампании — ещё не задано
              </option>
            </select>
          </Field>
        </div>
        {data.abilityMethod === 'POINT_BUY' ? (
          <p className={pointBuyInvalid ? 'form-error' : 'choice-help'}>
            Потрачено: {points ?? 'недопустимое значение'} из 27. Допустимы значения от 8 до 15.
          </p>
        ) : null}
        {data.abilityMethod === 'ROLL' ? (
          <Button tone="quiet" onClick={rollAbilities}>
            Бросить 4к6, убрать меньший
          </Button>
        ) : null}
        <div className="ability-grid">
          {abilityKeys.map((key) => (
            <label key={key}>
              <span>{abilityLabels[key]}</span>
              <input
                type="number"
                min={data.abilityMethod === 'POINT_BUY' ? 8 : 1}
                max={data.abilityMethod === 'POINT_BUY' ? 15 : 30}
                value={data.abilities[key]}
                onChange={(event) =>
                  patchData({ abilities: { ...data.abilities, [key]: Number(event.target.value) } })
                }
              />
              <strong>{formatModifier(abilityModifier(data.abilities[key]))}</strong>
            </label>
          ))}
        </div>
      </section>
      <section className="character-section">
        <h3>Навыки</h3>
        <p className="choice-help">
          {classOption
            ? `Выберите до ${classOption.skillChoices} навыков класса. Навыки предыстории добавляются отдельно.`
            : 'Сначала выберите класс.'}
        </p>
        <div className="choice-grid">
          {options.skills
            .filter(({ id }) => allowedSkillIds.has(id))
            .map((item) => {
              const fromBackground = background?.skillIds.includes(item.id);
              const checked = data.skillIds.includes(item.id);
              const atLimit = classChosenSkills.length >= (classOption?.skillChoices ?? 0);
              return (
                <label key={item.id} className={fromBackground ? 'is-fixed' : ''}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={fromBackground || (!checked && atLimit)}
                    onChange={() =>
                      patchData({
                        skillIds: checked
                          ? data.skillIds.filter((id) => id !== item.id)
                          : [...data.skillIds, item.id],
                      })
                    }
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{fromBackground ? 'От предыстории' : item.description}</small>
                  </span>
                </label>
              );
            })}
        </div>
      </section>
      {availableSpells.length > 0 ? (
        <section className="character-section">
          <h3>Заклинания</h3>
          <p className="choice-help">
            Показаны только заклинания выбранного класса. Ограничения по количеству можно будет
            уточнить после выбора подкласса и уровня.
          </p>
          <div className="choice-grid">
            {availableSpells.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={data.spellIds.includes(item.id)}
                  onChange={() =>
                    patchData({
                      spellIds: data.spellIds.includes(item.id)
                        ? data.spellIds.filter((id) => id !== item.id)
                        : [...data.spellIds, item.id],
                    })
                  }
                />
                <span>
                  <strong>
                    {item.name} · {item.level === 0 ? 'заговор' : `${item.level} ур.`}
                  </strong>
                  <small>{item.description}</small>
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}
      <section className="character-section">
        <h3>Снаряжение</h3>
        <div className="choice-grid">
          {options.equipment.map((item) => {
            const checked = data.equipment.some(({ optionId }) => optionId === item.id);
            return (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    patchData({
                      equipment: checked
                        ? data.equipment.filter(({ optionId }) => optionId !== item.id)
                        : [
                            ...data.equipment,
                            { optionId: item.id, name: item.name, quantity: 1, notes: '' },
                          ],
                    })
                  }
                />
                <span>
                  <strong>
                    {item.name} · {item.cost}
                  </strong>
                  <small>{item.description}</small>
                </span>
              </label>
            );
          })}
        </div>
      </section>
      <section className="character-section">
        <h3>Готовые основы</h3>
        <p className="choice-help">Это стартовые варианты, а не единственно правильные сборки.</p>
        <div className="build-grid">
          {options.builds.map((build) => (
            <button key={build.id} type="button" onClick={() => applyBuild(build)}>
              <strong>{build.name}</strong>
              <span>{build.summary}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="character-section">
        <h3>Описание</h3>
        <div className="character-grid">
          <Field label="Хиты">
            <input
              type="number"
              min={0}
              max={9999}
              value={data.hitPoints}
              onChange={(event) => patchData({ hitPoints: Number(event.target.value) })}
            />
          </Field>
          <Field label="Класс доспеха">
            <input
              type="number"
              min={0}
              max={99}
              value={data.armorClass}
              onChange={(event) => patchData({ armorClass: Number(event.target.value) })}
            />
          </Field>
          <Field label="Скорость">
            <input
              type="number"
              min={0}
              max={999}
              value={data.speed}
              onChange={(event) => patchData({ speed: Number(event.target.value) })}
            />
          </Field>
        </div>
        <Field label="Характер и привычки">
          <textarea
            rows={3}
            value={data.personality}
            onChange={(event) => patchData({ personality: event.target.value })}
          />
        </Field>
        <Field label="Внешность">
          <textarea
            rows={3}
            value={data.appearance}
            onChange={(event) => patchData({ appearance: event.target.value })}
          />
        </Field>
        <Field label="Предыстория персонажа">
          <textarea
            rows={5}
            value={data.backstory}
            onChange={(event) => patchData({ backstory: event.target.value })}
          />
        </Field>
        <Field label="Заметки">
          <textarea
            rows={5}
            value={data.notes}
            onChange={(event) => patchData({ notes: event.target.value })}
          />
        </Field>
      </section>
      <details className="rules-attribution">
        <summary>Источник правил и лицензия</summary>
        <p>{options.attribution}</p>
      </details>
      {portraitEditorOpen ? (
        <PortraitCropDialog
          pending={portraitMutation.isPending}
          onCancel={() => setPortraitEditorOpen(false)}
          onSave={(file) => portraitMutation.mutateAsync(file)}
        />
      ) : null}
    </div>
  );
}

function BeginnerWizard({
  builds,
  options,
  members,
  canAssign,
  pending,
  onCancel,
  onCreate,
}: {
  builds: CharacterBuildTemplate[];
  options: CharacterOptionsResponse;
  members: CampaignMembersResponse['members'];
  canAssign: boolean;
  pending: boolean;
  onCancel: () => void;
  onCreate: (input: CreateCharacterSheetRequest) => void;
}) {
  const [step, setStep] = useState(0);
  const [buildId, setBuildId] = useState('');
  const [speciesId, setSpeciesId] = useState('human');
  const [method, setMethod] = useState<AbilityMethod>('STANDARD_ARRAY');
  const [name, setName] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const roles = [
    {
      id: 'guardian-fighter',
      title: 'Быть на передовой',
      text: 'Держать удар и защищать остальных.',
    },
    {
      id: 'field-cleric',
      title: 'Лечить и поддерживать',
      text: 'Помогать союзникам и оставаться рядом.',
    },
    {
      id: 'quiet-scout',
      title: 'Разведывать и действовать скрытно',
      text: 'Замечать опасность и обходить ловушки.',
    },
    {
      id: 'careful-wizard',
      title: 'Использовать магию издалека',
      text: 'Контролировать бой и решать задачи заклинаниями.',
    },
  ];
  const build = builds.find(({ id }) => id === buildId);
  function finish() {
    if (!build || !name.trim()) return;
    const species = options.species.find(({ id }) => id === speciesId);
    onCreate({
      name,
      ownerUserId: ownerUserId || undefined,
      ruleset: 'dnd5e-srd-5.2.1',
      data: {
        ...defaultData,
        classId: build.classId,
        speciesId,
        backgroundId: build.backgroundId,
        abilityMethod: method,
        abilities: build.abilities,
        skillIds: build.skillIds,
        spellIds: build.spellIds,
        speed: species?.speed ?? 30,
        equipment: build.equipmentIds.map((id) => ({
          optionId: id,
          name: options.equipment.find((item) => item.id === id)?.name ?? id,
          quantity: 1,
          notes: '',
        })),
      },
    });
  }
  return (
    <div className="modal-backdrop">
      <section className="beginner-wizard" role="dialog" aria-modal="true">
        <div className="section-title">
          <div>
            <p className="eyebrow">Шаг {step + 1} из 4</p>
            <h2>Первый персонаж</h2>
          </div>
          <button className="modal-close" onClick={onCancel} type="button" aria-label="Закрыть">
            ×
          </button>
        </div>
        {step === 0 ? (
          <>
            <h3>Что вам интереснее делать во время игры?</h3>
            <div className="wizard-options">
              {roles.map((role) => (
                <button
                  className={buildId === role.id ? 'is-selected' : ''}
                  key={role.id}
                  onClick={() => setBuildId(role.id)}
                  type="button"
                >
                  <strong>{role.title}</strong>
                  <span>{role.text}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <h3>Какой образ вам ближе?</h3>
            <p className="choice-help">
              Вид влияет на особенности персонажа, но не определяет его характер.
            </p>
            <div className="wizard-options compact">
              {options.species.map((species) => (
                <button
                  className={speciesId === species.id ? 'is-selected' : ''}
                  key={species.id}
                  onClick={() => setSpeciesId(species.id)}
                  type="button"
                >
                  <strong>{species.name}</strong>
                  <span>{species.description}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <h3>Как распределить характеристики?</h3>
            <div className="wizard-options">
              <button
                className={method === 'STANDARD_ARRAY' ? 'is-selected' : ''}
                onClick={() => setMethod('STANDARD_ARRAY')}
                type="button"
              >
                <strong>Готовый набор</strong>
                <span>
                  Быстрый и понятный вариант. Значения уже расставлены под выбранную роль.
                </span>
              </button>
              <button
                className={method === 'POINT_BUY' ? 'is-selected' : ''}
                onClick={() => setMethod('POINT_BUY')}
                type="button"
              >
                <strong>27 очков</strong>
                <span>Сейчас возьмём корректную основу; после создания её можно изменить.</span>
              </button>
              <button
                className={method === 'ROLL' ? 'is-selected' : ''}
                onClick={() => setMethod('ROLL')}
                type="button"
              >
                <strong>Броски кубиков</strong>
                <span>
                  Лист создастся с безопасной основой, затем характеристики можно бросить в
                  редакторе.
                </span>
              </button>
            </div>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <h3>Осталось назвать персонажа</h3>
            <Field label="Имя">
              <input
                autoFocus
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {canAssign ? (
              <Field label="Владелец листа">
                <select
                  value={ownerUserId}
                  onChange={(event) => setOwnerUserId(event.target.value)}
                >
                  <option value="">Я</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName} · {member.role}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <div className="wizard-summary">
              <strong>{build?.name}</strong>
              <span>
                {options.species.find(({ id }) => id === speciesId)?.name} ·{' '}
                {options.classes.find(({ id }) => id === build?.classId)?.name}
              </span>
            </div>
          </>
        ) : null}
        <div className="wizard-footer">
          <Button tone="quiet" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
            {step === 0 ? 'Отмена' : 'Назад'}
          </Button>
          {step < 3 ? (
            <Button disabled={step === 0 && !buildId} onClick={() => setStep(step + 1)}>
              Дальше
            </Button>
          ) : (
            <Button disabled={!name.trim() || pending} onClick={finish}>
              Создать лист
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="character-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PortraitCropDialog({
  pending,
  onCancel,
  onSave,
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<unknown>;
}) {
  const [source, setSource] = useState<{ file: File; url: string } | null>(null);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );

  return (
    <div className="modal-backdrop">
      <section className="beginner-wizard portrait-crop-dialog" role="dialog" aria-modal="true">
        <div className="section-title">
          <div>
            <p className="eyebrow">Портрет героя</p>
            <h2>Выберите квадратный кадр</h2>
          </div>
          <button className="modal-close" onClick={onCancel} type="button" aria-label="Закрыть">
            ×
          </button>
        </div>
        <input
          accept="image/jpeg,image/png,image/webp"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
              setError('Поддерживаются JPEG, PNG и WebP.');
              return;
            }
            if (file.size > 10 * 1024 * 1024) {
              setError('Исходное изображение должно быть не больше 10 МБ.');
              return;
            }
            if (source) URL.revokeObjectURL(source.url);
            setSource({ file, url: URL.createObjectURL(file) });
            setError('');
          }}
        />
        {source ? (
          <>
            <div className="portrait-crop-preview">
              <img
                alt="Предпросмотр портрета"
                src={source.url}
                style={{
                  objectPosition: `${focalX}% ${focalY}%`,
                  transform: `scale(${zoom})`,
                }}
              />
            </div>
            <div className="portrait-crop-controls">
              <Field label="Кадр по горизонтали">
                <input
                  min={0}
                  max={100}
                  type="range"
                  value={focalX}
                  onChange={(event) => setFocalX(Number(event.target.value))}
                />
              </Field>
              <Field label="Кадр по вертикали">
                <input
                  min={0}
                  max={100}
                  type="range"
                  value={focalY}
                  onChange={(event) => setFocalY(Number(event.target.value))}
                />
              </Field>
              <Field label="Приближение">
                <input
                  min={1}
                  max={2.5}
                  step={0.05}
                  type="range"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </Field>
            </div>
          </>
        ) : (
          <p className="choice-help">
            Исходник останется на вашем устройстве; сервер получит квадрат 512 × 512.
          </p>
        )}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="wizard-footer">
          <Button tone="quiet" onClick={onCancel}>
            Отмена
          </Button>
          <Button
            disabled={!source || pending || processing}
            onClick={async () => {
              if (!source) return;
              setProcessing(true);
              setError('');
              try {
                await onSave(await cropPortrait(source.file, focalX, focalY, zoom));
              } catch {
                setError('Не удалось обработать или сохранить изображение.');
              } finally {
                setProcessing(false);
              }
            }}
          >
            {pending || processing ? 'Сохраняем…' : 'Сохранить портрет'}
          </Button>
        </div>
      </section>
    </div>
  );
}

async function cropPortrait(
  file: File,
  focalX: number,
  focalY: number,
  zoom: number,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const outputSize = 512;
    const baseCropSize = Math.min(bitmap.width, bitmap.height) / zoom;
    const cropWidth = Math.min(bitmap.width, baseCropSize);
    const cropHeight = Math.min(bitmap.height, baseCropSize);
    const sourceX = (bitmap.width - cropWidth) * (focalX / 100);
    const sourceY = (bitmap.height - cropHeight) * (focalY / 100);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      outputSize,
      outputSize,
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Portrait encoding failed'))),
        'image/webp',
        0.9,
      );
    });
    return new File([blob], 'character-portrait.webp', { type: blob.type });
  } finally {
    bitmap.close();
  }
}

function characterInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('');
}
function Status({ text }: { text: string }) {
  return (
    <main className="page-status">
      <p>{text}</p>
    </main>
  );
}
function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}
