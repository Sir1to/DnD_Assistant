import { z } from 'zod';

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'error']),
  service: z.literal('fog-of-lore-api'),
  timestamp: z.iso.datetime(),
  database: z.enum(['up', 'down']).optional(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
