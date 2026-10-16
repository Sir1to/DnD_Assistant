import { z } from 'zod';

import { campaignRoleSchema } from './campaigns';

export const battleSceneStatusSchema = z.enum(['DRAFT', 'LIVE', 'PAUSED', 'ARCHIVED']);
export const battleSceneShapeSchema = z.enum(['RECTANGLE', 'CIRCLE', 'HEXAGON', 'OCTAGON']);
export const battleCombatantKindSchema = z.enum(['PLAYER', 'ALLY', 'NPC', 'MONSTER', 'OBJECT']);
export const battleNameVisibilitySchema = z.enum(['EXACT', 'GENERIC', 'HIDDEN']);
export const battleHpVisibilitySchema = z.enum(['EXACT', 'BAR', 'STATE', 'HIDDEN']);
export const battleConditionsVisibilitySchema = z.enum(['ALL', 'HIDDEN']);
export const battleObstacleKindSchema = z.enum(['WALL', 'OBSTACLE', 'DIFFICULT_TERRAIN']);
export const battleSceneObjectKindSchema = z.enum(['PROP', 'CLUE']);
export const battleSystemAssetIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

export const randomBattleMapTerrainSchema = z.enum([
  'RANDOM',
  'FOREST',
  'RUINS',
  'DUNGEON',
  'CAVE',
  'SWAMP',
  'DESERT',
  'SNOW',
  'URBAN',
]);
export const randomBattleMapSizeSchema = z.enum(['SMALL', 'MEDIUM', 'LARGE']);
export const randomBattleMapDangerSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'DEADLY']);
export const randomBattleMapObjectiveSchema = z.enum([
  'SKIRMISH',
  'DEFEND',
  'ESCAPE',
  'RESCUE',
  'CAPTURE',
  'EXPLORE',
]);
export const randomBattleMapDensitySchema = z.enum(['SPARSE', 'BALANCED', 'DENSE']);
export const randomBattleMapStartingZonesSchema = z.enum([
  'OPPOSITE',
  'ADJACENT',
  'SURROUNDED',
  'RANDOM',
]);
export const randomBattleMapLightingSchema = z.enum(['BRIGHT', 'DIM', 'DARK']);
export const randomBattleMapWeatherSchema = z.enum(['CLEAR', 'RAIN', 'FOG', 'SNOW', 'STORM']);
export const battleBackgroundPresetSchema = z.enum([
  'FOREST_CLEARING',
  'FOREST_CREEK',
  'RUINS_RUBBLE',
  'RUINS_COURTYARD',
  'DUNGEON_STONE',
  'DUNGEON_DAMP',
  'CAVE_CRYSTAL',
  'CAVE_VOLCANIC',
  'SWAMP_MURK',
  'SWAMP_REEDS',
  'DESERT_DUNES',
  'DESERT_SALT',
  'SNOW_TUNDRA',
  'SNOW_GLACIER',
  'URBAN_PLAZA',
  'URBAN_ROAD',
]);

export const battleSceneSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string(),
  status: battleSceneStatusSchema,
  shape: battleSceneShapeSchema,
  gridColumns: z.int().min(4).max(60),
  gridRows: z.int().min(4).max(60),
  backgroundAttachmentId: z.string().uuid().nullable(),
  terrainTheme: randomBattleMapTerrainSchema.exclude(['RANDOM']).nullable().default(null),
  backgroundPreset: battleBackgroundPresetSchema.nullable().default(null),
  lightingTheme: randomBattleMapLightingSchema.nullable().default(null),
  weatherTheme: randomBattleMapWeatherSchema.nullable().default(null),
  activeCombatantId: z.string().uuid().nullable(),
  round: z.int().positive(),
  revision: z.int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const battleRuntimeCounterMapSchema = z.record(
  z.string().trim().min(1).max(100),
  z.int().min(0).max(999_999),
);

export const battleCharacterRuntimeSchema = z.object({
  resources: battleRuntimeCounterMapSchema,
  spellSlots: battleRuntimeCounterMapSchema,
  revision: z.int().nonnegative(),
});

export const battleCombatantSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  name: z.string().nullable(),
  kind: battleCombatantKindSchema,
  initiative: z.number().finite().min(-1000).max(1000),
  currentHp: z.int().min(0).max(999_999).nullable(),
  maxHp: z.int().positive().max(999_999).nullable(),
  hpPercent: z.int().min(0).max(100).nullable(),
  hpState: z.enum(['UNHARMED', 'HURT', 'BLOODIED', 'CRITICAL', 'DEFEATED']).nullable(),
  temporaryHp: z.int().nonnegative().max(999_999).nullable(),
  armorClass: z.int().min(-1000).max(1000).nullable(),
  speed: z.int().min(0).max(100),
  movementSpent: z.int().min(0).max(100),
  className: z.string().max(120).nullable(),
  species: z.string().max(120).nullable(),
  conditions: z.array(z.string().trim().min(1).max(80)).max(30),
  hidden: z.boolean(),
  nameVisibility: battleNameVisibilitySchema,
  hpVisibility: battleHpVisibilitySchema,
  showArmorClass: z.boolean(),
  showClassName: z.boolean(),
  showSpecies: z.boolean(),
  conditionsVisibility: battleConditionsVisibilitySchema,
  characterRuntime: battleCharacterRuntimeSchema.nullable().default(null),
  revision: z.int().nonnegative(),
});

export const battleTokenSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  combatantId: z.string().uuid(),
  ownerUserId: z.string().uuid().nullable(),
  imageAttachmentId: z.string().uuid().nullable(),
  systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
  hasImage: z.boolean(),
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  size: z.int().min(1).max(6),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  revision: z.int().nonnegative(),
});

export const battleCombatantPresetSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  kind: battleCombatantKindSchema,
  initiative: z.number().finite().min(-1000).max(1000),
  maxHp: z.int().positive().max(999_999),
  armorClass: z.int().min(-1000).max(1000).nullable(),
  speed: z.int().min(0).max(100),
  className: z.string().max(120),
  species: z.string().max(120),
  hidden: z.boolean(),
  nameVisibility: battleNameVisibilitySchema,
  hpVisibility: battleHpVisibilitySchema,
  showArmorClass: z.boolean(),
  showClassName: z.boolean(),
  showSpecies: z.boolean(),
  conditionsVisibility: battleConditionsVisibilitySchema,
  ownerUserId: z.string().uuid().nullable(),
  imageAttachmentId: z.string().uuid().nullable(),
  systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
  hasImage: z.boolean(),
  size: z.int().min(1).max(6),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const battleObstacleSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  kind: battleObstacleKindSchema,
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().min(1).max(60),
  height: z.int().min(1).max(60),
  movementCost: z.int().min(1).max(5),
  systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
  revision: z.int().nonnegative(),
});

export const battleSceneObjectSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  kind: battleSceneObjectKindSchema,
  name: z.string().min(1).max(120),
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().min(1).max(60),
  height: z.int().min(1).max(60),
  blocksMovement: z.boolean(),
  visibleToPlayers: z.boolean(),
  showLabel: z.boolean(),
  imageAttachmentId: z.string().uuid().nullable(),
  systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
  hasImage: z.boolean(),
  imageAnimated: z.boolean(),
  currentHp: z.int().min(0).max(999_999).nullable(),
  maxHp: z.int().positive().max(999_999).nullable(),
  hpPercent: z.int().min(0).max(100).nullable(),
  hpState: z.enum(['UNHARMED', 'HURT', 'BLOODIED', 'CRITICAL', 'DEFEATED']).nullable(),
  revision: z.int().nonnegative(),
});

export const battleSceneSnapshotSchema = z.object({
  campaignId: z.string().uuid(),
  role: campaignRoleSchema,
  scene: battleSceneSchema.nullable(),
  combatants: z.array(battleCombatantSchema),
  tokens: z.array(battleTokenSchema),
  obstacles: z.array(battleObstacleSchema),
  objects: z.array(battleSceneObjectSchema),
});

const savedBattleSceneStatusSchema = z.enum(['DRAFT', 'LIVE', 'PAUSED']);

export const battleSceneSavePayloadSchema = z.object({
  version: z.literal(1),
  scene: z.object({
    name: z.string().trim().min(1).max(160),
    status: savedBattleSceneStatusSchema,
    shape: battleSceneShapeSchema.default('RECTANGLE'),
    gridColumns: z.int().min(4).max(60),
    gridRows: z.int().min(4).max(60),
    terrainTheme: randomBattleMapTerrainSchema.exclude(['RANDOM']).nullable().default(null),
    backgroundPreset: battleBackgroundPresetSchema.nullable().default(null),
    lightingTheme: randomBattleMapLightingSchema.nullable().default(null),
    weatherTheme: randomBattleMapWeatherSchema.nullable().default(null),
    activeCombatantSourceId: z.string().uuid().nullable(),
    round: z.int().positive(),
  }),
  combatants: z
    .array(
      z.object({
        sourceId: z.string().uuid(),
        characterSheetId: z.string().uuid().nullable().default(null),
        name: z.string().trim().min(1).max(120),
        kind: battleCombatantKindSchema,
        initiative: z.number().finite().min(-1000).max(1000),
        currentHp: z.int().min(0).max(999_999),
        maxHp: z.int().positive().max(999_999),
        temporaryHp: z.int().nonnegative().max(999_999),
        armorClass: z.int().min(-1000).max(1000).nullable(),
        speed: z.int().min(0).max(100),
        movementSpent: z.int().min(0).max(100),
        className: z.string().max(120),
        species: z.string().max(120),
        conditions: z.array(z.string().trim().min(1).max(80)).max(30),
        note: z.string().max(2000),
        hidden: z.boolean(),
        nameVisibility: battleNameVisibilitySchema,
        hpVisibility: battleHpVisibilitySchema,
        showArmorClass: z.boolean(),
        showClassName: z.boolean(),
        showSpecies: z.boolean(),
        conditionsVisibility: battleConditionsVisibilitySchema,
      }),
    )
    .max(500),
  tokens: z
    .array(
      z.object({
        combatantSourceId: z.string().uuid(),
        ownerUserId: z.string().uuid().nullable(),
        x: z.int().nonnegative(),
        y: z.int().nonnegative(),
        size: z.int().min(1).max(6),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        imageAttachmentId: z.string().uuid().nullable().default(null),
        systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
      }),
    )
    .max(500),
  obstacles: z
    .array(
      z.object({
        kind: battleObstacleKindSchema,
        x: z.int().nonnegative(),
        y: z.int().nonnegative(),
        width: z.int().min(1).max(60),
        height: z.int().min(1).max(60),
        movementCost: z.int().min(1).max(5),
        systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
      }),
    )
    .max(500)
    .default([]),
  objects: z
    .array(
      z.object({
        kind: battleSceneObjectKindSchema,
        name: z.string().trim().min(1).max(120),
        x: z.int().nonnegative(),
        y: z.int().nonnegative(),
        width: z.int().min(1).max(60),
        height: z.int().min(1).max(60),
        blocksMovement: z.boolean(),
        visibleToPlayers: z.boolean(),
        showLabel: z.boolean().default(false),
        imageAttachmentId: z.string().uuid().nullable().default(null),
        systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
        currentHp: z.int().min(0).max(999_999).nullable(),
        maxHp: z.int().positive().max(999_999).nullable(),
      }),
    )
    .max(500)
    .default([]),
});

export const battleSceneSaveSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string(),
  sourceSceneName: z.string(),
  sceneStatus: savedBattleSceneStatusSchema,
  gridColumns: z.int().min(4).max(60),
  gridRows: z.int().min(4).max(60),
  combatantCount: z.int().nonnegative(),
  hasBackground: z.boolean(),
  createdAt: z.string().datetime(),
});

export const createBattleSceneRequestSchema = z.object({
  name: z.string().trim().min(1).max(160).default('Боевая сцена'),
  gridColumns: z.int().min(4).max(60).default(16),
  gridRows: z.int().min(4).max(60).default(10),
  shape: battleSceneShapeSchema.default('RECTANGLE'),
  terrainTheme: randomBattleMapTerrainSchema.exclude(['RANDOM']).nullable().default(null),
  backgroundPreset: battleBackgroundPresetSchema.nullable().default(null),
  lightingTheme: randomBattleMapLightingSchema.nullable().default(null),
  weatherTheme: randomBattleMapWeatherSchema.nullable().default(null),
});

const randomBattleMapEnemySchema = z.object({
  name: z.string().trim().min(1).max(120),
  count: z.int().min(1).max(20).default(1),
  maxHp: z.int().positive().max(999_999).optional(),
  armorClass: z.int().min(-1000).max(1000).nullable().optional(),
  speed: z.int().min(0).max(100).optional(),
  size: z.int().min(1).max(3).optional(),
});

export const generateRandomBattleMapRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).default('Случайная карта'),
    description: z.string().trim().max(1000).default(''),
    seed: z.string().trim().min(1).max(64).optional(),
    terrain: randomBattleMapTerrainSchema.default('RANDOM'),
    size: randomBattleMapSizeSchema.default('MEDIUM'),
    shape: battleSceneShapeSchema.default('RECTANGLE'),
    gridColumns: z.int().min(8).max(60).optional(),
    gridRows: z.int().min(8).max(60).optional(),
    playerCount: z.int().min(1).max(12).default(4),
    enemies: z.array(randomBattleMapEnemySchema).max(8).default([]),
    enemyCount: z.int().min(0).max(50).optional(),
    danger: randomBattleMapDangerSchema.default('MEDIUM'),
    objective: randomBattleMapObjectiveSchema.default('SKIRMISH'),
    startingZones: randomBattleMapStartingZonesSchema.default('OPPOSITE'),
    obstacleDensity: randomBattleMapDensitySchema.default('BALANCED'),
    difficultTerrain: z.boolean().default(true),
    lighting: randomBattleMapLightingSchema.default('BRIGHT'),
    weather: randomBattleMapWeatherSchema.default('CLEAR'),
    entrances: z.int().min(0).max(6).default(2),
    interactiveObjects: z.boolean().default(true),
    hazards: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if ((value.gridColumns === undefined) !== (value.gridRows === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'gridColumns and gridRows must be provided together',
        path: value.gridColumns === undefined ? ['gridColumns'] : ['gridRows'],
      });
    }
    const describedEnemyCount = value.enemies.reduce((total, enemy) => total + enemy.count, 0);
    if (describedEnemyCount > 50) {
      context.addIssue({
        code: 'custom',
        message: 'A generated map cannot contain more than 50 described enemies',
        path: ['enemies'],
      });
    }
    if (value.enemies.length && value.enemyCount !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'enemyCount cannot be combined with described enemy groups',
        path: ['enemyCount'],
      });
    }
  });

export const randomBattleMapGenerationSchema = z.object({
  seed: z.string().min(1).max(64),
  summary: z.string().min(1).max(1400),
  terrain: randomBattleMapTerrainSchema.exclude(['RANDOM']),
  playerStart: z.object({ x: z.int().nonnegative(), y: z.int().nonnegative() }),
  enemyStart: z.object({ x: z.int().nonnegative(), y: z.int().nonnegative() }),
});

export const generatedRandomBattleMapSchema = battleSceneSnapshotSchema.extend({
  generation: randomBattleMapGenerationSchema,
});

export const updateBattleSceneRequestSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    name: z.string().trim().min(1).max(160).optional(),
    status: battleSceneStatusSchema.optional(),
    gridColumns: z.int().min(4).max(60).optional(),
    gridRows: z.int().min(4).max(60).optional(),
    shape: battleSceneShapeSchema.optional(),
    backgroundAttachmentId: z.string().uuid().nullable().optional(),
    terrainTheme: randomBattleMapTerrainSchema.exclude(['RANDOM']).nullable().optional(),
    backgroundPreset: battleBackgroundPresetSchema.nullable().optional(),
    lightingTheme: randomBattleMapLightingSchema.nullable().optional(),
    weatherTheme: randomBattleMapWeatherSchema.nullable().optional(),
  })
  .refine(
    ({
      name,
      status,
      gridColumns,
      gridRows,
      shape,
      backgroundAttachmentId,
      terrainTheme,
      backgroundPreset,
      lightingTheme,
      weatherTheme,
    }) =>
      name !== undefined ||
      status !== undefined ||
      gridColumns !== undefined ||
      gridRows !== undefined ||
      shape !== undefined ||
      backgroundAttachmentId !== undefined ||
      terrainTheme !== undefined ||
      backgroundPreset !== undefined ||
      lightingTheme !== undefined ||
      weatherTheme !== undefined,
    { message: 'At least one scene field must be provided' },
  );

export const createBattleCombatantRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: battleCombatantKindSchema,
    initiative: z.number().finite().min(-1000).max(1000).default(10),
    currentHp: z.int().min(0).max(999_999).default(10),
    maxHp: z.int().positive().max(999_999).default(10),
    armorClass: z.int().min(-1000).max(1000).nullable().default(null),
    speed: z.int().min(0).max(100).default(6),
    className: z.string().trim().max(120).default(''),
    species: z.string().trim().max(120).default(''),
    conditions: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    hidden: z.boolean().default(false),
    nameVisibility: battleNameVisibilitySchema.default('EXACT'),
    hpVisibility: battleHpVisibilitySchema.default('STATE'),
    showArmorClass: z.boolean().default(false),
    showClassName: z.boolean().default(false),
    showSpecies: z.boolean().default(false),
    conditionsVisibility: battleConditionsVisibilitySchema.default('ALL'),
    ownerUserId: z.string().uuid().nullable().default(null),
    x: z.int().nonnegative().optional(),
    y: z.int().nonnegative().optional(),
    size: z.int().min(1).max(6).default(1),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#7c5cff'),
    imageAttachmentId: z.string().uuid().nullable().default(null),
    systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
  })
  .superRefine(({ kind, imageAttachmentId, systemAssetId }, context) => {
    if (kind === 'PLAYER' && (imageAttachmentId !== null || systemAssetId !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Player tokens use color circles and cannot have images',
        path: ['imageAttachmentId'],
      });
    }
    if (imageAttachmentId !== null && systemAssetId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Choose either a system asset or a campaign image',
        path: ['systemAssetId'],
      });
    }
  });

export const placeCharacterOnBattleRequestSchema = z
  .object({
    initiative: z.number().finite().min(-1000).max(1000).optional(),
    x: z.int().nonnegative().optional(),
    y: z.int().nonnegative().optional(),
    size: z.int().min(1).max(6).default(1),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#7c5cff'),
  })
  .superRefine(({ x, y }, context) => {
    if ((x === undefined) !== (y === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'x and y must be provided together',
        path: [x === undefined ? 'x' : 'y'],
      });
    }
  });

const importBattleEncounterSrdOpponentSchema = z.object({
  source: z.literal('SRD'),
  monsterId: z.string().regex(/^srd:[a-z0-9-]+$/),
  count: z.int().min(1).max(100),
});

const importBattleEncounterCustomOpponentSchema = z.object({
  source: z.literal('CUSTOM'),
  name: z.string().trim().min(1).max(120),
  count: z.int().min(1).max(100),
  initiative: z.number().finite().min(-1000).max(1000).default(10),
  maxHp: z.int().positive().max(999_999).default(10),
  armorClass: z.int().min(-1000).max(1000).nullable().default(null),
  speed: z.int().min(0).max(100).default(6),
  size: z.int().min(1).max(6).default(1),
});

export const importBattleEncounterRequestSchema = z
  .object({
    opponents: z
      .array(
        z.discriminatedUnion('source', [
          importBattleEncounterSrdOpponentSchema,
          importBattleEncounterCustomOpponentSchema,
        ]),
      )
      .min(1)
      .max(30),
  })
  .superRefine(({ opponents }, context) => {
    const total = opponents.reduce((sum, opponent) => sum + opponent.count, 0);
    if (total > 100) {
      context.addIssue({
        code: 'custom',
        message: 'An encounter can add at most 100 combatants',
        path: ['opponents'],
      });
    }
  });

export const createBattleObstacleRequestSchema = z.object({
  kind: battleObstacleKindSchema,
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().min(1).max(60).default(1),
  height: z.int().min(1).max(60).default(1),
  movementCost: z.int().min(1).max(5).default(2),
  systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
});

export const updateBattleObstacleRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  systemAssetId: battleSystemAssetIdSchema.nullable(),
});

export const createBattleSceneObjectRequestSchema = z
  .object({
    kind: battleSceneObjectKindSchema,
    name: z.string().trim().min(1).max(120),
    x: z.int().nonnegative(),
    y: z.int().nonnegative(),
    width: z.int().min(1).max(60).default(1),
    height: z.int().min(1).max(60).default(1),
    blocksMovement: z.boolean().default(true),
    visibleToPlayers: z.boolean().default(true),
    showLabel: z.boolean().default(false),
    imageAttachmentId: z.string().uuid().nullable().default(null),
    systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
    currentHp: z.int().min(0).max(999_999).nullable().default(null),
    maxHp: z.int().positive().max(999_999).nullable().default(null),
  })
  .refine(
    ({ currentHp, maxHp }) =>
      (currentHp === null && maxHp === null) ||
      (currentHp !== null && maxHp !== null && currentHp <= maxHp),
    { message: 'Object HP must be empty or within the maximum HP' },
  )
  .refine(
    ({ imageAttachmentId, systemAssetId }) => imageAttachmentId === null || systemAssetId === null,
    { message: 'Choose either a system asset or a campaign image', path: ['systemAssetId'] },
  );

export const updateBattleCombatantRequestSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    name: z.string().trim().min(1).max(120).optional(),
    initiative: z.number().finite().min(-1000).max(1000).optional(),
    maxHp: z.int().positive().max(999_999).optional(),
    armorClass: z.int().min(-1000).max(1000).nullable().optional(),
    speed: z.int().min(0).max(100).optional(),
    className: z.string().trim().max(120).optional(),
    species: z.string().trim().max(120).optional(),
    conditions: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    hidden: z.boolean().optional(),
    nameVisibility: battleNameVisibilitySchema.optional(),
    hpVisibility: battleHpVisibilitySchema.optional(),
    showArmorClass: z.boolean().optional(),
    showClassName: z.boolean().optional(),
    showSpecies: z.boolean().optional(),
    conditionsVisibility: battleConditionsVisibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: 'At least one combatant field must be provided',
  });

export const updateBattleSceneObjectRequestSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    name: z.string().trim().min(1).max(120).optional(),
    blocksMovement: z.boolean().optional(),
    visibleToPlayers: z.boolean().optional(),
    showLabel: z.boolean().optional(),
    imageAttachmentId: z.string().uuid().nullable().optional(),
    systemAssetId: battleSystemAssetIdSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: 'At least one object field must be provided',
  });

export const moveBattleTokenRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
});

export const updateBattleTokenRequestSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    imageAttachmentId: z.string().uuid().nullable().optional(),
    systemAssetId: battleSystemAssetIdSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: 'At least one token field must be provided',
  })
  .refine(
    ({ imageAttachmentId, systemAssetId }) =>
      imageAttachmentId === undefined ||
      systemAssetId === undefined ||
      imageAttachmentId === null ||
      systemAssetId === null,
    { message: 'Choose either a system asset or a campaign image', path: ['systemAssetId'] },
  );

export const adjustBattleHpRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  mode: z.enum(['DAMAGE', 'HEAL']),
  amount: z.int().nonnegative().max(999_999),
});

export const adjustBattleResourceRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  pool: z.enum(['RESOURCES', 'SPELL_SLOTS']),
  resourceId: z.string().trim().min(1).max(100),
  mode: z.enum(['SPEND', 'RESTORE']),
  amount: z.int().positive().max(999_999),
});

export const nextBattleTurnRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
});

export const createBattleSceneSaveRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export const saveBattleCombatantPresetRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

const battleCombatantPresetValuesSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: battleCombatantKindSchema,
  initiative: z.number().finite().min(-1000).max(1000),
  maxHp: z.int().positive().max(999_999),
  armorClass: z.int().min(-1000).max(1000).nullable(),
  speed: z.int().min(0).max(100),
  className: z.string().trim().max(120),
  species: z.string().trim().max(120),
  hidden: z.boolean(),
  nameVisibility: battleNameVisibilitySchema,
  hpVisibility: battleHpVisibilitySchema,
  showArmorClass: z.boolean(),
  showClassName: z.boolean(),
  showSpecies: z.boolean(),
  conditionsVisibility: battleConditionsVisibilitySchema,
  ownerUserId: z.string().uuid().nullable(),
  imageAttachmentId: z.string().uuid().nullable(),
  systemAssetId: battleSystemAssetIdSchema.nullable().default(null),
  size: z.int().min(1).max(6),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const portableBattleCombatantPresetValuesSchema = battleCombatantPresetValuesSchema
  .omit({ ownerUserId: true, imageAttachmentId: true })
  .strict();

export const portableBattleCombatantPresetImageSchema = z
  .object({
    fileName: z.string().trim().min(1).max(160),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    byteLength: z
      .int()
      .positive()
      .max(512 * 1024),
    width: z.int().positive().max(4096),
    height: z.int().positive().max(4096),
    dataBase64: z
      .string()
      .min(4)
      .max(700_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const portableBattleCombatantPresetSchema = z
  .object({
    format: z.literal('fog-of-lore.battle-combatant-preset'),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    preset: portableBattleCombatantPresetValuesSchema,
    image: portableBattleCombatantPresetImageSchema.nullable(),
  })
  .strict()
  .refine(
    ({ preset, image }) =>
      preset.kind !== 'PLAYER' || (image === null && preset.systemAssetId === null),
    {
      message: 'Player tokens use color circles and cannot have images',
      path: ['image'],
    },
  )
  .refine(({ preset, image }) => image === null || preset.systemAssetId === null, {
    message: 'Choose either a system asset or an embedded image',
    path: ['preset', 'systemAssetId'],
  });

export const importPortableBattleCombatantPresetRequestSchema = z
  .object({ preset: portableBattleCombatantPresetSchema })
  .strict();

export const updateBattleCombatantPresetRequestSchema = battleCombatantPresetValuesSchema
  .refine(
    ({ kind, imageAttachmentId, systemAssetId }) =>
      kind !== 'PLAYER' || (imageAttachmentId === null && systemAssetId === null),
    {
      message: 'Player tokens use color circles and cannot have images',
      path: ['imageAttachmentId'],
    },
  )
  .refine(
    ({ imageAttachmentId, systemAssetId }) => imageAttachmentId === null || systemAssetId === null,
    { message: 'Choose either a system asset or a campaign image', path: ['systemAssetId'] },
  );

export const duplicateBattleCombatantPresetRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export const saveCharacterSheetAsBattlePresetRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  initiative: z.number().finite().min(-1000).max(1000).optional(),
  size: z.int().min(1).max(6).default(1),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#7c5cff'),
});

export const importBattleCombatantPresetRequestSchema = z
  .object({
    ownerUserId: z.string().uuid().nullable().optional(),
    x: z.int().nonnegative().optional(),
    y: z.int().nonnegative().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    initiative: z.number().finite().min(-1000).max(1000).optional(),
    maxHp: z.int().positive().max(999_999).optional(),
    armorClass: z.int().min(-1000).max(1000).nullable().optional(),
    speed: z.int().min(0).max(100).optional(),
    className: z.string().trim().max(120).optional(),
    species: z.string().trim().max(120).optional(),
    size: z.int().min(1).max(6).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .refine(({ x, y }) => (x === undefined) === (y === undefined), {
    message: 'Both token coordinates must be provided together',
  });

export type BattleSceneStatus = z.infer<typeof battleSceneStatusSchema>;
export type BattleSceneShape = z.infer<typeof battleSceneShapeSchema>;
export type BattleCombatantKind = z.infer<typeof battleCombatantKindSchema>;
export type BattleNameVisibility = z.infer<typeof battleNameVisibilitySchema>;
export type BattleHpVisibility = z.infer<typeof battleHpVisibilitySchema>;
export type BattleConditionsVisibility = z.infer<typeof battleConditionsVisibilitySchema>;
export type BattleScene = z.infer<typeof battleSceneSchema>;
export type BattleCombatant = z.infer<typeof battleCombatantSchema>;
export type BattleCharacterRuntime = z.infer<typeof battleCharacterRuntimeSchema>;
export type BattleToken = z.infer<typeof battleTokenSchema>;
export type BattleCombatantPreset = z.infer<typeof battleCombatantPresetSchema>;
export type PortableBattleCombatantPresetImage = z.infer<
  typeof portableBattleCombatantPresetImageSchema
>;
export type PortableBattleCombatantPreset = z.infer<typeof portableBattleCombatantPresetSchema>;
export type BattleObstacleKind = z.infer<typeof battleObstacleKindSchema>;
export type BattleObstacle = z.infer<typeof battleObstacleSchema>;
export type BattleSceneObjectKind = z.infer<typeof battleSceneObjectKindSchema>;
export type BattleSystemAssetId = z.infer<typeof battleSystemAssetIdSchema>;
export type BattleSceneObject = z.infer<typeof battleSceneObjectSchema>;
export type RandomBattleMapTerrain = z.infer<typeof randomBattleMapTerrainSchema>;
export type RandomBattleMapSize = z.infer<typeof randomBattleMapSizeSchema>;
export type RandomBattleMapDanger = z.infer<typeof randomBattleMapDangerSchema>;
export type RandomBattleMapObjective = z.infer<typeof randomBattleMapObjectiveSchema>;
export type RandomBattleMapDensity = z.infer<typeof randomBattleMapDensitySchema>;
export type RandomBattleMapStartingZones = z.infer<typeof randomBattleMapStartingZonesSchema>;
export type RandomBattleMapLighting = z.infer<typeof randomBattleMapLightingSchema>;
export type RandomBattleMapWeather = z.infer<typeof randomBattleMapWeatherSchema>;
export type BattleBackgroundPreset = z.infer<typeof battleBackgroundPresetSchema>;
export type BattleSceneSnapshot = z.infer<typeof battleSceneSnapshotSchema>;
export type GenerateRandomBattleMapRequest = z.infer<typeof generateRandomBattleMapRequestSchema>;
export type GeneratedRandomBattleMap = z.infer<typeof generatedRandomBattleMapSchema>;
export type BattleSceneSavePayload = z.infer<typeof battleSceneSavePayloadSchema>;
export type BattleSceneSave = z.infer<typeof battleSceneSaveSchema>;
export type CreateBattleSceneRequest = z.infer<typeof createBattleSceneRequestSchema>;
export type UpdateBattleSceneRequest = z.infer<typeof updateBattleSceneRequestSchema>;
export type CreateBattleCombatantRequest = z.infer<typeof createBattleCombatantRequestSchema>;
export type PlaceCharacterOnBattleRequest = z.infer<typeof placeCharacterOnBattleRequestSchema>;
export type ImportBattleEncounterRequest = z.infer<typeof importBattleEncounterRequestSchema>;
export type CreateBattleObstacleRequest = z.infer<typeof createBattleObstacleRequestSchema>;
export type UpdateBattleObstacleRequest = z.infer<typeof updateBattleObstacleRequestSchema>;
export type CreateBattleSceneObjectRequest = z.infer<typeof createBattleSceneObjectRequestSchema>;
export type UpdateBattleCombatantRequest = z.infer<typeof updateBattleCombatantRequestSchema>;
export type UpdateBattleSceneObjectRequest = z.infer<typeof updateBattleSceneObjectRequestSchema>;
export type UpdateBattleTokenRequest = z.infer<typeof updateBattleTokenRequestSchema>;
export type MoveBattleTokenRequest = z.infer<typeof moveBattleTokenRequestSchema>;
export type AdjustBattleHpRequest = z.infer<typeof adjustBattleHpRequestSchema>;
export type AdjustBattleResourceRequest = z.infer<typeof adjustBattleResourceRequestSchema>;
export type NextBattleTurnRequest = z.infer<typeof nextBattleTurnRequestSchema>;
export type CreateBattleSceneSaveRequest = z.infer<typeof createBattleSceneSaveRequestSchema>;
export type SaveBattleCombatantPresetRequest = z.infer<
  typeof saveBattleCombatantPresetRequestSchema
>;
export type UpdateBattleCombatantPresetRequest = z.infer<
  typeof updateBattleCombatantPresetRequestSchema
>;
export type DuplicateBattleCombatantPresetRequest = z.infer<
  typeof duplicateBattleCombatantPresetRequestSchema
>;
export type SaveCharacterSheetAsBattlePresetRequest = z.infer<
  typeof saveCharacterSheetAsBattlePresetRequestSchema
>;
export type ImportBattleCombatantPresetRequest = z.infer<
  typeof importBattleCombatantPresetRequestSchema
>;
export type ImportPortableBattleCombatantPresetRequest = z.infer<
  typeof importPortableBattleCombatantPresetRequestSchema
>;
