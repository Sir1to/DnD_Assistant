import type {
  BattleBackgroundPreset,
  CreateBattleCombatantRequest,
  CreateBattleSceneObjectRequest,
  RandomBattleMapTerrain,
} from '@fog-of-lore/contracts';
import { defaultBattleSystemAssetId } from '@fog-of-lore/domain';

export type TerrainTheme = Exclude<RandomBattleMapTerrain, 'RANDOM'>;

export interface BackgroundPresetOption {
  id: BattleBackgroundPreset;
  label: string;
  terrain: TerrainTheme;
  atlasIndex: number;
}

export const backgroundPresets: readonly BackgroundPresetOption[] = [
  { id: 'FOREST_CLEARING', label: 'Лесная поляна', terrain: 'FOREST', atlasIndex: 0 },
  { id: 'FOREST_CREEK', label: 'Лесной ручей', terrain: 'FOREST', atlasIndex: 1 },
  { id: 'RUINS_RUBBLE', label: 'Заросшие обломки', terrain: 'RUINS', atlasIndex: 2 },
  { id: 'RUINS_COURTYARD', label: 'Древние плиты', terrain: 'RUINS', atlasIndex: 3 },
  { id: 'DUNGEON_STONE', label: 'Сухие плиты подземелья', terrain: 'DUNGEON', atlasIndex: 4 },
  { id: 'DUNGEON_DAMP', label: 'Сырые плиты подземелья', terrain: 'DUNGEON', atlasIndex: 5 },
  { id: 'CAVE_CRYSTAL', label: 'Кристальная пещера', terrain: 'CAVE', atlasIndex: 6 },
  { id: 'CAVE_VOLCANIC', label: 'Вулканическая пещера', terrain: 'CAVE', atlasIndex: 7 },
  { id: 'SWAMP_MURK', label: 'Тёмная трясина', terrain: 'SWAMP', atlasIndex: 8 },
  { id: 'SWAMP_REEDS', label: 'Камышовое болото', terrain: 'SWAMP', atlasIndex: 9 },
  { id: 'DESERT_DUNES', label: 'Песчаные дюны', terrain: 'DESERT', atlasIndex: 10 },
  { id: 'DESERT_SALT', label: 'Высохшие солончаки', terrain: 'DESERT', atlasIndex: 11 },
  { id: 'SNOW_TUNDRA', label: 'Снежная тундра', terrain: 'SNOW', atlasIndex: 12 },
  { id: 'SNOW_GLACIER', label: 'Ледяное поле', terrain: 'SNOW', atlasIndex: 13 },
  { id: 'URBAN_PLAZA', label: 'Городская площадь', terrain: 'URBAN', atlasIndex: 14 },
  { id: 'URBAN_ROAD', label: 'Грязная торговая дорога', terrain: 'URBAN', atlasIndex: 15 },
] as const;

export const terrainLabels: Record<TerrainTheme, string> = {
  FOREST: 'Лес',
  RUINS: 'Руины',
  DUNGEON: 'Подземелье',
  CAVE: 'Пещера',
  SWAMP: 'Болото',
  DESERT: 'Пустыня',
  SNOW: 'Снег и лёд',
  URBAN: 'Город',
};

export const enemyPresetsByTerrain: Record<
  TerrainTheme,
  readonly Pick<
    CreateBattleCombatantRequest,
    'name' | 'maxHp' | 'currentHp' | 'armorClass' | 'speed' | 'size' | 'systemAssetId'
  >[]
> = {
  FOREST: [
    {
      name: 'Лесной налётчик',
      currentHp: 12,
      maxHp: 12,
      armorClass: 13,
      speed: 6,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'FOREST', 0),
    },
    {
      name: 'Лютоволк',
      currentHp: 18,
      maxHp: 18,
      armorClass: 14,
      speed: 8,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'FOREST', 1),
    },
  ],
  RUINS: [
    {
      name: 'Страж руин',
      currentHp: 28,
      maxHp: 28,
      armorClass: 16,
      speed: 5,
      size: 2,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'RUINS', 0),
    },
    {
      name: 'Скелет-мародёр',
      currentHp: 13,
      maxHp: 13,
      armorClass: 14,
      speed: 6,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'RUINS', 1),
    },
  ],
  DUNGEON: [
    {
      name: 'Культист подземелья',
      currentHp: 11,
      maxHp: 11,
      armorClass: 12,
      speed: 6,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'DUNGEON', 0),
    },
    {
      name: 'Тюремщик',
      currentHp: 24,
      maxHp: 24,
      armorClass: 17,
      speed: 5,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'DUNGEON', 1),
    },
  ],
  CAVE: [
    {
      name: 'Троглодит',
      currentHp: 16,
      maxHp: 16,
      armorClass: 13,
      speed: 6,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'CAVE', 0),
    },
    {
      name: 'Кристальный жук',
      currentHp: 22,
      maxHp: 22,
      armorClass: 16,
      speed: 5,
      size: 2,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'CAVE', 1),
    },
  ],
  SWAMP: [
    {
      name: 'Болотная ведьма',
      currentHp: 20,
      maxHp: 20,
      armorClass: 13,
      speed: 5,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'SWAMP', 0),
    },
    {
      name: 'Топляк',
      currentHp: 30,
      maxHp: 30,
      armorClass: 15,
      speed: 4,
      size: 2,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'SWAMP', 1),
    },
  ],
  DESERT: [
    {
      name: 'Песчаный налётчик',
      currentHp: 14,
      maxHp: 14,
      armorClass: 14,
      speed: 7,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'DESERT', 0),
    },
    {
      name: 'Гигантский скорпион',
      currentHp: 26,
      maxHp: 26,
      armorClass: 15,
      speed: 7,
      size: 2,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'DESERT', 1),
    },
  ],
  SNOW: [
    {
      name: 'Морозный призрак',
      currentHp: 18,
      maxHp: 18,
      armorClass: 14,
      speed: 7,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'SNOW', 0),
    },
    {
      name: 'Ледяной тролль',
      currentHp: 38,
      maxHp: 38,
      armorClass: 16,
      speed: 6,
      size: 2,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'SNOW', 1),
    },
  ],
  URBAN: [
    {
      name: 'Городская убийца',
      currentHp: 17,
      maxHp: 17,
      armorClass: 15,
      speed: 7,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'URBAN', 0),
    },
    {
      name: 'Продажный капитан',
      currentHp: 30,
      maxHp: 30,
      armorClass: 18,
      speed: 6,
      size: 1,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', 'URBAN', 1),
    },
  ],
};

type EnvironmentPreset = Pick<
  CreateBattleSceneObjectRequest,
  'name' | 'blocksMovement' | 'kind' | 'visibleToPlayers' | 'showLabel'
>;

export const environmentPresetsByTerrain: Record<TerrainTheme, readonly EnvironmentPreset[]> = {
  FOREST: [
    {
      name: 'Поваленное дерево',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Колючий куст',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
  RUINS: [
    {
      name: 'Обломки колонны',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Разбитая статуя',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
  DUNGEON: [
    {
      name: 'Запертый сундук',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Железная жаровня',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
  CAVE: [
    {
      name: 'Кристаллы',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Светящиеся грибы',
      kind: 'PROP',
      blocksMovement: false,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
  SWAMP: [
    {
      name: 'Гнилая лодка',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Камыши и коряга',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
  DESERT: [
    {
      name: 'Каменная стела',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Пустынные припасы',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
  SNOW: [
    {
      name: 'Ледяной обелиск',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Снежный валун',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
  URBAN: [
    {
      name: 'Телега',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
    {
      name: 'Торговый прилавок',
      kind: 'PROP',
      blocksMovement: true,
      visibleToPlayers: true,
      showLabel: false,
    },
  ],
};

export function backgroundPresetById(
  id: BattleBackgroundPreset | null,
): BackgroundPresetOption | undefined {
  return backgroundPresets.find((preset) => preset.id === id);
}

export function defaultBackgroundPreset(
  terrain: TerrainTheme,
  stableIndex = 0,
): BackgroundPresetOption {
  const choices = backgroundPresets.filter((preset) => preset.terrain === terrain);
  return choices[Math.abs(stableIndex) % choices.length]!;
}

export function obstacleMaterialUrl(terrain: TerrainTheme, kind: 'WALL' | 'OBSTACLE'): string {
  return `/assets/battle/materials/${terrain.toLowerCase()}-${kind.toLowerCase()}.png`;
}

export function backgroundPresetImageUrl(preset: BackgroundPresetOption): string {
  return `/assets/battle/backgrounds/${preset.id.toLowerCase().replaceAll('_', '-')}.webp`;
}
