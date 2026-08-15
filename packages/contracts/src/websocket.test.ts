import { describe, expect, it } from 'vitest';

import { eventEnvelopeSchema } from './websocket';

describe('eventEnvelopeSchema', () => {
  it('accepts a versioned board event', () => {
    const result = eventEnvelopeSchema.safeParse({
      contractVersion: 1,
      eventId: '8fd08f42-0650-4aa0-b928-d5a69d880423',
      eventName: 'widget.instance.updated',
      occurredAt: '2026-07-25T10:00:00.000Z',
      boardId: 'cff957f4-cf27-44b6-a90e-da42974b24ab',
      revision: 4,
      data: { widgetId: '9818af1d-7467-4e80-a858-48398fcbbc28' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects unsupported contract versions', () => {
    const result = eventEnvelopeSchema.safeParse({
      contractVersion: 2,
      eventId: '8fd08f42-0650-4aa0-b928-d5a69d880423',
      eventName: 'widget.instance.updated',
      occurredAt: '2026-07-25T10:00:00.000Z',
      boardId: 'cff957f4-cf27-44b6-a90e-da42974b24ab',
      data: {},
    });

    expect(result.success).toBe(false);
  });
});
