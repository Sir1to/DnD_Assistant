import { describe, expect, it } from 'vitest';

import { loginRequestSchema, registerRequestSchema } from './auth';

describe('auth contracts', () => {
  it('normalizes an email without changing the password', () => {
    const result = registerRequestSchema.parse({
      email: ' Keeper@Example.Test ',
      password: '  a password with spaces  ',
      displayName: ' Хранитель ',
    });

    expect(result).toEqual({
      email: 'keeper@example.test',
      password: '  a password with spaces  ',
      displayName: 'Хранитель',
    });
  });

  it('keeps registration passwords strong while allowing provisioned local logins', () => {
    expect(() =>
      registerRequestSchema.parse({
        email: 'keeper@example.test',
        password: 'too-short',
        displayName: 'Keeper',
      }),
    ).toThrow();

    expect(loginRequestSchema.parse({ email: ' Master ', password: '1' })).toEqual({
      email: 'master@fog.local',
      password: '1',
    });
  });
});
