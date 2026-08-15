import { describe, expect, it } from 'vitest';

import {
  createDirectMessageRequestSchema,
  directMessageEventEnvelopeSchema,
  listDirectMessagesQuerySchema,
} from './direct-messages';

const id = '32c094fd-d15b-4d08-944e-2ad26fc62537';

describe('direct message contracts', () => {
  it('trims a plain-text message and requires a client idempotency key', () => {
    expect(
      createDirectMessageRequestSchema.parse({ clientMessageId: id, body: '  На связи.  ' }),
    ).toEqual({
      clientMessageId: id,
      body: 'На связи.',
    });
  });

  it('rejects ambiguous history cursors', () => {
    expect(
      listDirectMessagesQuerySchema.safeParse({ beforeSequence: 4, afterSequence: 3 }).success,
    ).toBe(false);
  });

  it('keeps websocket notifications free of message body', () => {
    const event = directMessageEventEnvelopeSchema.parse({
      contractVersion: 1,
      eventId: id,
      eventName: 'direct.message.created',
      occurredAt: '2026-08-03T12:00:00.000Z',
      campaignId: id,
      conversationId: id,
      sequence: 3,
    });
    expect(event).not.toHaveProperty('body');
  });
});
