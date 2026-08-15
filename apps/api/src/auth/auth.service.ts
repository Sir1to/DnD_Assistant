import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LoginRequest, RegisterRequest, User } from '@fog-of-lore/contracts';
import argon2 from 'argon2';
import { and, eq, gt } from 'drizzle-orm';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { sessions, users } from '../database/schema';
import type { AuthenticatedRequestContext, SessionResult } from './auth.types';
import { LoginAttemptLimiter } from './login-attempt-limiter.service';
import { createSessionToken, hashSessionToken } from './session-token';

const PASSWORD_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(LoginAttemptLimiter) private readonly loginAttemptLimiter: LoginAttemptLimiter,
  ) {}

  public async register(input: RegisterRequest): Promise<SessionResult> {
    const passwordHash = await argon2.hash(input.password, PASSWORD_OPTIONS);
    const token = createSessionToken();
    const expiresAt = this.createExpiry();

    try {
      const user = await this.database.transaction(async (transaction) => {
        const [createdUser] = await transaction
          .insert(users)
          .values({
            email: input.email,
            emailNormalized: input.email,
            passwordHash,
            displayName: input.displayName,
          })
          .returning({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            createdAt: users.createdAt,
          });

        if (!createdUser) {
          throw new Error('User insert did not return a row');
        }

        await transaction.insert(sessions).values({
          userId: createdUser.id,
          tokenHash: hashSessionToken(token),
          expiresAt,
        });

        return this.toPublicUser(createdUser);
      });

      return { token, expiresAt, user };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }

      throw error;
    }
  }

  public async login(input: LoginRequest, rateLimitKey: string): Promise<SessionResult> {
    this.loginAttemptLimiter.assertAllowed(rateLimitKey);

    const [user] = await this.database
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        passwordHash: users.passwordHash,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.emailNormalized, input.email))
      .limit(1);

    if (!user) {
      await argon2.hash(input.password, PASSWORD_OPTIONS);
      this.rejectLogin(rateLimitKey);
    }

    const passwordMatches = await argon2.verify(user.passwordHash, input.password);

    if (!passwordMatches) {
      this.rejectLogin(rateLimitKey);
    }

    this.loginAttemptLimiter.reset(rateLimitKey);

    const token = createSessionToken();
    const expiresAt = this.createExpiry();

    await this.database.insert(sessions).values({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });

    return {
      token,
      expiresAt,
      user: this.toPublicUser(user),
    };
  }

  public async authenticate(token: string): Promise<AuthenticatedRequestContext> {
    const now = new Date();
    const [record] = await this.database
      .select({
        sessionId: sessions.id,
        lastUsedAt: sessions.lastUsedAt,
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)))
      .limit(1);

    if (!record) {
      throw new UnauthorizedException('The session is missing or has expired');
    }

    if (now.getTime() - record.lastUsedAt.getTime() >= 15 * 60 * 1000) {
      await this.database
        .update(sessions)
        .set({ lastUsedAt: now })
        .where(eq(sessions.id, record.sessionId));
    }

    return {
      token,
      user: {
        sessionId: record.sessionId,
        ...this.toPublicUser(record),
      },
    };
  }

  public async rotateSession(
    sessionId: string,
  ): Promise<Pick<SessionResult, 'token' | 'expiresAt'>> {
    const token = createSessionToken();
    const expiresAt = this.createExpiry();
    const [updated] = await this.database
      .update(sessions)
      .set({
        tokenHash: hashSessionToken(token),
        expiresAt,
        lastUsedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id });

    if (!updated) {
      throw new UnauthorizedException('The session no longer exists');
    }

    return { token, expiresAt };
  }

  public async logout(sessionId: string): Promise<void> {
    await this.database.delete(sessions).where(eq(sessions.id, sessionId));
  }

  private createExpiry(): Date {
    const ttlDays = this.config.getOrThrow<number>('SESSION_TTL_DAYS');
    return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  }

  private rejectLogin(rateLimitKey: string): never {
    this.loginAttemptLimiter.recordFailure(rateLimitKey);
    throw new UnauthorizedException('Invalid email or password');
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    displayName: string;
    createdAt: Date;
  }): User {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private isUniqueViolation(error: unknown): error is { code: '23505' } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    );
  }
}
