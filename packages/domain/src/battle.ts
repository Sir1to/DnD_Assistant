export interface MovementScene {
  status: 'DRAFT' | 'LIVE' | 'PAUSED' | 'ARCHIVED';
  gridColumns: number;
  gridRows: number;
  shape?: 'RECTANGLE' | 'CIRCLE' | 'HEXAGON' | 'OCTAGON';
  activeCombatantId: string | null;
}

export interface MovementCombatant {
  id: string;
  speed: number;
  movementSpent: number;
}

export interface MovementToken {
  combatantId: string;
  ownerUserId: string | null;
  x: number;
  y: number;
  size: number;
}

export interface MovementObstacle {
  kind: 'WALL' | 'OBSTACLE' | 'DIFFICULT_TERRAIN';
  x: number;
  y: number;
  width: number;
  height: number;
  movementCost: number;
}

export type MoveRejection =
  | 'SCENE_NOT_LIVE'
  | 'NOT_ACTIVE_TURN'
  | 'NOT_TOKEN_OWNER'
  | 'OUT_OF_BOUNDS'
  | 'BLOCKED'
  | 'TOO_FAR';

export function squareGridDistance(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
}

export function isBattlePositionInsideShape(
  scene: Pick<MovementScene, 'gridColumns' | 'gridRows' | 'shape'>,
  x: number,
  y: number,
  width = 1,
  height = width,
): boolean {
  if (x < 0 || y < 0 || x + width > scene.gridColumns || y + height > scene.gridRows) {
    return false;
  }
  const shape = scene.shape ?? 'RECTANGLE';
  if (shape === 'RECTANGLE') return true;
  const corners = [
    [x + 0.5, y + 0.5],
    [x + width - 0.5, y + 0.5],
    [x + 0.5, y + height - 0.5],
    [x + width - 0.5, y + height - 0.5],
  ];
  return corners.every(([cellX, cellY]) => pointInsideShape(shape, cellX!, cellY!, scene));
}

export function findBattleReachableCells(input: {
  scene: MovementScene;
  token: MovementToken;
  remainingMovement: number;
  obstacles?: MovementObstacle[];
}): Array<{ x: number; y: number; cost: number }> {
  const { scene, token, remainingMovement, obstacles = [] } = input;
  const start = `${token.x}:${token.y}`;
  const distances = new Map<string, number>([[start, 0]]);
  const pending: Array<{ x: number; y: number; cost: number }> = [
    { x: token.x, y: token.y, cost: 0 },
  ];
  const directions = [-1, 0, 1];
  while (pending.length) {
    pending.sort((left, right) => left.cost - right.cost);
    const current = pending.shift();
    if (!current || current.cost !== distances.get(`${current.x}:${current.y}`)) continue;
    for (const dx of directions) {
      for (const dy of directions) {
        if (dx === 0 && dy === 0) continue;
        const x = current.x + dx;
        const y = current.y + dy;
        const stepCost = movementCostAt(scene, token.size, x, y, obstacles);
        if (stepCost === null) continue;
        const cost = current.cost + stepCost;
        if (cost > remainingMovement) continue;
        const key = `${x}:${y}`;
        if (cost >= (distances.get(key) ?? Number.POSITIVE_INFINITY)) continue;
        distances.set(key, cost);
        pending.push({ x, y, cost });
      }
    }
  }
  return [...distances.entries()].map(([key, cost]) => {
    const [x, y] = key.split(':').map(Number);
    return { x: x!, y: y!, cost };
  });
}

export function battleMovementCost(input: {
  scene: MovementScene;
  token: MovementToken;
  toX: number;
  toY: number;
  obstacles?: MovementObstacle[];
}): number | null {
  const reachable = findBattleReachableCells({
    scene: input.scene,
    token: input.token,
    remainingMovement: Math.max(input.scene.gridColumns * input.scene.gridRows * 5, 1),
    obstacles: input.obstacles,
  });
  return reachable.find(({ x, y }) => x === input.toX && y === input.toY)?.cost ?? null;
}

export function validatePlayerMove(input: {
  scene: MovementScene;
  combatant: MovementCombatant;
  token: MovementToken;
  userId: string;
  toX: number;
  toY: number;
  obstacles?: MovementObstacle[];
}): { ok: true; distance: number } | { ok: false; reason: MoveRejection } {
  const { scene, combatant, token, userId, toX, toY, obstacles } = input;
  if (scene.status !== 'LIVE') return { ok: false, reason: 'SCENE_NOT_LIVE' };
  if (scene.activeCombatantId !== combatant.id) return { ok: false, reason: 'NOT_ACTIVE_TURN' };
  if (token.ownerUserId !== userId) return { ok: false, reason: 'NOT_TOKEN_OWNER' };
  if (
    toX < 0 ||
    toY < 0 ||
    toX + token.size > scene.gridColumns ||
    toY + token.size > scene.gridRows
  ) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }
  const distance = battleMovementCost({ scene, token, toX, toY, obstacles });
  if (distance === null) return { ok: false, reason: 'BLOCKED' };
  if (distance > Math.max(0, combatant.speed - combatant.movementSpent)) {
    return { ok: false, reason: 'TOO_FAR' };
  }
  return { ok: true, distance };
}

function movementCostAt(
  scene: MovementScene,
  size: number,
  x: number,
  y: number,
  obstacles: MovementObstacle[],
): number | null {
  if (!isBattlePositionInsideShape(scene, x, y, size)) return null;
  let cost = 1;
  for (const obstacle of obstacles) {
    if (
      !rectanglesIntersect(
        x,
        y,
        size,
        size,
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height,
      )
    ) {
      continue;
    }
    if (obstacle.kind !== 'DIFFICULT_TERRAIN') return null;
    cost = Math.max(cost, obstacle.movementCost);
  }
  return cost;
}

function pointInsideShape(
  shape: NonNullable<MovementScene['shape']>,
  x: number,
  y: number,
  scene: Pick<MovementScene, 'gridColumns' | 'gridRows'>,
): boolean {
  const nx = (x / scene.gridColumns) * 2 - 1;
  const ny = (y / scene.gridRows) * 2 - 1;
  if (shape === 'CIRCLE') return nx * nx + ny * ny <= 1;
  if (shape === 'HEXAGON') return Math.abs(nx) <= 1 && Math.abs(ny) <= 1 - Math.abs(nx) * 0.5;
  return Math.abs(nx) <= 1 && Math.abs(ny) <= 1 && Math.abs(nx) + Math.abs(ny) <= 1.5;
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

export function battleHpState(
  currentHp: number,
  maxHp: number,
): 'UNHARMED' | 'HURT' | 'BLOODIED' | 'CRITICAL' | 'DEFEATED' {
  if (currentHp <= 0) return 'DEFEATED';
  const ratio = currentHp / maxHp;
  if (ratio >= 1) return 'UNHARMED';
  if (ratio > 0.5) return 'HURT';
  if (ratio > 0.25) return 'BLOODIED';
  return 'CRITICAL';
}

export function adjustBattleHp(
  currentHp: number,
  maxHp: number,
  temporaryHp: number,
  amount: number,
  mode: 'DAMAGE' | 'HEAL',
): { currentHp: number; temporaryHp: number } {
  if (mode === 'HEAL') {
    return { currentHp: Math.min(maxHp, currentHp + amount), temporaryHp };
  }
  const absorbed = Math.min(temporaryHp, amount);
  return {
    currentHp: Math.max(0, currentHp - (amount - absorbed)),
    temporaryHp: temporaryHp - absorbed,
  };
}
