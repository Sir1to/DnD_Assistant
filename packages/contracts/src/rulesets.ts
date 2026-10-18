import { z } from 'zod';

import { characterRulesetSchema } from './characters';

export const dnd5eMonsterSizeSchema = z.enum([
  'Tiny',
  'Small',
  'Medium',
  'Large',
  'Huge',
  'Gargantuan',
]);

export const dnd5eMonsterTypeSchema = z.enum([
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
]);

export const dnd5eChallengeRatingSchema = z.enum([
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
]);

export const dnd5eMonsterSummarySchema = z.object({
  id: z.string().regex(/^srd:[a-z0-9-]+$/),
  name: z.string().min(1),
  englishName: z.string().min(1),
  referenceUrl: z.string().url(),
  size: dnd5eMonsterSizeSchema,
  type: dnd5eMonsterTypeSchema,
  challengeRating: dnd5eChallengeRatingSchema,
  experiencePoints: z.int().nonnegative(),
  armorClass: z.int().positive(),
  hitPoints: z.int().positive(),
  hitPointFormula: z.string().min(1),
  initiativeModifier: z.int(),
});

const dnd5eAbilityScoresSchema = z.object({
  str: z.int(),
  dex: z.int(),
  con: z.int(),
  int: z.int(),
  wis: z.int(),
  cha: z.int(),
});

const dnd5eNamedRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
});

const dnd5eActionSchema = dnd5eNamedRuleSchema.extend({
  attackBonus: z.int().optional(),
  damage: z
    .array(
      z.object({
        dice: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
});

export const dnd5eMonsterStatBlockSchema = dnd5eMonsterSummarySchema.extend({
  abilityScores: dnd5eAbilityScoresSchema,
  speed: z.record(z.string(), z.union([z.number(), z.boolean()])),
  savingThrows: z.record(z.string(), z.number()),
  skills: z.record(z.string(), z.number()),
  senses: z.record(z.string(), z.number()),
  languages: z.array(z.string()),
  damageVulnerabilities: z.array(z.string()),
  damageResistances: z.array(z.string()),
  damageImmunities: z.array(z.string()),
  conditionImmunities: z.array(z.string()),
  traits: z.array(dnd5eNamedRuleSchema),
  actions: z.array(dnd5eActionSchema),
  reactions: z.array(dnd5eNamedRuleSchema),
  legendaryActions: z
    .object({
      description: z.string(),
      perRound: z.int().positive(),
      actions: z.array(dnd5eNamedRuleSchema.extend({ cost: z.int().positive() })),
    })
    .nullable(),
  source: z.literal('SRD 5.2.1'),
  license: z.literal('CC-BY-4.0'),
});

export const dnd5eMonsterCatalogueResponseSchema = z.object({
  ruleset: characterRulesetSchema,
  source: z.literal('SRD 5.2.1'),
  license: z.literal('CC-BY-4.0'),
  attribution: z.string(),
  monsters: z.array(dnd5eMonsterSummarySchema),
});

export type Dnd5eMonsterSize = z.infer<typeof dnd5eMonsterSizeSchema>;
export type Dnd5eMonsterType = z.infer<typeof dnd5eMonsterTypeSchema>;
export type Dnd5eMonsterSummary = z.infer<typeof dnd5eMonsterSummarySchema>;
export type Dnd5eMonsterStatBlock = z.infer<typeof dnd5eMonsterStatBlockSchema>;
export type Dnd5eMonsterCatalogueResponse = z.infer<typeof dnd5eMonsterCatalogueResponseSchema>;
