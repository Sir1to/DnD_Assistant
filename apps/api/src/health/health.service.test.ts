import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

import type { Environment } from '../config/environment';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
  const pool = { query } as unknown as Pool;
  const config = new ConfigService<Environment, true>({
    APP_VERSION: '0.2.0',
    APP_COMMIT: 'abc1234',
    APP_BUILD_TIME: '2026-10-05T12:00:00.000Z',
  });
  const service = new HealthService(pool, config);

  it('reports the running build in liveness data', () => {
    expect(service.live()).toMatchObject({
      status: 'ok',
      build: {
        version: '0.2.0',
        commit: 'abc1234',
        builtAt: '2026-10-05T12:00:00.000Z',
      },
    });
  });

  it('checks the database before reporting readiness', async () => {
    await expect(service.ready()).resolves.toMatchObject({ database: 'up' });
    expect(query).toHaveBeenCalledWith('select 1');
  });
});
