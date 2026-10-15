import { z } from 'zod';

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'error']),
  service: z.literal('fog-of-lore-api'),
  timestamp: z.iso.datetime(),
  database: z.enum(['up', 'down']).optional(),
  build: z.object({
    version: z.string().trim().min(1).max(64),
    commit: z.string().trim().min(1).max(64),
    builtAt: z.iso.datetime().optional(),
  }),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
