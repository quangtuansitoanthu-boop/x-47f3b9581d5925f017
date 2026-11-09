import { beforeEach, describe, expect, it, vi } from 'vitest';

const mediaSessionMocks = vi.hoisted(() => ({
  configure: vi.fn(() => () => undefined),
  updateMetadata: vi.fn(),
  updatePosition: vi.fn(),
}));

vi.mock('$lib/browser/offline-audio-database', () => ({
  canAccessAudioAlbum: vi.fn(async () => true),
  getOfflineTrack: vi.fn(async () => null),
}));

vi.mock('$lib/browser/media-session', () => ({
  configureMediaSession: mediaSessionMocks.configure,
  updateMediaSessionMetadata: mediaSessionMocks.updateMetadata,
  updateMediaSessionPositionState: mediaSessionMocks.updatePosition,
  updateMediaSessionPlaybackState: vi.fn(),
}));

vi.mock('$lib/browser/session-csrf', () => ({
  fetchWithSessionRefresh: vi.fn(),
  getBrowserSession: vi.fn(async () => null),
}));

vi.mock('$lib/browser/audio-sync', () => ({
  applyRemotePlayerSync: vi.fn(),
  dispatchAudioStorageEvent: vi.fn(),
  pushRecentAlbum: vi.fn((id: string) => [id]),
  readPlayerSyncPayload: vi.fn(() => ({
    pt_player_state: null,
    pt_album_positions: {},
    pt_recent_albums: [],
  })),
  readStoredRecentAlbums: vi.fn(() => []),
  selectAudioSyncPrincipal: vi.fn(),
  writeStoredAlbumPosition: vi.fn(),
  writeStoredPlayerState: vi.fn(),
}));

class FakeAudio extends EventTarget {
  src = '';
  preload = '';
  playbackRate = 1;
  volume = 1;
  muted = false;
  duration = 120;
  currentTime = 0;
  error = null;

  play = vi.fn(async () => undefined);
  pause = vi.fn();
  load = vi.fn();
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
}

describe('audio player singleton initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('caches concurrent first access before creating one Audio and listener set', async () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    const windowAdd = vi.spyOn(windowTarget, 'addEventListener');
    const windowRemove = vi.spyOn(windowTarget, 'removeEventListener');
    const documentAdd = vi.spyOn(documentTarget, 'addEventListener');
    const documentRemove = vi.spyOn(documentTarget, 'removeEventListener');
    Object.defineProperty(documentTarget, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(globalThis, 'window', { value: windowTarget, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: documentTarget, configurable: true });
    const AudioConstructor = vi.fn(function AudioConstructor() {
      return new FakeAudio();
    });
    Object.defineProperty(globalThis, 'Audio', { value: AudioConstructor, configurable: true });

    const { getAudioPlayer, selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession({
      authenticated: true,
      csrfToken: 'csrf-a',
      user: { id: 'user-a' },
    });
    const first = getAudioPlayer();
    const second = getAudioPlayer();

    expect(first).toBe(second);
    const [firstController, secondController] = await Promise.all([first, second]);
    expect(firstController).toBe(secondController);
    expect(AudioConstructor).toHaveBeenCalledTimes(1);
    expect(mediaSessionMocks.configure).toHaveBeenCalledTimes(1);
    expect(windowAdd.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    expect(windowAdd.mock.calls.filter(([type]) => type === 'pagehide')).toHaveLength(1);
    expect(documentAdd.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1);

    selectAudioPlayerSession({ authenticated: false, csrfToken: null, user: null });
    expect(firstController.snapshot.album).toBeNull();
    expect(AudioConstructor).toHaveBeenCalledTimes(1);

    firstController.destroy();
    expect(windowRemove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    expect(windowRemove.mock.calls.filter(([type]) => type === 'pagehide')).toHaveLength(1);
    expect(documentRemove.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1);
  });
});
