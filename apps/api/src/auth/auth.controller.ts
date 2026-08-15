import { Body, Controller, Get, HttpCode, Inject, Ip, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loginRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type RegisterRequest,
} from '@fog-of-lore/contracts';
import type { Response } from 'express';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { SessionAuthGuard } from './session-auth.guard';
import { SESSION_COOKIE_NAME } from './session-token';
import type { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  public constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Post('register')
  public async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) input: RegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.register(input);
    this.setSessionCookie(response, result.token, result.expiresAt);
    return { user: result.user };
  }

  @HttpCode(200)
  @Post('login')
  public async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(input, `${ip}|${input.email}`);
    this.setSessionCookie(response, result.token, result.expiresAt);
    return { user: result.user };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  public me(@CurrentUser() user: AuthenticatedUser): AuthResponse {
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    };
  }

  @HttpCode(204)
  @Post('logout')
  @UseGuards(SessionAuthGuard)
  public async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(user.sessionId);
    this.clearSessionCookie(response);
  }

  @HttpCode(204)
  @Post('refresh')
  @UseGuards(SessionAuthGuard)
  public async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.authService.rotateSession(user.sessionId);
    this.setSessionCookie(response, result.token, result.expiresAt);
  }

  private setSessionCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      expires: expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
    });
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
    });
  }
}
