import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment';

describe('environment validation', () => {
  it('parses a complete local configuration', () => {
    const result = validateEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/fog_of_lore',
      WEB_ORIGIN: 'http://localhost:3000',
      COOKIE_SECURE: 'false',
    });

    expect(result.API_PORT).toBe(4000);
    expect(result.COOKIE_SECURE).toBe(false);
    expect(result.TRUST_PROXY_HOPS).toBe(0);
    expect(result.APP_VERSION).toBe('0.1.0');
    expect(result.APP_COMMIT).toBe('development');
  });

  it('accepts a bounded reverse-proxy hop count', () => {
    const result = validateEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/fog_of_lore',
      TRUST_PROXY_HOPS: '1',
    });

    expect(result.TRUST_PROXY_HOPS).toBe(1);
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/fog_of_lore',
        TRUST_PROXY_HOPS: '4',
      }),
    ).toThrow();
  });

  it('accepts release build metadata', () => {
    const result = validateEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/fog_of_lore',
      APP_VERSION: '1.4.0',
      APP_COMMIT: 'abc1234',
      APP_BUILD_TIME: '2026-10-05T12:00:00.000Z',
    });

    expect(result.APP_BUILD_TIME).toBe('2026-10-05T12:00:00.000Z');
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'mysql://localhost/database',
      }),
    ).toThrow();
  });
});
