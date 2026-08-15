import { Inject, Injectable } from '@nestjs/common';
import type { HealthStatus } from '@fog-of-lore/contracts';
import type { Pool } from 'pg';

import { PG_POOL } from '../database/database.constants';

@Injectable()
export class HealthService {
  public constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  public live(): HealthStatus {
    return {
      status: 'ok',
      service: 'fog-of-lore-api',
      timestamp: new Date().toISOString(),
    };
  }

  public async ready(): Promise<HealthStatus> {
    await this.pool.query('select 1');

    return {
      ...this.live(),
      database: 'up',
    };
  }
}
