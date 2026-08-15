export class RevisionConflictError extends Error {
  public constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`Revision conflict: expected ${expected}, received ${actual}`);
    this.name = 'RevisionConflictError';
  }
}

export function assertRevision(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new RevisionConflictError(expected, actual);
  }
}

export function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new RangeError('Revision must be a non-negative safe integer');
  }

  return current + 1;
}
