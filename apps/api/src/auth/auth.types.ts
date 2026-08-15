import type { User } from '@fog-of-lore/contracts';

export interface AuthenticatedUser extends User {
  sessionId: string;
}

export interface AuthenticatedRequestContext {
  user: AuthenticatedUser;
  token: string;
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
  user: User;
}
