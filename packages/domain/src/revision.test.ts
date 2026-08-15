import { describe, expect, it } from 'vitest';

import { assertRevision, nextRevision, RevisionConflictError } from './revision';

describe('revision helpers', () => {
  it('allows a matching revision', () => {
    expect(() => assertRevision(3, 3)).not.toThrow();
    expect(nextRevision(3)).toBe(4);
  });

  it('rejects a stale revision', () => {
    expect(() => assertRevision(2, 3)).toThrow(RevisionConflictError);
  });
});
