import { z } from 'zod';

export const websocketEventNameSchema = z.enum([
  'board.view.created',
  'board.view.updated',
  'board.layout.updated',
  'widget.instance.created',
  'widget.instance.updated',
  'widget.instance.deleted',
  'widget.placement.created',
  'widget.placement.deleted',
  'timer.command.executed',
  'encounter.updated',
  'encounter.turn.changed',
]);

export const eventEnvelopeSchema = z.object({
  contractVersion: z.literal(1),
  eventId: z.uuid(),
  eventName: websocketEventNameSchema,
  occurredAt: z.iso.datetime(),
  boardId: z.uuid(),
  revision: z.int().nonnegative().optional(),
  data: z.record(z.string(), z.unknown()),
});

export type WebsocketEventName = z.infer<typeof websocketEventNameSchema>;
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
