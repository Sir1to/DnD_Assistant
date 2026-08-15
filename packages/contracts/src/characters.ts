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

export const createCharacterSheetRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  ownerUserId: z.string().uuid().optional(),
  ruleset: characterRulesetSchema.default('dnd5e-srd-5.2.1'),
  data: characterSheetDataSchema,
});

export const updateCharacterSheetRequestSchema = z.object({
  expectedRevision: z.int().nonnegative(),
  name: z.string().trim().min(1).max(160),
  data: characterSheetDataSchema,
});

export const characterSheetSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  ownerDisplayName: z.string(),
  name: z.string(),
  ruleset: characterRulesetSchema,
  data: characterSheetDataSchema,
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

export const characterOptionsResponseSchema = z.object({
  ruleset: characterRulesetSchema,
  attribution: z.string(),
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
export type CreateCharacterSheetRequest = z.infer<typeof createCharacterSheetRequestSchema>;
export type UpdateCharacterSheetRequest = z.infer<typeof updateCharacterSheetRequestSchema>;
export type CharacterSheet = z.infer<typeof characterSheetSchema>;
export type CampaignCharacterSheetsResponse = z.infer<typeof campaignCharacterSheetsResponseSchema>;
export type PortableCharacterSheet = z.infer<typeof portableCharacterSheetSchema>;
export type ImportCharacterSheetRequest = z.infer<typeof importCharacterSheetRequestSchema>;
export type CharacterOptionsResponse = z.infer<typeof characterOptionsResponseSchema>;
export type CharacterBuildTemplate = z.infer<typeof characterBuildTemplateSchema>;
