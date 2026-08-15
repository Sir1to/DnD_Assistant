import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: NextFunction): void {
    const suppliedRequestId = request.header('x-request-id');
    const requestId = suppliedRequestId?.slice(0, 128) || randomUUID();

    response.setHeader('x-request-id', requestId);
    next();
  }
}
