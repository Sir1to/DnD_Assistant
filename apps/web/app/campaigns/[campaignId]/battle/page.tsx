'use client';

import type {
  AdjustBattleHpRequest,
  BattleCombatant,
  BattleCombatantKind,
  BattleConditionsVisibility,
  BattleHpVisibility,
  BattleNameVisibility,
  BattleObstacle,
  BattleObstacleKind,
  BattleSceneObject,
  BattleSceneObjectKind,
  BattleSceneShape,
  BattleSceneSave,
  BattleSceneSnapshot,
  BattleToken,
  CampaignDetail,
  CampaignEventEnvelope,
  CampaignLoreResponse,
  CampaignMembersResponse,
  CreateBattleCombatantRequest,
  CreateBattleObstacleRequest,
  CreateBattleSceneObjectRequest,
  LoreAttachment,
  LoreEntry,
  UpdateBattleCombatantRequest,
  UpdateBattleSceneObjectRequest,
  UpdateBattleSceneRequest,
} from '@fog-of-lore/contracts';
import { findBattleReachableCells } from '@fog-of-lore/domain';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { io } from 'socket.io-client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';

import { CampaignNavigation } from '../../../components/campaign-navigation';
import { apiRequest, apiResourceUrl, readableError } from '../../../lib/api';

const kindLabels: Record<BattleCombatantKind, string> = {
  PLAYER: 'Игрок',
  ALLY: 'Союзник',
  NPC: 'NPC',
  MONSTER: 'Монстр',
  OBJECT: 'Объект',
};

const hpVisibilityLabels: Record<BattleHpVisibility, string> = {
  EXACT: 'Точные HP',
  BAR: 'Только шкала',
  STATE: 'Словесно',
  HIDDEN: 'Скрыть HP',
};

const nameVisibilityLabels: Record<BattleNameVisibility, string> = {
  EXACT: 'Точное имя',
  GENERIC: 'Общее название',
  HIDDEN: 'Скрыть имя',
};

const hpStateLabels = {
  UNHARMED: 'Невредим',
  HURT: 'Ранен',
  BLOODIED: 'Тяжело ранен',
  CRITICAL: 'При смерти',
  DEFEATED: 'Побеждён',
} as const;

type BattleImageOption = { id: string; label: string; mimeType: string };
type QuickCreateKind = 'PLAYER' | 'ALLY' | 'NPC' | 'MONSTER' | 'OBJECT' | 'PROP' | 'OBSTACLE';

const initialCombatant: CreateBattleCombatantRequest = {
  name: '',
  kind: 'MONSTER',
  initiative: 10,
  currentHp: 10,
  maxHp: 10,
  armorClass: null,
  speed: 6,
  className: '',
  species: '',
  conditions: [],
  hidden: false,
  nameVisibility: 'EXACT',
  hpVisibility: 'BAR',
  showArmorClass: false,
  showClassName: false,
  showSpecies: false,
  conditionsVisibility: 'ALL',
  ownerUserId: null,
  size: 1,
  color: '#7c5cff',
  imageAttachmentId: null,
};

const initialTerrainSettings: Pick<CreateBattleObstacleRequest, 'kind' | 'movementCost'> = {
  kind: 'WALL',
  movementCost: 2,
};

const initialObjectSettings: Omit<CreateBattleSceneObjectRequest, 'x' | 'y' | 'width' | 'height'> =
  {
    kind: 'PROP',
    name: 'Ящик',
    blocksMovement: true,
    visibleToPlayers: true,
    currentHp: null,
    maxHp: null,
    imageAttachmentId: null,
    showLabel: false,
  };

const defaultTokenColors = [
  '#7c5cff', '#ef5350', '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#26c6da',
  '#ec407a', '#d4e157', '#8d6e63', '#29b6f6', '#ff7043', '#26a69a', '#ffca28',
  '#5c6bc0', '#9ccc65', '#f06292', '#78909c',
];

function nextUnusedTokenColor(tokens: BattleToken[]): string {
  const used = new Set(tokens.map(({ color }) => color.toLowerCase()));
  const available = defaultTokenColors.find((color) => !used.has(color));
  if (available) return available;
  for (let hue = 0; hue < 360; hue += 1) {
    const color = hslToHex(hue, 72, 58);
    if (!used.has(color)) return color;
  }
  return '#ffffff';
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export default function CampaignBattlePage() {
  const params = useParams<{ campaignId: string }>();
  const queryClient = useQueryClient();
  const battleKey = useMemo(
    () => ['campaign-battle', params.campaignId] as const,
    [params.campaignId],
  );
  const savesKey = useMemo(
    () => ['campaign-battle-saves', params.campaignId] as const,
    [params.campaignId],
  );
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [newCombatant, setNewCombatant] = useState(initialCombatant);
  const [gridColumns, setGridColumns] = useState(16);
  const [gridRows, setGridRows] = useState(10);
  const [sceneShape, setSceneShape] = useState<BattleSceneShape>('RECTANGLE');
  const [saveName, setSaveName] = useState('');
  const [terrainSettings, setTerrainSettings] = useState(initialTerrainSettings);
  const [drawingTerrain, setDrawingTerrain] = useState(false);
  const [objectSettings, setObjectSettings] = useState(initialObjectSettings);
  const [drawingObject, setDrawingObject] = useState(false);
  const [settingsCombatantId, setSettingsCombatantId] = useState('');
  const campaignQuery = useQuery({
    queryKey: ['campaigns', params.campaignId],
    queryFn: () => apiRequest<CampaignDetail>(`/campaigns/${params.campaignId}`),
    retry: false,
  });
  const battleQuery = useQuery({
    queryKey: battleKey,
    queryFn: () => apiRequest<BattleSceneSnapshot>(`/campaigns/${params.campaignId}/battle`),
    enabled: campaignQuery.isSuccess,
  });
  const canEdit = campaignQuery.data?.role !== 'PLAYER';
  const membersQuery = useQuery({
    queryKey: ['campaign-members', params.campaignId],
    queryFn: () => apiRequest<CampaignMembersResponse>(`/campaigns/${params.campaignId}/members`),
    enabled: campaignQuery.isSuccess && canEdit,
  });
  const loreQuery = useQuery({
    queryKey: ['campaign-lore', params.campaignId],
    queryFn: () => apiRequest<CampaignLoreResponse>(`/campaigns/${params.campaignId}/lore`),
    enabled: campaignQuery.isSuccess && canEdit,
  });
  const savesQuery = useQuery({
    queryKey: savesKey,
    queryFn: () => apiRequest<BattleSceneSave[]>(`/campaigns/${params.campaignId}/battle-saves`),
    enabled: campaignQuery.isSuccess && canEdit,
  });

  const replaceSnapshot = (snapshot: BattleSceneSnapshot) => {
    queryClient.setQueryData(battleKey, snapshot);
  };
  const uploadBattleAsset = async (
    file: File,
    label: string,
    category: 'GENERAL' | 'MAP' = 'GENERAL',
  ): Promise<LoreAttachment> => {
    const entry = await apiRequest<LoreEntry>(`/campaigns/${params.campaignId}/lore`, {
      method: 'POST',
      body: JSON.stringify({
        title: `${label} · ${file.name}`,
        content: 'Загружено непосредственно из тактического стола.',
        category,
        status: 'DRAFT',
        audience: 'MASTER',
        recipientUserIds: [],
      }),
    });
    const form = new FormData();
    form.append('file', file);
    return apiRequest<LoreAttachment>(`/lore/${entry.id}/attachments`, {
      method: 'POST',
      body: form,
    });
  };
  const createScene = useMutation({
    mutationFn: () =>
      apiRequest<BattleSceneSnapshot>(`/campaigns/${params.campaignId}/battle`, {
        method: 'POST',
        body: JSON.stringify({ name: 'Первая боевая сцена', gridColumns: 16, gridRows: 10 }),
      }),
    onSuccess: replaceSnapshot,
  });
  const updateScene = useMutation({
    mutationFn: ({ sceneId, input }: { sceneId: string; input: UpdateBattleSceneRequest }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: replaceSnapshot,
  });
  const addCombatant = useMutation({
    mutationFn: ({ sceneId, input }: { sceneId: string; input: CreateBattleCombatantRequest }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}/combatants`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (snapshot) => {
      replaceSnapshot(snapshot);
      setNewCombatant((current) => ({ ...initialCombatant, kind: current.kind }));
    },
  });
  const addObstacle = useMutation({
    mutationFn: ({ sceneId, input }: { sceneId: string; input: CreateBattleObstacleRequest }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}/obstacles`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: replaceSnapshot,
  });
  const removeObstacle = useMutation({
    mutationFn: (obstacleId: string) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scene-obstacles/${obstacleId}`, {
        method: 'DELETE',
      }),
    onSuccess: replaceSnapshot,
  });
  const addSceneObject = useMutation({
    mutationFn: ({ sceneId, input }: { sceneId: string; input: CreateBattleSceneObjectRequest }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}/objects`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: replaceSnapshot,
  });
  const updateSceneObject = useMutation({
    mutationFn: ({
      objectId,
      input,
    }: {
      objectId: string;
      input: UpdateBattleSceneObjectRequest;
    }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scene-objects/${objectId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: replaceSnapshot,
  });
  const adjustSceneObjectHp = useMutation({
    mutationFn: ({
      objectId,
      revision,
      mode,
    }: {
      objectId: string;
      revision: number;
      mode: 'DAMAGE' | 'HEAL';
    }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scene-objects/${objectId}/hp`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: revision, mode, amount: 5 }),
      }),
    onSuccess: replaceSnapshot,
  });
  const removeSceneObject = useMutation({
    mutationFn: (objectId: string) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scene-objects/${objectId}`, { method: 'DELETE' }),
    onSuccess: replaceSnapshot,
  });
  const removeCombatant = useMutation({
    mutationFn: (combatantId: string) =>
      apiRequest<BattleSceneSnapshot>(`/battle-combatants/${combatantId}`, { method: 'DELETE' }),
    onSuccess: (nextSnapshot) => {
      replaceSnapshot(nextSnapshot);
      setSelectedTokenId('');
      setSettingsCombatantId('');
    },
  });
  const resetScene = useMutation({
    mutationFn: (sceneId: string) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}`, { method: 'DELETE' }),
    onSuccess: replaceSnapshot,
  });
  const moveToken = useMutation({
    mutationFn: ({ token, x, y }: { token: BattleToken; x: number; y: number }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-tokens/${token.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: token.revision, x, y }),
      }),
    onSuccess: (snapshot) => {
      replaceSnapshot(snapshot);
      setSelectedTokenId('');
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: battleKey }),
  });
  const nextTurn = useMutation({
    mutationFn: ({ sceneId, revision }: { sceneId: string; revision: number }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}/next-turn`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: revision }),
      }),
    onSuccess: replaceSnapshot,
  });
  const quickAdjustCombatant = useMutation({
    mutationFn: ({ combatant, mode }: { combatant: BattleCombatant; mode: 'DAMAGE' | 'HEAL' }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-combatants/${combatant.id}/hp`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: combatant.revision, mode, amount: 5 }),
      }),
    onSuccess: replaceSnapshot,
  });
  const quickUpdateCombatant = useMutation({
    mutationFn: ({ combatant, input }: { combatant: BattleCombatant; input: UpdateBattleCombatantRequest }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-combatants/${combatant.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: replaceSnapshot,
  });
  const saveBattleScene = useMutation({
    mutationFn: ({ sceneId, name }: { sceneId: string; name: string }) =>
      apiRequest<BattleSceneSave>(`/battle-scenes/${sceneId}/saves`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      setSaveName('');
      void queryClient.invalidateQueries({ queryKey: savesKey });
    },
  });
  const openBattleSave = useMutation({
    mutationFn: (saveId: string) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scene-saves/${saveId}/open`, { method: 'POST' }),
    onSuccess: (nextSnapshot) => {
      replaceSnapshot(nextSnapshot);
      setSelectedTokenId('');
      void queryClient.invalidateQueries({ queryKey: savesKey });
    },
  });
  const removeBattleSave = useMutation({
    mutationFn: (saveId: string) =>
      apiRequest<void>(`/battle-scene-saves/${saveId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: savesKey }),
  });
  const uploadBackground = useMutation({
    mutationFn: async ({
      sceneId,
      revision,
      file,
    }: {
      sceneId: string;
      revision: number;
      file: File;
    }) => {
      const attachment = await uploadBattleAsset(file, 'Фон поля боя', 'MAP');
      return apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: revision,
          backgroundAttachmentId: attachment.id,
        }),
      });
    },
    onSuccess: (snapshot) => {
      replaceSnapshot(snapshot);
      void queryClient.invalidateQueries({ queryKey: ['campaign-lore', params.campaignId] });
    },
  });
  const uploadCombatantImage = useMutation({
    mutationFn: (file: File) => uploadBattleAsset(file, 'Изображение врага'),
    onSuccess: (attachment) => {
      setNewCombatant((current) => ({ ...current, imageAttachmentId: attachment.id }));
      void queryClient.invalidateQueries({ queryKey: ['campaign-lore', params.campaignId] });
    },
  });
  const uploadObjectImage = useMutation({
    mutationFn: (file: File) => uploadBattleAsset(file, 'Окружение поля боя'),
    onSuccess: (attachment) => {
      setObjectSettings((current) => ({ ...current, imageAttachmentId: attachment.id }));
      void queryClient.invalidateQueries({ queryKey: ['campaign-lore', params.campaignId] });
    },
  });

  useEffect(() => {
    if (!campaignQuery.isSuccess) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
      /\/api\/?$/,
      '',
    );
    const socket = io(apiBase, { withCredentials: true });
    socket.on('connect', () => {
      socket.emit('campaign.subscribe', { campaignId: params.campaignId });
      void queryClient.invalidateQueries({ queryKey: battleKey });
    });
    socket.on('campaign.event', (event: CampaignEventEnvelope) => {
      if (event.campaignId === params.campaignId && event.eventName === 'campaign.battle.changed') {
        void queryClient.invalidateQueries({ queryKey: battleKey });
        void queryClient.invalidateQueries({ queryKey: savesKey });
      }
    });
    return () => {
      socket.close();
    };
  }, [battleKey, campaignQuery.isSuccess, params.campaignId, queryClient, savesKey]);

  const snapshot = battleQuery.data;
  const scene = snapshot?.scene;
  const selectedToken = snapshot?.tokens.find(({ id }) => id === selectedTokenId);
  const selectedCombatant = snapshot?.combatants.find(
    ({ id }) => id === selectedToken?.combatantId,
  );
  const mapImages = useMemo(
    () =>
      (loreQuery.data?.entries ?? [])
        .filter(({ category }) => category === 'MAP')
        .flatMap((entry) =>
          entry.attachments
            .filter(({ mimeType }) => mimeType.startsWith('image/'))
            .map((attachment) => ({
              id: attachment.id,
              label: `${entry.title} · ${attachment.originalName}`,
            })),
        ),
    [loreQuery.data?.entries],
  );
  const battleImages = useMemo(
    () =>
      (loreQuery.data?.entries ?? []).flatMap((entry) =>
        entry.attachments
          .filter(({ mimeType }) => mimeType.startsWith('image/'))
          .map((attachment) => ({
            id: attachment.id,
            label: `${entry.title} · ${attachment.originalName}`,
            mimeType: attachment.mimeType,
          })),
      ),
    [loreQuery.data?.entries],
  );

  useEffect(() => {
    if (!scene) return;
    setGridColumns(scene.gridColumns);
    setGridRows(scene.gridRows);
    setSceneShape(scene.shape);
  }, [scene?.gridColumns, scene?.gridRows, scene?.shape, scene]);

  useEffect(() => {
    if (scene?.status === 'LIVE') setSelectedTokenId('');
  }, [scene?.activeCombatantId, scene?.status]);

  if (campaignQuery.isPending || battleQuery.isPending) {
    return <BattleStatus message="Готовим тактический стол…" />;
  }
  if (campaignQuery.isError || battleQuery.isError || !campaignQuery.data || !snapshot) {
    return <BattleStatus message={readableError(campaignQuery.error ?? battleQuery.error)} />;
  }

  if (!scene) {
    return (
      <main className="battle-empty-shell">
        <CampaignNavigation campaignId={params.campaignId} role={campaignQuery.data.role} />
        <section className="battle-empty-state">
          <span aria-hidden="true">⌗</span>
          <p className="eyebrow">Тактический стол</p>
          <h1>{canEdit ? 'Создайте первую боевую сцену' : 'Мастер готовит поле боя'}</h1>
          <p>
            {canEdit
              ? 'Начнём с квадратной сетки. Фон можно выбрать из раздела «Карты» Альманаха.'
              : 'Когда мастер запустит сцену, она автоматически появится на этом планшете.'}
          </p>
          {canEdit ? (
            <Button disabled={createScene.isPending} onClick={() => createScene.mutate()}>
              Создать сцену
            </Button>
          ) : null}
          {createScene.isError ? (
            <p className="form-error">{readableError(createScene.error)}</p>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className={`battle-shell ${canEdit ? 'is-master' : 'is-player'}`}>
      {canEdit ? (
        <CampaignNavigation campaignId={params.campaignId} role={campaignQuery.data.role} />
      ) : null}
      <section className="battle-stage-column">
        <header className="battle-toolbar">
          <div>
            {canEdit ? (
              <Link href={`/campaigns/${params.campaignId}`}>← К доске</Link>
            ) : (
              <span className="eyebrow">Ход боя</span>
            )}
            <h1>{scene.name}</h1>
          </div>
          <div className="battle-round">
            <span>Раунд</span>
            <strong>{scene.round}</strong>
          </div>
          {canEdit ? (
            <div className="battle-toolbar-actions">
              <button
                className={scene.status === 'LIVE' ? 'is-live' : ''}
                disabled={updateScene.isPending}
                onClick={() =>
                  updateScene.mutate({
                    sceneId: scene.id,
                    input: {
                      expectedRevision: scene.revision,
                      status: scene.status === 'LIVE' ? 'PAUSED' : 'LIVE',
                    },
                  })
                }
                type="button"
              >
                {scene.status === 'LIVE' ? 'Пауза' : 'Показать игрокам'}
              </button>
              <button
                disabled={nextTurn.isPending || snapshot.combatants.length === 0}
                onClick={() => nextTurn.mutate({ sceneId: scene.id, revision: scene.revision })}
                type="button"
              >
                Следующий ход →
              </button>
            </div>
          ) : (
            <span className="battle-live-badge">● Сцена активна</span>
          )}
        </header>

        {canEdit ? (
          <>
            <section className="battle-scene-settings">
              <label>
                Фон из Альманаха
                <select
                  onChange={(event) =>
                    updateScene.mutate({
                      sceneId: scene.id,
                      input: {
                        expectedRevision: scene.revision,
                        backgroundAttachmentId: event.target.value || null,
                      },
                    })
                  }
                  value={scene.backgroundAttachmentId ?? ''}
                >
                  <option value="">Без изображения</option>
                  {mapImages.map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="battle-background-upload">
                Загрузить свой фон
                <input
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploadBackground.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      uploadBackground.mutate({
                        sceneId: scene.id,
                        revision: scene.revision,
                        file,
                      });
                    }
                    event.target.value = '';
                  }}
                  type="file"
                />
              </label>
              <label className="battle-grid-size-field">
                Ширина
                <input
                  value={gridColumns}
                  max={60}
                  min={4}
                  onChange={(event) => setGridColumns(Number(event.target.value))}
                  type="number"
                />
              </label>
              <label className="battle-shape-field">
                Форма
                <select
                  onChange={(event) => setSceneShape(event.target.value as BattleSceneShape)}
                  value={sceneShape}
                >
                  <option value="RECTANGLE">Прямоугольник</option>
                  <option value="CIRCLE">Круг</option>
                  <option value="HEXAGON">Шестиугольник</option>
                  <option value="OCTAGON">Восьмиугольник</option>
                </select>
              </label>
              <label className="battle-grid-size-field">
                Высота
                <input
                  value={gridRows}
                  max={60}
                  min={4}
                  onChange={(event) => setGridRows(Number(event.target.value))}
                  type="number"
                />
              </label>
              <button
                className="battle-apply-size"
                disabled={
                  updateScene.isPending ||
                  gridColumns < 4 ||
                  gridColumns > 60 ||
                  gridRows < 4 ||
                  gridRows > 60 ||
                  (gridColumns === scene.gridColumns &&
                    gridRows === scene.gridRows &&
                    sceneShape === scene.shape)
                }
                onClick={() =>
                  updateScene.mutate({
                    sceneId: scene.id,
                    input: {
                      expectedRevision: scene.revision,
                      gridColumns,
                      gridRows,
                      shape: sceneShape,
                    },
                  })
                }
                type="button"
              >
                Применить размер
              </button>
            </section>
            {uploadBackground.isError || updateScene.isError ? (
              <p className="battle-inline-error">
                {readableError(uploadBackground.error ?? updateScene.error)}
              </p>
            ) : null}
            <button
              className="battle-reset-scene"
              disabled={resetScene.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Сбросить текущую сцену? Все токены, местность и объекты на ней будут удалены. Сохранения останутся.',
                  )
                ) {
                  resetScene.mutate(scene.id);
                }
              }}
              type="button"
            >
              Сбросить текущую сцену
            </button>
          </>
        ) : null}

        <BattleBoard
          activeCombatant={selectedCombatant}
          canEdit={canEdit}
          combatants={snapshot.combatants}
          moving={moveToken.isPending}
          onBoardClick={(event) => {
            if (!selectedToken) return;
            const target = event.currentTarget.getBoundingClientRect();
            const x = Math.floor(
              ((event.clientX - target.left) / target.width) * scene.gridColumns,
            );
            const y = Math.floor(((event.clientY - target.top) / target.height) * scene.gridRows);
            if (scene.status === 'LIVE') {
              const available = Math.max(
                0,
                (selectedCombatant?.speed ?? 0) - (selectedCombatant?.movementSpent ?? 0),
              );
              const distance = Math.max(
                Math.abs(selectedToken.x - x),
                Math.abs(selectedToken.y - y),
              );
              if (distance > available) return;
            }
            moveToken.mutate({ token: selectedToken, x, y });
          }}
          onSelectToken={(token) => {
            const combatant = snapshot.combatants.find(({ id }) => id === token.combatantId);
            const canSelect = canEdit
              ? scene.status !== 'LIVE' || scene.activeCombatantId === combatant?.id
              : token.ownerUserId !== null && scene.activeCombatantId === combatant?.id;
            if (canSelect) setSelectedTokenId((current) => (current === token.id ? '' : token.id));
          }}
          onCreateCombatant={(input) => addCombatant.mutate({ sceneId: scene.id, input })}
          onCreateObject={(input) => addSceneObject.mutate({ sceneId: scene.id, input })}
          onCreateObstacle={(input) => addObstacle.mutate({ sceneId: scene.id, input })}
          onNextTurn={() => nextTurn.mutate({ sceneId: scene.id, revision: scene.revision })}
          onOpenCombatantSettings={(token) => {
            setSelectedTokenId(token.id);
            setSettingsCombatantId(token.combatantId);
          }}
          onRemoveObject={(object) => removeSceneObject.mutate(object.id)}
          onRemoveObstacle={(obstacle) => removeObstacle.mutate(obstacle.id)}
          onRemoveCombatant={(combatant) => {
            if (window.confirm(`Удалить юнита «${combatant.name}» с поля боя?`)) {
              removeCombatant.mutate(combatant.id);
            }
          }}
          onToggleObjectLabel={(object) =>
            updateSceneObject.mutate({
              objectId: object.id,
              input: { expectedRevision: object.revision, showLabel: !object.showLabel },
            })
          }
          onQuickAdjustCombatant={(combatant, mode) => quickAdjustCombatant.mutate({ combatant, mode })}
          onQuickUpdateCombatant={(combatant, input) =>
            quickUpdateCombatant.mutate({ combatant, input })
          }
          members={membersQuery.data?.members ?? []}
          scene={scene}
          selectedCombatant={selectedCombatant}
          selectedTokenId={selectedTokenId}
          obstacles={snapshot.obstacles}
          objects={snapshot.objects}
          terrainTool={
            canEdit && drawingTerrain
              ? {
                  ...terrainSettings,
                  onCreate: (input) => addObstacle.mutate({ sceneId: scene.id, input }),
                }
              : null
          }
          objectTool={
            canEdit && drawingObject
              ? {
                  ...objectSettings,
                  onCreate: (input) => addSceneObject.mutate({ sceneId: scene.id, input }),
                }
              : null
          }
          tokens={snapshot.tokens}
        />
        {moveToken.isError ? (
          <p className="battle-inline-error">{readableError(moveToken.error)}</p>
        ) : null}

        {!canEdit ? (
          <PlayerBattleLegend
            combatants={snapshot.combatants}
            sceneActiveId={scene.activeCombatantId}
          />
        ) : null}
      </section>

      {canEdit ? (
        <aside className="battle-master-panel">
          {settingsCombatantId ? (
            <details className="battle-master-drawer is-context-open" open>
              <summary>Настройки выбранного юнита</summary>
              {snapshot.combatants
                .filter(({ id }) => id === settingsCombatantId)
                .map((combatant) => (
                  <MasterCombatantCard
                    active={scene.activeCombatantId === combatant.id}
                    battleKey={battleKey}
                    combatant={combatant}
                    imageOptions={battleImages.filter(({ mimeType }) => mimeType !== 'image/gif')}
                    key={combatant.id}
                    onSnapshot={replaceSnapshot}
                    onUploadImage={async (file) => {
                      const attachment = await uploadBattleAsset(file, 'Изображение врага');
                      void queryClient.invalidateQueries({
                        queryKey: ['campaign-lore', params.campaignId],
                      });
                      return attachment;
                    }}
                    token={snapshot.tokens.find(({ combatantId }) => combatantId === combatant.id)}
                  />
                ))}
            </details>
          ) : null}
          <details className="battle-master-drawer" open>
            <summary>Местность</summary>
          <BattleTerrainPanel
            drawing={drawingTerrain}
            error={addObstacle.error ?? removeObstacle.error}
            input={terrainSettings}
            onChange={setTerrainSettings}
            onDrawingChange={(drawing) => {
              setDrawingTerrain(drawing);
              if (drawing) setDrawingObject(false);
            }}
            onRemove={(obstacle) => removeObstacle.mutate(obstacle.id)}
            obstacles={snapshot.obstacles}
            pending={addObstacle.isPending || removeObstacle.isPending}
          />
          </details>
          <details className="battle-master-drawer">
            <summary>Окружение</summary>
          <BattleObjectsPanel
            drawing={drawingObject}
            error={
              addSceneObject.error ??
              updateSceneObject.error ??
              adjustSceneObjectHp.error ??
              removeSceneObject.error ??
              uploadObjectImage.error
            }
            imageOptions={battleImages}
            input={objectSettings}
            objects={snapshot.objects}
            onChange={setObjectSettings}
            onDrawingChange={(drawing) => {
              setDrawingObject(drawing);
              if (drawing) setDrawingTerrain(false);
            }}
            onUploadImage={(file) => uploadObjectImage.mutate(file)}
            onHpChange={(object, mode) =>
              adjustSceneObjectHp.mutate({ objectId: object.id, revision: object.revision, mode })
            }
            onImageChange={(object, imageAttachmentId) =>
              updateSceneObject.mutate({
                objectId: object.id,
                input: { expectedRevision: object.revision, imageAttachmentId },
              })
            }
            onRemove={(object) => removeSceneObject.mutate(object.id)}
            onToggleBlocks={(object) =>
              updateSceneObject.mutate({
                objectId: object.id,
                input: {
                  expectedRevision: object.revision,
                  blocksMovement: !object.blocksMovement,
                },
              })
            }
            onToggleVisible={(object) =>
              updateSceneObject.mutate({
                objectId: object.id,
                input: {
                  expectedRevision: object.revision,
                  visibleToPlayers: !object.visibleToPlayers,
                },
              })
            }
            onToggleLabel={(object) =>
              updateSceneObject.mutate({
                objectId: object.id,
                input: { expectedRevision: object.revision, showLabel: !object.showLabel },
              })
            }
            pending={
              addSceneObject.isPending ||
              updateSceneObject.isPending ||
              adjustSceneObjectHp.isPending ||
              removeSceneObject.isPending ||
              uploadObjectImage.isPending
            }
          />
          </details>
          <details className="battle-master-drawer">
            <summary>Сохранения</summary>
          <BattleSavesPanel
            error={saveBattleScene.error ?? openBattleSave.error ?? removeBattleSave.error}
            loading={savesQuery.isPending}
            name={saveName}
            onDelete={(save) => {
              if (window.confirm(`Удалить сохранение «${save.name}»?`)) {
                removeBattleSave.mutate(save.id);
              }
            }}
            onNameChange={setSaveName}
            onOpen={(save) => {
              if (
                window.confirm(
                  `Открыть «${save.name}»? Текущее поле останется в истории, а игроки увидят восстановленную сцену, если она была сохранена как активная.`,
                )
              ) {
                openBattleSave.mutate(save.id);
              }
            }}
            onSave={() =>
              saveBattleScene.mutate({ sceneId: scene.id, name: saveName.trim() || scene.name })
            }
            opening={openBattleSave.isPending}
            removing={removeBattleSave.isPending}
            saving={saveBattleScene.isPending}
            saves={savesQuery.data ?? []}
          />
          </details>
          <details className="battle-master-drawer" open>
            <summary>Добавить юнита и список</summary>
          <CombatantCreator
            imageOptions={battleImages.filter(({ mimeType }) => mimeType !== 'image/gif')}
            input={newCombatant}
            members={membersQuery.data?.members ?? []}
            onChange={setNewCombatant}
            onSubmit={(event) => {
              event.preventDefault();
              if (!newCombatant.name.trim()) return;
              addCombatant.mutate({ sceneId: scene.id, input: newCombatant });
            }}
            onUploadImage={(file) => uploadCombatantImage.mutate(file)}
            pending={addCombatant.isPending || uploadCombatantImage.isPending}
          />
          {addCombatant.isError || uploadCombatantImage.isError ? (
            <p className="form-error">
              {readableError(addCombatant.error ?? uploadCombatantImage.error)}
            </p>
          ) : null}
          <div className="battle-combatant-panel-list">
            {snapshot.combatants.map((combatant) => (
              <MasterCombatantCard
                active={scene.activeCombatantId === combatant.id}
                battleKey={battleKey}
                combatant={combatant}
                imageOptions={battleImages.filter(({ mimeType }) => mimeType !== 'image/gif')}
                key={combatant.id}
                onSnapshot={replaceSnapshot}
                onUploadImage={async (file) => {
                  const attachment = await uploadBattleAsset(file, 'Изображение врага');
                  void queryClient.invalidateQueries({
                    queryKey: ['campaign-lore', params.campaignId],
                  });
                  return attachment;
                }}
                token={snapshot.tokens.find(({ combatantId }) => combatantId === combatant.id)}
              />
            ))}
          </div>
          </details>
        </aside>
      ) : null}
    </main>
  );
}

function BattleBoard({
  scene,
  activeCombatant,
  canEdit,
  combatants,
  tokens,
  selectedTokenId,
  selectedCombatant,
  obstacles,
  objects,
  moving,
  onBoardClick,
  onSelectToken,
  onOpenCombatantSettings,
  onCreateCombatant,
  onCreateObject,
  onCreateObstacle,
  onNextTurn,
  onRemoveObject,
  onRemoveObstacle,
  onRemoveCombatant,
  onToggleObjectLabel,
  onQuickAdjustCombatant,
  onQuickUpdateCombatant,
  members,
  terrainTool,
  objectTool,
}: {
  scene: NonNullable<BattleSceneSnapshot['scene']>;
  activeCombatant?: BattleCombatant;
  canEdit: boolean;
  combatants: BattleCombatant[];
  tokens: BattleToken[];
  selectedTokenId: string;
  selectedCombatant?: BattleCombatant;
  obstacles: BattleObstacle[];
  objects: BattleSceneObject[];
  moving: boolean;
  onBoardClick: (event: MouseEvent<HTMLDivElement>) => void;
  onSelectToken: (token: BattleToken) => void;
  onOpenCombatantSettings: (token: BattleToken) => void;
  onCreateCombatant: (input: CreateBattleCombatantRequest) => void;
  onCreateObject: (input: CreateBattleSceneObjectRequest) => void;
  onCreateObstacle: (input: CreateBattleObstacleRequest) => void;
  onNextTurn: () => void;
  onRemoveObject: (object: BattleSceneObject) => void;
  onRemoveObstacle: (obstacle: BattleObstacle) => void;
  onRemoveCombatant: (combatant: BattleCombatant) => void;
  onToggleObjectLabel: (object: BattleSceneObject) => void;
  onQuickAdjustCombatant: (combatant: BattleCombatant, mode: 'DAMAGE' | 'HEAL') => void;
  onQuickUpdateCombatant: (
    combatant: BattleCombatant,
    input: UpdateBattleCombatantRequest,
  ) => void;
  members: CampaignMembersResponse['members'];
  terrainTool: {
    kind: BattleObstacleKind;
    movementCost: number;
    onCreate: (input: CreateBattleObstacleRequest) => void;
  } | null;
  objectTool:
    | (Omit<CreateBattleSceneObjectRequest, 'x' | 'y' | 'width' | 'height'> & {
        onCreate: (input: CreateBattleSceneObjectRequest) => void;
      })
    | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<
    | {
        x: number;
        y: number;
        cell: { x: number; y: number };
        token?: BattleToken;
        object?: BattleSceneObject;
        obstacle?: BattleObstacle;
      }
    | null
  >(null);
  const [quickCreate, setQuickCreate] = useState<{
    kind: QuickCreateKind;
    cell: { x: number; y: number };
  } | null>(null);
  const [quickCombatant, setQuickCombatant] = useState<CreateBattleCombatantRequest>(initialCombatant);
  const [quickObject, setQuickObject] = useState(initialObjectSettings);
  const [quickObstacle, setQuickObstacle] = useState<CreateBattleObstacleRequest>({
    kind: 'OBSTACLE',
    movementCost: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const previousTokenState = useRef(new Map<string, { x: number; y: number; hp: number | null }>());
  const [tokenEffects, setTokenEffects] = useState<Record<string, 'move' | 'damage' | 'heal'>>({});
  const boardFrame = useRef<HTMLDivElement>(null);
  const [terrainStart, setTerrainStart] = useState<{ x: number; y: number } | null>(null);
  const [terrainEnd, setTerrainEnd] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const didPan = useRef(false);
  const combatantsById = new Map(combatants.map((item) => [item.id, item]));
  useEffect(() => {
    const next = new Map<string, { x: number; y: number; hp: number | null }>();
    const effects: Record<string, 'move' | 'damage' | 'heal'> = {};
    tokens.forEach((token) => {
      const combatant = combatantsById.get(token.combatantId);
      if (!combatant) return;
      const previous = previousTokenState.current.get(token.id);
      next.set(token.id, { x: token.x, y: token.y, hp: combatant.currentHp });
      if (previous) {
        if (previous.x !== token.x || previous.y !== token.y) effects[token.id] = 'move';
        else if (combatant.currentHp !== null && previous.hp !== null && combatant.currentHp < previous.hp) effects[token.id] = 'damage';
        else if (combatant.currentHp !== null && previous.hp !== null && combatant.currentHp > previous.hp) effects[token.id] = 'heal';
      }
    });
    previousTokenState.current = next;
    if (!Object.keys(effects).length) return;
    setTokenEffects(effects);
    const timeout = window.setTimeout(() => setTokenEffects({}), 650);
    return () => window.clearTimeout(timeout);
  }, [combatants, tokens]);
  const selectedToken = tokens.find(({ id }) => id === selectedTokenId);
  const remainingMovement = selectedCombatant
    ? Math.max(0, selectedCombatant.speed - selectedCombatant.movementSpent)
    : 0;
  const movementObstacles = [
    ...obstacles,
    ...objects
      .filter(({ blocksMovement, currentHp }) => blocksMovement && currentHp !== 0)
      .map(({ x, y, width, height }) => ({
        kind: 'OBSTACLE' as const,
        x,
        y,
        width,
        height,
        movementCost: 1,
      })),
  ];
  const reachable = selectedToken
    ? findBattleReachableCells({
        scene,
        token: selectedToken,
        remainingMovement,
        obstacles: movementObstacles,
      })
    : [];
  const backgroundUrl = scene.backgroundAttachmentId
    ? apiResourceUrl(`/battle-scenes/${scene.id}/background`)
    : undefined;
  const backgroundImage = backgroundUrl ? `url("${backgroundUrl}")` : undefined;
  const gridColor = useBattleGridColor(backgroundUrl);
  const drawingTool = terrainTool ?? objectTool;
  const terrainPreview =
    drawingTool && terrainStart && terrainEnd ? drawnRectangle(terrainStart, terrainEnd) : null;

  useEffect(() => {
    setTerrainStart(null);
    setTerrainEnd(null);
  }, [
    terrainTool?.kind,
    terrainTool?.movementCost,
    objectTool?.kind,
    objectTool?.name,
    Boolean(drawingTool),
  ]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === boardFrame.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const changeZoom = (nextZoom: number) => {
    setZoom(Math.min(3, Math.max(0.5, Number(nextZoom.toFixed(2)))));
  };
  const toggleFullscreen = async () => {
    if (document.fullscreenElement === boardFrame.current) {
      await document.exitFullscreen();
    } else {
      await boardFrame.current?.requestFullscreen();
    }
  };
  const showContextMenu = (
    event: MouseEvent<HTMLElement>,
    token?: BattleToken,
    object?: BattleSceneObject,
    obstacle?: BattleObstacle,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const frame = boardFrame.current?.getBoundingClientRect();
    if (!frame) return;
    const board = (event.currentTarget.closest('.battle-board') ?? event.currentTarget) as HTMLElement;
    const boardRect = board.getBoundingClientRect();
    const x = Math.max(0, Math.min(scene.gridColumns - 1, Math.floor(((event.clientX - boardRect.left) / boardRect.width) * scene.gridColumns)));
    const y = Math.max(0, Math.min(scene.gridRows - 1, Math.floor(((event.clientY - boardRect.top) / boardRect.height) * scene.gridRows)));
    setContextMenu({
      x: event.clientX - frame.left,
      y: event.clientY - frame.top,
      cell: { x, y },
      token,
      object,
      obstacle,
    });
  };
  const startQuickCreate = (kind: QuickCreateKind) => {
    if (!contextMenu) return;
    const cell = contextMenu.cell;
    if (kind === 'PROP') setQuickObject({ ...initialObjectSettings, name: 'Объект' });
    else if (kind === 'OBSTACLE') setQuickObstacle({ kind: 'OBSTACLE', movementCost: 1, ...cell, width: 1, height: 1 });
    else setQuickCombatant({ ...initialCombatant, kind, name: '', color: nextUnusedTokenColor(tokens), ...cell });
    setQuickCreate({ kind, cell: contextMenu.cell });
    setContextMenu(null);
  };
  const submitQuickCreate = () => {
    if (!quickCreate) return;
    const { kind, cell } = quickCreate;
    if (kind === 'PROP') {
      onCreateObject({ ...quickObject, name: quickObject.name.trim() || 'Объект', ...cell, width: 1, height: 1 });
    } else if (kind === 'OBSTACLE') {
      onCreateObstacle({ ...quickObstacle, ...cell, width: 1, height: 1 });
    } else {
      onCreateCombatant({
        ...quickCombatant,
        kind,
        name: quickCombatant.name.trim() || kindLabels[kind],
        ...cell,
      });
    }
    setQuickCreate(null);
  };
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (drawingTool) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest('.battle-token')) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
    };
    didPan.current = false;
  };
  const pan = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const x = current.cameraX + event.clientX - current.startX;
    const y = current.cameraY + event.clientY - current.startY;
    if (Math.abs(x - current.cameraX) > 3 || Math.abs(y - current.cameraY) > 3) {
      didPan.current = true;
    }
    setCamera({ x, y });
  };
  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
  };
  const zoomWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15));
  };
  const updateTerrainEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawingTool || !terrainStart) return;
    setTerrainEnd(cellFromBoardEvent(event, scene));
  };
  const drawTerrain = (event: MouseEvent<HTMLDivElement>) => {
    const cell = cellFromBoardEvent(event, scene);
    if (!drawingTool) {
      onBoardClick(event);
      return;
    }
    if (!terrainStart) {
      setTerrainStart(cell);
      setTerrainEnd(cell);
      return;
    }
    const rectangle = drawnRectangle(terrainStart, cell);
    if (terrainTool) {
      terrainTool.onCreate({
        kind: terrainTool.kind,
        movementCost: terrainTool.movementCost,
        ...rectangle,
      });
    } else if (objectTool) {
      const { onCreate, ...object } = objectTool;
      onCreate({ ...object, ...rectangle });
    }
    setTerrainStart(null);
    setTerrainEnd(null);
  };

  return (
    <div className={`battle-board-frame ${isFullscreen ? 'is-fullscreen' : ''}`} ref={boardFrame}>
      <div className="battle-fullscreen-hud">
        <span>Раунд <strong>{scene.round}</strong></span>
        <span>Ход: <strong>{activeCombatant?.name ?? '—'}</strong></span>
        {canEdit ? (
          <button disabled={!activeCombatant} onClick={onNextTurn} type="button">
            Следующий ход
          </button>
        ) : null}
      </div>
      <div className="battle-camera-controls" aria-label="Управление камерой">
        <button onClick={() => changeZoom(zoom - 0.2)} type="button">
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => changeZoom(zoom + 0.2)} type="button">
          +
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setCamera({ x: 0, y: 0 });
          }}
          type="button"
        >
          По центру
        </button>
        <button aria-label="Полный экран" onClick={() => void toggleFullscreen()} type="button">
          {isFullscreen ? 'Свернуть' : 'На весь экран'}
        </button>
      </div>
      <div
        className={`battle-board-viewport ${drag.current ? 'is-panning' : ''}`}
        onPointerCancel={endPan}
        onPointerDown={beginPan}
        onPointerMove={pan}
        onPointerUp={endPan}
        onWheel={zoomWithWheel}
      >
        <div
          className="battle-board-camera"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})` }}
        >
          <div
            aria-label="Поле боя"
            className={`battle-board is-shape-${scene.shape.toLowerCase()} ${selectedToken ? 'is-targeting' : ''} ${
              terrainTool ? 'is-drawing-terrain' : ''
            } ${objectTool ? 'is-drawing-object' : ''}`}
            onClick={(event) => {
              if (didPan.current) {
                didPan.current = false;
                return;
              }
              drawTerrain(event);
            }}
            onContextMenu={(event) => showContextMenu(event)}
            onPointerMove={updateTerrainEnd}
            role="application"
            style={
              {
                backgroundImage,
                '--battle-columns': scene.gridColumns,
                '--battle-rows': scene.gridRows,
                '--battle-grid-color': gridColor,
              } as CSSProperties
            }
          >
            {reachable.map(({ x, y }) => (
              <span
                className="battle-reachable-cell"
                key={`${x}:${y}`}
                style={cellStyle(x, y, 1, scene.gridColumns, scene.gridRows)}
              />
            ))}
            {terrainPreview && drawingTool ? (
              <span
                aria-label="Предпросмотр области"
                className={`battle-terrain-preview ${
                  terrainTool
                    ? `is-${terrainTool.kind.toLowerCase()}`
                    : `is-object-${objectTool?.kind.toLowerCase()}`
                }`}
                style={cellStyle(
                  terrainPreview.x,
                  terrainPreview.y,
                  terrainPreview.width,
                  scene.gridColumns,
                  scene.gridRows,
                  terrainPreview.height,
                )}
              />
            ) : null}
            {obstacles.map((obstacle) => (
              <span
                aria-label={
                  obstacle.kind === 'DIFFICULT_TERRAIN'
                    ? 'Труднопроходимая местность'
                    : obstacle.kind === 'WALL'
                      ? 'Стена'
                      : 'Препятствие'
                }
                className={`battle-obstacle is-${obstacle.kind.toLowerCase()}`}
                key={obstacle.id}
                onContextMenu={(event) => showContextMenu(event, undefined, undefined, obstacle)}
                style={cellStyle(
                  obstacle.x,
                  obstacle.y,
                  obstacle.width,
                  scene.gridColumns,
                  scene.gridRows,
                  obstacle.height,
                )}
              />
            ))}
            {objects.map((object) => (
              <span
                aria-label={object.name}
                className={`battle-scene-object is-${object.kind.toLowerCase()} ${
                  object.currentHp === 0 ? 'is-destroyed' : ''
                } ${object.hasImage ? 'has-image' : ''} ${object.imageAnimated ? 'is-animated' : ''}`}
                key={object.id}
                onContextMenu={(event) => showContextMenu(event, undefined, object)}
                style={cellStyle(
                  object.x,
                  object.y,
                  object.width,
                  scene.gridColumns,
                  scene.gridRows,
                  object.height,
                )}
                title={object.name}
              >
                {object.hasImage ? (
                  <img
                    alt=""
                    className="battle-scene-object-image"
                    src={apiResourceUrl(`/battle-scene-objects/${object.id}/image`)}
                  />
                ) : null}
                {!object.hasImage ? <strong>{object.kind === 'CLUE' ? '?' : '◆'}</strong> : null}
                {object.showLabel ? <small>{object.name}</small> : null}
                {object.currentHp !== null && object.maxHp !== null ? (
                  <em>{`${object.currentHp} / ${object.maxHp}`}</em>
                ) : null}
              </span>
            ))}
            {tokens.map((token) => {
              const combatant = combatantsById.get(token.combatantId);
              if (!combatant) return null;
              const active = scene.activeCombatantId === combatant.id;
              return (
                <button
                  aria-label={`Выбрать ${combatant.name ?? 'токен'}`}
                  className={`battle-token ${active ? 'is-active' : ''} ${
                    selectedTokenId === token.id ? 'is-selected' : ''
                  } ${tokenEffects[token.id] ? `has-${tokenEffects[token.id]}-effect` : ''}`}
                  disabled={moving}
                  key={token.id}
                  onClick={(event) => {
                    if (drawingTool) return;
                    event.stopPropagation();
                    onSelectToken(token);
                  }}
                  onContextMenu={(event) => showContextMenu(event, token)}
                  onPointerDown={(event) => {
                    if (!drawingTool) event.stopPropagation();
                  }}
                  style={
                    {
                      ...cellStyle(token.x, token.y, token.size, scene.gridColumns, scene.gridRows),
                      '--token-color': token.color,
                    } as CSSProperties
                  }
                  type="button"
                >
                  <span className="battle-token-ring">
                    {token.hasImage && combatant.kind !== 'PLAYER' ? (
                      <img
                        alt=""
                        className="battle-token-image"
                        src={apiResourceUrl(`/battle-tokens/${token.id}/image`)}
                      />
                    ) : (
                      <span>{initials(combatant.name)}</span>
                    )}
                  </span>
                  {tokenEffects[token.id] === 'damage' ? <span className="battle-token-feedback is-damage">− УРОН</span> : null}
                  {tokenEffects[token.id] === 'heal' ? <span className="battle-token-feedback is-heal">+ ЛЕЧЕНИЕ</span> : null}
                  {tokenEffects[token.id] === 'move' ? <span className="battle-token-feedback is-move">↗</span> : null}
                  <span className="battle-token-hud">
                    <strong>{combatant.name ?? 'Неизвестно'}</strong>
                    <HealthBar combatant={combatant} />
                    {combatantHpLabel(combatant) ? (
                      <small>{combatantHpLabel(combatant)}</small>
                    ) : null}
                    {(combatant.showClassName && combatant.className) ||
                    (combatant.showSpecies && combatant.species) ||
                    (combatant.showArmorClass && combatant.armorClass !== null) ? (
                      <small>
                        {[
                          combatant.showClassName ? combatant.className : null,
                          combatant.showSpecies ? combatant.species : null,
                          combatant.showArmorClass && combatant.armorClass !== null
                            ? `КД ${combatant.armorClass}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    ) : null}
                    {combatant.conditionsVisibility === 'ALL' && combatant.conditions.length > 0 ? (
                      <em>{combatant.conditions.join(' · ')}</em>
                    ) : null}
                  </span>
                  {combatant.revision > 0 ? (
                    <span
                      aria-hidden="true"
                      className="battle-token-effect"
                      key={combatant.revision}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {contextMenu ? (
        <div
          className="battle-context-menu"
          onMouseLeave={() => setContextMenu(null)}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.token ? (
            <>
              <strong>{combatantsById.get(contextMenu.token.combatantId)?.name ?? 'Юнит'}</strong>
              <button onClick={() => { onSelectToken(contextMenu.token!); setContextMenu(null); }} type="button">Выбрать</button>
              {canEdit ? (
                <>
                  <button onClick={() => { onOpenCombatantSettings(contextMenu.token!); setContextMenu(null); }} type="button">Настройки юнита</button>
                  <button onClick={() => { const combatant = combatantsById.get(contextMenu.token!.combatantId); if (combatant) onQuickAdjustCombatant(combatant, 'DAMAGE'); setContextMenu(null); }} type="button">Быстро: −5 HP</button>
                  <button onClick={() => { const combatant = combatantsById.get(contextMenu.token!.combatantId); if (combatant) onQuickAdjustCombatant(combatant, 'HEAL'); setContextMenu(null); }} type="button">Быстро: +5 HP</button>
                  <button onClick={() => { const combatant = combatantsById.get(contextMenu.token!.combatantId); if (combatant) onQuickUpdateCombatant(combatant, { expectedRevision: combatant.revision, hidden: !combatant.hidden }); setContextMenu(null); }} type="button">{combatantsById.get(contextMenu.token.combatantId)?.hidden ? 'Показать токен' : 'Скрыть токен'}</button>
                  <button onClick={() => { const combatant = combatantsById.get(contextMenu.token!.combatantId); if (combatant) onQuickUpdateCombatant(combatant, { expectedRevision: combatant.revision, nameVisibility: combatant.nameVisibility === 'HIDDEN' ? 'EXACT' : 'HIDDEN' }); setContextMenu(null); }} type="button">{combatantsById.get(contextMenu.token.combatantId)?.nameVisibility === 'HIDDEN' ? 'Показать имя' : 'Скрыть имя'}</button>
                  <button
                    className="is-danger"
                    onClick={() => {
                      const combatant = combatantsById.get(contextMenu.token!.combatantId);
                      if (combatant) onRemoveCombatant(combatant);
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    Удалить юнита
                  </button>
                </>
              ) : null}
            </>
          ) : contextMenu.object ? (
            <>
              <strong>{contextMenu.object.name}</strong>
              {canEdit ? (
                <>
                  <button
                    onClick={() => {
                      onToggleObjectLabel(contextMenu.object!);
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    {contextMenu.object.showLabel ? 'Скрыть подпись' : 'Показать подпись'}
                  </button>
                  <button
                    onClick={() => {
                      onRemoveObject(contextMenu.object!);
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    Удалить объект
                  </button>
                </>
              ) : null}
            </>
          ) : contextMenu.obstacle ? (
            <>
              <strong>Препятствие</strong>
              {canEdit ? (
                <button
                  onClick={() => {
                    onRemoveObstacle(contextMenu.obstacle!);
                    setContextMenu(null);
                  }}
                  type="button"
                >
                  Удалить препятствие
                </button>
              ) : null}
            </>
          ) : canEdit ? (
            <>
              <strong>Создать в клетке {contextMenu.cell.x + 1}, {contextMenu.cell.y + 1}</strong>
              <button onClick={() => startQuickCreate('MONSTER')} type="button">Враг</button>
              <button onClick={() => startQuickCreate('NPC')} type="button">NPC</button>
              <button onClick={() => startQuickCreate('ALLY')} type="button">Союзник</button>
              <button onClick={() => startQuickCreate('PLAYER')} type="button">Игрок</button>
              <button onClick={() => startQuickCreate('PROP')} type="button">Объект окружения</button>
              <button onClick={() => startQuickCreate('OBSTACLE')} type="button">Препятствие</button>
            </>
          ) : null}
        </div>
      ) : null}
      {quickCreate ? (
        <div className="battle-quick-create" role="dialog" aria-modal="true">
          <form onSubmit={(event) => { event.preventDefault(); submitQuickCreate(); }}>
            <strong>
              {quickCreate.kind === 'PROP'
                ? 'Новый объект'
                : quickCreate.kind === 'OBSTACLE'
                  ? 'Новое препятствие'
                  : `Новый: ${kindLabels[quickCreate.kind]}`}
            </strong>
            {quickCreate.kind === 'PROP' ? (
              <>
                <input autoFocus maxLength={120} onChange={(event) => setQuickObject({ ...quickObject, name: event.target.value })} placeholder="Название" value={quickObject.name} />
                <label><input checked={quickObject.blocksMovement} onChange={(event) => setQuickObject({ ...quickObject, blocksMovement: event.target.checked })} type="checkbox" /> Блокирует проход</label>
                <label><input checked={quickObject.visibleToPlayers} onChange={(event) => setQuickObject({ ...quickObject, visibleToPlayers: event.target.checked })} type="checkbox" /> Видно игрокам</label>
                <label><input checked={quickObject.showLabel} onChange={(event) => setQuickObject({ ...quickObject, showLabel: event.target.checked })} type="checkbox" /> Показывать подпись</label>
              </>
            ) : quickCreate.kind === 'OBSTACLE' ? (
              <>
                <label>Тип<select onChange={(event) => setQuickObstacle({ ...quickObstacle, kind: event.target.value as BattleObstacleKind })} value={quickObstacle.kind}><option value="OBSTACLE">Препятствие</option><option value="WALL">Стена</option><option value="DIFFICULT_TERRAIN">Трудная местность</option></select></label>
                <label>Цена движения<input max={5} min={1} onChange={(event) => setQuickObstacle({ ...quickObstacle, movementCost: Number(event.target.value) })} type="number" value={quickObstacle.movementCost} /></label>
              </>
            ) : (
              <>
                <input autoFocus maxLength={120} onChange={(event) => setQuickCombatant({ ...quickCombatant, name: event.target.value })} placeholder="Название" value={quickCombatant.name} />
                <div className="battle-quick-grid">
                  <label>HP<input min={0} onChange={(event) => setQuickCombatant({ ...quickCombatant, currentHp: Number(event.target.value) })} type="number" value={quickCombatant.currentHp} /></label>
                  <label>Макс. HP<input min={1} onChange={(event) => setQuickCombatant({ ...quickCombatant, maxHp: Number(event.target.value) })} type="number" value={quickCombatant.maxHp} /></label>
                  <label>КД<input onChange={(event) => setQuickCombatant({ ...quickCombatant, armorClass: event.target.value ? Number(event.target.value) : null })} type="number" value={quickCombatant.armorClass ?? ''} /></label>
                  <label>Скорость<input min={0} onChange={(event) => setQuickCombatant({ ...quickCombatant, speed: Number(event.target.value) })} type="number" value={quickCombatant.speed} /></label>
                  <label>Инициатива<input onChange={(event) => setQuickCombatant({ ...quickCombatant, initiative: Number(event.target.value) })} type="number" value={quickCombatant.initiative} /></label>
                  <label>
                    Цвет (свободный по умолчанию)
                    <input onChange={(event) => setQuickCombatant({ ...quickCombatant, color: event.target.value })} type="color" value={quickCombatant.color} />
                    <output className="battle-color-preview">
                      <span style={{ backgroundColor: quickCombatant.color }} />
                      <code>{quickCombatant.color.toUpperCase()}</code>
                      <small>Свободен при открытии формы</small>
                    </output>
                  </label>
                </div>
                <label>Класс / роль<input maxLength={120} onChange={(event) => setQuickCombatant({ ...quickCombatant, className: event.target.value })} value={quickCombatant.className} /></label>
                <label>Вид / раса<input maxLength={120} onChange={(event) => setQuickCombatant({ ...quickCombatant, species: event.target.value })} value={quickCombatant.species} /></label>
                {quickCreate.kind === 'PLAYER' ? <label>Владелец<select onChange={(event) => setQuickCombatant({ ...quickCombatant, ownerUserId: event.target.value || null })} value={quickCombatant.ownerUserId ?? ''}><option value="">Выберите игрока</option>{members.filter(({ role }) => role === 'PLAYER').map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label> : null}
                <label><input checked={quickCombatant.hidden} onChange={(event) => setQuickCombatant({ ...quickCombatant, hidden: event.target.checked })} type="checkbox" /> Скрыть токен</label>
              </>
            )}
            <small>Клетка {quickCreate.cell.x + 1}, {quickCreate.cell.y + 1}</small>
            <div>
              <button onClick={() => setQuickCreate(null)} type="button">Отмена</button>
              <button type="submit">Создать</button>
            </div>
          </form>
        </div>
      ) : null}
      <p>
        {drawingTool && terrainStart
          ? 'Выберите противоположную клетку, чтобы закончить область'
          : drawingTool
            ? 'Выберите первую клетку области на поле'
            : selectedToken
              ? `Выберите клетку назначения · доступно ${remainingMovement}`
              : 'Выберите доступный токен, затем клетку назначения'}
      </p>
    </div>
  );
}

function HealthBar({ combatant }: { combatant: BattleCombatant }) {
  const percent =
    combatant.hpPercent ??
    (combatant.currentHp !== null && combatant.maxHp
      ? Math.round((combatant.currentHp / combatant.maxHp) * 100)
      : null);
  if (percent === null) return null;
  return (
    <span aria-label={`Здоровье ${percent}%`} className="battle-health-bar" title={`${percent}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </span>
  );
}

function useBattleGridColor(backgroundUrl: string | undefined): '#111116' | '#fffdf5' {
  const [gridColor, setGridColor] = useState<'#111116' | '#fffdf5'>('#fffdf5');

  useEffect(() => {
    if (!backgroundUrl) {
      setGridColor('#fffdf5');
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'use-credentials';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let luminance = 0;
        let visiblePixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] ?? 0;
          if (alpha === 0) continue;
          luminance +=
            ((pixels[index] ?? 0) * 0.2126 +
              (pixels[index + 1] ?? 0) * 0.7152 +
              (pixels[index + 2] ?? 0) * 0.0722) *
            (alpha / 255);
          visiblePixels += 1;
        }
        if (!cancelled && visiblePixels > 0) {
          setGridColor(luminance / visiblePixels > 150 ? '#111116' : '#fffdf5');
        }
      } catch {
        if (!cancelled) setGridColor('#fffdf5');
      }
    };
    image.onerror = () => {
      if (!cancelled) setGridColor('#fffdf5');
    };
    image.src = backgroundUrl;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [backgroundUrl]);

  return gridColor;
}

function BattleSavesPanel({
  name,
  saves,
  loading,
  saving,
  opening,
  removing,
  error,
  onNameChange,
  onSave,
  onOpen,
  onDelete,
}: {
  name: string;
  saves: BattleSceneSave[];
  loading: boolean;
  saving: boolean;
  opening: boolean;
  removing: boolean;
  error: unknown;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onOpen: (save: BattleSceneSave) => void;
  onDelete: (save: BattleSceneSave) => void;
}) {
  return (
    <section className="battle-saves-panel">
      <div>
        <p className="eyebrow">Поля боя</p>
        <h2>Сохранения</h2>
      </div>
      <div className="battle-save-create">
        <input
          aria-label="Название сохранения"
          maxLength={160}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Название текущего поля"
          value={name}
        />
        <button disabled={saving || opening} onClick={onSave} type="button">
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      {error ? <p className="form-error">{readableError(error)}</p> : null}
      {loading ? <p className="battle-save-empty">Загружаем сохранения…</p> : null}
      {!loading && saves.length === 0 ? (
        <p className="battle-save-empty">
          Здесь появятся подготовленные поля и точки продолжения боя.
        </p>
      ) : null}
      {saves.length ? (
        <ul className="battle-save-list">
          {saves.map((save) => (
            <li key={save.id}>
              <div>
                <strong>{save.name}</strong>
                <small>
                  {save.sourceSceneName} · {save.gridColumns} × {save.gridRows} ·{' '}
                  {save.combatantCount} токенов
                </small>
                <small>
                  {save.sceneStatus === 'LIVE'
                    ? 'Активная сцена'
                    : save.sceneStatus === 'PAUSED'
                      ? 'На паузе'
                      : 'Черновик'}
                  {save.hasBackground ? ' · с фоном' : ''} · {formatSaveDate(save.createdAt)}
                </small>
              </div>
              <div className="battle-save-actions">
                <button disabled={opening || removing} onClick={() => onOpen(save)} type="button">
                  Открыть
                </button>
                <button
                  aria-label={`Удалить сохранение ${save.name}`}
                  className="battle-remove-save"
                  disabled={opening || removing}
                  onClick={() => onDelete(save)}
                  type="button"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BattleTerrainPanel({
  input,
  obstacles,
  pending,
  drawing,
  error,
  onChange,
  onDrawingChange,
  onRemove,
}: {
  input: Pick<CreateBattleObstacleRequest, 'kind' | 'movementCost'>;
  obstacles: BattleObstacle[];
  pending: boolean;
  drawing: boolean;
  error: unknown;
  onChange: (input: Pick<CreateBattleObstacleRequest, 'kind' | 'movementCost'>) => void;
  onDrawingChange: (drawing: boolean) => void;
  onRemove: (obstacle: BattleObstacle) => void;
}) {
  return (
    <section className="battle-terrain-panel">
      <div>
        <p className="eyebrow">Местность</p>
        <h2>Препятствия</h2>
      </div>
      <div className="battle-form-row">
        <label>
          Тип
          <select
            onChange={(event) =>
              onChange({ ...input, kind: event.target.value as BattleObstacleKind })
            }
            value={input.kind}
          >
            <option value="WALL">Стена</option>
            <option value="OBSTACLE">Препятствие</option>
            <option value="DIFFICULT_TERRAIN">Трудная местность</option>
          </select>
        </label>
        <NumberInput
          label="Цена"
          min={1}
          onChange={(movementCost) => onChange({ ...input, movementCost })}
          value={input.movementCost}
        />
      </div>
      <div className="battle-form-row">
        <button disabled={pending} onClick={() => onDrawingChange(!drawing)} type="button">
          {drawing ? 'Закончить рисование' : 'Рисовать на поле'}
        </button>
      </div>
      <p className="battle-terrain-hint">
        Нажмите первую и противоположную клетки. Получится область любой длины и ширины.
      </p>
      {error ? <p className="form-error">{readableError(error)}</p> : null}
      {obstacles.length ? (
        <ul className="battle-terrain-list">
          {obstacles.map((obstacle) => (
            <li key={obstacle.id}>
              <span>
                {obstacle.kind === 'WALL'
                  ? 'Стена'
                  : obstacle.kind === 'OBSTACLE'
                    ? 'Препятствие'
                    : `Местность ×${obstacle.movementCost}`}
              </span>
              <small>
                {obstacle.width} × {obstacle.height} клеток
              </small>
              <button disabled={pending} onClick={() => onRemove(obstacle)} type="button">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BattleObjectsPanel({
  input,
  imageOptions,
  objects,
  pending,
  drawing,
  error,
  onChange,
  onDrawingChange,
  onToggleVisible,
  onToggleLabel,
  onToggleBlocks,
  onHpChange,
  onImageChange,
  onRemove,
  onUploadImage,
}: {
  input: Omit<CreateBattleSceneObjectRequest, 'x' | 'y' | 'width' | 'height'>;
  imageOptions: BattleImageOption[];
  objects: BattleSceneObject[];
  pending: boolean;
  drawing: boolean;
  error: unknown;
  onChange: (input: Omit<CreateBattleSceneObjectRequest, 'x' | 'y' | 'width' | 'height'>) => void;
  onDrawingChange: (drawing: boolean) => void;
  onToggleVisible: (object: BattleSceneObject) => void;
  onToggleLabel: (object: BattleSceneObject) => void;
  onToggleBlocks: (object: BattleSceneObject) => void;
  onHpChange: (object: BattleSceneObject, mode: 'DAMAGE' | 'HEAL') => void;
  onImageChange: (object: BattleSceneObject, imageAttachmentId: string | null) => void;
  onRemove: (object: BattleSceneObject) => void;
  onUploadImage: (file: File) => void;
}) {
  const destructible = input.currentHp !== null && input.maxHp !== null;
  return (
    <section className="battle-objects-panel">
      <div>
        <p className="eyebrow">Окружение</p>
        <h2>Предметы и зацепки</h2>
      </div>
      <label>
        Название
        <input
          maxLength={120}
          onChange={(event) => onChange({ ...input, name: event.target.value })}
          placeholder="Например, бочка или рычаг"
          value={input.name}
        />
      </label>
      <div className="battle-form-row">
        <label>
          Вид
          <select
            onChange={(event) =>
              onChange({ ...input, kind: event.target.value as BattleSceneObjectKind })
            }
            value={input.kind}
          >
            <option value="PROP">Предмет</option>
            <option value="CLUE">Зацепка</option>
          </select>
        </label>
        <label className="battle-inline-checkbox">
          <input
            checked={input.blocksMovement}
            onChange={(event) => onChange({ ...input, blocksMovement: event.target.checked })}
            type="checkbox"
          />
          Блокирует проход
        </label>
      </div>
      <label className="battle-inline-checkbox">
        <input
          checked={input.visibleToPlayers}
          onChange={(event) => onChange({ ...input, visibleToPlayers: event.target.checked })}
          type="checkbox"
        />
        Видно игрокам
      </label>
      <label>
        Изображение или GIF
        <select
          onChange={(event) =>
            onChange({ ...input, imageAttachmentId: event.target.value || null })
          }
          value={input.imageAttachmentId ?? ''}
        >
          <option value="">Стандартный маркер</option>
          {imageOptions.map((image) => (
            <option key={image.id} value={image.id}>
              {image.label}
            </option>
          ))}
        </select>
      </label>
      <label className="battle-asset-upload">
        Импортировать своё изображение
        <input
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUploadImage(file);
            event.target.value = '';
          }}
          type="file"
        />
      </label>
      <label className="battle-inline-checkbox">
        <input
          checked={destructible}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { ...input, currentHp: 10, maxHp: 10 }
                : { ...input, currentHp: null, maxHp: null },
            )
          }
          type="checkbox"
        />
        Разрушаемый (есть HP)
      </label>
      {destructible ? (
        <div className="battle-form-row">
          <NumberInput
            label="Текущие HP"
            min={0}
            onChange={(currentHp) =>
              onChange({ ...input, currentHp: Math.min(currentHp, input.maxHp ?? currentHp) })
            }
            value={input.currentHp ?? 0}
          />
          <NumberInput
            label="Макс. HP"
            min={1}
            onChange={(maxHp) =>
              onChange({ ...input, maxHp, currentHp: Math.min(input.currentHp ?? maxHp, maxHp) })
            }
            value={input.maxHp ?? 10}
          />
        </div>
      ) : null}
      <button
        disabled={pending || !input.name.trim()}
        onClick={() => onDrawingChange(!drawing)}
        type="button"
      >
        {drawing ? 'Закончить рисование' : 'Рисовать на поле'}
      </button>
      <p className="battle-terrain-hint">
        Нажмите первую и противоположную клетки. Зацепку можно скрыть, а затем раскрыть игрокам
        одной кнопкой.
      </p>
      {error ? <p className="form-error">{readableError(error)}</p> : null}
      {objects.length ? (
        <ul className="battle-objects-list">
          {objects.map((object) => (
            <li key={object.id}>
              <div>
                <strong>{object.name}</strong>
                <small>
                  {object.kind === 'CLUE' ? 'Зацепка' : 'Предмет'} · {object.width} ×{' '}
                  {object.height} клеток
                  {object.currentHp !== null && object.maxHp !== null
                    ? ` · ${object.currentHp}/${object.maxHp} HP`
                    : ''}
                  {object.hasImage ? ' · изображение' : ''}
                </small>
                <select
                  aria-label={`Изображение объекта ${object.name}`}
                  disabled={pending}
                  onChange={(event) => onImageChange(object, event.target.value || null)}
                  value={object.imageAttachmentId ?? ''}
                >
                  <option value="">Стандартный маркер</option>
                  {imageOptions.map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="battle-object-actions">
                <button
                  disabled={pending}
                  onClick={() => onToggleVisible(object)}
                  title={object.visibleToPlayers ? 'Скрыть от игроков' : 'Показать игрокам'}
                  type="button"
                >
                  {object.visibleToPlayers ? '◉' : '○'}
                </button>
                <button
                  disabled={pending}
                  onClick={() => onToggleLabel(object)}
                  title={object.showLabel ? 'Скрыть подпись' : 'Показать подпись'}
                  type="button"
                >
                  {object.showLabel ? 'Aa' : '·'}
                </button>
                <button
                  disabled={pending}
                  onClick={() => onToggleBlocks(object)}
                  title={object.blocksMovement ? 'Разрешить проход' : 'Блокировать проход'}
                  type="button"
                >
                  {object.blocksMovement ? '▣' : '□'}
                </button>
                {object.currentHp !== null ? (
                  <>
                    <button
                      disabled={pending}
                      onClick={() => onHpChange(object, 'DAMAGE')}
                      title="Нанести 5 урона"
                      type="button"
                    >
                      −5
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => onHpChange(object, 'HEAL')}
                      title="Восстановить 5 HP"
                      type="button"
                    >
                      +5
                    </button>
                  </>
                ) : null}
                <button
                  disabled={pending}
                  onClick={() => onRemove(object)}
                  title="Удалить"
                  type="button"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CombatantCreator({
  input,
  imageOptions,
  members,
  pending,
  onChange,
  onSubmit,
  onUploadImage,
}: {
  input: CreateBattleCombatantRequest;
  imageOptions: BattleImageOption[];
  members: CampaignMembersResponse['members'];
  pending: boolean;
  onChange: (value: CreateBattleCombatantRequest) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUploadImage: (file: File) => void;
}) {
  const players = members.filter(({ role }) => role === 'PLAYER');
  return (
    <form className="battle-combatant-creator" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">Новый токен</p>
        <h2>Участник</h2>
      </div>
      <label>
        Имя
        <input
          maxLength={120}
          onChange={(event) => onChange({ ...input, name: event.target.value })}
          placeholder="Имя или название"
          required
          value={input.name}
        />
      </label>
      <div className="battle-form-row">
        <label>
          Тип
          <select
            onChange={(event) =>
              onChange({
                ...input,
                kind: event.target.value as BattleCombatantKind,
                imageAttachmentId: event.target.value === 'PLAYER' ? null : input.imageAttachmentId,
              })
            }
            value={input.kind}
          >
            {(Object.keys(kindLabels) as BattleCombatantKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {kindLabels[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Цвет
          <input
            onChange={(event) => onChange({ ...input, color: event.target.value })}
            type="color"
            value={input.color}
          />
        </label>
      </div>
      {input.kind === 'PLAYER' ? (
        <p className="battle-terrain-hint">
          Игрок отображается цветным кругом: сверху на него можно поставить физическую фигурку.
        </p>
      ) : (
        <>
          <label>
            Изображение токена
            <select
              onChange={(event) =>
                onChange({ ...input, imageAttachmentId: event.target.value || null })
              }
              value={input.imageAttachmentId ?? ''}
            >
              <option value="">Круг с инициалами</option>
              {imageOptions.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.label}
                </option>
              ))}
            </select>
          </label>
          <label className="battle-asset-upload">
            Импортировать своё изображение врага
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadImage(file);
                event.target.value = '';
              }}
              type="file"
            />
          </label>
        </>
      )}
      <div className="battle-form-row battle-form-row-three">
        <NumberInput
          label="HP"
          onChange={(currentHp) => onChange({ ...input, currentHp })}
          value={input.currentHp}
        />
        <NumberInput
          label="Макс."
          min={1}
          onChange={(maxHp) => onChange({ ...input, maxHp })}
          value={input.maxHp}
        />
        <NumberInput
          label="Скорость"
          min={0}
          onChange={(speed) => onChange({ ...input, speed })}
          value={input.speed}
        />
      </div>
      <div className="battle-form-row battle-form-row-three">
        <NumberInput
          label="Инициатива"
          onChange={(initiative) => onChange({ ...input, initiative })}
          value={input.initiative}
        />
      </div>
      <label>
        Владелец токена
        <select
          onChange={(event) => onChange({ ...input, ownerUserId: event.target.value || null })}
          value={input.ownerUserId ?? ''}
        >
          <option value="">Только мастер</option>
          {players.map((player) => (
            <option key={player.userId} value={player.userId}>
              {player.displayName}
            </option>
          ))}
        </select>
      </label>
      <Button disabled={pending || !input.name.trim()} type="submit">
        + Поставить на карту
      </Button>
    </form>
  );
}

function MasterCombatantCard({
  combatant,
  token,
  imageOptions,
  active,
  battleKey,
  onSnapshot,
  onUploadImage,
}: {
  combatant: BattleCombatant;
  token: BattleToken | undefined;
  imageOptions: BattleImageOption[];
  active: boolean;
  battleKey: readonly string[];
  onSnapshot: (snapshot: BattleSceneSnapshot) => void;
  onUploadImage: (file: File) => Promise<LoreAttachment>;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(1);
  const adjust = useMutation({
    mutationFn: (input: AdjustBattleHpRequest) =>
      apiRequest<BattleSceneSnapshot>(`/battle-combatants/${combatant.id}/hp`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: onSnapshot,
    onError: () => void queryClient.invalidateQueries({ queryKey: battleKey }),
  });
  const update = useMutation({
    mutationFn: (input: UpdateBattleCombatantRequest) =>
      apiRequest<BattleSceneSnapshot>(`/battle-combatants/${combatant.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: onSnapshot,
    onError: () => void queryClient.invalidateQueries({ queryKey: battleKey }),
  });
  const remove = useMutation({
    mutationFn: () =>
      apiRequest<BattleSceneSnapshot>(`/battle-combatants/${combatant.id}`, {
        method: 'DELETE',
      }),
    onSuccess: onSnapshot,
    onError: () => void queryClient.invalidateQueries({ queryKey: battleKey }),
  });
  const updateTokenImage = useMutation({
    mutationFn: async ({ attachmentId, file }: { attachmentId?: string | null; file?: File }) => {
      if (!token) throw new Error('Battle token is missing');
      const uploaded = file ? await onUploadImage(file) : null;
      return apiRequest<BattleSceneSnapshot>(`/battle-tokens/${token.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: token.revision,
          imageAttachmentId: uploaded?.id ?? attachmentId ?? null,
        }),
      });
    },
    onSuccess: onSnapshot,
    onError: () => void queryClient.invalidateQueries({ queryKey: battleKey }),
  });
  return (
    <article className={`battle-master-combatant ${active ? 'is-active' : ''}`}>
      <header>
        <span style={{ background: active ? 'var(--accent)' : undefined }}>
          {combatant.initiative}
        </span>
        <div>
          <strong>{combatant.name}</strong>
          <small>{kindLabels[combatant.kind]}</small>
        </div>
        <button
          className="battle-remove-combatant"
          aria-label={`Удалить ${combatant.name ?? 'участника'}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Удалить «${combatant.name ?? 'участника'}» с поля боя?`)) {
              remove.mutate();
            }
          }}
          type="button"
        >
          {remove.isPending ? 'Удаление…' : 'Удалить'}
        </button>
      </header>
      <div className="battle-master-hp">
        <span>
          HP <strong>{combatant.currentHp}</strong> / {combatant.maxHp}
        </span>
        <input
          min={0}
          onChange={(event) => setAmount(Number(event.target.value))}
          type="number"
          value={amount}
        />
        <button
          disabled={adjust.isPending}
          onClick={() =>
            adjust.mutate({ expectedRevision: combatant.revision, mode: 'DAMAGE', amount })
          }
          type="button"
        >
          Урон
        </button>
        <button
          disabled={adjust.isPending}
          onClick={() =>
            adjust.mutate({ expectedRevision: combatant.revision, mode: 'HEAL', amount })
          }
          type="button"
        >
          Лечение
        </button>
      </div>
      <details className="battle-combatant-details">
        <summary>Характеристики и видимость</summary>
        {combatant.kind === 'PLAYER' ? (
          <p className="battle-terrain-hint">Игровой токен всегда остаётся цветным кругом.</p>
        ) : token ? (
          <div className="battle-token-image-settings">
            <label>
              Изображение токена
              <select
                disabled={updateTokenImage.isPending}
                onChange={(event) =>
                  updateTokenImage.mutate({ attachmentId: event.target.value || null })
                }
                value={token.imageAttachmentId ?? ''}
              >
                <option value="">Круг с инициалами</option>
                {imageOptions.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="battle-asset-upload">
              Импортировать своё
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={updateTokenImage.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) updateTokenImage.mutate({ file });
                  event.target.value = '';
                }}
                type="file"
              />
            </label>
          </div>
        ) : null}
        <div className="battle-form-row">
          <label>
            Класс
            <input
              defaultValue={combatant.className ?? ''}
              maxLength={120}
              onBlur={(event) => {
                if (event.target.value !== (combatant.className ?? '')) {
                  update.mutate({
                    expectedRevision: combatant.revision,
                    className: event.target.value,
                  });
                }
              }}
            />
          </label>
          <label>
            Раса / вид
            <input
              defaultValue={combatant.species ?? ''}
              maxLength={120}
              onBlur={(event) => {
                if (event.target.value !== (combatant.species ?? '')) {
                  update.mutate({
                    expectedRevision: combatant.revision,
                    species: event.target.value,
                  });
                }
              }}
            />
          </label>
        </div>
        <div className="battle-form-row">
          <label>
            Защита
            <input
              defaultValue={combatant.armorClass ?? ''}
              onBlur={(event) => {
                const armorClass = event.target.value === '' ? null : Number(event.target.value);
                if (armorClass !== combatant.armorClass) {
                  update.mutate({ expectedRevision: combatant.revision, armorClass });
                }
              }}
              type="number"
            />
          </label>
          <label>
            Состояния
            <input
              defaultValue={combatant.conditions.join(', ')}
              onBlur={(event) => {
                const conditions = event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean);
                if (conditions.join('|') !== combatant.conditions.join('|')) {
                  update.mutate({ expectedRevision: combatant.revision, conditions });
                }
              }}
            />
          </label>
        </div>
        <div className="battle-form-row">
          <label className="battle-visibility-control">
            Имя для игроков
            <select
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate({
                  expectedRevision: combatant.revision,
                  nameVisibility: event.target.value as BattleNameVisibility,
                })
              }
              value={combatant.nameVisibility}
            >
              {(Object.keys(nameVisibilityLabels) as BattleNameVisibility[]).map((mode) => (
                <option key={mode} value={mode}>
                  {nameVisibilityLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          <label className="battle-visibility-control">
            HP для игроков
            <select
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate({
                  expectedRevision: combatant.revision,
                  hpVisibility: event.target.value as BattleHpVisibility,
                })
              }
              value={combatant.hpVisibility}
            >
              {(Object.keys(hpVisibilityLabels) as BattleHpVisibility[]).map((mode) => (
                <option key={mode} value={mode}>
                  {hpVisibilityLabels[mode]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="battle-visibility-checks">
          <VisibilityCheckbox
            checked={combatant.showArmorClass}
            label="Показывать защиту"
            onChange={(showArmorClass) =>
              update.mutate({ expectedRevision: combatant.revision, showArmorClass })
            }
          />
          <VisibilityCheckbox
            checked={combatant.showClassName}
            label="Показывать класс"
            onChange={(showClassName) =>
              update.mutate({ expectedRevision: combatant.revision, showClassName })
            }
          />
          <VisibilityCheckbox
            checked={combatant.showSpecies}
            label="Показывать расу / вид"
            onChange={(showSpecies) =>
              update.mutate({ expectedRevision: combatant.revision, showSpecies })
            }
          />
          <VisibilityCheckbox
            checked={combatant.conditionsVisibility === 'ALL'}
            label="Показывать состояния"
            onChange={(checked) =>
              update.mutate({
                expectedRevision: combatant.revision,
                conditionsVisibility: (checked ? 'ALL' : 'HIDDEN') as BattleConditionsVisibility,
              })
            }
          />
          <VisibilityCheckbox
            checked={combatant.hidden}
            label="Полностью скрыть токен"
            onChange={(hidden) => update.mutate({ expectedRevision: combatant.revision, hidden })}
          />
        </div>
      </details>
      {(adjust.isError || update.isError || remove.isError || updateTokenImage.isError) && (
        <p className="form-error">
          {readableError(adjust.error ?? update.error ?? remove.error ?? updateTokenImage.error)}
        </p>
      )}
    </article>
  );
}

function PlayerBattleLegend({
  combatants,
  sceneActiveId,
}: {
  combatants: BattleCombatant[];
  sceneActiveId: string | null;
}) {
  const active = combatants.find(({ id }) => id === sceneActiveId);
  return (
    <section className="player-battle-legend">
      <span>Сейчас ходит</span>
      <strong>{active?.name ?? 'Мастер выбирает участника'}</strong>
      <small>Коснитесь своего цветного круга, когда наступит ваш ход.</small>
    </section>
  );
}

function VisibilityCheckbox({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function NumberInput({
  label,
  value,
  min = -1000,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function cellStyle(
  x: number,
  y: number,
  width: number,
  columns: number,
  rows: number,
  height = width,
) {
  return {
    left: `${(x / columns) * 100}%`,
    top: `${(y / rows) * 100}%`,
    width: `${(width / columns) * 100}%`,
    height: `${(height / rows) * 100}%`,
  };
}

function cellFromBoardEvent(
  event: Pick<MouseEvent<HTMLDivElement>, 'clientX' | 'clientY' | 'currentTarget'>,
  scene: NonNullable<BattleSceneSnapshot['scene']>,
) {
  const board = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(
        scene.gridColumns - 1,
        Math.floor(((event.clientX - board.left) / board.width) * scene.gridColumns),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        scene.gridRows - 1,
        Math.floor(((event.clientY - board.top) / board.height) * scene.gridRows),
      ),
    ),
  };
}

function drawnRectangle(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x) + 1,
    height: Math.abs(end.y - start.y) + 1,
  };
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function combatantHpLabel(combatant: BattleCombatant): string {
  if (combatant.currentHp !== null && combatant.maxHp !== null) {
    return `${combatant.currentHp} / ${combatant.maxHp} HP`;
  }
  if (combatant.hpPercent !== null) return `${combatant.hpPercent}% HP`;
  if (combatant.hpState !== null) return hpStateLabels[combatant.hpState];
  return 'HP скрыты';
}

function formatSaveDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function BattleStatus({ message }: { message: string }) {
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
