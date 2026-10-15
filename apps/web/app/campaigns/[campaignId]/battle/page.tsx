'use client';

import type {
  AdjustBattleHpRequest,
  BattleBackgroundPreset,
  BattleCombatant,
  BattleCombatantKind,
  BattleCombatantPreset,
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
  CampaignCharacterSheetsResponse,
  CampaignLoreResponse,
  CampaignMembersResponse,
  CreateBattleCombatantRequest,
  CreateBattleObstacleRequest,
  CreateBattleSceneRequest,
  CreateBattleSceneObjectRequest,
  GenerateRandomBattleMapRequest,
  GeneratedRandomBattleMap,
  ImportBattleCombatantPresetRequest,
  LoreAttachment,
  LoreEntry,
  PortableBattleCombatantPreset,
  PlaceCharacterOnBattleRequest,
  UpdateBattleCombatantRequest,
  UpdateBattleCombatantPresetRequest,
  UpdateBattleSceneObjectRequest,
  UpdateBattleSceneRequest,
} from '@fog-of-lore/contracts';
import {
  BATTLE_SYSTEM_ASSET_PACK,
  battleSystemAssetById,
  battleSystemAssetsFor,
  defaultBattleSystemAssetId,
  findBattleReachableCells,
  type BattleSystemAsset,
} from '@fog-of-lore/domain';
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
import {
  cellStyle,
  drawnRectangle,
  formatSaveDate,
  initials,
  nextUnusedTokenColor,
} from './battle-utils';
import {
  backgroundPresetById,
  backgroundPresetImageUrl,
  backgroundPresets,
  defaultBackgroundPreset,
  enemyPresetsByTerrain,
  environmentPresetsByTerrain,
  obstacleMaterialUrl,
  terrainLabels,
  type TerrainTheme,
} from './battle-presets';

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
  systemAssetId: null,
};

const initialTerrainSettings: Pick<
  CreateBattleObstacleRequest,
  'kind' | 'movementCost' | 'systemAssetId'
> = {
  kind: 'WALL',
  movementCost: 2,
  systemAssetId: defaultBattleSystemAssetId('OBSTACLE', 'FOREST', 0),
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
    systemAssetId: null,
    showLabel: false,
  };

type RandomMapTerrain = GenerateRandomBattleMapRequest['terrain'];
type RandomMapSize = GenerateRandomBattleMapRequest['size'];
type RandomMapDanger = GenerateRandomBattleMapRequest['danger'];
type RandomMapObjective = GenerateRandomBattleMapRequest['objective'];
type RandomMapStartingZones = GenerateRandomBattleMapRequest['startingZones'];
type RandomMapDensity = GenerateRandomBattleMapRequest['obstacleDensity'];
type RandomMapLighting = GenerateRandomBattleMapRequest['lighting'];
type RandomMapWeather = GenerateRandomBattleMapRequest['weather'];
type RandomMapEnemy = GenerateRandomBattleMapRequest['enemies'][number];

const randomMapTerrainLabels: Record<RandomMapTerrain, string> = {
  RANDOM: 'Случайная',
  FOREST: 'Лес',
  RUINS: 'Руины',
  DUNGEON: 'Подземелье',
  CAVE: 'Пещера',
  SWAMP: 'Болото',
  DESERT: 'Пустыня',
  SNOW: 'Снег и лёд',
  URBAN: 'Город',
};

const randomMapSizeLabels: Record<RandomMapSize, string> = {
  SMALL: 'Маленькая · 12×8',
  MEDIUM: 'Средняя · 16×10',
  LARGE: 'Большая · 24×16',
};

const randomMapShapeLabels: Record<BattleSceneShape, string> = {
  RECTANGLE: 'Прямоугольник',
  CIRCLE: 'Круг',
  HEXAGON: 'Шестиугольник',
  OCTAGON: 'Восьмиугольник',
};

const randomMapDangerLabels: Record<RandomMapDanger, string> = {
  LOW: 'Низкая',
  MEDIUM: 'Средняя',
  HIGH: 'Высокая',
  DEADLY: 'Смертельная',
};

const randomMapObjectiveLabels: Record<RandomMapObjective, string> = {
  SKIRMISH: 'Схватка',
  DEFEND: 'Оборона',
  ESCAPE: 'Побег',
  RESCUE: 'Спасение',
  CAPTURE: 'Захват точки',
  EXPLORE: 'Исследование',
};

const randomMapStartingLabels: Record<RandomMapStartingZones, string> = {
  OPPOSITE: 'На противоположных сторонах',
  ADJACENT: 'Близко друг к другу',
  SURROUNDED: 'Игроки в окружении',
  RANDOM: 'Случайно',
};

const randomMapDensityLabels: Record<RandomMapDensity, string> = {
  SPARSE: 'Редкие препятствия',
  BALANCED: 'Сбалансированная',
  DENSE: 'Плотная',
};

const randomMapLightingLabels: Record<RandomMapLighting, string> = {
  BRIGHT: 'Яркий свет',
  DIM: 'Сумерки',
  DARK: 'Темнота',
};

const randomMapWeatherLabels: Record<RandomMapWeather, string> = {
  CLEAR: 'Ясно',
  RAIN: 'Дождь',
  FOG: 'Туман',
  SNOW: 'Снег',
  STORM: 'Буря',
};

const initialRandomMap: GenerateRandomBattleMapRequest = {
  name: 'Случайная карта',
  description: '',
  terrain: 'RANDOM',
  size: 'MEDIUM',
  shape: 'RECTANGLE',
  playerCount: 4,
  enemies: [],
  danger: 'MEDIUM',
  objective: 'SKIRMISH',
  startingZones: 'OPPOSITE',
  obstacleDensity: 'BALANCED',
  difficultTerrain: true,
  lighting: 'BRIGHT',
  weather: 'CLEAR',
  entrances: 2,
  interactiveObjects: true,
  hazards: false,
};

const initialManualScene: CreateBattleSceneRequest = {
  name: 'Новая карта',
  gridColumns: 16,
  gridRows: 10,
  shape: 'RECTANGLE',
  terrainTheme: 'FOREST',
  backgroundPreset: 'FOREST_CLEARING',
  lightingTheme: 'BRIGHT',
  weatherTheme: 'CLEAR',
};

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
  const presetsKey = useMemo(
    () => ['campaign-battle-combatant-presets', params.campaignId] as const,
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
  const [playerToolbarOpen, setPlayerToolbarOpen] = useState(false);
  const [randomMapWizardOpen, setRandomMapWizardOpen] = useState(false);
  const [manualMapWizardOpen, setManualMapWizardOpen] = useState(false);
  const [generatedMapDetails, setGeneratedMapDetails] = useState<
    GeneratedRandomBattleMap['generation'] | null
  >(null);
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
  const presetsQuery = useQuery({
    queryKey: presetsKey,
    queryFn: () =>
      apiRequest<BattleCombatantPreset[]>(
        `/campaigns/${params.campaignId}/battle-combatant-presets`,
      ),
    enabled: campaignQuery.isSuccess && canEdit,
  });
  const charactersQuery = useQuery({
    queryKey: ['campaign-characters', params.campaignId],
    queryFn: () =>
      apiRequest<CampaignCharacterSheetsResponse>(`/campaigns/${params.campaignId}/characters`),
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
    mutationFn: (input: CreateBattleSceneRequest) =>
      apiRequest<BattleSceneSnapshot>(`/campaigns/${params.campaignId}/battle`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (snapshot) => {
      replaceSnapshot(snapshot);
      setGeneratedMapDetails(null);
      setManualMapWizardOpen(false);
    },
  });
  const generateRandomMap = useMutation({
    mutationFn: (input: GenerateRandomBattleMapRequest) =>
      apiRequest<GeneratedRandomBattleMap>(`/campaigns/${params.campaignId}/battle/generate`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (result) => {
      replaceSnapshot(result);
      setGeneratedMapDetails(result.generation);
      setRandomMapWizardOpen(false);
    },
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
  const placeCharacter = useMutation({
    mutationFn: ({
      sceneId,
      sheetId,
      input,
    }: {
      sceneId: string;
      sheetId: string;
      input: PlaceCharacterOnBattleRequest;
    }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scenes/${sceneId}/characters/${sheetId}/place`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: replaceSnapshot,
  });
  const saveCombatantPreset = useMutation({
    mutationFn: (combatant: BattleCombatant) =>
      apiRequest<BattleCombatantPreset>(`/battle-combatants/${combatant.id}/preset`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
  const importCombatantPreset = useMutation({
    mutationFn: ({
      sceneId,
      presetId,
      input,
    }: {
      sceneId: string;
      presetId: string;
      input: ImportBattleCombatantPresetRequest;
    }) =>
      apiRequest<BattleSceneSnapshot>(
        `/battle-scenes/${sceneId}/combatant-presets/${presetId}/import`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: replaceSnapshot,
  });
  const updateCombatantPreset = useMutation({
    mutationFn: ({
      presetId,
      input,
    }: {
      presetId: string;
      input: UpdateBattleCombatantPresetRequest;
    }) =>
      apiRequest<BattleCombatantPreset>(`/battle-combatant-presets/${presetId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
  const duplicateCombatantPreset = useMutation({
    mutationFn: (preset: BattleCombatantPreset) =>
      apiRequest<BattleCombatantPreset>(`/battle-combatant-presets/${preset.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: `${preset.name} — копия` }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
  const exportCombatantPreset = useMutation({
    mutationFn: (preset: BattleCombatantPreset) =>
      apiRequest<PortableBattleCombatantPreset>(`/battle-combatant-presets/${preset.id}/export`),
    onSuccess: (portable) => {
      const blob = new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${portable.preset.name.replace(/[^a-zа-яё0-9_-]+/gi, '-') || 'battle-preset'}.fol-battle.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const importPortableCombatantPreset = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 950_000) {
        throw new Error('Файл слишком большой. Максимум — 950 КБ.');
      }
      let preset: unknown;
      try {
        preset = JSON.parse(await file.text());
      } catch {
        throw new Error('Это не JSON-файл боевого пресета Fog of Lore.');
      }
      return apiRequest<BattleCombatantPreset>(
        `/campaigns/${params.campaignId}/battle-combatant-presets/import`,
        { method: 'POST', body: JSON.stringify({ preset }) },
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
  const saveCharacterSheetPreset = useMutation({
    mutationFn: (sheetId: string) =>
      apiRequest<BattleCombatantPreset>(`/characters/${sheetId}/battle-combatant-preset`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
  const removeCombatantPreset = useMutation({
    mutationFn: (presetId: string) =>
      apiRequest<void>(`/battle-combatant-presets/${presetId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: presetsKey }),
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
  const updateObstacle = useMutation({
    mutationFn: ({
      obstacle,
      systemAssetId,
    }: {
      obstacle: BattleObstacle;
      systemAssetId: string | null;
    }) =>
      apiRequest<BattleSceneSnapshot>(`/battle-scene-obstacles/${obstacle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedRevision: obstacle.revision, systemAssetId }),
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
    onSuccess: (snapshot) => {
      replaceSnapshot(snapshot);
      setGeneratedMapDetails(null);
    },
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
    mutationFn: ({
      combatant,
      input,
    }: {
      combatant: BattleCombatant;
      input: UpdateBattleCombatantRequest;
    }) =>
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
      setGeneratedMapDetails(null);
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
      setNewCombatant((current) => ({
        ...current,
        imageAttachmentId: attachment.id,
        systemAssetId: null,
      }));
      void queryClient.invalidateQueries({ queryKey: ['campaign-lore', params.campaignId] });
    },
  });
  const uploadObjectImage = useMutation({
    mutationFn: (file: File) => uploadBattleAsset(file, 'Окружение поля боя'),
    onSuccess: (attachment) => {
      setObjectSettings((current) => ({
        ...current,
        imageAttachmentId: attachment.id,
        systemAssetId: null,
      }));
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
        void queryClient.invalidateQueries({ queryKey: presetsKey });
      }
    });
    return () => {
      socket.close();
    };
  }, [battleKey, campaignQuery.isSuccess, params.campaignId, presetsKey, queryClient, savesKey]);

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
            <div className="battle-empty-actions">
              <Button
                disabled={generateRandomMap.isPending}
                onClick={() => setRandomMapWizardOpen(true)}
              >
                Создать карту быстро
              </Button>
              <Button
                disabled={createScene.isPending || generateRandomMap.isPending}
                onClick={() => setManualMapWizardOpen(true)}
                tone="quiet"
              >
                Создать вручную
              </Button>
            </div>
          ) : null}
          {createScene.isError ? (
            <p className="form-error">{readableError(createScene.error)}</p>
          ) : null}
          {randomMapWizardOpen ? (
            <RandomMapWizard
              error={generateRandomMap.error}
              onClose={() => {
                if (!generateRandomMap.isPending) setRandomMapWizardOpen(false);
              }}
              onGenerate={(input) => generateRandomMap.mutate(input)}
              pending={generateRandomMap.isPending}
            />
          ) : null}
          {manualMapWizardOpen ? (
            <ManualMapWizard
              error={createScene.error}
              onClose={() => {
                if (!createScene.isPending) setManualMapWizardOpen(false);
              }}
              onCreate={(input) => createScene.mutate(input)}
              pending={createScene.isPending}
            />
          ) : null}
        </section>
      </main>
    );
  }

  const editorTerrainTheme: TerrainTheme =
    scene.terrainTheme ?? backgroundPresetById(scene.backgroundPreset)?.terrain ?? 'FOREST';

  return (
    <main className={`battle-shell ${canEdit ? 'is-master' : 'is-player'}`}>
      {canEdit ? (
        <CampaignNavigation campaignId={params.campaignId} role={campaignQuery.data.role} />
      ) : null}
      <section className="battle-stage-column">
        {!canEdit ? (
          <button
            aria-expanded={playerToolbarOpen}
            className="battle-player-toolbar-toggle"
            onClick={() => setPlayerToolbarOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true">☰</span>
            {playerToolbarOpen ? 'Скрыть панель' : `Раунд ${scene.round} · Показать панель`}
          </button>
        ) : null}
        <header
          className={`battle-toolbar ${!canEdit && !playerToolbarOpen ? 'is-collapsed' : ''}`}
        >
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

        <BattleInitiativeBar
          activeCombatantId={scene.activeCombatantId}
          combatants={snapshot.combatants}
          round={scene.round}
          tokens={snapshot.tokens}
        />

        {generatedMapDetails ? (
          <section className="battle-generation-notice" aria-live="polite">
            <div>
              <strong>Черновик создан генератором</strong>
              <span>{generatedMapDetails.summary}</span>
            </div>
            <code>seed: {generatedMapDetails.seed}</code>
          </section>
        ) : null}

        {canEdit ? (
          <>
            <section className="battle-scene-settings">
              <label className="battle-built-in-background">
                Встроенный пейзаж
                <select
                  disabled={updateScene.isPending}
                  onChange={(event) => {
                    const id = event.target.value as BattleBackgroundPreset;
                    const preset = backgroundPresetById(id);
                    if (!preset) return;
                    updateScene.mutate({
                      sceneId: scene.id,
                      input: {
                        expectedRevision: scene.revision,
                        backgroundAttachmentId: null,
                        backgroundPreset: preset.id,
                        terrainTheme: preset.terrain,
                      },
                    });
                  }}
                  value={scene.backgroundPreset ?? ''}
                >
                  <option disabled value="">
                    Выберите пейзаж
                  </option>
                  {(Object.keys(terrainLabels) as TerrainTheme[]).map((terrain) => (
                    <optgroup key={terrain} label={terrainLabels[terrain]}>
                      {backgroundPresets
                        .filter((preset) => preset.terrain === terrain)
                        .map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
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
            if (scene.status === 'LIVE' && !canEdit) {
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
          onMoveToken={(token, x, y) => moveToken.mutate({ token, x, y })}
          onSelectToken={(token) => {
            const combatant = snapshot.combatants.find(({ id }) => id === token.combatantId);
            const canSelect =
              canEdit || (token.ownerUserId !== null && scene.activeCombatantId === combatant?.id);
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
          onQuickAdjustCombatant={(combatant, mode) =>
            quickAdjustCombatant.mutate({ combatant, mode })
          }
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
                    onSavePreset={(value) => saveCombatantPreset.mutate(value)}
                    onUploadImage={async (file) => {
                      const attachment = await uploadBattleAsset(file, 'Изображение врага');
                      void queryClient.invalidateQueries({
                        queryKey: ['campaign-lore', params.campaignId],
                      });
                      return attachment;
                    }}
                    token={snapshot.tokens.find(({ combatantId }) => combatantId === combatant.id)}
                    savingPreset={saveCombatantPreset.isPending}
                    terrain={editorTerrainTheme}
                  />
                ))}
            </details>
          ) : null}
          <details className="battle-master-drawer" open>
            <summary>Местность</summary>
            <BattleTerrainPanel
              drawing={drawingTerrain}
              error={addObstacle.error ?? updateObstacle.error ?? removeObstacle.error}
              input={terrainSettings}
              onChange={setTerrainSettings}
              onDrawingChange={(drawing) => {
                setDrawingTerrain(drawing);
                if (drawing) setDrawingObject(false);
              }}
              onRemove={(obstacle) => removeObstacle.mutate(obstacle.id)}
              onAssetChange={(obstacle, systemAssetId) =>
                updateObstacle.mutate({ obstacle, systemAssetId })
              }
              obstacles={snapshot.obstacles}
              pending={
                addObstacle.isPending || removeObstacle.isPending || updateObstacle.isPending
              }
              terrain={editorTerrainTheme}
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
                  input: {
                    expectedRevision: object.revision,
                    imageAttachmentId,
                    systemAssetId: null,
                  },
                })
              }
              onAssetChange={(object, systemAssetId) =>
                updateSceneObject.mutate({
                  objectId: object.id,
                  input: {
                    expectedRevision: object.revision,
                    imageAttachmentId: null,
                    systemAssetId,
                  },
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
              terrain={editorTerrainTheme}
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
            <summary>Сохранённые персонажи</summary>
            <CombatantPresetPanel
              error={
                presetsQuery.error ??
                charactersQuery.error ??
                saveCombatantPreset.error ??
                saveCharacterSheetPreset.error ??
                placeCharacter.error ??
                importCombatantPreset.error ??
                importPortableCombatantPreset.error ??
                exportCombatantPreset.error ??
                updateCombatantPreset.error ??
                duplicateCombatantPreset.error ??
                removeCombatantPreset.error
              }
              characters={charactersQuery.data?.sheets ?? []}
              loading={presetsQuery.isPending}
              members={membersQuery.data?.members ?? []}
              onDelete={(preset) => {
                if (window.confirm(`Удалить сохранённого персонажа «${preset.name}»?`)) {
                  removeCombatantPreset.mutate(preset.id);
                }
              }}
              onDuplicate={(preset) => duplicateCombatantPreset.mutate(preset)}
              onExport={(preset) => exportCombatantPreset.mutate(preset)}
              onImport={(preset, input) =>
                importCombatantPreset.mutateAsync({ sceneId: scene.id, presetId: preset.id, input })
              }
              onImportFile={(file) => importPortableCombatantPreset.mutateAsync(file)}
              onSaveCharacter={(sheetId) => saveCharacterSheetPreset.mutate(sheetId)}
              onPlaceCharacter={(sheetId) =>
                placeCharacter.mutateAsync({
                  sceneId: scene.id,
                  sheetId,
                  input: { size: 1, color: '#7c5cff' },
                })
              }
              onUpdate={(preset, input) =>
                updateCombatantPreset.mutateAsync({ presetId: preset.id, input })
              }
              pending={
                importCombatantPreset.isPending ||
                importPortableCombatantPreset.isPending ||
                exportCombatantPreset.isPending ||
                updateCombatantPreset.isPending ||
                duplicateCombatantPreset.isPending ||
                saveCharacterSheetPreset.isPending ||
                placeCharacter.isPending ||
                removeCombatantPreset.isPending
              }
              presets={presetsQuery.data ?? []}
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
              terrain={editorTerrainTheme}
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
                  onSavePreset={(value) => saveCombatantPreset.mutate(value)}
                  onUploadImage={async (file) => {
                    const attachment = await uploadBattleAsset(file, 'Изображение врага');
                    void queryClient.invalidateQueries({
                      queryKey: ['campaign-lore', params.campaignId],
                    });
                    return attachment;
                  }}
                  token={snapshot.tokens.find(({ combatantId }) => combatantId === combatant.id)}
                  savingPreset={saveCombatantPreset.isPending}
                  terrain={editorTerrainTheme}
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
  onMoveToken,
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
  onMoveToken: (token: BattleToken, x: number, y: number) => void;
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
  onQuickUpdateCombatant: (combatant: BattleCombatant, input: UpdateBattleCombatantRequest) => void;
  members: CampaignMembersResponse['members'];
  terrainTool: {
    kind: BattleObstacleKind;
    movementCost: number;
    systemAssetId: string | null;
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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    cell: { x: number; y: number };
    token?: BattleToken;
    object?: BattleSceneObject;
    obstacle?: BattleObstacle;
  } | null>(null);
  const [quickCreate, setQuickCreate] = useState<{
    kind: QuickCreateKind;
    cell: { x: number; y: number };
  } | null>(null);
  const [quickCombatant, setQuickCombatant] =
    useState<CreateBattleCombatantRequest>(initialCombatant);
  const [quickObject, setQuickObject] = useState(initialObjectSettings);
  const [quickObstacle, setQuickObstacle] = useState<CreateBattleObstacleRequest>({
    kind: 'OBSTACLE',
    movementCost: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    systemAssetId: null,
  });
  const previousTokenState = useRef(
    new Map<
      string,
      {
        x: number;
        y: number;
        hp: number | null;
        hpPercent: number | null;
        hpState: string | null;
        revision: number;
      }
    >(),
  );
  const previousObjectState = useRef(
    new Map<
      string,
      { hp: number | null; hpPercent: number | null; hpState: string | null; revision: number }
    >(),
  );
  const [tokenEffects, setTokenEffects] = useState<Record<string, 'move' | 'damage' | 'heal'>>({});
  const [objectEffects, setObjectEffects] = useState<Record<string, 'damage' | 'heal'>>({});
  const boardFrame = useRef<HTMLDivElement>(null);
  const boardSurface = useRef<HTMLDivElement>(null);
  const [terrainStart, setTerrainStart] = useState<{ x: number; y: number } | null>(null);
  const [terrainEnd, setTerrainEnd] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const tokenDrag = useRef<{
    pointerId: number;
    token: BattleToken;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressTokenClick = useRef('');
  const [draggedToken, setDraggedToken] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const didPan = useRef(false);
  const combatantsById = new Map(combatants.map((item) => [item.id, item]));
  useEffect(() => {
    const next = new Map<
      string,
      {
        x: number;
        y: number;
        hp: number | null;
        hpPercent: number | null;
        hpState: string | null;
        revision: number;
      }
    >();
    const effects: Record<string, 'move' | 'damage' | 'heal'> = {};
    tokens.forEach((token) => {
      const combatant = combatantsById.get(token.combatantId);
      if (!combatant) return;
      const previous = previousTokenState.current.get(token.id);
      next.set(token.id, {
        x: token.x,
        y: token.y,
        hp: combatant.currentHp,
        hpPercent: combatant.hpPercent,
        hpState: combatant.hpState,
        revision: combatant.revision,
      });
      if (previous) {
        if (previous.x !== token.x || previous.y !== token.y) effects[token.id] = 'move';
        else if (
          (combatant.currentHp !== null &&
            previous.hp !== null &&
            combatant.currentHp < previous.hp) ||
          (combatant.hpPercent !== null &&
            previous.hpPercent !== null &&
            combatant.hpPercent < previous.hpPercent) ||
          (combatant.hpState !== null &&
            combatant.hpState !== previous.hpState &&
            combatant.hpState !== 'UNHARMED')
        )
          effects[token.id] = 'damage';
        else if (
          (combatant.currentHp !== null &&
            previous.hp !== null &&
            combatant.currentHp > previous.hp) ||
          (combatant.hpPercent !== null &&
            previous.hpPercent !== null &&
            combatant.hpPercent > previous.hpPercent) ||
          (combatant.hpState === 'UNHARMED' && previous.hpState !== 'UNHARMED')
        )
          effects[token.id] = 'heal';
        else if (combatant.revision !== previous.revision) effects[token.id] = 'damage';
      }
    });
    previousTokenState.current = next;
    if (!Object.keys(effects).length) return;
    setTokenEffects(effects);
    const timeout = window.setTimeout(() => setTokenEffects({}), 650);
    return () => window.clearTimeout(timeout);
  }, [combatants, tokens]);
  useEffect(() => {
    const next = new Map<
      string,
      { hp: number | null; hpPercent: number | null; hpState: string | null; revision: number }
    >();
    const effects: Record<string, 'damage' | 'heal'> = {};
    objects.forEach((object) => {
      const previous = previousObjectState.current.get(object.id);
      next.set(object.id, {
        hp: object.currentHp,
        hpPercent: object.hpPercent,
        hpState: object.hpState,
        revision: object.revision,
      });
      if (!previous) return;
      if (
        (object.currentHp !== null && previous.hp !== null && object.currentHp < previous.hp) ||
        (object.hpPercent !== null &&
          previous.hpPercent !== null &&
          object.hpPercent < previous.hpPercent) ||
        (object.hpState !== null &&
          object.hpState !== previous.hpState &&
          object.hpState !== 'UNHARMED')
      )
        effects[object.id] = 'damage';
      else if (
        (object.currentHp !== null && previous.hp !== null && object.currentHp > previous.hp) ||
        (object.hpPercent !== null &&
          previous.hpPercent !== null &&
          object.hpPercent > previous.hpPercent) ||
        (object.hpState === 'UNHARMED' && previous.hpState !== 'UNHARMED')
      )
        effects[object.id] = 'heal';
      else if (object.revision !== previous.revision && object.currentHp !== null)
        effects[object.id] = 'damage';
    });
    previousObjectState.current = next;
    if (!Object.keys(effects).length) return;
    setObjectEffects(effects);
    const timeout = window.setTimeout(() => setObjectEffects({}), 650);
    return () => window.clearTimeout(timeout);
  }, [objects]);
  const selectedToken = tokens.find(({ id }) => id === selectedTokenId);
  const remainingMovement = selectedCombatant
    ? canEdit
      ? Math.max(scene.gridColumns * scene.gridRows * 5, 1)
      : Math.max(0, selectedCombatant.speed - selectedCombatant.movementSpent)
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
  const resolvedTerrainTheme =
    scene.terrainTheme ?? inferTerrainTheme(scene.id, combatants, objects);
  const resolvedBackgroundPreset =
    backgroundPresetById(scene.backgroundPreset) ??
    defaultBackgroundPreset(resolvedTerrainTheme, stableVisualIndex(scene.id, 2));
  const backgroundUrl = scene.backgroundAttachmentId
    ? apiResourceUrl(`/battle-scenes/${scene.id}/background`)
    : undefined;
  const generatedBackground = !backgroundUrl
    ? generatedBattleBackground(scene, resolvedTerrainTheme)
    : undefined;
  const backgroundStyle = backgroundUrl
    ? ({ backgroundImage: `url("${backgroundUrl}")` } satisfies CSSProperties)
    : generatedBackground;
  const gridColor = useBattleGridColor(
    backgroundUrl ?? backgroundPresetImageUrl(resolvedBackgroundPreset),
  );
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
    const board = (event.currentTarget.closest('.battle-board') ??
      event.currentTarget) as HTMLElement;
    const boardRect = board.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(
        scene.gridColumns - 1,
        Math.floor(((event.clientX - boardRect.left) / boardRect.width) * scene.gridColumns),
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        scene.gridRows - 1,
        Math.floor(((event.clientY - boardRect.top) / boardRect.height) * scene.gridRows),
      ),
    );
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
    else if (kind === 'OBSTACLE')
      setQuickObstacle({
        kind: 'OBSTACLE',
        movementCost: 1,
        ...cell,
        width: 1,
        height: 1,
        systemAssetId: defaultBattleSystemAssetId('OBSTACLE', resolvedTerrainTheme, 1),
      });
    else
      setQuickCombatant({
        ...initialCombatant,
        kind,
        name: '',
        color: nextUnusedTokenColor(tokens),
        ...cell,
      });
    setQuickCreate({ kind, cell: contextMenu.cell });
    setContextMenu(null);
  };
  const submitQuickCreate = () => {
    if (!quickCreate) return;
    const { kind, cell } = quickCreate;
    if (kind === 'PROP') {
      onCreateObject({
        ...quickObject,
        name: quickObject.name.trim() || 'Объект',
        ...cell,
        width: 1,
        height: 1,
      });
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
  const canMoveToken = (token: BattleToken) => {
    if (canEdit) return true;
    const combatant = combatantsById.get(token.combatantId);
    return token.ownerUserId !== null && scene.activeCombatantId === combatant?.id;
  };
  const beginTokenDrag = (event: PointerEvent<HTMLButtonElement>, token: BattleToken) => {
    if (drawingTool) return;
    event.stopPropagation();
    if (moving || !canMoveToken(token) || (event.pointerType !== 'touch' && event.button !== 0))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    tokenDrag.current = {
      pointerId: event.pointerId,
      token,
      startX: event.clientX,
      startY: event.clientY,
      x: token.x,
      y: token.y,
      moved: false,
    };
    setDraggedToken({ id: token.id, x: token.x, y: token.y });
  };
  const dragToken = (event: PointerEvent<HTMLButtonElement>) => {
    const current = tokenDrag.current;
    if (!current || current.pointerId !== event.pointerId || !boardSurface.current) return;
    if (
      !current.moved &&
      Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 4
    )
      return;
    current.moved = true;
    event.preventDefault();
    event.stopPropagation();
    const cell = tokenCellFromBoardPoint(
      event.clientX,
      event.clientY,
      boardSurface.current,
      scene,
      current.token.size,
    );
    current.x = cell.x;
    current.y = cell.y;
    setDraggedToken({ id: current.token.id, ...cell });
  };
  const endTokenDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = tokenDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    tokenDrag.current = null;
    setDraggedToken(null);
    if (cancelled || !current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    suppressTokenClick.current = current.token.id;
    window.setTimeout(() => {
      if (suppressTokenClick.current === current.token.id) suppressTokenClick.current = '';
    }, 0);
    if (current.x !== current.token.x || current.y !== current.token.y) {
      onMoveToken(current.token, current.x, current.y);
    }
  };
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (drawingTool) return;
    if (
      (event.pointerType !== 'touch' && event.button !== 0) ||
      (event.target as HTMLElement).closest('.battle-token')
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
        systemAssetId: terrainTool.systemAssetId,
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
        {isFullscreen ? (
          <BattleInitiativeBar
            activeCombatantId={scene.activeCombatantId}
            combatants={combatants}
            round={scene.round}
            tokens={tokens}
          />
        ) : null}
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
            } ${objectTool ? 'is-drawing-object' : ''} ${`is-generated-terrain terrain-${resolvedTerrainTheme.toLowerCase()}`}`}
            onClick={(event) => {
              if (didPan.current) {
                didPan.current = false;
                return;
              }
              drawTerrain(event);
            }}
            onContextMenu={(event) => showContextMenu(event)}
            onPointerMove={updateTerrainEnd}
            ref={boardSurface}
            role="application"
            style={
              {
                ...backgroundStyle,
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
                style={{
                  ...cellStyle(
                    obstacle.x,
                    obstacle.y,
                    obstacle.width,
                    scene.gridColumns,
                    scene.gridRows,
                    obstacle.height,
                  ),
                  ...generatedObstacleStyle(
                    obstacle.kind,
                    resolvedTerrainTheme,
                    obstacle.systemAssetId,
                  ),
                }}
              />
            ))}
            {objects.map((object) => {
              const systemAsset = battleSystemAssetById(object.systemAssetId);
              const environmentSprite = generatedEnvironmentSprite(
                object.name,
                resolvedTerrainTheme,
              );
              return (
                <span
                  aria-label={object.name}
                  className={`battle-scene-object is-${object.kind.toLowerCase()} ${
                    object.currentHp === 0 ? 'is-destroyed' : ''
                  } ${object.hasImage ? 'has-image' : ''} ${object.imageAnimated ? 'is-animated' : ''} ${
                    objectEffects[object.id] ? `has-${objectEffects[object.id]}-effect` : ''
                  }`}
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
                  {systemAsset?.kind === 'PROP' ? (
                    <span
                      aria-hidden="true"
                      className="battle-generated-environment"
                      style={systemAssetStyle(systemAsset)}
                    />
                  ) : object.hasImage ? (
                    <img
                      alt=""
                      className="battle-scene-object-image"
                      src={apiResourceUrl(`/battle-scene-objects/${object.id}/image`)}
                    />
                  ) : environmentSprite !== null ? (
                    <span
                      aria-hidden="true"
                      className="battle-generated-environment"
                      style={atlasSpriteStyle(
                        environmentSprite,
                        4,
                        4,
                        '/assets/battle/environment-props-expanded-atlas.png',
                      )}
                    />
                  ) : null}
                  {!object.hasImage && environmentSprite === null ? (
                    <strong>{object.kind === 'CLUE' ? '?' : '◆'}</strong>
                  ) : null}
                  {object.showLabel ? <small>{object.name}</small> : null}
                  {object.currentHp !== null && object.maxHp !== null ? (
                    <em>{`${object.currentHp} / ${object.maxHp}`}</em>
                  ) : null}
                  {objectEffects[object.id] === 'damage' ? (
                    <b className="battle-object-feedback is-damage">− УРОН</b>
                  ) : null}
                  {objectEffects[object.id] === 'heal' ? (
                    <b className="battle-object-feedback is-heal">+ ЛЕЧЕНИЕ</b>
                  ) : null}
                </span>
              );
            })}
            {tokens.map((token) => {
              const combatant = combatantsById.get(token.combatantId);
              if (!combatant) return null;
              const systemAsset = battleSystemAssetById(token.systemAssetId);
              const active = scene.activeCombatantId === combatant.id;
              const dragPosition = draggedToken?.id === token.id ? draggedToken : token;
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
                    if (suppressTokenClick.current === token.id) {
                      suppressTokenClick.current = '';
                      return;
                    }
                    onSelectToken(token);
                  }}
                  onContextMenu={(event) => showContextMenu(event, token)}
                  onPointerCancel={(event) => endTokenDrag(event, true)}
                  onPointerDown={(event) => beginTokenDrag(event, token)}
                  onPointerMove={dragToken}
                  onPointerUp={(event) => endTokenDrag(event)}
                  style={
                    {
                      ...cellStyle(
                        dragPosition.x,
                        dragPosition.y,
                        token.size,
                        scene.gridColumns,
                        scene.gridRows,
                      ),
                      '--token-color': token.color,
                    } as CSSProperties
                  }
                  type="button"
                >
                  <span className="battle-token-ring">
                    {systemAsset?.kind === 'TOKEN' && combatant.kind !== 'PLAYER' ? (
                      <span
                        aria-hidden="true"
                        className="battle-generated-enemy-portrait"
                        style={systemAssetStyle(systemAsset)}
                      />
                    ) : token.hasImage ? (
                      <img
                        alt=""
                        className="battle-token-image"
                        src={apiResourceUrl(`/battle-tokens/${token.id}/image`)}
                      />
                    ) : combatant.kind === 'MONSTER' ? (
                      <span
                        aria-hidden="true"
                        className="battle-generated-enemy-portrait"
                        style={atlasSpriteStyle(
                          generatedEnemyPortrait(combatant.name ?? ''),
                          4,
                          4,
                          '/assets/battle/enemy-portraits-expanded-atlas.png',
                        )}
                      />
                    ) : (
                      <span>{initials(combatant.name)}</span>
                    )}
                  </span>
                  {tokenEffects[token.id] === 'damage' ? (
                    <span className="battle-token-feedback is-damage">− УРОН</span>
                  ) : null}
                  {tokenEffects[token.id] === 'heal' ? (
                    <span className="battle-token-feedback is-heal">+ ЛЕЧЕНИЕ</span>
                  ) : null}
                  {tokenEffects[token.id] === 'move' ? (
                    <span className="battle-token-feedback is-move">↗</span>
                  ) : null}
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
              <button
                onClick={() => {
                  onSelectToken(contextMenu.token!);
                  setContextMenu(null);
                }}
                type="button"
              >
                Выбрать
              </button>
              {canEdit ? (
                <>
                  <button
                    onClick={() => {
                      onOpenCombatantSettings(contextMenu.token!);
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    Настройки юнита
                  </button>
                  <button
                    onClick={() => {
                      const combatant = combatantsById.get(contextMenu.token!.combatantId);
                      if (combatant) onQuickAdjustCombatant(combatant, 'DAMAGE');
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    Быстро: −5 HP
                  </button>
                  <button
                    onClick={() => {
                      const combatant = combatantsById.get(contextMenu.token!.combatantId);
                      if (combatant) onQuickAdjustCombatant(combatant, 'HEAL');
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    Быстро: +5 HP
                  </button>
                  <button
                    onClick={() => {
                      const combatant = combatantsById.get(contextMenu.token!.combatantId);
                      if (combatant)
                        onQuickUpdateCombatant(combatant, {
                          expectedRevision: combatant.revision,
                          hidden: !combatant.hidden,
                        });
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    {combatantsById.get(contextMenu.token.combatantId)?.hidden
                      ? 'Показать токен'
                      : 'Скрыть токен'}
                  </button>
                  <button
                    onClick={() => {
                      const combatant = combatantsById.get(contextMenu.token!.combatantId);
                      if (combatant)
                        onQuickUpdateCombatant(combatant, {
                          expectedRevision: combatant.revision,
                          nameVisibility:
                            combatant.nameVisibility === 'HIDDEN' ? 'EXACT' : 'HIDDEN',
                        });
                      setContextMenu(null);
                    }}
                    type="button"
                  >
                    {combatantsById.get(contextMenu.token.combatantId)?.nameVisibility === 'HIDDEN'
                      ? 'Показать имя'
                      : 'Скрыть имя'}
                  </button>
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
              <strong>
                Создать в клетке {contextMenu.cell.x + 1}, {contextMenu.cell.y + 1}
              </strong>
              <button onClick={() => startQuickCreate('MONSTER')} type="button">
                Враг
              </button>
              <button onClick={() => startQuickCreate('NPC')} type="button">
                NPC
              </button>
              <button onClick={() => startQuickCreate('ALLY')} type="button">
                Союзник
              </button>
              <button onClick={() => startQuickCreate('PLAYER')} type="button">
                Игрок
              </button>
              <button onClick={() => startQuickCreate('PROP')} type="button">
                Объект окружения
              </button>
              <button onClick={() => startQuickCreate('OBSTACLE')} type="button">
                Препятствие
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {quickCreate ? (
        <div className="battle-quick-create" role="dialog" aria-modal="true">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitQuickCreate();
            }}
          >
            <strong>
              {quickCreate.kind === 'PROP'
                ? 'Новый объект'
                : quickCreate.kind === 'OBSTACLE'
                  ? 'Новое препятствие'
                  : `Новый: ${kindLabels[quickCreate.kind]}`}
            </strong>
            {quickCreate.kind === 'PROP' ? (
              <>
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setQuickObject({ ...quickObject, name: event.target.value })}
                  placeholder="Название"
                  value={quickObject.name}
                />
                <label>
                  <input
                    checked={quickObject.blocksMovement}
                    onChange={(event) =>
                      setQuickObject({ ...quickObject, blocksMovement: event.target.checked })
                    }
                    type="checkbox"
                  />{' '}
                  Блокирует проход
                </label>
                <label>
                  <input
                    checked={quickObject.visibleToPlayers}
                    onChange={(event) =>
                      setQuickObject({ ...quickObject, visibleToPlayers: event.target.checked })
                    }
                    type="checkbox"
                  />{' '}
                  Видно игрокам
                </label>
                <label>
                  <input
                    checked={quickObject.showLabel}
                    onChange={(event) =>
                      setQuickObject({ ...quickObject, showLabel: event.target.checked })
                    }
                    type="checkbox"
                  />{' '}
                  Показывать подпись
                </label>
              </>
            ) : quickCreate.kind === 'OBSTACLE' ? (
              <>
                <label>
                  Тип
                  <select
                    onChange={(event) =>
                      setQuickObstacle({
                        ...quickObstacle,
                        kind: event.target.value as BattleObstacleKind,
                      })
                    }
                    value={quickObstacle.kind}
                  >
                    <option value="OBSTACLE">Препятствие</option>
                    <option value="WALL">Стена</option>
                    <option value="DIFFICULT_TERRAIN">Трудная местность</option>
                  </select>
                </label>
                <label>
                  Цена движения
                  <input
                    max={5}
                    min={1}
                    onChange={(event) =>
                      setQuickObstacle({
                        ...quickObstacle,
                        movementCost: Number(event.target.value),
                      })
                    }
                    type="number"
                    value={quickObstacle.movementCost}
                  />
                </label>
              </>
            ) : (
              <>
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) =>
                    setQuickCombatant({ ...quickCombatant, name: event.target.value })
                  }
                  placeholder="Название"
                  value={quickCombatant.name}
                />
                <div className="battle-quick-grid">
                  <label>
                    HP
                    <input
                      min={0}
                      onChange={(event) =>
                        setQuickCombatant({
                          ...quickCombatant,
                          currentHp: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={quickCombatant.currentHp}
                    />
                  </label>
                  <label>
                    Макс. HP
                    <input
                      min={1}
                      onChange={(event) =>
                        setQuickCombatant({ ...quickCombatant, maxHp: Number(event.target.value) })
                      }
                      type="number"
                      value={quickCombatant.maxHp}
                    />
                  </label>
                  <label>
                    КД
                    <input
                      onChange={(event) =>
                        setQuickCombatant({
                          ...quickCombatant,
                          armorClass: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      type="number"
                      value={quickCombatant.armorClass ?? ''}
                    />
                  </label>
                  <label>
                    Скорость
                    <input
                      min={0}
                      onChange={(event) =>
                        setQuickCombatant({ ...quickCombatant, speed: Number(event.target.value) })
                      }
                      type="number"
                      value={quickCombatant.speed}
                    />
                  </label>
                  <label>
                    Инициатива
                    <input
                      onChange={(event) =>
                        setQuickCombatant({
                          ...quickCombatant,
                          initiative: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={quickCombatant.initiative}
                    />
                  </label>
                  <label>
                    Цвет (свободный по умолчанию)
                    <input
                      onChange={(event) =>
                        setQuickCombatant({ ...quickCombatant, color: event.target.value })
                      }
                      type="color"
                      value={quickCombatant.color}
                    />
                    <output className="battle-color-preview">
                      <span style={{ backgroundColor: quickCombatant.color }} />
                      <code>{quickCombatant.color.toUpperCase()}</code>
                      <small>Свободен при открытии формы</small>
                    </output>
                  </label>
                </div>
                <label>
                  Класс / роль
                  <input
                    maxLength={120}
                    onChange={(event) =>
                      setQuickCombatant({ ...quickCombatant, className: event.target.value })
                    }
                    value={quickCombatant.className}
                  />
                </label>
                <label>
                  Вид / раса
                  <input
                    maxLength={120}
                    onChange={(event) =>
                      setQuickCombatant({ ...quickCombatant, species: event.target.value })
                    }
                    value={quickCombatant.species}
                  />
                </label>
                {quickCreate.kind === 'PLAYER' ? (
                  <label>
                    Владелец
                    <select
                      onChange={(event) =>
                        setQuickCombatant({
                          ...quickCombatant,
                          ownerUserId: event.target.value || null,
                        })
                      }
                      value={quickCombatant.ownerUserId ?? ''}
                    >
                      <option value="">Выберите игрока</option>
                      {members
                        .filter(({ role }) => role === 'PLAYER')
                        .map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.displayName}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  <input
                    checked={quickCombatant.hidden}
                    onChange={(event) =>
                      setQuickCombatant({ ...quickCombatant, hidden: event.target.checked })
                    }
                    type="checkbox"
                  />{' '}
                  Скрыть токен
                </label>
              </>
            )}
            <small>
              Клетка {quickCreate.cell.x + 1}, {quickCreate.cell.y + 1}
            </small>
            <div>
              <button onClick={() => setQuickCreate(null)} type="button">
                Отмена
              </button>
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
              ? canEdit
                ? 'Выберите клетку назначения · мастер может перемещать любого участника'
                : `Выберите клетку назначения · доступно ${remainingMovement}`
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
  terrain,
  onChange,
  onDrawingChange,
  onAssetChange,
  onRemove,
}: {
  input: Pick<CreateBattleObstacleRequest, 'kind' | 'movementCost' | 'systemAssetId'>;
  obstacles: BattleObstacle[];
  pending: boolean;
  drawing: boolean;
  error: unknown;
  terrain: TerrainTheme;
  onChange: (
    input: Pick<CreateBattleObstacleRequest, 'kind' | 'movementCost' | 'systemAssetId'>,
  ) => void;
  onDrawingChange: (drawing: boolean) => void;
  onAssetChange: (obstacle: BattleObstacle, systemAssetId: string | null) => void;
  onRemove: (obstacle: BattleObstacle) => void;
}) {
  const materialAssets = battleSystemAssetsFor('OBSTACLE', terrain);
  return (
    <section className="battle-terrain-panel">
      <div>
        <p className="eyebrow">Местность</p>
        <h2>Препятствия</h2>
      </div>
      <div
        className="battle-built-in-preset-strip"
        aria-label={`Материалы: ${terrainLabels[terrain]}`}
      >
        {materialAssets.map((asset) => {
          const kind = asset.id.endsWith('.wall') ? 'WALL' : 'OBSTACLE';
          return (
            <button
              className={input.systemAssetId === asset.id ? 'is-selected' : ''}
              key={asset.id}
              onClick={() => onChange({ ...input, kind, systemAssetId: asset.id })}
              type="button"
            >
              <SystemAssetPreview asset={asset} />
              {asset.label}
            </button>
          );
        })}
      </div>
      <AssetPackNote />
      <div className="battle-form-row">
        <label>
          Тип
          <select
            onChange={(event) => {
              const kind = event.target.value as BattleObstacleKind;
              onChange({
                ...input,
                kind,
                systemAssetId:
                  kind === 'DIFFICULT_TERRAIN'
                    ? null
                    : defaultBattleSystemAssetId('OBSTACLE', terrain, kind === 'WALL' ? 0 : 1),
              });
            }}
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
              <select
                aria-label={`Встроенный материал ${obstacle.kind}`}
                disabled={pending || obstacle.kind === 'DIFFICULT_TERRAIN'}
                onChange={(event) => onAssetChange(obstacle, event.target.value || null)}
                value={obstacle.systemAssetId ?? ''}
              >
                <option value="">Без материала</option>
                {materialAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.label}
                  </option>
                ))}
              </select>
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
  terrain,
  onChange,
  onDrawingChange,
  onToggleVisible,
  onToggleLabel,
  onToggleBlocks,
  onHpChange,
  onAssetChange,
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
  terrain: TerrainTheme;
  onChange: (input: Omit<CreateBattleSceneObjectRequest, 'x' | 'y' | 'width' | 'height'>) => void;
  onDrawingChange: (drawing: boolean) => void;
  onToggleVisible: (object: BattleSceneObject) => void;
  onToggleLabel: (object: BattleSceneObject) => void;
  onToggleBlocks: (object: BattleSceneObject) => void;
  onHpChange: (object: BattleSceneObject, mode: 'DAMAGE' | 'HEAL') => void;
  onAssetChange: (object: BattleSceneObject, systemAssetId: string | null) => void;
  onImageChange: (object: BattleSceneObject, imageAttachmentId: string | null) => void;
  onRemove: (object: BattleSceneObject) => void;
  onUploadImage: (file: File) => void;
}) {
  const destructible = input.currentHp !== null && input.maxHp !== null;
  const systemAssets = battleSystemAssetsFor('PROP', terrain);
  return (
    <section className="battle-objects-panel">
      <div>
        <p className="eyebrow">Окружение</p>
        <h2>Предметы и зацепки</h2>
      </div>
      <label>
        Пресет окружения · {terrainLabels[terrain]}
        <select
          onChange={(event) => {
            const preset = environmentPresetsByTerrain[terrain].find(
              ({ name }) => name === event.target.value,
            );
            if (preset) {
              const index = environmentPresetsByTerrain[terrain].indexOf(preset);
              onChange({
                ...input,
                ...preset,
                imageAttachmentId: null,
                systemAssetId: defaultBattleSystemAssetId('PROP', terrain, index),
              });
            }
          }}
          value=""
        >
          <option value="">Выберите готовый объект</option>
          {environmentPresetsByTerrain[terrain].map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
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
      <SystemAssetPicker
        assets={systemAssets}
        emptyLabel="Стандартный маркер"
        onChange={(systemAssetId) => onChange({ ...input, imageAttachmentId: null, systemAssetId })}
        value={input.systemAssetId}
      />
      <label>
        Моё изображение или GIF
        <select
          onChange={(event) =>
            onChange({
              ...input,
              imageAttachmentId: event.target.value || null,
              systemAssetId: null,
            })
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
                  aria-label={`Встроенный ассет объекта ${object.name}`}
                  disabled={pending}
                  onChange={(event) => onAssetChange(object, event.target.value || null)}
                  value={object.systemAssetId ?? ''}
                >
                  <option value="">Без встроенного ассета</option>
                  {systemAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </select>
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
  terrain,
}: {
  input: CreateBattleCombatantRequest;
  imageOptions: BattleImageOption[];
  members: CampaignMembersResponse['members'];
  pending: boolean;
  onChange: (value: CreateBattleCombatantRequest) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUploadImage: (file: File) => void;
  terrain: TerrainTheme;
}) {
  const players = members.filter(({ role }) => role === 'PLAYER');
  const systemAssets = battleSystemAssetsFor('TOKEN', terrain);
  return (
    <form className="battle-combatant-creator" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">Новый токен</p>
        <h2>Участник</h2>
      </div>
      <label>
        Пресет врага · {terrainLabels[terrain]}
        <select
          onChange={(event) => {
            const preset = enemyPresetsByTerrain[terrain].find(
              ({ name }) => name === event.target.value,
            );
            if (preset) {
              onChange({
                ...input,
                ...preset,
                kind: 'MONSTER',
                imageAttachmentId: null,
              });
            }
          }}
          value=""
        >
          <option value="">Выберите готового врага</option>
          {enemyPresetsByTerrain[terrain].map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name} · {preset.maxHp} HP · КД {preset.armorClass}
            </option>
          ))}
        </select>
      </label>
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
                systemAssetId: event.target.value === 'PLAYER' ? null : input.systemAssetId,
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
          <SystemAssetPicker
            assets={systemAssets}
            emptyLabel="Круг с инициалами"
            onChange={(systemAssetId) =>
              onChange({ ...input, imageAttachmentId: null, systemAssetId })
            }
            value={input.systemAssetId}
          />
          <label>
            Моё изображение токена
            <select
              onChange={(event) =>
                onChange({
                  ...input,
                  imageAttachmentId: event.target.value || null,
                  systemAssetId: null,
                })
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

function CombatantPresetPanel({
  presets,
  characters,
  members,
  loading,
  pending,
  error,
  onImport,
  onUpdate,
  onDuplicate,
  onExport,
  onImportFile,
  onSaveCharacter,
  onPlaceCharacter,
  onDelete,
}: {
  presets: BattleCombatantPreset[];
  characters: CampaignCharacterSheetsResponse['sheets'];
  members: CampaignMembersResponse['members'];
  loading: boolean;
  pending: boolean;
  error: unknown;
  onImport: (
    preset: BattleCombatantPreset,
    input: ImportBattleCombatantPresetRequest,
  ) => Promise<unknown>;
  onUpdate: (
    preset: BattleCombatantPreset,
    input: UpdateBattleCombatantPresetRequest,
  ) => Promise<unknown>;
  onDuplicate: (preset: BattleCombatantPreset) => void;
  onExport: (preset: BattleCombatantPreset) => void;
  onImportFile: (file: File) => Promise<unknown>;
  onSaveCharacter: (sheetId: string) => void;
  onPlaceCharacter: (sheetId: string) => Promise<unknown>;
  onDelete: (preset: BattleCombatantPreset) => void;
}) {
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const [action, setAction] = useState<{
    mode: 'IMPORT' | 'EDIT';
    preset: BattleCombatantPreset;
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  return (
    <section className="battle-preset-panel">
      <p className="battle-terrain-hint">
        Пресет добавляет независимого участника со свежими HP и без состояний. Перед добавлением
        можно изменить владельца, стартовую клетку и параметры только этого боя.
      </p>
      <div className="battle-preset-portable-actions">
        <input
          accept=".json,.fol-battle.json,application/json"
          aria-label="Импортировать боевой пресет из JSON"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              await onImportFile(file);
            } catch {
              // The mutation error is rendered below the preset list.
            } finally {
              event.target.value = '';
            }
          }}
          ref={importRef}
          type="file"
        />
        <button disabled={pending} onClick={() => importRef.current?.click()} type="button">
          Импорт JSON
        </button>
        <small>
          Формат v1 не переносит владельца; встроенный ассет сохраняется по стабильному ID, а
          пользовательская картинка проверяется и сохраняется в Альманах.
        </small>
      </div>
      {characters.length > 0 ? (
        <div className="battle-preset-character-import">
          <label>
            Создать из листа персонажа
            <select
              disabled={pending}
              onChange={(event) => setSelectedSheetId(event.target.value)}
              value={selectedSheetId}
            >
              <option value="">Выберите лист…</option>
              {characters.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.name} · {sheet.ownerDisplayName}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={pending || !selectedSheetId}
            onClick={() => {
              onSaveCharacter(selectedSheetId);
              setSelectedSheetId('');
            }}
            type="button"
          >
            Сохранить пресет
          </button>
          <button
            disabled={pending || !selectedSheetId}
            onClick={async () => {
              try {
                await onPlaceCharacter(selectedSheetId);
                setSelectedSheetId('');
              } catch {
                // The mutation error is rendered below the panel.
              }
            }}
            type="button"
          >
            Поставить героя
          </button>
        </div>
      ) : null}
      {loading ? <p className="battle-save-empty">Загружаем персонажей…</p> : null}
      {!loading && presets.length === 0 ? (
        <p className="battle-save-empty">Пока нет сохранённых персонажей.</p>
      ) : null}
      {presets.length > 0 ? (
        <ul className="battle-preset-list">
          {presets.map((preset) => (
            <li key={preset.id}>
              <span className="battle-preset-color" style={{ background: preset.color }} />
              <div>
                <strong>{preset.name}</strong>
                <small>
                  {kindLabels[preset.kind]} · {preset.maxHp} HP · скорость {preset.speed}
                  {preset.ownerUserId
                    ? ` · ${memberNames.get(preset.ownerUserId) ?? 'бывший игрок'}`
                    : ''}
                </small>
              </div>
              <div className="battle-preset-actions">
                <button
                  disabled={pending}
                  onClick={() => setAction({ mode: 'IMPORT', preset })}
                  type="button"
                >
                  Добавить
                </button>
                <button
                  disabled={pending}
                  onClick={() => setAction({ mode: 'EDIT', preset })}
                  type="button"
                >
                  Изменить
                </button>
                <button disabled={pending} onClick={() => onDuplicate(preset)} type="button">
                  Копия
                </button>
                <button disabled={pending} onClick={() => onExport(preset)} type="button">
                  JSON
                </button>
                <button
                  aria-label={`Удалить сохранённого персонажа ${preset.name}`}
                  className="battle-remove-preset"
                  disabled={pending}
                  onClick={() => onDelete(preset)}
                  type="button"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {action ? (
        <CombatantPresetAction
          key={`${action.mode}:${action.preset.id}`}
          members={members}
          mode={action.mode}
          onCancel={() => setAction(null)}
          onImport={(input) => onImport(action.preset, input)}
          onUpdate={(input) => onUpdate(action.preset, input)}
          pending={pending}
          preset={action.preset}
        />
      ) : null}
      {error ? <p className="form-error">{readableError(error)}</p> : null}
    </section>
  );
}

function CombatantPresetAction({
  preset,
  members,
  mode,
  pending,
  onCancel,
  onImport,
  onUpdate,
}: {
  preset: BattleCombatantPreset;
  members: CampaignMembersResponse['members'];
  mode: 'IMPORT' | 'EDIT';
  pending: boolean;
  onCancel: () => void;
  onImport: (input: ImportBattleCombatantPresetRequest) => Promise<unknown>;
  onUpdate: (input: UpdateBattleCombatantPresetRequest) => Promise<unknown>;
}) {
  const players = members.filter(({ role }) => role === 'PLAYER');
  const [name, setName] = useState(preset.name);
  const [kind, setKind] = useState(preset.kind);
  const [initiative, setInitiative] = useState(preset.initiative);
  const [maxHp, setMaxHp] = useState(preset.maxHp);
  const [armorClass, setArmorClass] = useState(preset.armorClass?.toString() ?? '');
  const [speed, setSpeed] = useState(preset.speed);
  const [className, setClassName] = useState(preset.className);
  const [species, setSpecies] = useState(preset.species);
  const [ownerUserId, setOwnerUserId] = useState(preset.ownerUserId ?? '');
  const [size, setSize] = useState(preset.size);
  const [color, setColor] = useState(preset.color);
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const coordinatesComplete = (x === '' && y === '') || (x !== '' && y !== '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      if (mode === 'IMPORT') {
        await onImport({
          name,
          initiative,
          maxHp,
          armorClass: armorClass === '' ? null : Number(armorClass),
          speed,
          className,
          species,
          ownerUserId: ownerUserId || null,
          size,
          color,
          x: x === '' ? undefined : Number(x),
          y: y === '' ? undefined : Number(y),
        });
      } else {
        await onUpdate({
          name,
          kind,
          initiative,
          maxHp,
          armorClass: armorClass === '' ? null : Number(armorClass),
          speed,
          className,
          species,
          hidden: preset.hidden,
          nameVisibility: preset.nameVisibility,
          hpVisibility: preset.hpVisibility,
          showArmorClass: preset.showArmorClass,
          showClassName: preset.showClassName,
          showSpecies: preset.showSpecies,
          conditionsVisibility: preset.conditionsVisibility,
          ownerUserId: ownerUserId || null,
          imageAttachmentId: kind === 'PLAYER' ? null : preset.imageAttachmentId,
          systemAssetId: kind === 'PLAYER' ? null : preset.systemAssetId,
          size,
          color,
        });
      }
      onCancel();
    } catch {
      // The mutation exposes its readable error below the editor; keep the form open for fixes.
    }
  };

  return (
    <form className="battle-preset-editor" onSubmit={submit}>
      <header>
        <strong>{mode === 'IMPORT' ? 'Добавить на поле' : 'Изменить пресет'}</strong>
        <button aria-label="Закрыть редактор пресета" onClick={onCancel} type="button">
          ×
        </button>
      </header>
      <label>
        Имя
        <input maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      {mode === 'EDIT' ? (
        <label>
          Тип
          <select
            onChange={(event) => setKind(event.target.value as BattleCombatantKind)}
            value={kind}
          >
            {(Object.keys(kindLabels) as BattleCombatantKind[]).map((value) => (
              <option key={value} value={value}>
                {kindLabels[value]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="battle-form-row battle-form-row-three">
        <NumberInput label="Макс. HP" min={1} onChange={setMaxHp} value={maxHp} />
        <NumberInput label="Инициатива" onChange={setInitiative} value={initiative} />
        <label>
          Защита
          <input
            onChange={(event) => setArmorClass(event.target.value)}
            type="number"
            value={armorClass}
          />
        </label>
      </div>
      <div className="battle-form-row battle-form-row-three">
        <NumberInput label="Скорость" min={0} onChange={setSpeed} value={speed} />
        <NumberInput label="Размер" min={1} onChange={setSize} value={size} />
        <label>
          Цвет
          <input onChange={(event) => setColor(event.target.value)} type="color" value={color} />
        </label>
      </div>
      <div className="battle-form-row">
        <label>
          Класс
          <input
            maxLength={120}
            onChange={(event) => setClassName(event.target.value)}
            value={className}
          />
        </label>
        <label>
          Раса / вид
          <input
            maxLength={120}
            onChange={(event) => setSpecies(event.target.value)}
            value={species}
          />
        </label>
      </div>
      <label>
        Владелец токена
        <select onChange={(event) => setOwnerUserId(event.target.value)} value={ownerUserId}>
          <option value="">Только мастер</option>
          {players.map((player) => (
            <option key={player.userId} value={player.userId}>
              {player.displayName}
            </option>
          ))}
        </select>
      </label>
      {mode === 'IMPORT' ? (
        <>
          <div className="battle-form-row">
            <label>
              Стартовая X (необязательно)
              <input
                min={0}
                onChange={(event) => setX(event.target.value)}
                type="number"
                value={x}
              />
            </label>
            <label>
              Стартовая Y (необязательно)
              <input
                min={0}
                onChange={(event) => setY(event.target.value)}
                type="number"
                value={y}
              />
            </label>
          </div>
          {!coordinatesComplete ? (
            <small className="form-error">Укажите обе координаты или оставьте обе пустыми.</small>
          ) : null}
        </>
      ) : null}
      <div className="battle-preset-editor-actions">
        <button disabled={pending} onClick={onCancel} type="button">
          Отмена
        </button>
        <Button disabled={pending || !name.trim() || !coordinatesComplete} type="submit">
          {mode === 'IMPORT' ? 'Добавить независимую копию' : 'Сохранить изменения'}
        </Button>
      </div>
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
  onSavePreset,
  onUploadImage,
  savingPreset,
  terrain,
}: {
  combatant: BattleCombatant;
  token: BattleToken | undefined;
  imageOptions: BattleImageOption[];
  active: boolean;
  battleKey: readonly string[];
  onSnapshot: (snapshot: BattleSceneSnapshot) => void;
  onSavePreset: (combatant: BattleCombatant) => void;
  onUploadImage: (file: File) => Promise<LoreAttachment>;
  savingPreset: boolean;
  terrain: TerrainTheme;
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
    mutationFn: async ({
      attachmentId,
      systemAssetId,
      file,
    }: {
      attachmentId?: string | null;
      systemAssetId?: string | null;
      file?: File;
    }) => {
      if (!token) throw new Error('Battle token is missing');
      const uploaded = file ? await onUploadImage(file) : null;
      return apiRequest<BattleSceneSnapshot>(`/battle-tokens/${token.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: token.revision,
          imageAttachmentId: uploaded?.id ?? attachmentId ?? null,
          systemAssetId: uploaded || attachmentId ? null : (systemAssetId ?? null),
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
      <div className="battle-combatant-card-actions">
        <button disabled={savingPreset} onClick={() => onSavePreset(combatant)} type="button">
          {savingPreset ? 'Сохраняем…' : 'Сохранить персонажа'}
        </button>
      </div>
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
          <p className="battle-terrain-hint">
            {token?.hasImage
              ? 'Портрет связан с листом персонажа и меняется только через его карточку.'
              : 'Обычный игровой токен остаётся цветным кругом.'}
          </p>
        ) : token ? (
          <div className="battle-token-image-settings">
            <SystemAssetPicker
              assets={battleSystemAssetsFor('TOKEN', terrain)}
              disabled={updateTokenImage.isPending}
              emptyLabel="Круг с инициалами"
              onChange={(systemAssetId) => updateTokenImage.mutate({ systemAssetId })}
              value={token.systemAssetId}
            />
            <label>
              Моё изображение токена
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

function BattleInitiativeBar({
  combatants,
  tokens,
  activeCombatantId,
  round,
}: {
  combatants: BattleCombatant[];
  tokens: BattleToken[];
  activeCombatantId: string | null;
  round: number;
}) {
  const activeCardRef = useRef<HTMLDivElement>(null);
  const orderedCombatants = useMemo(
    () => [...combatants].sort((left, right) => right.initiative - left.initiative),
    [combatants],
  );
  const tokensByCombatantId = useMemo(
    () => new Map(tokens.map((token) => [token.combatantId, token])),
    [tokens],
  );
  const activeCombatant = orderedCombatants.find(({ id }) => id === activeCombatantId);

  useEffect(() => {
    activeCardRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeCombatantId]);

  return (
    <section aria-label="Порядок ходов" className="battle-initiative-bar">
      <div className="battle-initiative-status">
        <span>Раунд</span>
        <strong>{round}</strong>
        <small>{activeCombatant ? 'Сейчас ходит' : 'Ожидание хода'}</small>
      </div>
      {orderedCombatants.length > 0 ? (
        <div className="battle-initiative-track" role="list">
          {orderedCombatants.map((combatant) => {
            const token = tokensByCombatantId.get(combatant.id);
            const active = combatant.id === activeCombatantId;
            const hpPercent = combatantHpPercent(combatant);
            const hpLabel = combatantHpLabel(combatant);
            const systemAsset = battleSystemAssetById(token?.systemAssetId);
            return (
              <div
                aria-current={active ? 'step' : undefined}
                aria-label={`${combatant.name ?? 'Неизвестный участник'}, инициатива ${combatant.initiative}, ${hpLabel}${active ? ', ходит сейчас' : ''}`}
                className={`battle-initiative-card ${active ? 'is-active' : ''} is-${combatant.kind.toLowerCase()}`}
                key={combatant.id}
                ref={active ? activeCardRef : undefined}
                role="listitem"
                style={{ '--initiative-color': token?.color ?? '#8b8498' } as CSSProperties}
              >
                {active ? <span className="battle-initiative-turn-marker">Ходит</span> : null}
                <span className="battle-initiative-portrait">
                  {systemAsset?.kind === 'TOKEN' ? (
                    <span
                      aria-hidden="true"
                      className="battle-generated-enemy-portrait"
                      style={systemAssetStyle(systemAsset)}
                    />
                  ) : token?.hasImage ? (
                    <img
                      alt=""
                      className="battle-initiative-portrait-image"
                      src={apiResourceUrl(`/battle-tokens/${token.id}/image`)}
                    />
                  ) : combatant.kind === 'MONSTER' ? (
                    <span
                      aria-hidden="true"
                      className="battle-generated-enemy-portrait"
                      style={atlasSpriteStyle(
                        generatedEnemyPortrait(combatant.name ?? ''),
                        4,
                        4,
                        '/assets/battle/enemy-portraits-expanded-atlas.png',
                      )}
                    />
                  ) : (
                    <span className="battle-initiative-initials">{initials(combatant.name)}</span>
                  )}
                  <span className="battle-initiative-roll" title="Инициатива">
                    {combatant.initiative}
                  </span>
                </span>
                <strong className="battle-initiative-name">{combatant.name ?? 'Неизвестно'}</strong>
                <span className="battle-initiative-hp">
                  <span className="battle-initiative-hp-track" aria-hidden="true">
                    {hpPercent !== null ? (
                      <span style={{ width: `${Math.max(0, Math.min(100, hpPercent))}%` }} />
                    ) : null}
                  </span>
                  <small>{hpLabel}</small>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="battle-initiative-empty">
          Добавьте участников, чтобы появилась очередь ходов.
        </p>
      )}
    </section>
  );
}

function ManualMapWizard({
  pending,
  error,
  onClose,
  onCreate,
}: {
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onCreate: (input: CreateBattleSceneRequest) => void;
}) {
  const [form, setForm] = useState<CreateBattleSceneRequest>(initialManualScene);
  const selectedPreset = backgroundPresetById(form.backgroundPreset ?? null);
  return (
    <div className="random-map-wizard-backdrop" role="presentation">
      <section
        aria-labelledby="manual-map-title"
        aria-modal="true"
        className="random-map-wizard manual-map-wizard"
        role="dialog"
      >
        <header className="random-map-wizard-header">
          <div>
            <p className="eyebrow">Ручное создание</p>
            <h2 id="manual-map-title">Начните с готового пейзажа</h2>
            <p>
              Пресет задаёт только фон и набор визуальных материалов. Врагов, стены и окружение вы
              разместите сами в редакторе.
            </p>
          </div>
          <button
            aria-label="Закрыть"
            className="random-map-wizard-close"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <form
          className="manual-map-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(form);
          }}
        >
          <div className="manual-map-fields">
            <label>
              Название
              <input
                maxLength={160}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </label>
            <label>
              Форма
              <select
                onChange={(event) =>
                  setForm({ ...form, shape: event.target.value as BattleSceneShape })
                }
                value={form.shape}
              >
                {(Object.keys(randomMapShapeLabels) as BattleSceneShape[]).map((shape) => (
                  <option key={shape} value={shape}>
                    {randomMapShapeLabels[shape]}
                  </option>
                ))}
              </select>
            </label>
            <NumberInput
              label="Ширина"
              min={4}
              onChange={(gridColumns) => setForm({ ...form, gridColumns })}
              value={form.gridColumns}
            />
            <NumberInput
              label="Высота"
              min={4}
              onChange={(gridRows) => setForm({ ...form, gridRows })}
              value={form.gridRows}
            />
          </div>
          <div className="manual-background-gallery" role="listbox" aria-label="Пресеты фона">
            {backgroundPresets.map((preset) => (
              <button
                aria-selected={selectedPreset?.id === preset.id}
                className={selectedPreset?.id === preset.id ? 'is-selected' : ''}
                key={preset.id}
                onClick={() =>
                  setForm({
                    ...form,
                    backgroundPreset: preset.id,
                    terrainTheme: preset.terrain,
                  })
                }
                role="option"
                title={`${BATTLE_SYSTEM_ASSET_PACK.source} · ${BATTLE_SYSTEM_ASSET_PACK.license}`}
                type="button"
              >
                <span
                  aria-hidden="true"
                  style={{
                    backgroundImage: `url("${backgroundPresetImageUrl(preset)}")`,
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                  }}
                />
                <strong>{preset.label}</strong>
                <small>{terrainLabels[preset.terrain]}</small>
              </button>
            ))}
          </div>
          <AssetPackNote />
          <div className="manual-map-fields">
            <label>
              Освещение
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    lightingTheme: event.target.value as NonNullable<
                      CreateBattleSceneRequest['lightingTheme']
                    >,
                  })
                }
                value={form.lightingTheme ?? 'BRIGHT'}
              >
                {(Object.keys(randomMapLightingLabels) as RandomMapLighting[]).map((lighting) => (
                  <option key={lighting} value={lighting}>
                    {randomMapLightingLabels[lighting]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Погода
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    weatherTheme: event.target.value as NonNullable<
                      CreateBattleSceneRequest['weatherTheme']
                    >,
                  })
                }
                value={form.weatherTheme ?? 'CLEAR'}
              >
                {(Object.keys(randomMapWeatherLabels) as RandomMapWeather[]).map((weather) => (
                  <option key={weather} value={weather}>
                    {randomMapWeatherLabels[weather]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="form-error">{readableError(error)}</p> : null}
          <div className="random-map-wizard-actions">
            <Button disabled={pending} onClick={onClose} tone="quiet" type="button">
              Отмена
            </Button>
            <Button
              disabled={
                pending ||
                !form.name.trim() ||
                form.gridColumns < 4 ||
                form.gridColumns > 60 ||
                form.gridRows < 4 ||
                form.gridRows > 60
              }
              type="submit"
            >
              {pending ? 'Создаём…' : 'Открыть ручной редактор'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RandomMapWizard({
  pending,
  error,
  onClose,
  onGenerate,
}: {
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onGenerate: (input: GenerateRandomBattleMapRequest) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<GenerateRandomBattleMapRequest>(initialRandomMap);
  const stepNames = ['Замысел', 'Поле', 'Столкновение', 'Детали', 'Проверка'];

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, pending]);

  function updateField<Key extends keyof GenerateRandomBattleMapRequest>(
    key: Key,
    value: GenerateRandomBattleMapRequest[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateEnemy(index: number, patch: Partial<RandomMapEnemy>) {
    setForm((current) => ({
      ...current,
      enemies: current.enemies.map((enemy, enemyIndex) =>
        enemyIndex === index ? { ...enemy, ...patch } : enemy,
      ),
    }));
  }

  function addEnemy() {
    setForm((current) => ({
      ...current,
      enemyCount: undefined,
      enemies: [...current.enemies, { name: `Противник ${current.enemies.length + 1}`, count: 1 }],
    }));
  }

  function removeEnemy(index: number) {
    setForm((current) => ({
      ...current,
      enemies: current.enemies.filter((_, enemyIndex) => enemyIndex !== index),
    }));
  }

  function showReview() {
    setForm((current) => ({ ...current, seed: current.seed || createRandomMapSeed() }));
    setStep(4);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }
    if (step === 3) {
      showReview();
      return;
    }
    onGenerate({ ...form, seed: form.seed || createRandomMapSeed() });
  }

  return (
    <div className="random-map-wizard-backdrop" role="presentation">
      <section
        aria-describedby="random-map-wizard-help"
        aria-labelledby="random-map-wizard-title"
        aria-modal="true"
        className="random-map-wizard"
        role="dialog"
      >
        <header className="random-map-wizard-header">
          <div>
            <p className="eyebrow">Создать карту быстро</p>
            <h2 id="random-map-wizard-title">{stepNames[step]}</h2>
            <p id="random-map-wizard-help">
              Ответы можно изменить до создания. Генератор сохранит результат как черновик.
            </p>
          </div>
          <button
            aria-label="Закрыть мастер генерации"
            className="random-map-wizard-close"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <ol className="random-map-wizard-progress" aria-label="Шаги генерации">
          {stepNames.map((name, index) => (
            <li
              aria-current={index === step ? 'step' : undefined}
              className={index === step ? 'is-current' : index < step ? 'is-complete' : ''}
              key={name}
            >
              <span>{index + 1}</span>
              <small>{name}</small>
            </li>
          ))}
        </ol>

        <form className="random-map-wizard-form" onSubmit={submit}>
          {step === 0 ? (
            <div className="random-map-wizard-step">
              <label>
                Название карты
                <input
                  autoFocus
                  maxLength={160}
                  onChange={(event) => updateField('name', event.target.value)}
                  required
                  value={form.name}
                />
              </label>
              <label>
                Местность
                <select
                  onChange={(event) =>
                    updateField('terrain', event.target.value as RandomMapTerrain)
                  }
                  value={form.terrain}
                >
                  {(Object.keys(randomMapTerrainLabels) as RandomMapTerrain[]).map((terrain) => (
                    <option key={terrain} value={terrain}>
                      {randomMapTerrainLabels[terrain]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Краткое описание
                <textarea
                  maxLength={1000}
                  onChange={(event) => updateField('description', event.target.value)}
                  placeholder="Например: туманная тропа, старый алтарь и узкий мост"
                  rows={4}
                  value={form.description}
                />
                <small>Описание влияет на вариант раскладки и сохраняется в резюме.</small>
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="random-map-wizard-step">
              <div className="random-map-wizard-grid">
                <label>
                  Размер поля
                  <select
                    onChange={(event) => updateField('size', event.target.value as RandomMapSize)}
                    value={form.size}
                  >
                    {(Object.keys(randomMapSizeLabels) as RandomMapSize[]).map((size) => (
                      <option key={size} value={size}>
                        {randomMapSizeLabels[size]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Форма
                  <select
                    onChange={(event) =>
                      updateField('shape', event.target.value as BattleSceneShape)
                    }
                    value={form.shape}
                  >
                    {(Object.keys(randomMapShapeLabels) as BattleSceneShape[]).map((shape) => (
                      <option key={shape} value={shape}>
                        {randomMapShapeLabels[shape]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Число игроков
                  <input
                    max={12}
                    min={1}
                    onChange={(event) => updateField('playerCount', Number(event.target.value))}
                    type="number"
                    value={form.playerCount}
                  />
                </label>
                <label>
                  Стартовые зоны
                  <select
                    onChange={(event) =>
                      updateField('startingZones', event.target.value as RandomMapStartingZones)
                    }
                    value={form.startingZones}
                  >
                    {(Object.keys(randomMapStartingLabels) as RandomMapStartingZones[]).map(
                      (mode) => (
                        <option key={mode} value={mode}>
                          {randomMapStartingLabels[mode]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <p className="random-map-wizard-note">
                После генерации размер, форма и стартовые маркеры останутся редактируемыми.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="random-map-wizard-step">
              <div className="random-map-wizard-grid">
                <label>
                  Уровень опасности
                  <select
                    onChange={(event) =>
                      updateField('danger', event.target.value as RandomMapDanger)
                    }
                    value={form.danger}
                  >
                    {(Object.keys(randomMapDangerLabels) as RandomMapDanger[]).map((danger) => (
                      <option key={danger} value={danger}>
                        {randomMapDangerLabels[danger]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Цель столкновения
                  <select
                    onChange={(event) =>
                      updateField('objective', event.target.value as RandomMapObjective)
                    }
                    value={form.objective}
                  >
                    {(Object.keys(randomMapObjectiveLabels) as RandomMapObjective[]).map(
                      (objective) => (
                        <option key={objective} value={objective}>
                          {randomMapObjectiveLabels[objective]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              {form.enemies.length === 0 ? (
                <label>
                  Число противников
                  <input
                    max={50}
                    min={0}
                    onChange={(event) =>
                      updateField(
                        'enemyCount',
                        event.target.value === '' ? undefined : Number(event.target.value),
                      )
                    }
                    placeholder="Автоматически по опасности"
                    type="number"
                    value={form.enemyCount ?? ''}
                  />
                  <small>Оставьте пустым, чтобы сервер подобрал количество и тип.</small>
                </label>
              ) : null}

              <div className="random-map-enemies">
                <header>
                  <div>
                    <strong>Свой состав врагов</strong>
                    <small>Необязательно — можно доверить подбор серверу.</small>
                  </div>
                  <button disabled={form.enemies.length >= 8} onClick={addEnemy} type="button">
                    + Добавить группу
                  </button>
                </header>
                {form.enemies.map((enemy, index) => (
                  <article className="random-map-enemy" key={`enemy-${index}`}>
                    <label>
                      Название
                      <input
                        maxLength={120}
                        onChange={(event) => updateEnemy(index, { name: event.target.value })}
                        required
                        value={enemy.name}
                      />
                    </label>
                    <label>
                      Количество
                      <input
                        max={20}
                        min={1}
                        onChange={(event) =>
                          updateEnemy(index, { count: Number(event.target.value) })
                        }
                        type="number"
                        value={enemy.count}
                      />
                    </label>
                    <label>
                      HP
                      <input
                        min={1}
                        onChange={(event) =>
                          updateEnemy(index, {
                            maxHp: optionalNumber(event.target.value),
                          })
                        }
                        placeholder="Авто"
                        type="number"
                        value={enemy.maxHp ?? ''}
                      />
                    </label>
                    <label>
                      КД
                      <input
                        onChange={(event) =>
                          updateEnemy(index, {
                            armorClass: optionalNumber(event.target.value),
                          })
                        }
                        placeholder="Авто"
                        type="number"
                        value={enemy.armorClass ?? ''}
                      />
                    </label>
                    <button
                      aria-label={`Удалить группу ${enemy.name}`}
                      onClick={() => removeEnemy(index)}
                      type="button"
                    >
                      Удалить
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="random-map-wizard-step">
              <div className="random-map-wizard-grid">
                <label>
                  Плотность укрытий
                  <select
                    onChange={(event) =>
                      updateField('obstacleDensity', event.target.value as RandomMapDensity)
                    }
                    value={form.obstacleDensity}
                  >
                    {(Object.keys(randomMapDensityLabels) as RandomMapDensity[]).map((density) => (
                      <option key={density} value={density}>
                        {randomMapDensityLabels[density]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Освещение
                  <select
                    onChange={(event) =>
                      updateField('lighting', event.target.value as RandomMapLighting)
                    }
                    value={form.lighting}
                  >
                    {(Object.keys(randomMapLightingLabels) as RandomMapLighting[]).map((light) => (
                      <option key={light} value={light}>
                        {randomMapLightingLabels[light]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Погода
                  <select
                    onChange={(event) =>
                      updateField('weather', event.target.value as RandomMapWeather)
                    }
                    value={form.weather}
                  >
                    {(Object.keys(randomMapWeatherLabels) as RandomMapWeather[]).map((weather) => (
                      <option key={weather} value={weather}>
                        {randomMapWeatherLabels[weather]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Входы и выходы
                  <input
                    max={6}
                    min={0}
                    onChange={(event) => updateField('entrances', Number(event.target.value))}
                    type="number"
                    value={form.entrances}
                  />
                </label>
              </div>
              <div className="random-map-wizard-checks">
                <VisibilityCheckbox
                  checked={form.difficultTerrain}
                  label="Добавить сложную местность"
                  onChange={(value) => updateField('difficultTerrain', value)}
                />
                <VisibilityCheckbox
                  checked={form.interactiveObjects}
                  label="Добавить интерактивные объекты"
                  onChange={(value) => updateField('interactiveObjects', value)}
                />
                <VisibilityCheckbox
                  checked={form.hazards}
                  label="Добавить опасности и ловушки"
                  onChange={(value) => updateField('hazards', value)}
                />
              </div>
              <label>
                Seed для повторения
                <div className="random-map-seed-field">
                  <input
                    maxLength={64}
                    onChange={(event) => updateField('seed', event.target.value)}
                    placeholder="Создадим автоматически"
                    value={form.seed ?? ''}
                  />
                  <button onClick={() => updateField('seed', createRandomMapSeed())} type="button">
                    Новый seed
                  </button>
                </div>
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="random-map-wizard-step random-map-review">
              <dl>
                <div>
                  <dt>Карта</dt>
                  <dd>
                    {form.name} · {randomMapTerrainLabels[form.terrain]}
                  </dd>
                </div>
                <div>
                  <dt>Поле</dt>
                  <dd>
                    {randomMapSizeLabels[form.size]} · {randomMapShapeLabels[form.shape]}
                  </dd>
                </div>
                <div>
                  <dt>Столкновение</dt>
                  <dd>
                    {randomMapDangerLabels[form.danger]} опасность ·{' '}
                    {randomMapObjectiveLabels[form.objective].toLowerCase()}
                  </dd>
                </div>
                <div>
                  <dt>Участники</dt>
                  <dd>
                    {form.playerCount} игроков ·{' '}
                    {form.enemies.length
                      ? form.enemies.map(({ name, count }) => `${name} ×${count}`).join(', ')
                      : form.enemyCount === undefined
                        ? 'автоматический подбор врагов'
                        : `${form.enemyCount} противников`}
                  </dd>
                </div>
                <div>
                  <dt>Окружение</dt>
                  <dd>
                    {randomMapDensityLabels[form.obstacleDensity].toLowerCase()},{' '}
                    {randomMapLightingLabels[form.lighting].toLowerCase()},{' '}
                    {randomMapWeatherLabels[form.weather].toLowerCase()}
                  </dd>
                </div>
              </dl>
              {form.description ? <p>{form.description}</p> : null}
              <div className="random-map-review-seed">
                <span>seed</span>
                <code>{form.seed}</code>
                <button
                  disabled={pending}
                  onClick={() => updateField('seed', createRandomMapSeed())}
                  type="button"
                >
                  Перемешать вариант
                </button>
              </div>
              <p className="random-map-wizard-note">
                Бой не запустится автоматически. Вы сможете передвинуть или удалить любой созданный
                элемент.
              </p>
            </div>
          ) : null}

          {error ? <p className="form-error">{readableError(error)}</p> : null}

          <footer className="random-map-wizard-actions">
            {step > 0 ? (
              <Button
                disabled={pending}
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                tone="quiet"
              >
                Назад
              </Button>
            ) : (
              <Button disabled={pending} onClick={onClose} tone="quiet">
                Отмена
              </Button>
            )}
            <Button disabled={pending} type="submit">
              {pending
                ? 'Создаём карту…'
                : step === 4
                  ? 'Создать черновик'
                  : step === 3
                    ? 'Проверить ответы'
                    : 'Далее'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function SystemAssetPicker({
  assets,
  value,
  emptyLabel,
  disabled = false,
  onChange,
}: {
  assets: readonly BattleSystemAsset[];
  value: string | null;
  emptyLabel: string;
  disabled?: boolean;
  onChange: (assetId: string | null) => void;
}) {
  return (
    <div className="battle-system-assets">
      <div className="battle-system-assets-heading">
        <span>Встроенная библиотека</span>
        <small>
          {BATTLE_SYSTEM_ASSET_PACK.label} · v{BATTLE_SYSTEM_ASSET_PACK.version}
        </small>
      </div>
      <div className="battle-system-assets-grid">
        <button
          aria-pressed={value === null}
          className={value === null ? 'is-selected' : ''}
          disabled={disabled}
          onClick={() => onChange(null)}
          type="button"
        >
          <span className="battle-system-asset-empty">Aa</span>
          <strong>{emptyLabel}</strong>
        </button>
        {assets.map((asset) => (
          <button
            aria-pressed={value === asset.id}
            className={value === asset.id ? 'is-selected' : ''}
            disabled={disabled}
            key={asset.id}
            onClick={() => onChange(asset.id)}
            title={`${asset.source} · ${asset.license} · ${asset.width}×${asset.height}px`}
            type="button"
          >
            <SystemAssetPreview asset={asset} />
            <strong>{asset.label}</strong>
            <small>{asset.tags.join(' · ')}</small>
          </button>
        ))}
      </div>
      <AssetPackNote />
    </div>
  );
}

function SystemAssetPreview({ asset }: { asset: BattleSystemAsset }) {
  return (
    <span
      aria-hidden="true"
      className="battle-system-asset-preview"
      style={systemAssetStyle(asset)}
    />
  );
}

function AssetPackNote() {
  return (
    <small className="battle-asset-pack-note">
      {BATTLE_SYSTEM_ASSET_PACK.source} · {BATTLE_SYSTEM_ASSET_PACK.license}
    </small>
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

function generatedBattleBackground(
  scene: NonNullable<BattleSceneSnapshot['scene']>,
  terrainTheme: NonNullable<NonNullable<BattleSceneSnapshot['scene']>['terrainTheme']>,
): CSSProperties | undefined {
  const preset =
    backgroundPresetById(scene.backgroundPreset) ??
    defaultBackgroundPreset(terrainTheme, stableVisualIndex(scene.id, 2));
  const lightingLayer =
    scene.lightingTheme === 'DARK'
      ? 'linear-gradient(rgb(3 5 14 / 0.62), rgb(7 9 18 / 0.54))'
      : scene.lightingTheme === 'DIM'
        ? 'linear-gradient(rgb(20 23 42 / 0.32), rgb(16 18 34 / 0.26))'
        : 'linear-gradient(rgb(255 244 211 / 0.04), rgb(255 244 211 / 0.02))';
  const weatherLayer =
    scene.weatherTheme === 'FOG'
      ? 'radial-gradient(ellipse at 30% 25%, rgb(228 238 242 / 0.42), rgb(201 216 220 / 0.12) 48%, transparent 78%)'
      : scene.weatherTheme === 'RAIN'
        ? 'repeating-linear-gradient(112deg, transparent 0 22px, rgb(168 204 224 / 0.18) 23px 25px)'
        : scene.weatherTheme === 'SNOW'
          ? 'radial-gradient(circle at 32% 38%, rgb(255 255 255 / 0.34), transparent 58%)'
          : scene.weatherTheme === 'STORM'
            ? 'linear-gradient(135deg, rgb(20 31 52 / 0.42), transparent 45%, rgb(35 17 48 / 0.36))'
            : 'linear-gradient(transparent, transparent)';
  return {
    backgroundImage: `${weatherLayer}, ${lightingLayer}, url("${backgroundPresetImageUrl(preset)}")`,
    backgroundPosition: 'center, center, center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover, cover, cover',
  };
}

function inferTerrainTheme(
  sceneId: string,
  combatants: BattleCombatant[],
  objects: BattleSceneObject[],
): NonNullable<NonNullable<BattleSceneSnapshot['scene']>['terrainTheme']> {
  const text = [...combatants.map(({ name }) => name ?? ''), ...objects.map(({ name }) => name)]
    .join(' ')
    .toLocaleLowerCase('ru-RU');
  const scores = [
    { theme: 'FOREST' as const, pattern: /лес|дерев|пень|звер|алтар/gu },
    { theme: 'RUINS' as const, pattern: /руин|скелет|колон|стату|марод/gu },
    { theme: 'DUNGEON' as const, pattern: /подзем|культ|саркофаг|реш[её]тк|дротик/gu },
    { theme: 'CAVE' as const, pattern: /пещер|кристалл|троглодит|жук|гриб/gu },
    { theme: 'SWAMP' as const, pattern: /болот|топляк|камыш|лодк|трясин/gu },
    { theme: 'DESERT' as const, pattern: /пустын|песчан|скорпион|стел|колод/gu },
    { theme: 'SNOW' as const, pattern: /снеж|лед|л[её]д|север|зам[её]рз/gu },
    { theme: 'URBAN' as const, pattern: /город|шпион|телег|фонтан|прилав/gu },
  ].map(({ theme, pattern }) => ({ theme, score: text.match(pattern)?.length ?? 0 }));
  scores.sort((left, right) => right.score - left.score);
  if (scores[0]!.score > 0) return scores[0]!.theme;
  const fallbackThemes = [
    'FOREST',
    'RUINS',
    'DUNGEON',
    'CAVE',
    'SWAMP',
    'DESERT',
    'SNOW',
    'URBAN',
  ] as const;
  return fallbackThemes[stableVisualIndex(sceneId, fallbackThemes.length)]!;
}

function generatedEnemyPortrait(name: string): number {
  const normalized = name.toLocaleLowerCase('ru-RU');
  if (/лесн.*нал[её]т|бандит/.test(normalized)) return 0;
  if (/волк|звер/.test(normalized)) return 1;
  if (/страж руин|каменн.*страж|голем/.test(normalized)) return 2;
  if (/скелет|нежить|марод[её]р/.test(normalized)) return 3;
  if (/культ/.test(normalized)) return 4;
  if (/тюремщик|страж подзем/.test(normalized)) return 5;
  if (/троглодит|пещер|глубинн.*охот/.test(normalized)) return 6;
  if (/кристальн.*жук|глубинн.*жук/.test(normalized)) return 7;
  if (/болотн.*ведьм|ведьм/.test(normalized)) return 8;
  if (/топляк|болотн.*твар/.test(normalized)) return 9;
  if (/песчан.*нал[её]т|пустынн.*охот/.test(normalized)) return 10;
  if (/скорпион/.test(normalized)) return 11;
  if (/морозн.*призрак|ледян.*дух/.test(normalized)) return 12;
  if (/ледян.*трол|снежн.*хищ/.test(normalized)) return 13;
  if (/убийц|шпион|головорез/.test(normalized)) return 14;
  if (/капитан|городск.*страж|^страж/.test(normalized)) return 15;
  return stableVisualIndex(name, 16);
}

function generatedEnvironmentSprite(
  name: string,
  terrain: NonNullable<BattleSceneSnapshot['scene']>['terrainTheme'],
): number | null {
  if (!terrain || /^(Старт|Вход|Выход|Опасность|Точка|Путь|Цель)/i.test(name)) return null;
  const normalized = name.toLocaleLowerCase('ru-RU');
  if (/повален.*дерев|пень/.test(normalized)) return 0;
  if (/колюч|куст/.test(normalized)) return 1;
  if (/колон/.test(normalized)) return 2;
  if (/стату/.test(normalized)) return 3;
  if (/сундук/.test(normalized)) return 4;
  if (/жаровн|кост[её]р/.test(normalized)) return 5;
  if (/кристалл/.test(normalized)) return 6;
  if (/гриб/.test(normalized)) return 7;
  if (/лодк/.test(normalized)) return 8;
  if (/камыш|коряг|сухое дерево/.test(normalized)) return 9;
  if (/стел|идол|алтар/.test(normalized)) return 10;
  if (/пустынн.*припас|ящик|кувшин/.test(normalized)) return 11;
  if (/ледян.*обелиск|ледяной обелиск/.test(normalized)) return 12;
  if (/снежн.*валун|зам[её]рзш.*припас/.test(normalized)) return 13;
  if (/телег|повоз/.test(normalized)) return 14;
  if (/прилав|стойк|фонтан/.test(normalized)) return 15;
  const terrainOffset: Record<TerrainTheme, number> = {
    FOREST: 0,
    RUINS: 2,
    DUNGEON: 4,
    CAVE: 6,
    SWAMP: 8,
    DESERT: 10,
    SNOW: 12,
    URBAN: 14,
  };
  return terrainOffset[terrain] + stableVisualIndex(name, 2);
}

function generatedObstacleStyle(
  kind: BattleObstacleKind,
  terrain: TerrainTheme,
  systemAssetId?: string | null,
): CSSProperties | undefined {
  if (kind === 'DIFFICULT_TERRAIN') return undefined;
  const systemAsset = battleSystemAssetById(systemAssetId);
  if (systemAsset?.kind === 'OBSTACLE') {
    return {
      ...systemAssetStyle(systemAsset),
      backgroundRepeat: 'repeat',
      backgroundSize: '104px 104px',
    };
  }
  return {
    backgroundImage: `url("${obstacleMaterialUrl(terrain, kind)}")`,
    backgroundPosition: 'center',
    backgroundRepeat: 'repeat',
    backgroundSize: '104px 104px',
  };
}

function systemAssetStyle(asset: BattleSystemAsset): CSSProperties {
  if (asset.render.type === 'IMAGE') {
    return {
      backgroundImage: `url("${asset.render.url}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
    };
  }
  return atlasSpriteStyle(
    asset.render.index,
    asset.render.columns,
    asset.render.rows,
    asset.render.url,
  );
}

function atlasSpriteStyle(
  index: number,
  columns: number,
  rows: number,
  image: string,
): CSSProperties {
  return {
    backgroundImage: `url("${image}")`,
    backgroundPosition: atlasPosition(index, columns, rows),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
  };
}

function atlasPosition(index: number, columns: number, rows: number): string {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = columns === 1 ? 0 : (column / (columns - 1)) * 100;
  const y = rows === 1 ? 0 : (row / (rows - 1)) * 100;
  return `${x}% ${y}%`;
}

function stableVisualIndex(value: string, count: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}

function createRandomMapSeed(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function optionalNumber(value: string): number | undefined {
  return value === '' ? undefined : Number(value);
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

function cellFromBoardEvent(
  event: Pick<MouseEvent<HTMLDivElement>, 'clientX' | 'clientY' | 'currentTarget'>,
  scene: NonNullable<BattleSceneSnapshot['scene']>,
) {
  return cellFromBoardPoint(event.clientX, event.clientY, event.currentTarget, scene);
}

function cellFromBoardPoint(
  clientX: number,
  clientY: number,
  boardElement: Pick<HTMLElement, 'getBoundingClientRect'>,
  scene: NonNullable<BattleSceneSnapshot['scene']>,
) {
  const board = boardElement.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(
        scene.gridColumns - 1,
        Math.floor(((clientX - board.left) / board.width) * scene.gridColumns),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        scene.gridRows - 1,
        Math.floor(((clientY - board.top) / board.height) * scene.gridRows),
      ),
    ),
  };
}

function tokenCellFromBoardPoint(
  clientX: number,
  clientY: number,
  boardElement: Pick<HTMLElement, 'getBoundingClientRect'>,
  scene: NonNullable<BattleSceneSnapshot['scene']>,
  tokenSize: number,
) {
  const cell = cellFromBoardPoint(clientX, clientY, boardElement, scene);
  return {
    x: Math.min(cell.x, scene.gridColumns - tokenSize),
    y: Math.min(cell.y, scene.gridRows - tokenSize),
  };
}

function combatantHpLabel(combatant: BattleCombatant): string {
  if (combatant.currentHp !== null && combatant.maxHp !== null) {
    return `${combatant.currentHp} / ${combatant.maxHp} HP`;
  }
  if (combatant.hpPercent !== null) return `${combatant.hpPercent}% HP`;
  if (combatant.hpState !== null) return hpStateLabels[combatant.hpState];
  return 'HP скрыты';
}

function combatantHpPercent(combatant: BattleCombatant): number | null {
  return (
    combatant.hpPercent ??
    (combatant.currentHp !== null && combatant.maxHp
      ? Math.round((combatant.currentHp / combatant.maxHp) * 100)
      : null)
  );
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
