import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeAudioState } from '../../../src/lib/browser/native-talk-audio';
const bridge = vi.hoisted(() => ({ plugin: {} as any, platform: 'android' }));
vi.mock('@capacitor/core', async original => ({
  ...await original<object>(),
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => bridge.plugin,
}));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: () => bridge.platform }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: async () => null }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url, isHtmlResponse: () => false }));
vi.mock('$lib/browser/offline-audio-database', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/browser/offline-audio-database')>();
  const authorize: typeof actual.canAccessAudioAlbum = (album, access) => album.id === 'native-three' ? Promise.resolve(true) : actual.canAccessAudioAlbum(album, access);
  return { ...actual, canAccessAudioAlbum: authorize, getOfflineTrack: vi.fn(async () => null), getOfflineTracksForAlbum: vi.fn(async () => []) };
});
vi.mock('$lib/browser/media-session', () => ({ configureMediaSession: () => () => {}, updateMediaSessionMetadata() {}, updateMediaSessionPositionState() {}, updateMediaSessionPlaybackState() {} }));
import { AudioPlayerController } from '../../../src/lib/browser/audio-player-controller';
import { getOfflineTrack, getOfflineTracksForAlbum } from '../../../src/lib/browser/offline-audio-database';
import { fetchTalkAlbums } from '../../../src/lib/browser/content-catalogs';

const album = { id: 'native-three', title: 'Album', description: '', tracks: [0, 1, 2].map(i => ({ title: `Part ${i}`, url: `https://media.quangtu.vn/${i}.mp3` })) };
let state: NativeAudioState;
let publish: (state: NativeAudioState) => void;
let controller: AudioPlayerController;
describe.each(['android', 'ios'])('native playback on %s', platform => {
beforeEach(() => {
  vi.mocked(getOfflineTrack).mockReset().mockResolvedValue(null);
  vi.mocked(getOfflineTracksForAlbum).mockReset().mockResolvedValue([]);
  bridge.platform = platform;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { baseURI: 'https://localhost', visibilityState: 'visible' }));
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) });
  vi.stubGlobal('MediaError', { MEDIA_ERR_ABORTED: 1, MEDIA_ERR_NETWORK: 2 });
  state = { queueId: 'existing', album, trackIndex: 0, position: 4, duration: 12,
    playing: true, playWhenReady: true, buffering: false, ended: false, speed: 1.5,
    volume: 0.4, repeat: 2, error: '', sleepRemainingMs: 0, sleepAtEnd: false };
  Object.assign(bridge.plugin, {
    addListener: vi.fn(async (_: string, listener: typeof publish) => { publish = listener; return { remove: vi.fn() }; }),
    peek: vi.fn(async () => state), getState: vi.fn(async () => state),
    setQueue: vi.fn(async (options: any) => (state = { ...state, queueId: options.queueId, trackIndex: options.index, position: options.position, playing: false, playWhenReady: false, ended: false })),
    options: vi.fn(async (options: any) => (state = { ...state, ...options })),
    play: vi.fn(async () => (state = { ...state, playing: true, playWhenReady: true })),
    pause: vi.fn(async () => (state = { ...state, playing: false, playWhenReady: false })),
    seek: vi.fn(async (options: any) => (state = { ...state, ...options, ended: false })),
    sleep: vi.fn(async () => state), stop: vi.fn(async () => ({ ...state, queueId: '' })),
    cacheStatus: vi.fn(async () => ({ bytes: 0 })), cacheChunk: vi.fn(async () => undefined),
  });
  controller = new AudioPlayerController();
});
afterEach(async () => {
  controller.destroy();
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
  vi.unstubAllGlobals();
});

it('uses a finite root lease for rosary without repeating the completion bells', async () => {
  await controller.ready;
  const onState = vi.fn(), interrupted = vi.fn();
  const lease = await controller.beginPracticePlayback({ ...album, id: 'practice:rosary' }, 1, onState, interrupted, undefined, { finite: true });
  expect(lease).not.toBeNull();
  expect(bridge.plugin.options).toHaveBeenCalledWith({ repeat: 0 });
  expect(bridge.plugin.sleep).toHaveBeenLastCalledWith({ remainingMs: 0, atEnd: false });
  publish({ ...state, position: 108, ended: true, playWhenReady: false });
  expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ position: 108, ended: true }));
  lease?.stop();
  expect(interrupted).toHaveBeenCalledOnce();
});

it('restores repeat, speed and volume from the running service rather than resetting its queue', async () => {
  await controller.ready;
  expect(controller.snapshot).toMatchObject({ repeat: 2, speed: 1.5, volume: 0.4, playing: true, currentTime: 4 });
  expect(bridge.plugin.setQueue).not.toHaveBeenCalled();
  controller.cycleRepeat();
  await vi.waitFor(() => expect(bridge.plugin.options).toHaveBeenCalledWith({ repeat: 0 }));
});

it('does not migrate a private album into the guest native queue', async () => {
  await controller.ready;
  const privateAlbum = { ...album, visibility: 'private' as const };
  vi.mocked(getOfflineTrack).mockResolvedValue({ url: album.tracks[0].url, albumId: album.id, title: 'Private track', blob: new Blob(['private bytes']), downloadedAt: 1 });
  expect(await controller.load(privateAlbum)).toBe(false);
  expect(bridge.plugin.cacheChunk).not.toHaveBeenCalled();
  expect(bridge.plugin.setQueue).not.toHaveBeenCalled();
});

it('stops a private native queue when the same account loses its privileged role', async () => {
  await controller.ready;
  controller.setSession({ authenticated: true, csrfToken: 'test', user: { id: 'same-account', role: 'admin' } });
  expect(await controller.load({ ...album, visibility: 'private' })).toBe(true);
  await controller.play();
  bridge.plugin.stop.mockClear();
  controller.setSession({ authenticated: true, csrfToken: 'new-token', user: { id: 'same-account', role: 'user' } });
  expect(controller.snapshot.album).toBeNull();
  expect(controller.snapshot.playing).toBe(false);
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
});

it('keeps the current public native queue through same-identity token refresh', async () => {
  await controller.ready;
  controller.setSession({ authenticated: true, csrfToken: 'first', user: { id: 'same-account', role: 'admin' } });
  expect(await controller.load(album)).toBe(true);
  await controller.play();
  bridge.plugin.stop.mockClear();
  controller.setSession({ authenticated: true, csrfToken: 'refreshed', user: { id: 'same-account', role: 'admin' } });
  expect(controller.snapshot.album?.id).toBe(album.id);
  expect(controller.snapshot.playing).toBe(true);
  expect(bridge.plugin.stop).not.toHaveBeenCalled();
});

it('streams a current public catalog album even when catalog persistence is blocked and no bundle exists', async () => {
  await controller.ready;
  const write = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key.startsWith('quangtu_cached_talk_catalog') || key.startsWith('quangtu_talk_catalog_meta')) {
      throw new DOMException('Storage blocked', 'QuotaExceededError');
    }
    write(key, value);
  });
  const fetched = await fetchTalkAlbums(vi.fn(async () => Response.json([{
    id: 'new-public-online', tieu_de: 'New public online', visibility: 'public',
    tracks: [{ title: 'Public online track', url: 'https://media.quangtu.vn/new-public-online.mp3' }],
  }])) as typeof fetch);
  const current = fetched.find(item => item.id === 'new-public-online')!;
  expect(current).toBeDefined();
  const descriptor = { ...current, title: current.tieu_de, description: current.mo_ta || '', tracks: current.tracks };
  expect(await controller.load(descriptor)).toBe(true);
  expect(bridge.plugin.setQueue).toHaveBeenCalledWith(expect.objectContaining({ albumId: 'new-public-online' }));
});

it('does not stop a newer allowed queue when a stale recovery returns a restricted album', async () => {
  await controller.ready;
  controller.destroy();
  await vi.waitFor(() => expect(bridge.plugin.stop).toHaveBeenCalled());
  bridge.plugin.stop.mockClear();
  vi.stubEnv('VITE_CONTENT_PLATFORM', 'ios');
  const restricted = { ...state, album: { ...album, id: 'pt_1782208869321' } };
  let release!: (value: NativeAudioState) => void;
  bridge.plugin.peek.mockImplementationOnce(() => new Promise<NativeAudioState>(resolve => { release = resolve; }));
  controller = new AudioPlayerController();
  try {
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await controller.playTrack(album);
    expect(controller.snapshot.album?.id).toBe(album.id);
    expect(controller.snapshot.playing).toBe(true);
    release(restricted);
    await controller.ready;
    expect(controller.audio.src).not.toBe('');
    expect(controller.snapshot.album?.id).toBe(album.id);
    expect(bridge.plugin.stop).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

it('restores the previous volume after muting and unmuting a recovered player', async () => {
  await controller.ready;
  controller.toggleMute(); controller.toggleMute();
  await vi.waitFor(() => expect(bridge.plugin.options).toHaveBeenLastCalledWith({ volume: 0.4 }));
});

it('observes autonomous screen-off track advances and final stop without replaying the native queue', async () => {
  await controller.ready;
  publish({ ...state, trackIndex: 1, position: 1 });
  expect(controller.snapshot).toMatchObject({ trackIndex: 1, currentTime: 1, playing: true });
  publish({ ...state, trackIndex: 2, position: 12, playing: false, playWhenReady: false, ended: true });
  expect(controller.snapshot).toMatchObject({ trackIndex: 2, playing: false });
  expect(bridge.plugin.setQueue).not.toHaveBeenCalled();
  expect(bridge.plugin.play).not.toHaveBeenCalled();
});

it('Play all replaces the complete native playlist, disables repeat-one, and starts at the first part', async () => {
  state.repeat = 1;
  await controller.ready;
  await controller.playAll(album);
  expect(bridge.plugin.setQueue).toHaveBeenCalledWith(expect.objectContaining({ tracks: album.tracks, index: 0, position: 0 }));
  expect(bridge.plugin.options).toHaveBeenCalledWith({ repeat: 0 });
  expect(controller.snapshot).toMatchObject({ trackIndex: 0, repeat: 0, playing: true });
});
});
