import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthStatus } from '@fog-of-lore/contracts';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  public constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('live')
  public live(): HealthStatus {
    return this.healthService.live();
  }

  @Get()
  public ready(): Promise<HealthStatus> {
    return this.healthService.ready();
  }
}
