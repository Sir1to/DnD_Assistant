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
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'mysql://localhost/database',
      }),
    ).toThrow();
  });
});
