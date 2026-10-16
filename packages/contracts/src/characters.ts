import { z } from 'zod';

import { campaignRoleSchema } from './campaigns';

export const characterRulesetSchema = z.literal('dnd5e-srd-5.2.1');
export const abilityKeySchema = z.enum([
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
]);
export const abilityMethodSchema = z.enum([
  'STANDARD_ARRAY',
  'POINT_BUY',
  'ROLL',
  'MANUAL',
  'CAMPAIGN',
]);
export const characterCreationModeSchema = z.enum(['AUTOMATIC', 'GUIDED', 'MANUAL']);
export const characterSheetStatusSchema = z.enum(['DRAFT', 'READY', 'ARCHIVED']);

export const abilityScoresSchema = z.object({
  strength: z.int().min(1).max(30),
  dexterity: z.int().min(1).max(30),
  constitution: z.int().min(1).max(30),
  intelligence: z.int().min(1).max(30),
  wisdom: z.int().min(1).max(30),
  charisma: z.int().min(1).max(30),
});

const idListSchema = z.array(z.string().trim().min(1).max(100)).max(100).default([]);

export const characterEquipmentItemSchema = z.object({
  optionId: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(160),
  quantity: z.int().min(1).max(999).default(1),
  notes: z.string().trim().max(500).default(''),
});

export const characterSheetDataSchema = z.object({
  level: z.int().min(1).max(20).default(1),
  speciesId: z.string().trim().max(100).default(''),
  classId: z.string().trim().max(100).default(''),
  backgroundId: z.string().trim().max(100).default(''),
  abilityMethod: abilityMethodSchema.default('STANDARD_ARRAY'),
  abilities: abilityScoresSchema.default({
    strength: 15,
    dexterity: 14,
    constitution: 13,
    intelligence: 12,
    wisdom: 10,
    charisma: 8,
  }),
  skillIds: idListSchema,
  spellIds: idListSchema,
  equipment: z.array(characterEquipmentItemSchema).max(200).default([]),
  hitPoints: z.int().min(0).max(9999).default(0),
  armorClass: z.int().min(0).max(99).default(10),
  speed: z.int().min(0).max(999).default(30),
  personality: z.string().max(4000).default(''),
  appearance: z.string().max(4000).default(''),
  backstory: z.string().max(20_000).default(''),
  notes: z.string().max(20_000).default(''),
});

export const characterDocumentV2Schema = z.object({
  documentVersion: z.literal(2),
  ruleset: z.object({
    id: characterRulesetSchema,
    version: z.literal('5.2.1'),
  }),
  creation: z.object({
    mode: characterCreationModeSchema,
    decisions: z
      .array(
        z.object({
          stepId: z.string().trim().min(1).max(100),
          optionIds: idListSchema,
        }),
      )
      .max(100),
  }),
  identity: z.object({
    level: z.int().min(1).max(20),
    speciesId: z.string().trim().max(100),
    classId: z.string().trim().max(100),
    backgroundId: z.string().trim().max(100),
  }),
  abilities: z.object({
    method: abilityMethodSchema,
    scores: abilityScoresSchema,
  }),
  choices: z.object({
    skillIds: idListSchema,
    spellIds: idListSchema,
  }),
  inventory: z.object({
    equipment: z.array(characterEquipmentItemSchema).max(200),
  }),
  profile: z.object({
    personality: z.string().max(4000),
    appearance: z.string().max(4000),
    backstory: z.string().max(20_000),
    notes: z.string().max(20_000),
  }),
  ruleOverrides: z
    .array(
      z.object({
        path: z.enum(['/derived/armorClass', '/derived/hitPointMaximum', '/derived/speed']),
        value: z.int().min(0).max(999_999),
        reason: z.string().trim().min(1).max(2000),
        source: z.enum(['CAMPAIGN', 'LEGACY_V1']),
      }),
    )
    .max(100),
});

const characterRuntimeCounterMapSchema = z.record(
  z.string().trim().min(1).max(100),
  z.int().min(0).max(999_999),
);

export const characterRuntimeStateSchema = z.object({
  currentHitPoints: z.int().min(0).max(999_999),
  temporaryHitPoints: z.int().min(0).max(999_999),
  resources: characterRuntimeCounterMapSchema,
  spellSlots: characterRuntimeCounterMapSchema,
  conditions: z.array(z.string().trim().min(1).max(100)).max(100),
  inspiration: z.boolean(),
  deathSaveSuccesses: z.int().min(0).max(3),
  deathSaveFailures: z.int().min(0).max(3),
  revision: z.int().nonnegative(),
  updatedAt: z.string().datetime(),
});

const createLegacyCharacterSheetRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  ownerUserId: z.string().uuid().optional(),
  ruleset: characterRulesetSchema.default('dnd5e-srd-5.2.1'),
  creationMode: characterCreationModeSchema.optional(),
  data: characterSheetDataSchema,
});

const createCharacterDocumentRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  ownerUserId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'READY']),
  document: characterDocumentV2Schema,
});

export const createCharacterSheetRequestSchema = z.union([
  createLegacyCharacterSheetRequestSchema,
  createCharacterDocumentRequestSchema,
]);

export const updateCharacterSheetRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  name: z.string().trim().min(1).max(160),
  data: characterSheetDataSchema,
});

export const updateCharacterRuntimeRequestSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    currentHitPoints: z.int().min(0).max(999_999).optional(),
    temporaryHitPoints: z.int().min(0).max(999_999).optional(),
    resources: characterRuntimeCounterMapSchema.optional(),
    spellSlots: characterRuntimeCounterMapSchema.optional(),
    conditions: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    inspiration: z.boolean().optional(),
    deathSaveSuccesses: z.int().min(0).max(3).optional(),
    deathSaveFailures: z.int().min(0).max(3).optional(),
  })
  .refine(
    (input) =>
      input.currentHitPoints !== undefined ||
      input.temporaryHitPoints !== undefined ||
      input.resources !== undefined ||
      input.spellSlots !== undefined ||
      input.conditions !== undefined ||
      input.inspiration !== undefined ||
      input.deathSaveSuccesses !== undefined ||
      input.deathSaveFailures !== undefined,
    { message: 'At least one runtime field must be changed' },
  );

export const characterDerivedValuesSchema = z.object({
  abilityModifiers: z.record(abilityKeySchema, z.int()),
  proficiencyBonus: z.int(),
  hitPointMaximum: z.int().nonnegative(),
  armorClass: z.int().nonnegative(),
  speed: z.int().nonnegative(),
  initiative: z.int(),
  passivePerception: z.int(),
});

export const characterRuleIssueSchema = z.object({
  code: z.string().trim().min(1),
  path: z.string().startsWith('/'),
  severity: z.enum(['ERROR', 'WARNING']),
  message: z.string().trim().min(1),
});

export const updateCharacterDocumentRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  name: z.string().trim().min(1).max(160),
  status: z.enum(['DRAFT', 'READY']),
  document: characterDocumentV2Schema,
  changeSummary: z.string().trim().min(1).max(500).optional(),
});

export const characterMasterCorrectionSchema = z.object({
  path: z.string().startsWith('/').max(500),
  correctedByUserId: z.string().uuid(),
  correctedAt: z.string().datetime(),
  revision: z.int().nonnegative(),
});

export const characterDocumentRevisionKindSchema = z.enum([
  'CREATED',
  'UPDATED',
  'RESTORED',
  'MIGRATED',
]);
export const characterRevisionActorKindSchema = z.enum(['PLAYER', 'GAME_MASTER', 'SYSTEM']);

export const characterDocumentRevisionSchema = z.object({
  id: z.string().uuid(),
  documentRevision: z.int().nonnegative(),
  name: z.string().trim().min(1).max(160),
  status: characterSheetStatusSchema,
  actorKind: characterRevisionActorKindSchema,
  kind: characterDocumentRevisionKindSchema,
  summary: z.string().trim().min(1).max(500).nullable(),
  changedByUserId: z.string().uuid(),
  changedByDisplayName: z.string().trim().min(1),
  masterCorrectionPaths: z.array(z.string().startsWith('/').max(500)),
  createdAt: z.string().datetime(),
});

export const characterDocumentRevisionListResponseSchema = z.object({
  sheetId: z.string().uuid(),
  currentRevision: z.int().nonnegative(),
  revisions: z.array(characterDocumentRevisionSchema),
});

export const restoreCharacterDocumentRevisionRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  summary: z.string().trim().min(1).max(500).optional(),
});

export const characterDocumentResponseSchema = z.object({
  sheetId: z.string().uuid(),
  campaignId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  ownerDisplayName: z.string(),
  name: z.string(),
  status: characterSheetStatusSchema,
  storedDocumentVersion: z.union([z.literal(1), z.literal(2)]),
  document: characterDocumentV2Schema,
  derived: characterDerivedValuesSchema,
  issues: z.array(characterRuleIssueSchema),
  masterCorrections: z.array(characterMasterCorrectionSchema),
  revision: z.int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const characterSheetSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  ownerDisplayName: z.string(),
  name: z.string(),
  ruleset: characterRulesetSchema,
  rulesetVersion: z.literal('5.2.1'),
  documentVersion: z.union([z.literal(1), z.literal(2)]),
  creationMode: characterCreationModeSchema,
  status: characterSheetStatusSchema,
  portraitAssetId: z.string().uuid().nullable(),
  data: characterSheetDataSchema,
  runtime: characterRuntimeStateSchema,
  revision: z.int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const campaignCharacterSheetsResponseSchema = z.object({
  campaignId: z.string().uuid(),
  role: campaignRoleSchema,
  sheets: z.array(characterSheetSchema),
});

export const portableCharacterSheetSchema = z.object({
  format: z.literal('fog-of-lore.character-sheet'),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  ruleset: z.object({
    id: characterRulesetSchema,
    system: z.literal('D&D 5e'),
    source: z.literal('SRD 5.2.1'),
    license: z.literal('CC-BY-4.0'),
  }),
  character: z.object({
    name: z.string().trim().min(1).max(160),
    data: characterSheetDataSchema,
  }),
});

export const importCharacterSheetRequestSchema = z.object({
  ownerUserId: z.string().uuid().optional(),
  sheet: portableCharacterSheetSchema,
});

export const characterFolcharImportPreviewSchema = z.object({
  exportedAt: z.string().datetime(),
  ruleset: characterRulesetSchema,
  rulesetVersion: z.literal('5.2.1'),
  name: z.string().trim().min(1).max(160),
  status: z.enum(['DRAFT', 'READY']),
  creationMode: characterCreationModeSchema,
  identity: z.object({
    level: z.int().min(1).max(20),
    speciesId: z.string().trim().max(100),
    classId: z.string().trim().max(100),
    backgroundId: z.string().trim().max(100),
  }),
  derived: characterDerivedValuesSchema,
  issues: z.array(characterRuleIssueSchema),
  runtime: z.object({
    currentHitPoints: z.int().min(0).max(999_999),
    temporaryHitPoints: z.int().min(0).max(999_999),
    resourceCount: z.int().nonnegative(),
    spellSlotCount: z.int().nonnegative(),
    conditions: z.array(z.string().trim().min(1).max(100)).max(100),
    inspiration: z.boolean(),
  }),
  hasPortrait: z.boolean(),
});

const optionSchema = z.object({ id: z.string(), name: z.string(), description: z.string() });
export const characterClassOptionSchema = optionSchema.extend({
  hitDie: z.int(),
  primaryAbilities: z.array(abilityKeySchema),
  skillChoices: z.int(),
  allowedSkillIds: z.array(z.string()),
  starterSpellIds: z.array(z.string()),
  starterEquipmentIds: z.array(z.string()),
});
export const characterSpeciesOptionSchema = optionSchema.extend({ speed: z.int() });
export const characterBackgroundOptionSchema = optionSchema.extend({
  skillIds: z.array(z.string()),
  equipmentIds: z.array(z.string()),
});
export const spellOptionSchema = optionSchema.extend({
  level: z.int().min(0).max(9),
  classIds: z.array(z.string()),
});
export const equipmentOptionSchema = optionSchema.extend({
  category: z.enum(['WEAPON', 'ARMOR', 'GEAR', 'FOCUS']),
  cost: z.string(),
});
export const characterBuildTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  classId: z.string(),
  speciesId: z.string(),
  backgroundId: z.string(),
  abilities: abilityScoresSchema,
  skillIds: z.array(z.string()),
  spellIds: z.array(z.string()),
  equipmentIds: z.array(z.string()),
});
export const guidedCharacterCreationStepSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1000),
});
export const guidedCharacterAbilityMethodSchema = z.object({
  id: abilityMethodSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1000),
});
export const guidedCharacterCreationSchema = z.object({
  version: z.literal(1),
  steps: z.array(guidedCharacterCreationStepSchema).min(1).max(100),
  abilityMethods: z.array(guidedCharacterAbilityMethodSchema).min(1).max(20),
});

export const characterOptionsResponseSchema = z.object({
  ruleset: characterRulesetSchema,
  attribution: z.string(),
  guided: guidedCharacterCreationSchema,
  classes: z.array(characterClassOptionSchema),
  species: z.array(characterSpeciesOptionSchema),
  backgrounds: z.array(characterBackgroundOptionSchema),
  skills: z.array(optionSchema),
  spells: z.array(spellOptionSchema),
  equipment: z.array(equipmentOptionSchema),
  builds: z.array(characterBuildTemplateSchema),
});

export type AbilityKey = z.infer<typeof abilityKeySchema>;
export type AbilityMethod = z.infer<typeof abilityMethodSchema>;
export type CharacterSheetData = z.infer<typeof characterSheetDataSchema>;
export type CharacterDocumentV2 = z.infer<typeof characterDocumentV2Schema>;
export type CharacterRuntimeState = z.infer<typeof characterRuntimeStateSchema>;
export type CreateCharacterSheetRequest = z.infer<typeof createCharacterSheetRequestSchema>;
export type UpdateCharacterSheetRequest = z.infer<typeof updateCharacterSheetRequestSchema>;
export type UpdateCharacterRuntimeRequest = z.infer<typeof updateCharacterRuntimeRequestSchema>;
export type CharacterDerivedValues = z.infer<typeof characterDerivedValuesSchema>;
export type CharacterRuleIssue = z.infer<typeof characterRuleIssueSchema>;
export type UpdateCharacterDocumentRequest = z.infer<typeof updateCharacterDocumentRequestSchema>;
export type CharacterDocumentResponse = z.infer<typeof characterDocumentResponseSchema>;
export type CharacterMasterCorrection = z.infer<typeof characterMasterCorrectionSchema>;
export type CharacterDocumentRevision = z.infer<typeof characterDocumentRevisionSchema>;
export type CharacterDocumentRevisionListResponse = z.infer<
  typeof characterDocumentRevisionListResponseSchema
>;
export type RestoreCharacterDocumentRevisionRequest = z.infer<
  typeof restoreCharacterDocumentRevisionRequestSchema
>;
export type CharacterSheet = z.infer<typeof characterSheetSchema>;
export type CampaignCharacterSheetsResponse = z.infer<typeof campaignCharacterSheetsResponseSchema>;
export type PortableCharacterSheet = z.infer<typeof portableCharacterSheetSchema>;
export type ImportCharacterSheetRequest = z.infer<typeof importCharacterSheetRequestSchema>;
export type CharacterFolcharImportPreview = z.infer<typeof characterFolcharImportPreviewSchema>;
export type CharacterOptionsResponse = z.infer<typeof characterOptionsResponseSchema>;
export type CharacterBuildTemplate = z.infer<typeof characterBuildTemplateSchema>;
