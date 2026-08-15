import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedRequestContext } from './auth.types';
import { AuthService } from './auth.service';
import { readSessionToken } from './session-token';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  public constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authContext?: AuthenticatedRequestContext }>();
    const token = readSessionToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    request.authContext = await this.authService.authenticate(token);
    return true;
  }
}
