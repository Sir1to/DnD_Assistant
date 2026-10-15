import { describe, expect, it } from 'vitest';

import { findBattleReachableCells } from './battle';
import { battleSystemAssetById } from './battle-assets';
import { generateRandomBattleMap, type GenerateRandomBattleMapInput } from './battle-map-generator';

const input: GenerateRandomBattleMapInput = {
  seed: 'forest-42',
  name: 'Засада в старом лесу',
  description: 'Ручей, древние камни и узкая тропа',
  terrain: 'FOREST',
  size: 'MEDIUM',
  shape: 'RECTANGLE',
  playerCount: 4,
  enemies: [],
  danger: 'HIGH',
  objective: 'DEFEND',
  startingZones: 'OPPOSITE',
  obstacleDensity: 'DENSE',
  difficultTerrain: true,
  entrances: 2,
  interactiveObjects: true,
  hazards: true,
  lighting: 'DIM',
  weather: 'FOG',
};

describe('random battle map generation', () => {
  it('is deterministic for the same description and seed', () => {
    expect(generateRandomBattleMap(input)).toEqual(generateRandomBattleMap(input));
    expect(generateRandomBattleMap({ ...input, seed: 'forest-43' })).not.toEqual(
      generateRandomBattleMap(input),
    );
  });

  it('assigns catalog assets that match every generated feature type and terrain', () => {
    const map = generateRandomBattleMap(input);

    for (const token of map.tokens) {
      expect(battleSystemAssetById(token.systemAssetId)).toMatchObject({
        kind: 'TOKEN',
        terrain: input.terrain,
      });
    }
    for (const obstacle of map.obstacles) {
      if (obstacle.systemAssetId === null) continue;
      expect(battleSystemAssetById(obstacle.systemAssetId)).toMatchObject({
        kind: 'OBSTACLE',
        terrain: input.terrain,
      });
    }
    for (const object of map.objects) {
      if (object.systemAssetId === null) continue;
      expect(battleSystemAssetById(object.systemAssetId)).toMatchObject({
        kind: 'PROP',
        terrain: input.terrain,
      });
    }
  });

  it('keeps tokens and generated features inside the scene without overlaps', () => {
    const map = generateRandomBattleMap(input);
    const rectangles = [
      ...map.tokens.map((token) => ({
        label: token.combatantKey,
        x: token.x,
        y: token.y,
        width: token.size,
        height: token.size,
      })),
      ...map.obstacles.map((obstacle, index) => ({ label: `obstacle-${index}`, ...obstacle })),
      ...map.objects.map((object, index) => ({ label: `object-${index}`, ...object })),
    ];

    for (const rectangle of rectangles) {
      expect(rectangle.x).toBeGreaterThanOrEqual(0);
      expect(rectangle.y).toBeGreaterThanOrEqual(0);
      expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(map.scene.gridColumns);
      expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(map.scene.gridRows);
    }
    for (let left = 0; left < rectangles.length; left += 1) {
      for (let right = left + 1; right < rectangles.length; right += 1) {
        expect(intersects(rectangles[left]!, rectangles[right]!)).toBe(false);
      }
    }
  });

  it('always leaves a traversable route between starting zones', () => {
    for (const shape of ['RECTANGLE', 'CIRCLE', 'HEXAGON', 'OCTAGON'] as const) {
      const map = generateRandomBattleMap({ ...input, shape, seed: `route-${shape}` });
      const reachable = findBattleReachableCells({
        scene: {
          status: 'DRAFT',
          ...map.scene,
          activeCombatantId: null,
        },
        token: {
          combatantId: 'probe',
          ownerUserId: null,
          ...map.starts.players,
          size: 1,
        },
        remainingMovement: map.scene.gridColumns * map.scene.gridRows * 3,
        obstacles: [
          ...map.obstacles,
          ...map.objects
            .filter(({ blocksMovement }) => blocksMovement)
            .map((object) => ({
              kind: 'OBSTACLE' as const,
              x: object.x,
              y: object.y,
              width: object.width,
              height: object.height,
              movementCost: 1,
            })),
        ],
      });
      expect(
        reachable.some(({ x, y }) => x === map.starts.enemies.x && y === map.starts.enemies.y),
      ).toBe(true);
    }
  });

  it('generates more visible environment for denser maps', () => {
    const sparse = generateRandomBattleMap({
      ...input,
      interactiveObjects: false,
      hazards: false,
      obstacleDensity: 'SPARSE',
    });
    const dense = generateRandomBattleMap({
      ...input,
      interactiveObjects: false,
      hazards: false,
      obstacleDensity: 'DENSE',
    });
    const generatedProps = (map: ReturnType<typeof generateRandomBattleMap>) =>
      map.objects.filter(
        ({ name, visibleToPlayers, showLabel }) =>
          visibleToPlayers && !showLabel && !name.startsWith('Старт'),
      );

    expect(generatedProps(sparse).length).toBeGreaterThanOrEqual(2);
    expect(generatedProps(dense).length).toBeGreaterThan(generatedProps(sparse).length);
  });

  it('keeps a route across a broad set of seeds, shapes and terrains', () => {
    for (const terrain of [
      'FOREST',
      'RUINS',
      'DUNGEON',
      'CAVE',
      'SWAMP',
      'DESERT',
      'SNOW',
      'URBAN',
    ] as const) {
      for (const shape of ['RECTANGLE', 'CIRCLE', 'HEXAGON', 'OCTAGON'] as const) {
        for (let variant = 0; variant < 3; variant += 1) {
          const map = generateRandomBattleMap({
            ...input,
            terrain,
            shape,
            seed: `${terrain}-${shape}-${variant}`,
          });
          const reachable = findBattleReachableCells({
            scene: { status: 'DRAFT', ...map.scene, activeCombatantId: null },
            token: {
              combatantId: 'probe',
              ownerUserId: null,
              ...map.starts.players,
              size: 1,
            },
            remainingMovement: map.scene.gridColumns * map.scene.gridRows * 3,
            obstacles: [
              ...map.obstacles,
              ...map.objects
                .filter(({ blocksMovement }) => blocksMovement)
                .map((object) => ({
                  kind: 'OBSTACLE' as const,
                  x: object.x,
                  y: object.y,
                  width: object.width,
                  height: object.height,
                  movementCost: 1,
                })),
            ],
          });
          expect(
            reachable.some(({ x, y }) => x === map.starts.enemies.x && y === map.starts.enemies.y),
          ).toBe(true);
        }
      }
    }
  });

  it('uses compact formations instead of scattering enemies across the map', () => {
    const opposite = generateRandomBattleMap({
      ...input,
      enemyCount: 8,
      enemies: [],
      startingZones: 'OPPOSITE',
      seed: 'compact-formation',
    });
    const averageDistance =
      opposite.tokens.reduce(
        (total, token) =>
          total +
          Math.max(
            Math.abs(token.x - opposite.starts.enemies.x),
            Math.abs(token.y - opposite.starts.enemies.y),
          ),
        0,
      ) / opposite.tokens.length;
    expect(averageDistance).toBeLessThanOrEqual(4);

    const surrounded = generateRandomBattleMap({
      ...input,
      enemyCount: 8,
      enemies: [],
      startingZones: 'SURROUNDED',
      seed: 'surrounded-formation',
    });
    expect(surrounded.tokens.some(({ x }) => x < surrounded.starts.players.x)).toBe(true);
    expect(surrounded.tokens.some(({ x }) => x > surrounded.starts.players.x)).toBe(true);
    expect(surrounded.tokens.some(({ y }) => y < surrounded.starts.players.y)).toBe(true);
    expect(surrounded.tokens.some(({ y }) => y > surrounded.starts.players.y)).toBe(true);
  });
});

function intersects(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
