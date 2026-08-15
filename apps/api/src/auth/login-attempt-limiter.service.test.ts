import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { LoginAttemptLimiter } from './login-attempt-limiter.service';

const config = {
  getOrThrow: (key: string) => {
    if (key === 'LOGIN_RATE_LIMIT_ATTEMPTS') {
      return 2;
    }

    if (key === 'LOGIN_RATE_LIMIT_WINDOW_SECONDS') {
      return 60;
    }

    throw new Error(`Unexpected configuration key: ${key}`);
  },
} as ConfigService;

describe('LoginAttemptLimiter', () => {
  it('blocks repeated failures and resets after the configured window', () => {
    const limiter = new LoginAttemptLimiter(config);

    limiter.recordFailure('client', 1_000);
    limiter.recordFailure('client', 2_000);

    expect(() => limiter.assertAllowed('client', 3_000)).toThrow(HttpException);
    expect(() => limiter.assertAllowed('client', 62_000)).not.toThrow();
  });

  it('clears failures after a successful login', () => {
    const limiter = new LoginAttemptLimiter(config);

    limiter.recordFailure('client', 1_000);
    limiter.recordFailure('client', 2_000);
    limiter.reset('client');

    expect(() => limiter.assertAllowed('client', 3_000)).not.toThrow();
  });
});
