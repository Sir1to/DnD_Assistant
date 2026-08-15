import { describe, expect, it } from 'vitest';

import {
  canAccessDirectConversation,
  hasMessageSequenceGap,
  nextReadSequence,
} from './direct-messages';

describe('direct messages domain', () => {
  it('limits a player to their own conversation while allowing campaign masters', () => {
    expect(canAccessDirectConversation('PLAYER', 'player-a', 'player-a')).toBe(true);
    expect(canAccessDirectConversation('PLAYER', 'player-a', 'player-b')).toBe(false);
    expect(canAccessDirectConversation('GM', 'gm-a', 'player-b')).toBe(true);
    expect(canAccessDirectConversation('OWNER', 'owner-a', 'player-b')).toBe(true);
  });

  it('moves read position forward without exceeding the conversation tail', () => {
    expect(nextReadSequence(4, 2, 10)).toBe(4);
    expect(nextReadSequence(4, 7, 10)).toBe(7);
    expect(nextReadSequence(4, 20, 10)).toBe(10);
  });

  it('detects a missing realtime message sequence', () => {
    expect(hasMessageSequenceGap(4, 5)).toBe(false);
    expect(hasMessageSequenceGap(4, 7)).toBe(true);
  });
});
