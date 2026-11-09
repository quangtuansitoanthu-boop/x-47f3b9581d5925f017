import { describe, expect, it } from 'vitest';
import { interactionProfile } from '$lib/browser/interaction-performance';

describe('interaction performance policy', () => {
  it.each([
    { native: true, reducedMotion: false, cores: 16, memory: 16 },
    { native: false, reducedMotion: true },
    { native: false, reducedMotion: false, memory: 2 },
    { native: false, reducedMotion: false, memory: 4 },
    { native: false, reducedMotion: false, cores: 4 },
  ])('uses economical rendering for a native, constrained or reduced-motion device: %o', device => {
    expect(interactionProfile(device)).toBe('efficient');
  });
  it('retains full effects when capabilities are unavailable or sufficient', () => {
    expect(interactionProfile({ native: false, reducedMotion: false })).toBe('full');
    expect(interactionProfile({ native: false, reducedMotion: false, memory: 8, cores: 8 })).toBe('full');
    expect(interactionProfile({ native: false, reducedMotion: false, memory: 0, cores: 0 })).toBe('full');
  });
});
