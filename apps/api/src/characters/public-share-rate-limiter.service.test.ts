import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { PublicShareRateLimiter } from './public-share-rate-limiter.service';

describe('PublicShareRateLimiter', () => {
  it('limits bursts per client and resets the window', () => {
    const limiter = new PublicShareRateLimiter();
    for (let index = 0; index < 120; index += 1) limiter.consume('client', 1_000);
    expect(() => limiter.consume('client', 2_000)).toThrow(HttpException);
    expect(() => limiter.consume('client', 61_000)).not.toThrow();
  });

  it('bounds tracked clients and accepts new clients after stale windows expire', () => {
    const limiter = new PublicShareRateLimiter();
    for (let index = 0; index < 10_000; index += 1) {
      limiter.consume(`client-${index}`, 1_000);
    }

    expect(() => limiter.consume('one-client-too-many', 2_000)).toThrow(HttpException);
    expect(() => limiter.consume('new-client-after-reset', 61_000)).not.toThrow();
  });

  it('normalizes empty and oversized client identifiers', () => {
    const limiter = new PublicShareRateLimiter();
    for (let index = 0; index < 120; index += 1) limiter.consume('', 1_000);

    expect(() => limiter.consume('   ', 2_000)).toThrow(HttpException);
    expect(() => limiter.consume(`client-${'x'.repeat(512)}`, 2_000)).not.toThrow();
  });
});
