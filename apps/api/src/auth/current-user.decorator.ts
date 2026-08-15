import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedRequestContext, AuthenticatedUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authContext?: AuthenticatedRequestContext }>();

    if (!request.authContext) {
      throw new UnauthorizedException('Authentication is required');
    }

    return request.authContext.user;
  },
);
