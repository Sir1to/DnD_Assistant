import { z } from 'zod';

import { campaignRoleSchema } from './campaigns';

export const directMessageEventNameSchema = z.enum([
  'direct.conversation.created',
  'direct.message.created',
  'direct.read.updated',
]);

export const directConversationSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  playerUserId: z.string().uuid(),
  playerDisplayName: z.string(),
  lastSequence: z.int().nonnegative(),
  lastMessageAt: z.string().datetime().nullable(),
  unreadCount: z.int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const directConversationsResponseSchema = z.object({
  campaignId: z.string().uuid(),
  role: campaignRoleSchema,
  conversations: z.array(directConversationSchema),
});

export const directMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  sequence: z.int().positive(),
  senderUserId: z.string().uuid(),
  senderDisplayName: z.string(),
  senderRole: campaignRoleSchema,
  body: z.string(),
  createdAt: z.string().datetime(),
});

export const listDirectMessagesQuerySchema = z
  .object({
    beforeSequence: z.coerce.number().int().positive().optional(),
    afterSequence: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((value) => !(value.beforeSequence !== undefined && value.afterSequence !== undefined), {
    message: 'beforeSequence and afterSequence cannot be used together',
  });

export const directMessagesPageSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(directMessageSchema),
  hasMore: z.boolean(),
  lastSequence: z.int().nonnegative(),
});

export const createDirectMessageRequestSchema = z.object({
  clientMessageId: z.string().uuid(),
  body: z.string().trim().min(1).max(10_000),
});

export const markDirectConversationReadRequestSchema = z.object({
  lastReadSequence: z.int().nonnegative(),
});

export const directMessageEventEnvelopeSchema = z.object({
  contractVersion: z.literal(1),
  eventId: z.string().uuid(),
  eventName: directMessageEventNameSchema,
  occurredAt: z.string().datetime(),
  campaignId: z.string().uuid(),
  conversationId: z.string().uuid(),
  sequence: z.int().nonnegative().optional(),
});

export type DirectConversation = z.infer<typeof directConversationSchema>;
export type DirectConversationsResponse = z.infer<typeof directConversationsResponseSchema>;
export type DirectMessage = z.infer<typeof directMessageSchema>;
export type ListDirectMessagesQuery = z.infer<typeof listDirectMessagesQuerySchema>;
export type DirectMessagesPage = z.infer<typeof directMessagesPageSchema>;
export type CreateDirectMessageRequest = z.infer<typeof createDirectMessageRequestSchema>;
export type MarkDirectConversationReadRequest = z.infer<
  typeof markDirectConversationReadRequestSchema
>;
export type DirectMessageEventName = z.infer<typeof directMessageEventNameSchema>;
export type DirectMessageEventEnvelope = z.infer<typeof directMessageEventEnvelopeSchema>;
