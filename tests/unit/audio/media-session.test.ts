import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureMediaSession,
  updateMediaSessionPositionState,
} from '$lib/browser/media-session';

describe('Media Session transport', () => {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const setActionHandler = vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    handlers.set(action, handler);
  });
  const setPositionState = vi.fn();

  beforeEach(() => {
    handlers.clear();
    setActionHandler.mockClear();
    setPositionState.mockClear();
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaSession: { setActionHandler, setPositionState, metadata: null } },
      configurable: true,
    });
  });

  it('registers seek backward and forward with requested and default offsets', () => {
    const actions = {
      play: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      seekTo: vi.fn(),
      seekBackward: vi.fn(),
      seekForward: vi.fn(),
    };

    const dispose = configureMediaSession(actions);
    handlers.get('seekbackward')?.({ action: 'seekbackward', seekOffset: 12 });
    handlers.get('seekbackward')?.({ action: 'seekbackward' });
    handlers.get('seekforward')?.({ action: 'seekforward', seekOffset: 45 });
    handlers.get('seekforward')?.({ action: 'seekforward' });
    handlers.get('seekto')?.({ action: 'seekto', seekTime: 33 });

    expect(actions.seekBackward).toHaveBeenNthCalledWith(1, 12);
    expect(actions.seekBackward).toHaveBeenNthCalledWith(2, 10);
    expect(actions.seekForward).toHaveBeenNthCalledWith(1, 45);
    expect(actions.seekForward).toHaveBeenNthCalledWith(2, 30);
    expect(actions.seekTo).toHaveBeenCalledWith(33);

    dispose();
    for (const action of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto', 'seekbackward', 'seekforward'] as const) {
      expect(setActionHandler).toHaveBeenCalledWith(action, null);
    }
  });

  it('publishes clamped position state and clears it when duration is unavailable', () => {
    updateMediaSessionPositionState(120, 150, 1.25);
    expect(setPositionState).toHaveBeenCalledWith({
      duration: 120,
      position: 120,
      playbackRate: 1.25,
    });

    updateMediaSessionPositionState(0, 10, 1);
    expect(setPositionState).toHaveBeenLastCalledWith();
  });
});
