import { describe, expect, it } from 'vitest';

import { formatBuildLabel } from './build-info';

describe('formatBuildLabel', () => {
  it('shortens commit hashes', () => {
    expect(formatBuildLabel({ version: '1.2.3', commit: 'abcdef1234567890' })).toBe(
      'v1.2.3 · abcdef12',
    );
  });

  it('keeps development labels and marks dirty builds', () => {
    expect(formatBuildLabel({ version: '0.1.0', commit: 'development' })).toBe(
      'v0.1.0 · development',
    );
    expect(formatBuildLabel({ version: '0.1.0', commit: 'abcdef123456-dirty' })).toBe(
      'v0.1.0 · abcdef12+dirty',
    );
  });
});
