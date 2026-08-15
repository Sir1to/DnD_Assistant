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

  it('rejects short passwords', () => {
    expect(() =>
      loginRequestSchema.parse({
        email: 'keeper@example.test',
        password: 'too-short',
      }),
    ).toThrow();
  });
});
