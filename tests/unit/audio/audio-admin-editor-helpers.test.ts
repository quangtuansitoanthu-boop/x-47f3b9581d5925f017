import { describe, expect, it } from 'vitest';

import {
  dragObjectPosition,
  nudgeObjectPosition,
  reorderItems,
  serializeAudioArtwork,
} from '$lib/components/audio/audio-admin-editor-helpers';

describe('audio admin editor helpers', () => {
  it('keeps the legacy artwork position suffix contract', () => {
    expect(serializeAudioArtwork('/api/media/covers/talk.webp', 'center')).toBe('/api/media/covers/talk.webp');
    expect(serializeAudioArtwork('/api/media/covers/talk.webp', '35% 70%')).toBe(
      '/api/media/covers/talk.webp#pos=35%25%2070%25',
    );
  });

  it('converts drag deltas into clamped object positions', () => {
    expect(dragObjectPosition('center', 25, -20, 100, 100)).toBe('25% 70%');
    expect(dragObjectPosition('0% 100%', 80, -80, 100, 100)).toBe('0% 100%');
    expect(nudgeObjectPosition('right bottom', -10, -20)).toBe('90% 80%');
  });

  it('reorders tracks without mutating the input list', () => {
    const tracks = ['Một', 'Hai', 'Ba'];
    expect(reorderItems(tracks, 2, 0)).toEqual(['Ba', 'Một', 'Hai']);
    expect(tracks).toEqual(['Một', 'Hai', 'Ba']);
    expect(reorderItems(tracks, -1, 2)).toEqual(tracks);
  });
});
