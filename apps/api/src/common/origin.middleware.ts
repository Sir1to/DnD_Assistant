import { ForbiddenException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class OriginMiddleware implements NestMiddleware {
  public constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  public use(request: Request, _response: Response, next: NextFunction): void {
    if (!stateChangingMethods.has(request.method)) {
      next();
      return;
    }

    const origin = request.header('origin');
    const allowedOrigin = this.config.getOrThrow<string>('WEB_ORIGIN');
    const isTest = this.config.get<string>('NODE_ENV') === 'test';

    if (!isTest && origin !== allowedOrigin) {
      throw new ForbiddenException('Request origin is not allowed');
    }

    next();
  }
}
