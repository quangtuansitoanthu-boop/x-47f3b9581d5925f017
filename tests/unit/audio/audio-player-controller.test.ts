import { beforeEach, describe, expect, it, vi } from 'vitest';
import { principalStorageKey } from '$lib/browser/principal-storage';
import { PRACTICE_SESSION_OUTBOX_KEY } from '$lib/browser/practice-session-outbox';

vi.mock('$lib/browser/offline-audio-database', () => ({
  canAccessAudioAlbum: vi.fn(async () => true),
  getOfflineTrack: vi.fn(async () => null),
}));

vi.mock('$lib/browser/media-session', () => ({
  configureMediaSession: vi.fn(() => () => undefined),
  updateMediaSessionMetadata: vi.fn(),
  updateMediaSessionPositionState: vi.fn(),
  updateMediaSessionPlaybackState: vi.fn(),
}));

vi.mock('$lib/browser/audio-sync', () => ({
  applyRemotePlayerSync: vi.fn((payload) => payload),
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
  duration = 300;
  currentTime = 0;
  error: { code: number } | null = null;

  async play(): Promise<void> {
    this.dispatchEvent(new Event('loadedmetadata'));
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
  }

  pause(): void {
    this.dispatchEvent(new Event('pause'));
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }

  load(): void {}
}

class FakeElement {
  constructor(private readonly interactive = false) {}

  closest(): FakeElement | null {
    return this.interactive ? this : null;
  }
}

let keyboardHandler: ((event: KeyboardEvent) => void) | undefined;

function createStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function installBrowserStubs(): void {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const addWindowListener = windowTarget.addEventListener.bind(windowTarget);
  vi.spyOn(windowTarget, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown') keyboardHandler = listener as (event: KeyboardEvent) => void;
    addWindowListener(type, listener, options);
  });
  Object.defineProperty(documentTarget, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(documentTarget, 'activeElement', { value: null, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: windowTarget, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: documentTarget, configurable: true });
  Object.defineProperty(globalThis, 'Element', { value: FakeElement, configurable: true });
  Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: createStorage(), configurable: true });
  Object.defineProperty(globalThis, 'MediaError', {
    value: { MEDIA_ERR_ABORTED: 1, MEDIA_ERR_NETWORK: 2 },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'fetch', {
    value: vi.fn(async () => ({
      ok: true,
      json: async () => ({ authenticated: false, csrfToken: null }),
    })),
    configurable: true,
  });
}

describe('AudioPlayerController resume and retry lifecycle', () => {
  it.each(['android', 'ios'])('does not load web-only albums from a saved queue on %s', async platform => {
    vi.stubEnv('VITE_CONTENT_PLATFORM', platform);
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const { getOfflineTrack } = await import('$lib/browser/offline-audio-database');
    const controller = new AudioPlayerController();
    try {
      vi.mocked(getOfflineTrack).mockClear();
      expect(await controller.load({ id: 'pt_1782208869321', title: 'Saved album', tracks: [
        { title: 'Saved track', url: '/restricted.mp3' },
      ] })).toBe(false);
      expect(getOfflineTrack).not.toHaveBeenCalled();
      expect(controller.snapshot.album).toBeNull();
    } finally { controller.destroy(); vi.unstubAllEnvs(); }
  });
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    keyboardHandler = undefined;
    installBrowserStubs();
  });

  it('initializes public playback when recent-history storage is blocked', async () => {
    const { readStoredRecentAlbums } = await import('$lib/browser/audio-sync');
    vi.mocked(readStoredRecentAlbums).mockImplementationOnce(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      expect(controller.snapshot.recentAlbumIds).toEqual([]);
      await controller.load({ id: 'storage-blocked', title: 'Public talk', description: '', tracks: [{ title: 'Talk', url: '/public.mp3' }] });
      await controller.play();
      expect(controller.snapshot.playing).toBe(true);
    } finally { controller.destroy(); }
  });

  it('keeps playback and in-memory recent history available when persisting recents fails', async () => {
    const { pushRecentAlbum } = await import('$lib/browser/audio-sync');
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      vi.mocked(pushRecentAlbum).mockImplementationOnce(() => {
        throw new DOMException('Storage full', 'QuotaExceededError');
      });
      const album = { id: 'quota-talk', title: 'Public talk', description: '', tracks: [{ title: 'Talk', url: '/quota.mp3' }] };
      await expect(controller.playTrack(album)).resolves.toBeUndefined();
      expect(controller.snapshot.album?.id).toBe('quota-talk');
      expect(controller.snapshot.playing).toBe(true);
      expect(controller.snapshot.recentAlbumIds).toContain('quota-talk');
    } finally { controller.destroy(); }
  });

  it('clamps a pending seek when later metadata reveals a shorter track', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      await controller.load({ id: 'short-talk', title: 'Short talk', description: '', tracks: [{ title: 'Short', url: '/short.mp3' }] });
      let actualTime = 0;
      let duration = Number.NaN;
      Object.defineProperty(controller.audio, 'duration', { get: () => duration, configurable: true });
      Object.defineProperty(controller.audio, 'currentTime', {
        get: () => actualTime,
        set: (value: number) => { if (Number.isFinite(duration)) actualTime = Math.min(duration, value); },
        configurable: true,
      });
      controller.seek(30);
      expect(controller.snapshot.currentTime).toBe(30);
      duration = 10;
      controller.audio.dispatchEvent(new Event('loadedmetadata'));
      controller.audio.dispatchEvent(new Event('timeupdate'));
      expect(controller.snapshot.currentTime).toBe(10);
      expect(controller.audio.currentTime).toBe(10);
      actualTime = 9;
      controller.audio.dispatchEvent(new Event('timeupdate'));
      expect(controller.snapshot.currentTime).toBe(9);
    } finally { controller.destroy(); }
  });

  it.each(['pause', 'close', 'destroy'] as const)('preserves a saved resume point when %s happens before metadata loads', async action => {
    const { writeStoredPlayerState } = await import('$lib/browser/audio-sync');
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    let destroyed = false;
    try {
      await controller.load({ id: 'pending-resume', title: 'Talk', description: '', tracks: [{ title: 'Talk', url: '/pending-resume.mp3' }] }, 0, 60);
      expect(controller.audio.currentTime).toBe(0);
      expect(controller.snapshot.currentTime).toBe(60);
      controller[action]();
      destroyed = action === 'destroy';
      expect(writeStoredPlayerState).toHaveBeenLastCalledWith(expect.objectContaining({ albumId: 'pending-resume', pos: 60 }));
    } finally { if (!destroyed) controller.destroy(); }
  });

  it('stops an already-loaded private queue when the same account loses its role', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const admin = { authenticated: true, csrfToken: 'admin-csrf', user: { id: 'member', role: 'admin' } };
    const controller = new AudioPlayerController(admin);
    try {
      await controller.ready;
      await controller.playTrack({ id: 'private-talk', title: 'Private', description: '', tracks: [{ title: 'Private', url: '/private.mp3' }] });
      const playerSyncReads = () => vi.mocked(fetch).mock.calls.filter(([input, init]) =>
        String(input) === '/api/player-sync' && (!init?.method || init.method === 'GET')).length;
      const readsBefore = playerSyncReads();
      controller.setSession({ authenticated: true, csrfToken: 'member-csrf', user: { id: 'member', role: 'user' } });
      expect(controller.snapshot.album).toBeNull();
      expect(controller.snapshot.playing).toBe(false);
      expect(controller.audio.src).toBe('');
      expect(playerSyncReads()).toBe(readsBefore);
    } finally { controller.destroy(); }
  });

  it('preserves playback and speed when only the same-role session CSRF token refreshes', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const member = { authenticated: true, csrfToken: 'old-csrf', user: { id: 'member', role: 'user' } };
    const controller = new AudioPlayerController(member);
    try {
      await controller.ready;
      await controller.playTrack({ id: 'same-role', title: 'Talk', description: '', tracks: [{ title: 'Talk', url: '/same-role.mp3' }] });
      controller.setSpeed(1.5);
      controller.setSession({ authenticated: true, csrfToken: 'new-csrf', user: { id: 'member', role: 'user' } });
      expect(controller.snapshot.album?.id).toBe('same-role');
      expect(controller.snapshot.playing).toBe(true);
      expect(controller.audio.playbackRate).toBe(1.5);
    } finally { controller.destroy(); }
  });

  it('prepares one seekable source for a server without ranges and keeps the latest paused seek', { timeout: 10000 }, async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    let release!: (response: Response) => void;
    const response = new Promise<Response>(resolve => release = resolve);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => String(input) === '/no-range.mp3' ? response : Promise.resolve(new Response('{}')));
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:seekable');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    try {
      await controller.load({ id: 'seek-source', title: 'Seek', description: '', tracks: [{ title: 'Track', url: '/no-range.mp3' }] });
      Object.defineProperty(controller.audio, 'seekable', { value: { length: 1, start: () => 0, end: () => 0 } });
      controller.seek(200);
      controller.seek(250);
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/no-range.mp3')).toHaveLength(1);
      release(new Response(new Blob(['audio'], { type: 'audio/mpeg' })));
      await vi.waitFor(() => expect(controller.audio.src).toBe('blob:seekable'));
      controller.audio.dispatchEvent(new Event('loadedmetadata'));
      expect(controller.audio.currentTime).toBe(250);
      expect(controller.snapshot.playing).toBe(false);
      controller.seek(100);
      expect(controller.audio.currentTime).toBe(100);
      expect(createUrl).toHaveBeenCalledTimes(1);
    } finally { controller.destroy(); createUrl.mockRestore(); revokeUrl.mockRestore(); }
  });

  it('aborts a pending seek source when another track is loaded', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    let signal: AbortSignal | undefined;
    let release!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input) === '/old-no-range.mp3') {
        signal = init?.signal as AbortSignal;
        return new Promise(resolve => release = resolve);
      }
      return Promise.resolve(new Response('{}'));
    });
    try {
      await controller.load({ id: 'seek-source', title: 'Seek', description: '', tracks: [{ title: 'Old', url: '/old-no-range.mp3' }, { title: 'New', url: '/new.mp3' }] });
      Object.defineProperty(controller.audio, 'seekable', { value: { length: 1, start: () => 0, end: () => 0 } });
      controller.seek(200);
      await controller.load(controller.snapshot.album!, 1);
      expect(signal?.aborted).toBe(true);
      release(new Response(new Blob(['audio'])));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(controller.audio.src).toBe('/new.mp3');
    } finally { controller.destroy(); }
  });

  it('does not download another copy when the requested time is already seekable', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      await controller.load({ id: 'range-source', title: 'Seek', description: '', tracks: [{ title: 'Track', url: '/ranges.mp3' }] });
      Object.defineProperty(controller.audio, 'seekable', { value: { length: 1, start: () => 0, end: () => 300 } });
      controller.seek(250);
      expect(controller.audio.currentTime).toBe(250);
      expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/ranges.mp3')).toHaveLength(0);
    } finally { controller.destroy(); }
  });

  it('closing during a pending seek clears the target before late media events arrive', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    vi.mocked(fetch).mockImplementation(input => String(input) === '/closing-seek.mp3'
      ? new Promise<Response>(() => {}) : Promise.resolve(new Response('{}')));
    try {
      await controller.load({ id: 'closing-seek', title: 'Seek', description: '', tracks: [{ title: 'Track', url: '/closing-seek.mp3' }] });
      Object.defineProperty(controller.audio, 'seekable', { value: { length: 0 } });
      controller.seek(200);
      controller.close();
      controller.audio.dispatchEvent(new Event('canplay'));
      expect(controller.snapshot.album).toBeNull();
      expect(controller.snapshot.currentTime).toBe(0);
      expect(controller.audio.currentTime).toBe(0);
    } finally { controller.destroy(); }
  });

  it('reports a failed seek preparation and allows a later retry', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    vi.mocked(fetch).mockImplementation((input) => Promise.resolve(new Response(String(input) === '/failed-seek.mp3' ? '' : '{}', { status: String(input) === '/failed-seek.mp3' ? 503 : 200 })));
    try {
      await controller.load({ id: 'failed-seek', title: 'Seek', description: '', tracks: [{ title: 'Track', url: '/failed-seek.mp3' }] });
      Object.defineProperty(controller.audio, 'seekable', { value: { length: 0 } });
      controller.seek(200);
      await vi.waitFor(() => expect(controller.snapshot.error).toContain('Không thể tua'));
      expect(controller.snapshot.currentTime).toBe(0);
      controller.seek(250);
      await vi.waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/failed-seek.mp3')).toHaveLength(2));
    } finally { controller.destroy(); }
  });

  it('publishes an actionable playback failure without rejecting a UI event handler', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      await controller.load({ id: 'unavailable', title: 'Unavailable', description: '', tracks: [{ title: 'Track', url: '/missing.mp3' }] });
      vi.spyOn(controller.audio, 'play').mockRejectedValue(new DOMException('unsupported source', 'NotSupportedError'));
      await expect(controller.play()).resolves.toBeUndefined();
      expect(controller.snapshot.playing).toBe(false);
      expect(controller.snapshot.error).toContain('Không thể phát');
    } finally { controller.destroy(); }
  });

  function shortcutEvent(
    code: string,
    target = new FakeElement(),
    modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
  ): KeyboardEvent {
    return {
      code,
      target,
      defaultPrevented: false,
      isComposing: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      ...modifiers,
    } as unknown as KeyboardEvent;
  }

  it('reports actual track starts, preserves unfinished cycles and immediately counts completed replays', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    const requests = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/plays'));
    const album = { id: 'plays', title: 'Album', description: '', tracks: [
      { title: 'One', url: '/one.mp3' }, { title: 'Two', url: '/two.mp3' },
    ] };
    try {
      await controller.load(album);
      expect(requests()).toHaveLength(0);
      await controller.play();
      await vi.waitFor(() => expect(requests()).toHaveLength(1));
      controller.pause();
      controller.seek(10);
      controller.audio.dispatchEvent(new Event('waiting'));
      await controller.play();
      await controller.load(album, 0, 10);
      await controller.play();
      expect(requests()).toHaveLength(1);
      await controller.next();
      await vi.waitFor(() => expect(requests()).toHaveLength(2));
      controller.pause();
      controller.audio.dispatchEvent(new Event('ended'));
      expect(requests()).toHaveLength(2);
      await controller.play();
      await vi.waitFor(() => expect(requests()).toHaveLength(3));
      controller.cycleRepeat();
      controller.audio.dispatchEvent(new Event('ended'));
      await vi.waitFor(() => expect(requests()).toHaveLength(4));
      const bodies = requests().map(([, init]) => JSON.parse(String(init?.body)));
      expect(bodies.map((body) => body.trackUrl)).toEqual(['/one.mp3', '/two.mp3', '/two.mp3', '/two.mp3']);
      expect(new Set(bodies.map((body) => body.playbackId)).size).toBe(4);
    } finally { controller.destroy(); }
  });

  it('counts automatic next tracks and repeat-all cycles without an album cooldown', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    const requests = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/plays'));
    try {
      await controller.load({ id: 'repeat-all', title: 'Album', description: '', tracks: [
        { title: 'One', url: '/one.mp3' }, { title: 'Two', url: '/two.mp3' },
      ] });
      controller.cycleRepeat(); controller.cycleRepeat();
      await controller.play();
      await vi.waitFor(() => expect(requests()).toHaveLength(1));
      controller.audio.dispatchEvent(new Event('ended'));
      await vi.waitFor(() => expect(requests()).toHaveLength(2));
      controller.audio.dispatchEvent(new Event('ended'));
      await vi.waitFor(() => expect(requests()).toHaveLength(3));
      expect(requests().map(([, init]) => JSON.parse(String(init?.body)).trackUrl)).toEqual(['/one.mp3', '/two.mp3', '/one.mp3']);
    } finally { controller.destroy(); }
  });

  it('plays all 31 parts in order, clears repeat-one, and stops after the last part', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    const album = { id: '31-parts', title: 'Album 31 phần', description: '', tracks:
      Array.from({ length: 31 }, (_, i) => ({ title: `Phần ${i + 1}`, url: `/part-${i + 1}.mp3` })) };
    try {
      controller.cycleRepeat();
      await controller.playAll(album);
      expect(controller.snapshot.repeat).toBe(0);
      for (let i = 0; i < 30; i++) {
        expect(controller.snapshot.trackIndex).toBe(i);
        controller.audio.dispatchEvent(new Event('ended'));
        await vi.waitFor(() => expect(controller.snapshot.trackIndex).toBe(i + 1));
      }
      controller.audio.dispatchEvent(new Event('ended'));
      expect(controller.snapshot.trackIndex).toBe(30);
      expect(controller.snapshot.playing).toBe(false);
    } finally { controller.destroy(); }
  });

  it('marks the final track stopped even when the browser sends ended without a pause event', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      await controller.load({ id: 'last', title: 'Last', description: '', tracks: [{ title: 'Last', url: '/last.mp3' }] });
      await controller.play();
      controller.audio.dispatchEvent(new Event('ended'));
      expect(controller.snapshot.playing).toBe(false);
    } finally { controller.destroy(); }
  });

  it('does not reject a Play all click or disturb current playback for an empty album', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      await controller.load({ id: 'current', title: 'Current', description: '', tracks: [{ title: 'One', url: '/one.mp3' }] });
      await controller.play();
      await expect(controller.playAll({ id: 'empty', title: 'Empty', description: '', tracks: [] })).resolves.toBeUndefined();
      expect(controller.snapshot.album?.id).toBe('current');
      expect(controller.snapshot.playing).toBe(true);
      expect(controller.snapshot.error).toBeTruthy();
    } finally { controller.destroy(); }
  });

  it('a pause during asynchronous auto-next prevents the next track from starting', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const { getOfflineTrack } = await import('$lib/browser/offline-audio-database');
    const controller = new AudioPlayerController();
    try {
      await controller.load({ id: 'paused-transition', title: 'Album', description: '', tracks: [
        { title: 'One', url: '/one.mp3' }, { title: 'Two', url: '/two.mp3' },
      ] });
      await controller.play();
      let resolve!: (value: null) => void;
      vi.mocked(getOfflineTrack).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
      controller.audio.dispatchEvent(new Event('ended'));
      controller.pause();
      resolve(null);
      await vi.waitFor(() => expect(controller.snapshot.trackIndex).toBe(1));
      expect(controller.snapshot.playing).toBe(false);
    } finally { controller.destroy(); }
  });

  it('cancels a scheduled network retry when the listener presses pause', async () => {
    vi.useFakeTimers();
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController();
    try {
      await controller.load({ id: 'retry-paused', title: 'Album', description: '', tracks: [{ title: 'One', url: '/one.mp3' }] });
      await controller.play();
      const play = vi.spyOn(controller.audio, 'play');
      Object.assign(controller.audio, { error: { code: 2 } });
      controller.audio.dispatchEvent(new Event('error'));
      controller.pause();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(play).not.toHaveBeenCalled();
      expect(controller.snapshot.playing).toBe(false);
      expect(controller.snapshot.retry).toBe(0);
    } finally { controller.destroy(); vi.useRealTimers(); }
  });

  it('handles global shortcuts once and ignores modified or interactive targets', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    await controller.load({
      id: 'album-shortcuts', title: 'Album phím tắt', description: '',
      tracks: [{ title: 'Bài đang nghe', url: '/shortcuts.mp3' }],
    });
    controller.seek(20);

    const forward = shortcutEvent('ArrowRight');
    keyboardHandler?.(forward);
    expect(controller.snapshot.currentTime).toBe(25);
    expect(forward.preventDefault).toHaveBeenCalledOnce();

    keyboardHandler?.(shortcutEvent('ArrowLeft'));
    expect(controller.snapshot.currentTime).toBe(20);

    keyboardHandler?.(shortcutEvent('KeyM'));
    expect(controller.snapshot.muted).toBe(true);
    expect(controller.audio.muted).toBe(true);

    keyboardHandler?.(shortcutEvent('Space'));
    expect(controller.snapshot.playing).toBe(true);

    keyboardHandler?.(shortcutEvent('ArrowRight', new FakeElement(), { ctrlKey: true }));
    keyboardHandler?.(shortcutEvent('ArrowRight', new FakeElement(true)));
    expect(controller.snapshot.currentTime).toBe(20);

    controller.destroy();
  });

  it('bases relative seeks on the published position when media time lags', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    await controller.load({
      id: 'album-relative-seek', title: 'Album tua', description: '',
      tracks: [{ title: 'Bài đang nghe', url: '/relative-seek.mp3' }],
    });

    controller.seek(1);
    // A browser may expose the previous currentTime briefly after an
    // assignment; the visible snapshot is the authoritative user position.
    controller.audio.currentTime = 0;
    controller.seekBy(-10);
    controller.seekBy(30);
    (controller as unknown as { pendingSeekTarget?: number }).pendingSeekTarget = 30;
    controller.audio.currentTime = 0;
    controller.audio.dispatchEvent(new Event('timeupdate'));

    expect(controller.snapshot.currentTime).toBe(30);
    expect(controller.audio.currentTime).toBe(30);
    controller.destroy();
  });

  it('resumes the exact stored track and position after metadata is ready', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    const album = {
      id: 'album-a',
      title: 'Album A',
      description: 'Pháp ngữ',
      tracks: [
        { title: 'Bài 1', url: '/one.mp3' },
        { title: 'Bài 2', url: '/two.mp3' },
      ],
    };

    await controller.load(album, 1, 42);
    await controller.play();

    expect(controller.snapshot.trackIndex).toBe(1);
    expect(controller.audio.src).toContain('/two.mp3');
    expect(controller.audio.currentTime).toBe(42);
    controller.destroy();
  });

  it('does not let a stale retry replace a newly loaded track', async () => {
    vi.useFakeTimers();
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    const first = {
      id: 'album-a', title: 'Album A', description: '',
      tracks: [{ title: 'A', url: '/a.mp3' }],
    };
    const second = {
      id: 'album-b', title: 'Album B', description: '',
      tracks: [{ title: 'B', url: '/b.mp3' }],
    };

    await controller.load(first);
    (controller.audio as unknown as FakeAudio).error = { code: 2 };
    controller.audio.dispatchEvent(new Event('error'));
    expect(controller.snapshot.retry).toBe(1);

    await controller.load(second);
    await vi.advanceTimersByTimeAsync(2_500);

    expect(controller.audio.src).toContain('/b.mp3');
    expect(controller.snapshot.retry).toBe(0);
    controller.destroy();
  });

  it('closes playback while preserving the saved position and reusable controller lifecycle', async () => {
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    const album = {
      id: 'album-close', title: 'Album đóng', description: '',
      tracks: [{ title: 'Bài đang nghe', url: '/close.mp3' }],
    };

    await controller.load(album);
    await controller.play();
    controller.seek(27);
    controller.close();

    expect(controller.snapshot.album).toBeNull();
    expect(controller.snapshot.playing).toBe(false);
    expect(controller.audio.src).toBe('');

    await controller.load(album, 0, 27);
    expect(controller.snapshot.album?.id).toBe(album.id);
    expect(controller.snapshot.currentTime).toBe(27);
    controller.destroy();
  });

  it('still closes playback when browser position storage fails', async () => {
    const { writeStoredPlayerState } = await import('$lib/browser/audio-sync');
    vi.mocked(writeStoredPlayerState).mockImplementationOnce(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    const album = {
      id: 'album-storage-failure', title: 'Album lỗi lưu', description: '',
      tracks: [{ title: 'Bài đang nghe', url: '/storage-failure.mp3' }],
    };

    await controller.load(album);
    await controller.play();

    expect(() => controller.close()).not.toThrow();
    expect(controller.snapshot.album).toBeNull();
    expect(controller.snapshot.playing).toBe(false);
    expect(controller.audio.src).toBe('');
    controller.destroy();
  });

  it('backs off timeupdate persistence retries when browser storage fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { writeStoredPlayerState } = await import('$lib/browser/audio-sync');
    const writeState = vi.mocked(writeStoredPlayerState);
    writeState.mockClear();
    writeState.mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
    await controller.load({
      id: 'album-storage-backoff', title: 'Album lỗi dung lượng', description: '',
      tracks: [{ title: 'Bài đang nghe', url: '/storage-backoff.mp3' }],
    });

    controller.audio.dispatchEvent(new Event('timeupdate'));
    controller.audio.dispatchEvent(new Event('timeupdate'));

    expect(writeState).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('notifies the catalog after authenticated recent history is restored from cloud sync', async () => {
    const remotePayload = {
      pt_player_state: null,
      pt_album_positions: {},
      pt_recent_albums: ['album-recent'],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => remotePayload,
      });
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });

    const { createSessionStore, registerBrowserSessionStore } = await import('$lib/stores/session.svelte');
    const authenticatedSession = {
      authenticated: true,
      user: { id: 'admin', email: 'admin@example.com', displayName: 'Admin', avatarUrl: '', role: 'admin' },
      csrfToken: 'csrf-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as const;
    const unregisterSession = registerBrowserSessionStore(createSessionStore(authenticatedSession));

    const { dispatchAudioStorageEvent } = await import('$lib/browser/audio-sync');
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController(authenticatedSession);
    await controller.ready;

    expect(dispatchAudioStorageEvent).toHaveBeenCalledWith('quangtu:player-sync-updated', remotePayload);
    expect(controller.snapshot.recentAlbumIds).toEqual(['album-recent']);
    controller.destroy();
    unregisterSession();
  });

  it('cancels delayed and in-flight sync before resetting playback for another principal', async () => {
    vi.useFakeTimers();
    let putSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putSignal = init.signal as AbortSignal;
        return new Promise<Response>(() => {});
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          pt_player_state: null,
          pt_album_positions: {},
          pt_recent_albums: [],
        }),
      } as Response;
    });
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });
    const sessionA = {
      authenticated: true,
      csrfToken: 'csrf-a',
      user: { id: 'user-a' },
    };
    const sessionB = {
      authenticated: true,
      csrfToken: 'csrf-b',
      user: { id: 'user-b' },
    };
    const { selectAudioSyncPrincipal, writeStoredPlayerState } = await import('$lib/browser/audio-sync');
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController(sessionA);
    await controller.ready;
    await controller.load({
      id: 'album-a', title: 'Album A', description: '',
      tracks: [{ title: 'Bài A', url: '/a.mp3' }],
    });

    controller.pause();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(putSignal?.aborted).toBe(false);

    controller.setSession(sessionB);
    expect(putSignal?.aborted).toBe(true);
    expect(controller.snapshot.album).toBeNull();
    expect(controller.snapshot.recentAlbumIds).toEqual([]);
    expect(controller.audio.src).toBe('');
    expect(vi.mocked(selectAudioSyncPrincipal)).toHaveBeenLastCalledWith('user-b');

    await controller.load({
      id: 'album-b', title: 'Album B', description: '',
      tracks: [{ title: 'Bài B', url: '/b.mp3' }],
    });
    controller.pause();
    expect(vi.mocked(writeStoredPlayerState).mock.invocationCallOrder.at(-1))
      .toBeGreaterThan(vi.mocked(selectAudioSyncPrincipal).mock.invocationCallOrder.at(-1) ?? 0);
    controller.destroy();
  });

  it('records honest Dharma-talk playback without counting pauses or seeks as played time', async () => {
    vi.useFakeTimers();
    let now = 0;
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController({
      authenticated: true,
      csrfToken: 'csrf-a',
      user: { id: 'user-a' },
    }, { nowMs: () => now });
    await controller.ready;
    await controller.load({
      id: 'talk-a', title: 'Pháp thoại A', description: '',
      tracks: [{ title: 'Bài A', url: '/talk-a.mp3' }],
    });
    await controller.play();

    now = 30_000;
    controller.pause();
    now = 50_000;
    await controller.play();
    now = 60_000;
    controller.seek(200);
    now = 90_000;
    controller.close();

    const operations = JSON.parse(localStorage.getItem(
      principalStorageKey('user-a', PRACTICE_SESSION_OUTBOX_KEY),
    ) ?? '[]') as Array<{ kind: string; payload: Record<string, unknown> }>;
    expect(operations.map((operation) => operation.kind)).toEqual(['start', 'complete']);
    expect(operations[0].payload).toEqual(expect.objectContaining({
      activityType: 'dharma_talk',
      sourceId: 'talk-a:0',
      sourceKind: 'dharma_talk',
      targetCount: null,
      targetDurationSeconds: 300,
    }));
    expect(operations[1].payload.evidenceSummary).toEqual(expect.objectContaining({
      clientElapsedSeconds: 90,
      playedSeconds: 70,
      seekCount: 1,
    }));
    controller.destroy();
  });

  it('allows guest playback and keeps guest outbox isolated from account outbox before explicit adoption', async () => {
    let now = 0;
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController(undefined, { nowMs: () => now });
    const loginRequired = vi.fn();
    window.addEventListener('quangtu:login-required', loginRequired);
    expect(await controller.load({
      id: 'guest-talk', title: 'Pháp thoại khách', description: '',
      tracks: [{ title: 'Bài khách', url: '/guest-talk.mp3' }],
    })).toBe(true);
    await controller.play();
    expect(loginRequired).not.toHaveBeenCalled();
    expect(controller.audio.src).toContain('/guest-talk.mp3');
    now = 65_000;
    controller.close();

    const guestKey = principalStorageKey(null, PRACTICE_SESSION_OUTBOX_KEY);
    const accountKey = principalStorageKey('user-a', PRACTICE_SESSION_OUTBOX_KEY);
    const guestBeforeLogin = localStorage.getItem(guestKey);
    expect(JSON.parse(guestBeforeLogin ?? '[]').map((operation: { kind: string }) => operation.kind))
      .toEqual(['start', 'complete']);

    controller.setSession({
      authenticated: true,
      csrfToken: 'csrf-a',
      user: { id: 'user-a' },
    });

    expect(localStorage.getItem(guestKey)).toBe(guestBeforeLogin);
    expect(localStorage.getItem(accountKey)).toBeNull();
    controller.destroy();
  });

  it('finishes active evidence in the old account before starting evidence for the next account', async () => {
    let now = 0;
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
      configurable: true,
    });
    const sessionA = { authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } };
    const sessionB = { authenticated: true, csrfToken: 'csrf-b', user: { id: 'user-b' } };
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController(sessionA, { nowMs: () => now });
    await controller.load({
      id: 'talk-a', title: 'Pháp thoại A', description: '',
      tracks: [{ title: 'Bài A', url: '/talk-a.mp3' }],
    });
    await controller.play();
    now = 61_000;

    controller.setSession(sessionB);

    const operationsFor = (userId: string) => JSON.parse(localStorage.getItem(
      principalStorageKey(userId, PRACTICE_SESSION_OUTBOX_KEY),
    ) ?? '[]') as Array<{ kind: string; payload: Record<string, unknown> }>;
    expect(operationsFor('user-a').map((operation) => operation.kind)).toEqual(['start', 'complete']);
    expect(operationsFor('user-b')).toEqual([]);

    await controller.load({
      id: 'talk-b', title: 'Pháp thoại B', description: '',
      tracks: [{ title: 'Bài B', url: '/talk-b.mp3' }],
    });
    await controller.play();
    now = 125_000;
    controller.close();

    expect(operationsFor('user-a')[0].payload.sourceId).toBe('talk-a:0');
    expect(operationsFor('user-b')[0].payload.sourceId).toBe('talk-b:0');
    expect(operationsFor('user-b').map((operation) => operation.kind)).toEqual(['start', 'complete']);
    controller.destroy();
  });

  it('installs B and reports an explicit loss state when A evidence cannot fit in its outbox', async () => {
    let now = 0;
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
      configurable: true,
    });
    const sessionA = { authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } };
    const sessionB = { authenticated: true, csrfToken: 'csrf-b', user: { id: 'user-b' } };
    const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
    const controller = new AudioPlayerController(sessionA, { nowMs: () => now });
    await controller.load({
      id: 'talk-capacity-a', title: 'Pháp thoại A', description: '',
      tracks: [{ title: 'Bài A', url: '/talk-capacity-a.mp3' }],
    });
    await controller.play();
    now = 61_000;

    const accountAKey = principalStorageKey('user-a', PRACTICE_SESSION_OUTBOX_KEY);
    const accountAOperations = JSON.parse(localStorage.getItem(accountAKey) ?? '[]') as Array<Record<string, unknown>>;
    for (let index = accountAOperations.length; index < 1_000; index += 1) {
      accountAOperations.push({
        id: `start:filler-${index}`,
        kind: 'start',
        clientSessionId: `filler-${index}`,
        payload: {},
        queuedAt: '2026-09-04T00:00:00.000Z',
      });
    }
    localStorage.setItem(accountAKey, JSON.stringify(accountAOperations));

    expect(() => controller.setSession(sessionB)).not.toThrow();
    expect(controller.snapshot.album).toBeNull();
    expect(controller.snapshot.error).toContain('phiên nghe này chưa được ghi nhận');
    expect(JSON.parse(localStorage.getItem(accountAKey) ?? '[]')).toHaveLength(1_000);

    await controller.load({
      id: 'talk-capacity-b', title: 'Pháp thoại B', description: '',
      tracks: [{ title: 'Bài B', url: '/talk-capacity-b.mp3' }],
    });
    await controller.play();
    const accountBOperations = JSON.parse(localStorage.getItem(
      principalStorageKey('user-b', PRACTICE_SESSION_OUTBOX_KEY),
    ) ?? '[]') as Array<{ payload: Record<string, unknown> }>;
    expect(accountBOperations).toHaveLength(1);
    expect(accountBOperations[0].payload.sourceId).toBe('talk-capacity-b:0');
    controller.destroy();
  });

  it('manages sleep timer countdown, pauses during playback pause, and handles end-of-track', async () => {
    vi.useFakeTimers();
    try {
      const { AudioPlayerController } = await import('$lib/browser/audio-player-controller');
      const controller = new AudioPlayerController({ authenticated: true, csrfToken: null, user: { id: 'member' } });
      await controller.load({
        id: 'talk-sleep-timer', title: 'Pháp thoại hẹn giờ', description: '',
        tracks: [{ title: 'Bài 1', url: '/talk-1.mp3' }],
      });

      // 1. Set 15 minutes timer
      controller.setSleepTimer(15);
      expect(controller.snapshot.sleepTimerRemainingMs).toBe(15 * 60_000);
      expect(controller.snapshot.sleepTimerEndOfTrack).toBe(false);

      // Audio is paused initially: ticking should not decrement
      vi.advanceTimersByTime(3_000);
      expect(controller.snapshot.sleepTimerRemainingMs).toBe(15 * 60_000);

      // Play audio: ticking should decrement
      await controller.play();
      vi.advanceTimersByTime(2_000);
      expect(controller.snapshot.sleepTimerRemainingMs).toBeLessThan(15 * 60_000);
      const remainingAfterPlay = controller.snapshot.sleepTimerRemainingMs;

      // Pause audio: ticking should pause
      controller.pause();
      vi.advanceTimersByTime(5_000);
      expect(controller.snapshot.sleepTimerRemainingMs).toBe(remainingAfterPlay);

      // Resume play: ticking should resume
      await controller.play();
      vi.advanceTimersByTime(2_000);
      expect(controller.snapshot.sleepTimerRemainingMs).toBeLessThan(remainingAfterPlay);

      // 2. Test End of track mode
      controller.setSleepTimerEndOfTrack();
      expect(controller.snapshot.sleepTimerEndOfTrack).toBe(true);
      expect(controller.snapshot.sleepTimerRemainingMs).toBe(controller.audio.duration * 1_000);

      // Track ends: controller should pause and clear sleep timer
      controller.audio.dispatchEvent(new Event('ended'));
      expect(controller.snapshot.sleepTimerEndOfTrack).toBe(false);
      expect(controller.snapshot.sleepTimerRemainingMs).toBe(0);

      // 3. Clear sleep timer
      controller.setSleepTimer(30);
      expect(controller.snapshot.sleepTimerRemainingMs).toBe(30 * 60_000);
      controller.clearSleepTimer();
      expect(controller.snapshot.sleepTimerRemainingMs).toBe(0);

      controller.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
