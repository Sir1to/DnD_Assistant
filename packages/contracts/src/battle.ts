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

export const battleSceneSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string(),
  status: battleSceneStatusSchema,
  shape: battleSceneShapeSchema,
  gridColumns: z.int().min(4).max(60),
  gridRows: z.int().min(4).max(60),
  backgroundAttachmentId: z.string().uuid().nullable(),
  activeCombatantId: z.string().uuid().nullable(),
  round: z.int().positive(),
  revision: z.int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
  revision: z.int().nonnegative(),
});

export const battleTokenSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  combatantId: z.string().uuid(),
  ownerUserId: z.string().uuid().nullable(),
  imageAttachmentId: z.string().uuid().nullable(),
  hasImage: z.boolean(),
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  size: z.int().min(1).max(6),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  revision: z.int().nonnegative(),
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
    activeCombatantSourceId: z.string().uuid().nullable(),
    round: z.int().positive(),
  }),
  combatants: z
    .array(
      z.object({
        sourceId: z.string().uuid(),
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
  })
  .refine(
    ({ name, status, gridColumns, gridRows, shape, backgroundAttachmentId }) =>
      name !== undefined ||
      status !== undefined ||
      gridColumns !== undefined ||
      gridRows !== undefined ||
      shape !== undefined ||
      backgroundAttachmentId !== undefined,
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
  })
  .refine(({ kind, imageAttachmentId }) => kind !== 'PLAYER' || imageAttachmentId === null, {
    message: 'Player tokens use color circles and cannot have images',
    path: ['imageAttachmentId'],
  });

export const createBattleObstacleRequestSchema = z.object({
  kind: battleObstacleKindSchema,
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().min(1).max(60).default(1),
  height: z.int().min(1).max(60).default(1),
  movementCost: z.int().min(1).max(5).default(2),
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
    currentHp: z.int().min(0).max(999_999).nullable().default(null),
    maxHp: z.int().positive().max(999_999).nullable().default(null),
  })
  .refine(
    ({ currentHp, maxHp }) =>
      (currentHp === null && maxHp === null) ||
      (currentHp !== null && maxHp !== null && currentHp <= maxHp),
    { message: 'Object HP must be empty or within the maximum HP' },
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
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: 'At least one object field must be provided',
  });

export const moveBattleTokenRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
});

export const updateBattleTokenRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  imageAttachmentId: z.string().uuid().nullable(),
});

export const adjustBattleHpRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  mode: z.enum(['DAMAGE', 'HEAL']),
  amount: z.int().nonnegative().max(999_999),
});

export const nextBattleTurnRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
});

export const createBattleSceneSaveRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export type BattleSceneStatus = z.infer<typeof battleSceneStatusSchema>;
export type BattleSceneShape = z.infer<typeof battleSceneShapeSchema>;
export type BattleCombatantKind = z.infer<typeof battleCombatantKindSchema>;
export type BattleNameVisibility = z.infer<typeof battleNameVisibilitySchema>;
export type BattleHpVisibility = z.infer<typeof battleHpVisibilitySchema>;
export type BattleConditionsVisibility = z.infer<typeof battleConditionsVisibilitySchema>;
export type BattleScene = z.infer<typeof battleSceneSchema>;
export type BattleCombatant = z.infer<typeof battleCombatantSchema>;
export type BattleToken = z.infer<typeof battleTokenSchema>;
export type BattleObstacleKind = z.infer<typeof battleObstacleKindSchema>;
export type BattleObstacle = z.infer<typeof battleObstacleSchema>;
export type BattleSceneObjectKind = z.infer<typeof battleSceneObjectKindSchema>;
export type BattleSceneObject = z.infer<typeof battleSceneObjectSchema>;
export type BattleSceneSnapshot = z.infer<typeof battleSceneSnapshotSchema>;
export type BattleSceneSavePayload = z.infer<typeof battleSceneSavePayloadSchema>;
export type BattleSceneSave = z.infer<typeof battleSceneSaveSchema>;
export type CreateBattleSceneRequest = z.infer<typeof createBattleSceneRequestSchema>;
export type UpdateBattleSceneRequest = z.infer<typeof updateBattleSceneRequestSchema>;
export type CreateBattleCombatantRequest = z.infer<typeof createBattleCombatantRequestSchema>;
export type CreateBattleObstacleRequest = z.infer<typeof createBattleObstacleRequestSchema>;
export type CreateBattleSceneObjectRequest = z.infer<typeof createBattleSceneObjectRequestSchema>;
export type UpdateBattleCombatantRequest = z.infer<typeof updateBattleCombatantRequestSchema>;
export type UpdateBattleSceneObjectRequest = z.infer<typeof updateBattleSceneObjectRequestSchema>;
export type UpdateBattleTokenRequest = z.infer<typeof updateBattleTokenRequestSchema>;
export type MoveBattleTokenRequest = z.infer<typeof moveBattleTokenRequestSchema>;
export type AdjustBattleHpRequest = z.infer<typeof adjustBattleHpRequestSchema>;
export type NextBattleTurnRequest = z.infer<typeof nextBattleTurnRequestSchema>;
export type CreateBattleSceneSaveRequest = z.infer<typeof createBattleSceneSaveRequestSchema>;
