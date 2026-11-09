import { describe, expect, it } from 'vitest';

import { parseAudioArtwork } from '$lib/domain/audio-artwork';

describe('audio artwork', () => {
  it('uses the full source and centers ordinary artwork', () => {
    expect(parseAudioArtwork('https://media.quangtu.vn/album.jpg')).toEqual({
      position: 'center',
      src: 'https://media.quangtu.vn/album.jpg',
    });
  });

  it('separates and decodes the legacy object-position suffix', () => {
    expect(parseAudioArtwork('https://media.quangtu.vn/album.jpg#pos=35%25%2070%25')).toEqual({
      position: '35% 70%',
      src: 'https://media.quangtu.vn/album.jpg',
    });
  });

  it('falls back to centered artwork when the position is malformed', () => {
    expect(parseAudioArtwork('/album.jpg#pos=%E0%A4%A')).toEqual({
      position: 'center',
      src: '/album.jpg',
    });
  });
});
