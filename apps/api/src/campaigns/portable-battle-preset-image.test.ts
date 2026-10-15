import { describe, expect, it } from 'vitest';

import {
  decodePortableBattlePresetImage,
  encodePortableBattlePresetImage,
} from './portable-battle-preset-image';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('portable battle preset images', () => {
  it('round-trips a bounded PNG with verified dimensions', () => {
    const encoded = encodePortableBattlePresetImage('token.png', 'image/png', onePixelPng);
    expect(encoded).toMatchObject({ byteLength: onePixelPng.length, width: 1, height: 1 });
    expect(decodePortableBattlePresetImage(encoded)).toEqual(onePixelPng);
  });

  it('rejects forged dimensions and unsupported image data', () => {
    const encoded = encodePortableBattlePresetImage('token.png', 'image/png', onePixelPng);
    expect(() => decodePortableBattlePresetImage({ ...encoded, width: 2 })).toThrow(
      'dimensions do not match',
    );
    expect(() =>
      encodePortableBattlePresetImage('token.png', 'image/png', Buffer.from('not an image')),
    ).toThrow('does not match');
  });
});
