import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AttemptWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();

  public constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  public assertAllowed(key: string, now = Date.now()): void {
    const current = this.attempts.get(key);

    if (!current || current.resetAt <= now) {
      this.attempts.delete(key);
      return;
    }

    if (current.count >= this.config.getOrThrow<number>('LOGIN_RATE_LIMIT_ATTEMPTS')) {
      throw new HttpException(
        'Too many login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  public recordFailure(key: string, now = Date.now()): void {
    const current = this.attempts.get(key);
    const windowMilliseconds =
      this.config.getOrThrow<number>('LOGIN_RATE_LIMIT_WINDOW_SECONDS') * 1000;

    if (!current || current.resetAt <= now) {
      this.attempts.set(key, {
        count: 1,
        resetAt: now + windowMilliseconds,
      });
      return;
    }

    current.count += 1;
  }

  public reset(key: string): void {
    this.attempts.delete(key);
  }
}
