import { describe, expect, it } from 'vitest';
import { encodeMediaFileNameHeader } from '$lib/browser/media-upload';

describe('media upload metadata', () => {
  it('encodes Vietnamese file names into an ASCII-safe request header', () => {
    const encoded = encodeMediaFileNameHeader('ảnh bìa kiểm thử.jpg');

    expect(encoded).toBe('%E1%BA%A3nh%20b%C3%ACa%20ki%E1%BB%83m%20th%E1%BB%AD.jpg');
    expect([...encoded].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
  });
});
