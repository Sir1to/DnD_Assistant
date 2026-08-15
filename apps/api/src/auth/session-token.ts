import { createHash, randomBytes } from 'node:crypto';

import type { Request } from 'express';

export const SESSION_COOKIE_NAME = 'fog_of_lore_session';

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function readSessionToken(request: Request): string | null {
  return parseSessionToken(request.header('cookie'));
}

export function parseSessionToken(cookieHeader?: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');

    if (separator < 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();

    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}
