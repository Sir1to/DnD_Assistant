import { describe, expect, it } from 'vitest';

import { redactSensitiveRequestUrl } from './sensitive-request-url';

describe('redactSensitiveRequestUrl', () => {
  it('removes public character tokens from card and portrait request logs', () => {
    const token = 'a'.repeat(43);
    expect(redactSensitiveRequestUrl(`/api/character-shares/${token}`)).toBe(
      '/api/character-shares/[REDACTED]',
    );
    expect(redactSensitiveRequestUrl(`/api/character-shares/${token}/portrait?size=small`)).toBe(
      '/api/character-shares/[REDACTED]/portrait?size=small',
    );
    expect(
      redactSensitiveRequestUrl(`https://table.example/share/characters/${token}?from=message`),
    ).toBe('https://table.example/share/characters/[REDACTED]?from=message');
  });

  it('leaves unrelated request paths intact', () => {
    expect(redactSensitiveRequestUrl('/api/characters/123')).toBe('/api/characters/123');
  });
});
