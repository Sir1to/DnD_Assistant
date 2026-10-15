export const BATTLE_SYSTEM_ASSET_PACK = {
  id: 'fog-of-lore-starter',
  version: '1.0.0',
  label: 'Стартовый набор Fog of Lore',
  source: 'Оригинальные ассеты Fog of Lore',
  license: 'Поставляется вместе с Fog of Lore; разрешено использование внутри приложения',
} as const;

export type BattleSystemAssetKind = 'BACKGROUND' | 'TOKEN' | 'PROP' | 'OBSTACLE';
export type BattleSystemAssetTerrain =
  'FOREST' | 'RUINS' | 'DUNGEON' | 'CAVE' | 'SWAMP' | 'DESERT' | 'SNOW' | 'URBAN';

export interface BattleSystemAsset {
  id: string;
  label: string;
  kind: BattleSystemAssetKind;
  terrain: BattleSystemAssetTerrain;
  tags: readonly string[];
  width: number;
  height: number;
  source: string;
  license: string;
  packId: string;
  packVersion: string;
  render:
    | { type: 'IMAGE'; url: string }
    | { type: 'ATLAS'; url: string; index: number; columns: number; rows: number };
}

const terrainIds = [
  'forest',
  'ruins',
  'dungeon',
  'cave',
  'swamp',
  'desert',
  'snow',
  'urban',
] as const;

const terrainNames: Record<(typeof terrainIds)[number], string> = {
  forest: 'Лес',
  ruins: 'Руины',
  dungeon: 'Подземелье',
  cave: 'Пещера',
  swamp: 'Болото',
  desert: 'Пустыня',
  snow: 'Снег и лёд',
  urban: 'Город',
};

const terrainCodes: Record<(typeof terrainIds)[number], BattleSystemAssetTerrain> = {
  forest: 'FOREST',
  ruins: 'RUINS',
  dungeon: 'DUNGEON',
  cave: 'CAVE',
  swamp: 'SWAMP',
  desert: 'DESERT',
  snow: 'SNOW',
  urban: 'URBAN',
};

const backgroundDefinitions = [
  ['forest', 'clearing', 'Лесная поляна'],
  ['forest', 'creek', 'Лесной ручей'],
  ['ruins', 'rubble', 'Заросшие обломки'],
  ['ruins', 'courtyard', 'Древние плиты'],
  ['dungeon', 'stone', 'Сухие плиты подземелья'],
  ['dungeon', 'damp', 'Сырые плиты подземелья'],
  ['cave', 'crystal', 'Кристальная пещера'],
  ['cave', 'volcanic', 'Вулканическая пещера'],
  ['swamp', 'murk', 'Тёмная трясина'],
  ['swamp', 'reeds', 'Камышовое болото'],
  ['desert', 'dunes', 'Песчаные дюны'],
  ['desert', 'salt', 'Высохшие солончаки'],
  ['snow', 'tundra', 'Снежная тундра'],
  ['snow', 'glacier', 'Ледяное поле'],
  ['urban', 'plaza', 'Городская площадь'],
  ['urban', 'road', 'Грязная торговая дорога'],
] as const;

const tokenDefinitions = [
  ['forest', 'raider', 'Лесной налётчик'],
  ['forest', 'dire-wolf', 'Лютоволк'],
  ['ruins', 'guardian', 'Страж руин'],
  ['ruins', 'skeleton', 'Скелет-мародёр'],
  ['dungeon', 'cultist', 'Культист подземелья'],
  ['dungeon', 'jailer', 'Тюремщик'],
  ['cave', 'troglodyte', 'Троглодит'],
  ['cave', 'crystal-beetle', 'Кристальный жук'],
  ['swamp', 'witch', 'Болотная ведьма'],
  ['swamp', 'drowned', 'Топляк'],
  ['desert', 'raider', 'Песчаный налётчик'],
  ['desert', 'scorpion', 'Гигантский скорпион'],
  ['snow', 'frost-ghost', 'Морозный призрак'],
  ['snow', 'ice-troll', 'Ледяной тролль'],
  ['urban', 'assassin', 'Городская убийца'],
  ['urban', 'captain', 'Продажный капитан'],
] as const;

const propDefinitions = [
  ['forest', 'fallen-tree', 'Поваленное дерево'],
  ['forest', 'thorn-bush', 'Колючий куст'],
  ['ruins', 'broken-column', 'Обломки колонны'],
  ['ruins', 'broken-statue', 'Разбитая статуя'],
  ['dungeon', 'locked-chest', 'Запертый сундук'],
  ['dungeon', 'brazier', 'Железная жаровня'],
  ['cave', 'crystals', 'Кристаллы'],
  ['cave', 'glowing-mushrooms', 'Светящиеся грибы'],
  ['swamp', 'rotten-boat', 'Гнилая лодка'],
  ['swamp', 'reeds-snag', 'Камыши и коряга'],
  ['desert', 'stone-stele', 'Каменная стела'],
  ['desert', 'supplies', 'Пустынные припасы'],
  ['snow', 'ice-obelisk', 'Ледяной обелиск'],
  ['snow', 'snow-boulder', 'Снежный валун'],
  ['urban', 'cart', 'Телега'],
  ['urban', 'market-stall', 'Торговый прилавок'],
] as const;

function metadata() {
  return {
    source: BATTLE_SYSTEM_ASSET_PACK.source,
    license: BATTLE_SYSTEM_ASSET_PACK.license,
    packId: BATTLE_SYSTEM_ASSET_PACK.id,
    packVersion: BATTLE_SYSTEM_ASSET_PACK.version,
  };
}

const backgrounds: BattleSystemAsset[] = backgroundDefinitions.map(([terrain, variant, label]) => ({
  id: `starter.background.${terrain}.${variant}`,
  label,
  kind: 'BACKGROUND',
  terrain: terrainCodes[terrain],
  tags: [terrainNames[terrain], 'поле', 'фон'],
  width: 314,
  height: 314,
  render: { type: 'IMAGE', url: `/assets/battle/backgrounds/${terrain}-${variant}.webp` },
  ...metadata(),
}));

const tokens: BattleSystemAsset[] = tokenDefinitions.map(([terrain, variant, label], index) => ({
  id: `starter.token.${terrain}.${variant}`,
  label,
  kind: 'TOKEN',
  terrain: terrainCodes[terrain],
  tags: [terrainNames[terrain], 'токен', 'противник'],
  width: 313,
  height: 313,
  render: {
    type: 'ATLAS',
    url: '/assets/battle/enemy-portraits-expanded-atlas.png',
    index,
    columns: 4,
    rows: 4,
  },
  ...metadata(),
}));

const props: BattleSystemAsset[] = propDefinitions.map(([terrain, variant, label], index) => ({
  id: `starter.prop.${terrain}.${variant}`,
  label,
  kind: 'PROP',
  terrain: terrainCodes[terrain],
  tags: [terrainNames[terrain], 'окружение', 'предмет'],
  width: 313,
  height: 313,
  render: {
    type: 'ATLAS',
    url: '/assets/battle/environment-props-expanded-atlas.png',
    index,
    columns: 4,
    rows: 4,
  },
  ...metadata(),
}));

const obstacles: BattleSystemAsset[] = terrainIds.flatMap((terrain) =>
  (['wall', 'obstacle'] as const).map((variant) => ({
    id: `starter.obstacle.${terrain}.${variant}`,
    label: `${variant === 'wall' ? 'Стена' : 'Препятствие'} · ${terrainNames[terrain]}`,
    kind: 'OBSTACLE' as const,
    terrain: terrainCodes[terrain],
    tags: [terrainNames[terrain], variant === 'wall' ? 'стена' : 'препятствие', 'материал'],
    width: 314,
    height: 314,
    render: {
      type: 'IMAGE' as const,
      url: `/assets/battle/materials/${terrain}-${variant}.png`,
    },
    ...metadata(),
  })),
);

export const battleSystemAssets: readonly BattleSystemAsset[] = [
  ...backgrounds,
  ...tokens,
  ...props,
  ...obstacles,
];

const assetsById = new Map(battleSystemAssets.map((asset) => [asset.id, asset]));

export function battleSystemAssetById(id: string | null | undefined): BattleSystemAsset | null {
  return id ? (assetsById.get(id) ?? null) : null;
}

export function battleSystemAssetsFor(
  kind: BattleSystemAssetKind,
  terrain?: BattleSystemAssetTerrain | null,
): readonly BattleSystemAsset[] {
  return battleSystemAssets.filter(
    (asset) => asset.kind === kind && (!terrain || asset.terrain === terrain),
  );
}

export function defaultBattleSystemAssetId(
  kind: Exclude<BattleSystemAssetKind, 'BACKGROUND'>,
  terrain: BattleSystemAssetTerrain,
  stableIndex = 0,
): string {
  const choices = battleSystemAssetsFor(kind, terrain);
  if (!choices.length) throw new Error(`No ${kind} system asset exists for ${terrain}`);
  return choices[Math.abs(stableIndex) % choices.length]!.id;
}
