import { findBattleReachableCells, isBattlePositionInsideShape } from './battle';
import { defaultBattleSystemAssetId } from './battle-assets';

export type RandomMapTerrain =
  'FOREST' | 'RUINS' | 'DUNGEON' | 'CAVE' | 'SWAMP' | 'DESERT' | 'SNOW' | 'URBAN';

export type RandomMapDanger = 'LOW' | 'MEDIUM' | 'HIGH' | 'DEADLY';
export type RandomMapObjective =
  'SKIRMISH' | 'DEFEND' | 'ESCAPE' | 'RESCUE' | 'CAPTURE' | 'EXPLORE';
export type RandomMapDensity = 'SPARSE' | 'BALANCED' | 'DENSE';
export type RandomMapStartingZones = 'OPPOSITE' | 'ADJACENT' | 'SURROUNDED' | 'RANDOM';
export type RandomMapShape = 'RECTANGLE' | 'CIRCLE' | 'HEXAGON' | 'OCTAGON';

export interface RandomMapEnemyGroup {
  name: string;
  count: number;
  maxHp?: number;
  armorClass?: number | null;
  speed?: number;
  size?: number;
}

export interface GenerateRandomBattleMapInput {
  seed: string;
  name: string;
  description: string;
  terrain: RandomMapTerrain | 'RANDOM';
  size: 'SMALL' | 'MEDIUM' | 'LARGE';
  shape: RandomMapShape;
  gridColumns?: number;
  gridRows?: number;
  playerCount: number;
  enemies: RandomMapEnemyGroup[];
  enemyCount?: number;
  danger: RandomMapDanger;
  objective: RandomMapObjective;
  startingZones: RandomMapStartingZones;
  obstacleDensity: RandomMapDensity;
  difficultTerrain: boolean;
  entrances: number;
  interactiveObjects: boolean;
  hazards: boolean;
  lighting: 'BRIGHT' | 'DIM' | 'DARK';
  weather: 'CLEAR' | 'RAIN' | 'FOG' | 'SNOW' | 'STORM';
}

export interface GeneratedRandomBattleMap {
  seed: string;
  summary: string;
  terrain: RandomMapTerrain;
  scene: {
    name: string;
    shape: RandomMapShape;
    gridColumns: number;
    gridRows: number;
  };
  combatants: Array<{
    key: string;
    name: string;
    kind: 'MONSTER';
    initiative: number;
    currentHp: number;
    maxHp: number;
    armorClass: number | null;
    speed: number;
  }>;
  tokens: Array<{
    combatantKey: string;
    systemAssetId: string;
    x: number;
    y: number;
    size: number;
    color: string;
  }>;
  obstacles: Array<{
    kind: 'WALL' | 'OBSTACLE' | 'DIFFICULT_TERRAIN';
    systemAssetId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    movementCost: number;
  }>;
  objects: Array<{
    kind: 'PROP' | 'CLUE';
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    blocksMovement: boolean;
    visibleToPlayers: boolean;
    showLabel: boolean;
    systemAssetId: string | null;
  }>;
  starts: {
    players: { x: number; y: number };
    enemies: { x: number; y: number };
  };
}

const terrains: RandomMapTerrain[] = [
  'FOREST',
  'RUINS',
  'DUNGEON',
  'CAVE',
  'SWAMP',
  'DESERT',
  'SNOW',
  'URBAN',
];

const terrainNames: Record<RandomMapTerrain, string> = {
  FOREST: 'лес',
  RUINS: 'руины',
  DUNGEON: 'подземелье',
  CAVE: 'пещера',
  SWAMP: 'болото',
  DESERT: 'пустыня',
  SNOW: 'снежная местность',
  URBAN: 'город',
};

const terrainEnemies: Record<RandomMapTerrain, readonly string[]> = {
  FOREST: ['Лесной налётчик', 'Лютоволк', 'Дикий зверь', 'Лесной следопыт'],
  RUINS: ['Страж руин', 'Скелет-мародёр', 'Пробуждённый скелет', 'Каменный страж'],
  DUNGEON: ['Культист подземелья', 'Тюремщик', 'Страж подземелья', 'Глубинный охотник'],
  CAVE: ['Троглодит', 'Кристальный жук', 'Пещерный хищник', 'Глубинный жук'],
  SWAMP: ['Болотная ведьма', 'Топляк', 'Болотная тварь', 'Ядовитая змея'],
  DESERT: ['Песчаный налётчик', 'Гигантский скорпион', 'Скорпион', 'Пустынный охотник'],
  SNOW: ['Морозный призрак', 'Ледяной тролль', 'Снежный хищник', 'Ледяной дух'],
  URBAN: ['Городская убийца', 'Продажный капитан', 'Городской головорез', 'Шпион'],
};

const terrainProps: Record<RandomMapTerrain, readonly string[]> = {
  FOREST: ['Поваленное дерево', 'Каменный идол', 'Заросший алтарь'],
  RUINS: ['Обломки колонны', 'Разбитая статуя', 'Древний механизм'],
  DUNGEON: ['Решётка', 'Рычаг', 'Каменный саркофаг'],
  CAVE: ['Кристаллы', 'Подземный источник', 'Грибная колония'],
  SWAMP: ['Гнилая лодка', 'Камышовый тотем', 'Затонувший сундук'],
  DESERT: ['Высохший колодец', 'Каменная стела', 'Брошенная повозка'],
  SNOW: ['Ледяной обелиск', 'Замёрзшие припасы', 'Сигнальный костёр'],
  URBAN: ['Телега', 'Фонтан', 'Торговый прилавок'],
};

const terrainDecorations: Record<RandomMapTerrain, readonly string[]> = {
  FOREST: ['Поваленное дерево', 'Колючий куст', 'Старый пень', 'Лесной валун'],
  RUINS: ['Обломки колонны', 'Разбитая статуя', 'Каменная урна', 'Груда обломков'],
  DUNGEON: ['Запертый сундук', 'Железная жаровня', 'Каменная колонна', 'Стойка с припасами'],
  CAVE: ['Кристаллы', 'Светящиеся грибы', 'Грибная колония', 'Каменная глыба'],
  SWAMP: ['Гнилая лодка', 'Камыши и коряга', 'Сухое дерево', 'Затонувший сундук'],
  DESERT: ['Каменная стела', 'Пустынные припасы', 'Брошенная повозка', 'Высохший куст'],
  SNOW: ['Ледяной обелиск', 'Снежный валун', 'Замёрзшие припасы', 'Сигнальный костёр'],
  URBAN: ['Телега', 'Торговый прилавок', 'Каменный фонтан', 'Уличная стойка'],
};

const terrainHazards: Record<RandomMapTerrain, readonly string[]> = {
  FOREST: ['Колючие заросли', 'Осиное гнездо'],
  RUINS: ['Ненадёжный пол', 'Падающие обломки'],
  DUNGEON: ['Нажимная плита', 'Ловушка с дротиками'],
  CAVE: ['Осыпь', 'Ядовитые споры'],
  SWAMP: ['Трясина', 'Ядовитые испарения'],
  DESERT: ['Зыбучий песок', 'Раскалённая расселина'],
  SNOW: ['Тонкий лёд', 'Снежный карниз'],
  URBAN: ['Непрочная крыша', 'Горящие обломки'],
};

const tokenColors = ['#ef5350', '#ffa726', '#ab47bc', '#26c6da', '#ec407a', '#8d6e63'];

export function generateRandomBattleMap(
  input: GenerateRandomBattleMapInput,
): GeneratedRandomBattleMap {
  const random = createSeededRandom(`${input.seed}\u0000${stableDescription(input)}`);
  const terrain = input.terrain === 'RANDOM' ? pick(random, terrains) : input.terrain;
  const defaultSize =
    input.size === 'SMALL'
      ? { gridColumns: 12, gridRows: 8 }
      : input.size === 'LARGE'
        ? { gridColumns: 24, gridRows: 16 }
        : { gridColumns: 16, gridRows: 10 };
  const scene = {
    name: input.name,
    shape: input.shape,
    gridColumns: input.gridColumns ?? defaultSize.gridColumns,
    gridRows: input.gridRows ?? defaultSize.gridRows,
  };
  const cells = allInsideCells(scene);
  if (cells.length < 12) throw new Error('The selected map is too small for random generation');

  const starts = chooseStarts(random, cells, scene, input.startingZones);
  const protectedCells = new Set(
    lineBetween(starts.players, starts.enemies).map(({ x, y }) => cellKey(x, y)),
  );
  addNeighborhood(protectedCells, starts.players, scene, 1);
  addNeighborhood(protectedCells, starts.enemies, scene, 1);

  const occupied: Rectangle[] = [];
  const objects: GeneratedRandomBattleMap['objects'] = [];
  const reserveObject = (
    name: string,
    cell: Cell,
    options: Partial<GeneratedRandomBattleMap['objects'][number]> = {},
  ) => {
    const object = {
      kind: 'PROP' as const,
      name,
      x: cell.x,
      y: cell.y,
      width: 1,
      height: 1,
      blocksMovement: false,
      visibleToPlayers: true,
      showLabel: true,
      systemAssetId: null,
      ...options,
    };
    objects.push(object);
    occupied.push(object);
  };
  reserveObject(`Старт игроков (до ${input.playerCount})`, starts.players, {
    visibleToPlayers: false,
  });
  reserveObject('Старт противников', starts.enemies, { visibleToPlayers: false });

  // Large tokens are the hardest to fit. Placing them first prevents a group of
  // one-cell enemies from accidentally fragmenting all valid large placements.
  const enemyGroups = expandEnemyGroups(input, terrain, random)
    .map((enemy, order) => ({ ...enemy, order }))
    .sort((left, right) => right.size - left.size || left.order - right.order);
  const tokens: GeneratedRandomBattleMap['tokens'] = [];
  const combatants: GeneratedRandomBattleMap['combatants'] = [];
  for (let index = 0; index < enemyGroups.length; index += 1) {
    const enemy = enemyGroups[index]!;
    const formationTarget = enemyFormationTarget(
      input.startingZones,
      starts,
      scene,
      index,
      enemyGroups.length,
    );
    const formationPosition = findPlacement({
      random,
      cells,
      scene,
      occupied,
      width: enemy.size,
      height: enemy.size,
      preferred: formationTarget,
      maxDistance: 2,
      selection: 'NEAREST',
    });
    const clusteredPosition =
      formationPosition ??
      findPlacement({
        random,
        cells,
        scene,
        occupied,
        width: enemy.size,
        height: enemy.size,
        preferred: starts.enemies,
        maxDistance: Math.max(3, Math.ceil(scene.gridColumns / 3)),
        selection: 'NEAREST',
      });
    // A shaped edge or a very large group can exhaust its planned formation.
    // Keep the fallback deterministic and as close to the enemy anchor as possible.
    const position =
      clusteredPosition ??
      findPlacement({
        random,
        cells,
        scene,
        occupied,
        width: enemy.size,
        height: enemy.size,
        preferred: starts.enemies,
        selection: 'NEAREST',
      });
    if (!position) {
      throw new Error('The selected map cannot fit every described enemy without overlaps');
    }
    const key = `enemy-${index + 1}`;
    combatants.push({
      key,
      name: enemy.name,
      kind: 'MONSTER',
      initiative: randomInt(random, 7, 16),
      currentHp: enemy.maxHp,
      maxHp: enemy.maxHp,
      armorClass: enemy.armorClass,
      speed: enemy.speed,
    });
    const token = {
      combatantKey: key,
      systemAssetId: defaultBattleSystemAssetId('TOKEN', terrain, index),
      x: position.x,
      y: position.y,
      size: enemy.size,
      color: tokenColors[index % tokenColors.length]!,
    };
    tokens.push(token);
    occupied.push({ ...position, width: enemy.size, height: enemy.size });
  }

  const boundaryCells = cells.filter((cell) => isBoundaryCell(scene, cell));
  for (let index = 0; index < input.entrances; index += 1) {
    const preferred = index % 2 === 0 ? starts.players : starts.enemies;
    const position = findPlacement({
      random,
      cells: boundaryCells,
      scene,
      occupied,
      width: 1,
      height: 1,
      preferred,
      selection: 'NEAREST',
    });
    if (position) {
      const name = index === 0 ? 'Вход' : index === 1 ? 'Выход' : `Дополнительный вход ${index}`;
      reserveObject(name, position);
      addNeighborhood(protectedCells, position, scene, 1);
    }
  }

  const objectiveName = objectiveObjectName(input.objective);
  if (objectiveName) {
    const center = { x: Math.floor(scene.gridColumns / 2), y: Math.floor(scene.gridRows / 2) };
    const position = findPlacement({
      random,
      cells,
      scene,
      occupied,
      width: 1,
      height: 1,
      preferred: center,
      maxDistance: Math.max(scene.gridColumns, scene.gridRows),
    });
    if (position) reserveObject(objectiveName, position);
  }

  const environmentClusters = chooseEnvironmentClusters(
    random,
    cells,
    scene,
    starts,
    input.obstacleDensity,
  );

  if (input.interactiveObjects) {
    const count = input.obstacleDensity === 'DENSE' ? 3 : 2;
    for (let index = 0; index < count; index += 1) {
      const position = findPlacement({
        random,
        cells,
        scene,
        occupied,
        width: 1,
        height: 1,
        preferred: environmentClusters[index % environmentClusters.length],
        maxDistance: 3,
        forbiddenCells: index === 0 ? protectedCells : undefined,
        selection: 'NEAREST',
      });
      if (!position) break;
      reserveObject(pick(random, terrainProps[terrain]), position, {
        showLabel: false,
        blocksMovement: index === 0,
        systemAssetId: defaultBattleSystemAssetId('PROP', terrain, index),
      });
    }
  }

  const environmentTarget = environmentCount(
    input.obstacleDensity,
    scene.gridColumns * scene.gridRows,
  );
  let generatedEnvironmentCount = 0;
  for (let index = 0; index < environmentTarget; index += 1) {
    const blocksMovement = index % 3 === 0;
    const cluster = environmentClusters[index % environmentClusters.length]!;
    const clusteredPosition = findPlacement({
      random,
      cells,
      scene,
      occupied,
      width: 1,
      height: 1,
      preferred: cluster,
      maxDistance: input.obstacleDensity === 'DENSE' ? 2 : 3,
      forbiddenCells: blocksMovement ? protectedCells : undefined,
      selection: 'NEAREST',
    });
    const position =
      clusteredPosition ??
      findPlacement({
        random,
        cells,
        scene,
        occupied,
        width: 1,
        height: 1,
        forbiddenCells: blocksMovement ? protectedCells : undefined,
      });
    if (!position) break;
    const candidate = {
      kind: 'PROP' as const,
      name: pick(random, terrainDecorations[terrain]),
      ...position,
      width: 1,
      height: 1,
      blocksMovement,
      visibleToPlayers: true,
      showLabel: false,
      systemAssetId: defaultBattleSystemAssetId('PROP', terrain, index),
    };
    if (blocksMovement && !hasTraversableRoute(scene, starts, [], [...objects, candidate])) {
      continue;
    }
    objects.push(candidate);
    occupied.push(candidate);
    generatedEnvironmentCount += 1;
  }

  if (input.hazards) {
    const position = findPlacement({
      random,
      cells,
      scene,
      occupied,
      width: 1,
      height: 1,
      preferred: pick(random, environmentClusters),
      maxDistance: 3,
      selection: 'NEAREST',
    });
    if (position) {
      reserveObject(`Опасность: ${pick(random, terrainHazards[terrain])}`, position, {
        kind: 'CLUE',
        showLabel: true,
        systemAssetId: null,
      });
    }
  }

  const obstacles: GeneratedRandomBattleMap['obstacles'] = [];
  const obstacleTarget = densityCount(input.obstacleDensity, scene.gridColumns * scene.gridRows);
  for (let index = 0; index < obstacleTarget; index += 1) {
    const difficult = input.difficultTerrain && index % 3 === 0;
    const kind = difficult
      ? ('DIFFICULT_TERRAIN' as const)
      : terrain === 'DUNGEON' || terrain === 'URBAN' || terrain === 'RUINS'
        ? random() < 0.45
          ? ('WALL' as const)
          : ('OBSTACLE' as const)
        : ('OBSTACLE' as const);
    const horizontal = random() < 0.5;
    const length = kind === 'WALL' ? randomInt(random, 2, 4) : randomInt(random, 1, 3);
    const width = horizontal ? length : 1;
    const height = horizontal ? 1 : length;
    const position = findPlacement({
      random,
      cells,
      scene,
      occupied,
      width,
      height,
      preferred: environmentClusters[index % environmentClusters.length],
      maxDistance: input.obstacleDensity === 'DENSE' ? 3 : 4,
      forbiddenCells: kind === 'DIFFICULT_TERRAIN' ? undefined : protectedCells,
      selection: 'NEAREST',
    });
    if (!position) continue;
    const obstacle = {
      kind,
      systemAssetId:
        kind === 'DIFFICULT_TERRAIN'
          ? null
          : defaultBattleSystemAssetId('OBSTACLE', terrain, kind === 'WALL' ? 0 : 1),
      ...position,
      width,
      height,
      movementCost: difficult ? randomInt(random, 2, 3) : 1,
    };
    if (
      kind !== 'DIFFICULT_TERRAIN' &&
      !hasTraversableRoute(scene, starts, [...obstacles, obstacle], objects)
    ) {
      continue;
    }
    obstacles.push(obstacle);
    occupied.push(obstacle);
  }

  const descriptionSuffix = input.description ? ` — ${input.description}` : '';
  return {
    seed: input.seed,
    terrain,
    summary: `${terrainNames[terrain]}, ${scene.gridColumns}×${scene.gridRows}, ${combatants.length} противников, ${generatedEnvironmentCount} элементов окружения, цель: ${objectiveLabel(input.objective)}${descriptionSuffix}`,
    scene,
    combatants,
    tokens,
    obstacles,
    objects,
    starts,
  };
}

interface Cell {
  x: number;
  y: number;
}

interface Rectangle extends Cell {
  width: number;
  height: number;
}

interface ExpandedEnemy {
  name: string;
  maxHp: number;
  armorClass: number | null;
  speed: number;
  size: number;
}

function expandEnemyGroups(
  input: GenerateRandomBattleMapInput,
  terrain: RandomMapTerrain,
  random: () => number,
): ExpandedEnemy[] {
  const dangerFactor: Record<RandomMapDanger, number> = {
    LOW: 0.6,
    MEDIUM: 1,
    HIGH: 1.5,
    DEADLY: 2,
  };
  const hpByDanger: Record<RandomMapDanger, number> = { LOW: 8, MEDIUM: 12, HIGH: 18, DEADLY: 24 };
  const acByDanger: Record<RandomMapDanger, number> = { LOW: 11, MEDIUM: 13, HIGH: 15, DEADLY: 17 };
  if (input.enemies.length) {
    return input.enemies.flatMap((group) =>
      Array.from({ length: group.count }, (_, index) => ({
        name: group.count === 1 ? group.name : `${group.name} ${index + 1}`,
        maxHp: group.maxHp ?? hpByDanger[input.danger],
        armorClass: group.armorClass === undefined ? acByDanger[input.danger] : group.armorClass,
        speed: group.speed ?? 6,
        size: group.size ?? 1,
      })),
    );
  }
  const count =
    input.enemyCount ?? Math.max(1, Math.round(input.playerCount * dangerFactor[input.danger]));
  const names = terrainEnemies[terrain];
  return Array.from({ length: count }, (_, index) => ({
    name: `${pick(random, names)} ${index + 1}`,
    maxHp: hpByDanger[input.danger] + randomInt(random, -2, 3),
    armorClass: acByDanger[input.danger],
    speed: 6,
    size: input.danger === 'DEADLY' && index === 0 && count > 1 ? 2 : 1,
  }));
}

function chooseStarts(
  random: () => number,
  cells: Cell[],
  scene: GeneratedRandomBattleMap['scene'],
  mode: RandomMapStartingZones,
): GeneratedRandomBattleMap['starts'] {
  const center = { x: (scene.gridColumns - 1) / 2, y: (scene.gridRows - 1) / 2 };
  const left = nearestCell(cells, { x: 1, y: center.y });
  const right = nearestCell(cells, { x: scene.gridColumns - 2, y: center.y });
  if (mode === 'OPPOSITE') return { players: left, enemies: right };
  if (mode === 'ADJACENT') {
    return {
      players: left,
      enemies: nearestCell(cells, { x: Math.min(left.x + 4, scene.gridColumns - 1), y: left.y }),
    };
  }
  if (mode === 'SURROUNDED') {
    return { players: nearestCell(cells, center), enemies: pick(random, [left, right]) };
  }
  const first = pick(random, cells);
  const distant = cells.filter(
    (cell) => chebyshevDistance(cell, first) >= Math.max(3, Math.floor(scene.gridColumns / 2)),
  );
  return { players: first, enemies: pick(random, distant.length ? distant : cells) };
}

function enemyFormationTarget(
  mode: RandomMapStartingZones,
  starts: GeneratedRandomBattleMap['starts'],
  scene: GeneratedRandomBattleMap['scene'],
  index: number,
  count: number,
): Cell {
  if (mode === 'SURROUNDED') {
    const radius = Math.max(3, Math.floor(Math.min(scene.gridColumns, scene.gridRows) / 3));
    const angle = (Math.PI * 2 * index) / Math.max(1, count);
    return {
      x: Math.round(starts.players.x + Math.cos(angle) * radius),
      y: Math.round(starts.players.y + Math.sin(angle) * radius),
    };
  }

  const formationHeight = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rank = Math.floor(index / formationHeight) + 1;
  const offset = (index % formationHeight) - Math.floor((formationHeight - 1) / 2);
  const direction = starts.enemies.x >= scene.gridColumns / 2 ? -1 : 1;
  return {
    x: starts.enemies.x + direction * rank,
    y: starts.enemies.y + offset,
  };
}

function chooseEnvironmentClusters(
  random: () => number,
  cells: Cell[],
  scene: GeneratedRandomBattleMap['scene'],
  starts: GeneratedRandomBattleMap['starts'],
  density: RandomMapDensity,
): Cell[] {
  const targetCount = density === 'DENSE' ? 3 : 2;
  const minimumSpacing = Math.max(3, Math.floor(Math.min(scene.gridColumns, scene.gridRows) / 3));
  const candidates = shuffled(random, cells).filter(
    (cell) =>
      chebyshevDistance(cell, starts.players) >= 3 && chebyshevDistance(cell, starts.enemies) >= 3,
  );
  const clusters: Cell[] = [];
  for (const candidate of candidates) {
    if (clusters.every((cluster) => chebyshevDistance(cluster, candidate) >= minimumSpacing)) {
      clusters.push(candidate);
      if (clusters.length === targetCount) break;
    }
  }
  if (!clusters.length) clusters.push(nearestCell(cells, { x: scene.gridColumns / 2, y: 1 }));
  return clusters;
}

function findPlacement(input: {
  random: () => number;
  cells: Cell[];
  scene: GeneratedRandomBattleMap['scene'];
  occupied: Rectangle[];
  width: number;
  height: number;
  preferred?: Cell;
  minDistance?: number;
  maxDistance?: number;
  forbiddenCells?: Set<string>;
  selection?: 'RANDOM' | 'NEAREST';
}): Cell | null {
  const candidates = input.cells
    .map((cell) => ({ cell, tieBreaker: input.random() }))
    .filter(({ cell }) => {
      if (!isBattlePositionInsideShape(input.scene, cell.x, cell.y, input.width, input.height)) {
        return false;
      }
      if (
        input.occupied.some((item) =>
          rectanglesIntersect(
            cell.x,
            cell.y,
            input.width,
            input.height,
            item.x,
            item.y,
            item.width,
            item.height,
          ),
        )
      ) {
        return false;
      }
      if (input.forbiddenCells) {
        for (let x = cell.x; x < cell.x + input.width; x += 1) {
          for (let y = cell.y; y < cell.y + input.height; y += 1) {
            if (input.forbiddenCells.has(cellKey(x, y))) return false;
          }
        }
      }
      if (!input.preferred) return true;
      const distance = chebyshevDistance(cell, input.preferred);
      return distance >= (input.minDistance ?? 0) && distance <= (input.maxDistance ?? Infinity);
    })
    .sort((left, right) => {
      if (input.selection === 'NEAREST' && input.preferred) {
        const distance =
          chebyshevDistance(left.cell, input.preferred) -
          chebyshevDistance(right.cell, input.preferred);
        if (distance !== 0) return distance;
      }
      return left.tieBreaker - right.tieBreaker;
    });
  return candidates[0]?.cell ?? null;
}

function allInsideCells(scene: GeneratedRandomBattleMap['scene']): Cell[] {
  const result: Cell[] = [];
  for (let y = 0; y < scene.gridRows; y += 1) {
    for (let x = 0; x < scene.gridColumns; x += 1) {
      if (isBattlePositionInsideShape(scene, x, y)) result.push({ x, y });
    }
  }
  return result;
}

function isBoundaryCell(scene: GeneratedRandomBattleMap['scene'], cell: Cell): boolean {
  return [
    { x: cell.x - 1, y: cell.y },
    { x: cell.x + 1, y: cell.y },
    { x: cell.x, y: cell.y - 1 },
    { x: cell.x, y: cell.y + 1 },
  ].some(({ x, y }) => !isBattlePositionInsideShape(scene, x, y));
}

function lineBetween(from: Cell, to: Cell): Cell[] {
  const result: Cell[] = [];
  let x = from.x;
  let y = from.y;
  while (x !== to.x || y !== to.y) {
    result.push({ x, y });
    if (x !== to.x) x += Math.sign(to.x - x);
    if (y !== to.y) y += Math.sign(to.y - y);
  }
  result.push({ x, y });
  return result;
}

function addNeighborhood(
  target: Set<string>,
  center: Cell,
  scene: GeneratedRandomBattleMap['scene'],
  radius: number,
): void {
  for (let x = center.x - radius; x <= center.x + radius; x += 1) {
    for (let y = center.y - radius; y <= center.y + radius; y += 1) {
      if (isBattlePositionInsideShape(scene, x, y)) target.add(cellKey(x, y));
    }
  }
}

function nearestCell(cells: Cell[], target: { x: number; y: number }): Cell {
  return cells.reduce((best, cell) =>
    Math.hypot(cell.x - target.x, cell.y - target.y) <
    Math.hypot(best.x - target.x, best.y - target.y)
      ? cell
      : best,
  );
}

function densityCount(density: RandomMapDensity, area: number): number {
  const divisor = density === 'SPARSE' ? 45 : density === 'DENSE' ? 18 : 28;
  return Math.max(2, Math.min(18, Math.round(area / divisor)));
}

function environmentCount(density: RandomMapDensity, area: number): number {
  const divisor = density === 'SPARSE' ? 55 : density === 'DENSE' ? 22 : 34;
  return Math.max(2, Math.min(14, Math.round(area / divisor)));
}

function hasTraversableRoute(
  scene: GeneratedRandomBattleMap['scene'],
  starts: GeneratedRandomBattleMap['starts'],
  obstacles: GeneratedRandomBattleMap['obstacles'],
  objects: GeneratedRandomBattleMap['objects'],
): boolean {
  const reachable = findBattleReachableCells({
    scene: { status: 'DRAFT', ...scene, activeCombatantId: null },
    token: {
      combatantId: 'route-probe',
      ownerUserId: null,
      ...starts.players,
      size: 1,
    },
    remainingMovement: scene.gridColumns * scene.gridRows * 5,
    obstacles: [
      ...obstacles,
      ...objects
        .filter(({ blocksMovement }) => blocksMovement)
        .map(({ x, y, width, height }) => ({
          kind: 'OBSTACLE' as const,
          x,
          y,
          width,
          height,
          movementCost: 1,
        })),
    ],
  });
  return reachable.some(({ x, y }) => x === starts.enemies.x && y === starts.enemies.y);
}

function objectiveObjectName(objective: RandomMapObjective): string | null {
  const names: Record<RandomMapObjective, string | null> = {
    SKIRMISH: null,
    DEFEND: 'Точка обороны',
    ESCAPE: 'Путь к отступлению',
    RESCUE: 'Цель спасения',
    CAPTURE: 'Точка захвата',
    EXPLORE: 'Точка интереса',
  };
  return names[objective];
}

function objectiveLabel(objective: RandomMapObjective): string {
  const labels: Record<RandomMapObjective, string> = {
    SKIRMISH: 'схватка',
    DEFEND: 'оборона',
    ESCAPE: 'побег',
    RESCUE: 'спасение',
    CAPTURE: 'захват',
    EXPLORE: 'исследование',
  };
  return labels[objective];
}

function stableDescription(input: GenerateRandomBattleMapInput): string {
  return JSON.stringify({
    ...input,
    seed: undefined,
    enemies: input.enemies.map((enemy) => ({ ...enemy })),
  });
}

function createSeededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  if (!values.length) throw new Error('Cannot pick from an empty collection');
  return values[Math.floor(random() * values.length)]!;
}

function shuffled<T>(random: () => number, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function randomInt(random: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function chebyshevDistance(left: Cell, right: Cell): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function rectanglesIntersect(
  leftX: number,
  leftY: number,
  leftWidth: number,
  leftHeight: number,
  rightX: number,
  rightY: number,
  rightWidth: number,
  rightHeight: number,
): boolean {
  return (
    leftX < rightX + rightWidth &&
    leftX + leftWidth > rightX &&
    leftY < rightY + rightHeight &&
    leftY + leftHeight > rightY
  );
}
