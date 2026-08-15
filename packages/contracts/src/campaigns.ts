import { z } from 'zod';

export const campaignRoleSchema = z.enum(['OWNER', 'GM', 'PLAYER']);
export const campaignInvitationStatusSchema = z.enum([
  'AVAILABLE',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
]);

export const createCampaignRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000).default(''),
});

export const campaignSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  role: campaignRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const boardViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  audience: z.enum(['MASTER', 'PLAYERS']),
});

export const boardSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  views: z.array(boardViewSchema),
});

export const campaignDetailSchema = campaignSummarySchema.extend({
  boards: z.array(boardSchema),
});

export const campaignListResponseSchema = z.object({
  campaigns: z.array(campaignSummarySchema),
});

export const createCampaignInvitationRequestSchema = z.object({
  expiresInDays: z.int().min(1).max(30).default(7),
});

export const campaignInvitationSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  role: z.literal('PLAYER'),
  status: campaignInvitationStatusSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});

export const createdCampaignInvitationSchema = campaignInvitationSchema.extend({
  token: z.string().min(32),
});

export const campaignInvitationPreviewSchema = z.object({
  campaignId: z.string().uuid(),
  campaignName: z.string(),
  role: z.literal('PLAYER'),
  status: campaignInvitationStatusSchema,
  expiresAt: z.string().datetime(),
});

export const campaignInvitationsResponseSchema = z.object({
  invitations: z.array(campaignInvitationSchema),
});

export const campaignMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email(),
  role: campaignRoleSchema,
  joinedAt: z.string().datetime(),
});

export const updateCampaignMemberRoleRequestSchema = z.object({
  role: z.enum(['GM', 'PLAYER']),
});

export const campaignMembersResponseSchema = z.object({
  members: z.array(campaignMemberSchema),
});

export type CampaignRole = z.infer<typeof campaignRoleSchema>;
export type CampaignInvitationStatus = z.infer<typeof campaignInvitationStatusSchema>;
export type CreateCampaignRequest = z.infer<typeof createCampaignRequestSchema>;
export type CampaignSummary = z.infer<typeof campaignSummarySchema>;
export type CampaignDetail = z.infer<typeof campaignDetailSchema>;
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;
export type CreateCampaignInvitationRequest = z.infer<typeof createCampaignInvitationRequestSchema>;
export type CampaignInvitation = z.infer<typeof campaignInvitationSchema>;
export type CreatedCampaignInvitation = z.infer<typeof createdCampaignInvitationSchema>;
export type CampaignInvitationPreview = z.infer<typeof campaignInvitationPreviewSchema>;
export type CampaignInvitationsResponse = z.infer<typeof campaignInvitationsResponseSchema>;
export type CampaignMember = z.infer<typeof campaignMemberSchema>;
export type CampaignMembersResponse = z.infer<typeof campaignMembersResponseSchema>;
export type UpdateCampaignMemberRoleRequest = z.infer<typeof updateCampaignMemberRoleRequestSchema>;
