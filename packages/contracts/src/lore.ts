import { z } from 'zod';

import { campaignRoleSchema } from './campaigns';

export const loreCategorySchema = z.enum([
  'GENERAL',
  'CLUE',
  'FACT',
  'MAP',
  'PERSON',
  'PLACE',
  'EVENT',
  'ITEM',
  'HANDOUT',
]);
export const loreStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export const loreAudienceSchema = z.enum(['MASTER', 'ALL_PLAYERS', 'SELECTED_PLAYERS']);

export const loreAttachmentSchema = z.object({
  id: z.string().uuid(),
  loreEntryId: z.string().uuid(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.int().nonnegative(),
  createdAt: z.string().datetime(),
});

const recipientUserIdsSchema = z
  .array(z.string().uuid())
  .max(100)
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const createLoreEntryRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().max(100_000).default(''),
  category: loreCategorySchema.default('GENERAL'),
  isPinned: z.boolean().default(false),
  status: loreStatusSchema.default('DRAFT'),
  audience: loreAudienceSchema.default('MASTER'),
  recipientUserIds: recipientUserIdsSchema,
});

export const updateLoreEntryRequestSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    title: z.string().trim().min(1).max(160).optional(),
    content: z.string().max(100_000).optional(),
    category: loreCategorySchema.optional(),
    isPinned: z.boolean().optional(),
    status: loreStatusSchema.optional(),
    audience: loreAudienceSchema.optional(),
    recipientUserIds: recipientUserIdsSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.category !== undefined ||
      value.isPinned !== undefined ||
      value.status !== undefined ||
      value.audience !== undefined ||
      value.recipientUserIds !== undefined,
    { message: 'At least one lore field must be provided' },
  );

export const loreEntrySchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  category: loreCategorySchema,
  isPinned: z.boolean(),
  status: loreStatusSchema,
  audience: loreAudienceSchema,
  recipientUserIds: z.array(z.string().uuid()),
  attachments: z.array(loreAttachmentSchema),
  authorDisplayName: z.string().nullable(),
  revision: z.int().nonnegative(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const campaignLoreResponseSchema = z.object({
  campaignId: z.string().uuid(),
  role: campaignRoleSchema,
  entries: z.array(loreEntrySchema),
});

export const campaignEventEnvelopeSchema = z.object({
  contractVersion: z.literal(1),
  eventId: z.string().uuid(),
  eventName: z.enum([
    'campaign.lore.changed',
    'campaign.characters.changed',
    'campaign.battle.changed',
  ]),
  occurredAt: z.string().datetime(),
  campaignId: z.string().uuid(),
});

export type LoreCategory = z.infer<typeof loreCategorySchema>;
export type LoreStatus = z.infer<typeof loreStatusSchema>;
export type LoreAudience = z.infer<typeof loreAudienceSchema>;
export type CreateLoreEntryRequest = z.infer<typeof createLoreEntryRequestSchema>;
export type UpdateLoreEntryRequest = z.infer<typeof updateLoreEntryRequestSchema>;
export type LoreEntry = z.infer<typeof loreEntrySchema>;
export type LoreAttachment = z.infer<typeof loreAttachmentSchema>;
export type CampaignLoreResponse = z.infer<typeof campaignLoreResponseSchema>;
export type CampaignEventEnvelope = z.infer<typeof campaignEventEnvelopeSchema>;
