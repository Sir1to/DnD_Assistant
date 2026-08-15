import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  hashSessionToken,
  readSessionToken,
  SESSION_COOKIE_NAME,
} from './session-token';

describe('session tokens', () => {
  it('creates opaque tokens and stores only a deterministic hash', () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashSessionToken(first)).toHaveLength(64);
    expect(hashSessionToken(first)).toBe(hashSessionToken(first));
  });

  it('reads the session cookie among unrelated cookies', () => {
    const request = {
      header: (name: string) =>
        name === 'cookie' ? `theme=dark; ${SESSION_COOKIE_NAME}=opaque%20token` : undefined,
    } as Request;

    expect(readSessionToken(request)).toBe('opaque token');
  });
});
