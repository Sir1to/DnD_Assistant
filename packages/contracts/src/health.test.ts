import { describe, expect, it } from 'vitest';

import { healthStatusSchema } from './health';

describe('health status contract', () => {
  it('accepts readiness data with build identity', () => {
    const result = healthStatusSchema.parse({
      status: 'ok',
      service: 'fog-of-lore-api',
      timestamp: '2026-10-05T12:00:00.000Z',
      database: 'up',
      build: {
        version: '0.1.0',
        commit: 'd3ac88a',
        builtAt: '2026-10-05T11:55:00.000Z',
      },
    });

    expect(result.build.commit).toBe('d3ac88a');
  });

  it('requires build identity on liveness responses', () => {
    expect(() =>
      healthStatusSchema.parse({
        status: 'ok',
        service: 'fog-of-lore-api',
        timestamp: '2026-10-05T12:00:00.000Z',
      }),
    ).toThrow();
  });
});
