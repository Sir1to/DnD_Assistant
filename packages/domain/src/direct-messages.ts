export type DirectMessageRole = 'OWNER' | 'GM' | 'PLAYER';

export function canAccessDirectConversation(
  role: DirectMessageRole,
  userId: string,
  playerUserId: string,
): boolean {
  return role !== 'PLAYER' || userId === playerUserId;
}

export function nextReadSequence(current: number, requested: number, lastSequence: number): number {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new RangeError('Current read sequence must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(requested) || requested < 0) {
    throw new RangeError('Requested read sequence must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(lastSequence) || lastSequence < 0) {
    throw new RangeError('Last sequence must be a non-negative safe integer');
  }

  return Math.min(Math.max(current, requested), lastSequence);
}

export function hasMessageSequenceGap(current: number, received: number): boolean {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new RangeError('Current sequence must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(received) || received < 0) {
    throw new RangeError('Received sequence must be a non-negative safe integer');
  }

  return received > current + 1;
}
