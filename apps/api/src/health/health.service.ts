import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthStatus } from '@fog-of-lore/contracts';
import type { Pool } from 'pg';

import type { Environment } from '../config/environment';
import { PG_POOL } from '../database/database.constants';

@Injectable()
export class HealthService {
  public constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>,
  ) {}

  public live(): HealthStatus {
    return {
      status: 'ok',
      service: 'fog-of-lore-api',
      timestamp: new Date().toISOString(),
      build: {
        version: this.config.get('APP_VERSION', { infer: true }),
        commit: this.config.get('APP_COMMIT', { infer: true }),
        ...(this.config.get('APP_BUILD_TIME', { infer: true })
          ? { builtAt: this.config.get('APP_BUILD_TIME', { infer: true }) }
          : {}),
      },
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
