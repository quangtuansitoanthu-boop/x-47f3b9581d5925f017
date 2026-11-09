import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioAlbum } from '../../../src/lib/browser/audio-player-controller';
import type { NativeAudioState } from '../../../src/lib/browser/native-talk-audio';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), start: vi.fn(), write: vi.fn(), select: vi.fn(), report: vi.fn(),
}));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.fetch }));
vi.mock('$lib/browser/offline-audio-database', () => ({ canAccessAudioAlbum: vi.fn(async () => true), getOfflineTrack: vi.fn(async () => null), getOfflineTracksForAlbum: vi.fn(async () => []) }));
vi.mock('$lib/browser/practice-evidence-controller', () => ({ createPracticeEvidenceController: () => ({ start: mocks.start, finish: vi.fn() }) }));
vi.mock('$lib/browser/album-plays', () => ({ createAlbumPlayReporter: () => ({ select: mocks.select, playing: mocks.report, ended() {}, reset() {} }) }));
vi.mock('$lib/browser/media-session', () => ({ configureMediaSession: () => () => {}, updateMediaSessionMetadata() {}, updateMediaSessionPositionState() {}, updateMediaSessionPlaybackState() {} }));
vi.mock('$lib/browser/audio-sync', () => ({
  applyRemotePlayerSync: () => null, dispatchAudioStorageEvent() {}, pushRecentAlbum: () => [],
  readPlayerSyncPayload: () => ({}), readStoredRecentAlbums: () => [], selectAudioSyncPrincipal() {},
  writeStoredAlbumPosition: mocks.write, writeStoredPlayerState: mocks.write,
}));
vi.mock('$lib/browser/native-talk-audio', () => {
  class NativeAudio extends EventTarget {
    static instances = 0;
    src = ''; preload = ''; paused = true; currentTime = 0; duration = 300;
    playbackRate = 1; volume = 1; muted = false; ended = false;
    isPracticePlayback = false;
    state: NativeAudioState = { queueId: '', trackIndex: 0, position: 0, duration: 300,
      playing: false, playWhenReady: false, buffering: false, ended: false,
      speed: 1, volume: 1, error: '', sleepRemainingMs: 0, sleepAtEnd: false };
    constructor() { super(); NativeAudio.instances++; }
    async recover() { return null; }
    async setQueue(album: AudioAlbum) {
      this.src = album.tracks[0].url; this.paused = true;
      this.isPracticePlayback = album.id === 'practice:meditation';
      this.state = { ...this.state, queueId: `${album.id}:1`, album, playWhenReady: false, playing: false };
    }
    async play() {
      this.paused = false;
      this.state = { ...this.state, speed: this.playbackRate, playing: true, playWhenReady: true };
      for (const name of ['play', 'playing', 'timeupdate']) this.dispatchEvent(new Event(name));
      await this.refreshState();
    }
    pause() { this.paused = true; this.state.playing = false; this.state.playWhenReady = false; this.dispatchEvent(new Event('pause')); }
    setSleep(ms: number) { this.state.sleepRemainingMs = ms; }
    setRepeat() {}
    async refreshState() { this.dispatchEvent(new CustomEvent('nativesleep', { detail: this.state })); return this.state; }
    removeAttribute() { this.src = ''; this.isPracticePlayback = false; }
    load() {} dispose() {}
  }
  return { NativeTalkAudio: NativeAudio, hasNativeTalkAudio: () => true, cacheNativeTalk: vi.fn(), MEDITATION_AUDIO_ALBUM_ID: 'practice:meditation', ROSARY_AUDIO_ALBUM_ID: 'practice:rosary' };
});

import { AudioPlayerController } from '../../../src/lib/browser/audio-player-controller';
import { NativeTalkAudio } from '../../../src/lib/browser/native-talk-audio';

const meditation: AudioAlbum = { id: 'practice:meditation', title: 'Thiền', description: '', tracks: [{ title: 'Nhạc thiền', url: 'https://localhost/assets/audio/nhac-thien-01.m4a' }] };
const talk: AudioAlbum = { id: 'talk', title: 'Pháp thoại', description: '', tracks: [{ title: 'Bài giảng', url: '/talk.mp3' }] };
let player: AudioPlayerController;

beforeEach(async () => {
  vi.clearAllMocks();
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  player = new AudioPlayerController({ authenticated: true, csrfToken: 'test-only', user: { id: 'qa' } });
  await player.ready;
  vi.clearAllMocks();
});
afterEach(() => { player.destroy(); vi.unstubAllGlobals(); });

describe('root-owned practice playback', () => {
  it('uses the existing native transport without talk reporting, persisted fake albums or HTTP', async () => {
    player.setSpeed(1.5);
    const originalTransport = player.audio;
    const state = vi.fn();
    const lease = await player.beginPracticePlayback(meditation, 930_000, state, vi.fn());
    expect(lease).not.toBeNull();
    expect(player.audio).toBe(originalTransport);
    expect(player.audio).toBeInstanceOf(NativeTalkAudio);
    expect(player.snapshot.album).toBeNull();
    expect(player.snapshot.speed).toBe(1.5);
    expect(state).toHaveBeenCalledWith(expect.objectContaining({ sleepRemainingMs: 930_000, playWhenReady: true }));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    lease!.pause();
    await lease!.play();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    lease!.stop();
  });

  it('releases the lease when a talk takes over and prevents stale practice actions from stopping it', async () => {
    const interrupted = vi.fn();
    const lease = await player.beginPracticePlayback(meditation, 60_000, vi.fn(), interrupted);
    expect(lease).not.toBeNull();
    await player.load(talk);
    expect(interrupted).toHaveBeenCalledOnce();
    lease!.stop();
    lease!.pause();
    expect(player.snapshot.album?.id).toBe('talk');
    expect(player.audio.src).toBe('/talk.mp3');
  });

  it('revokes practice controls on principal change', async () => {
    const interrupted = vi.fn();
    const lease = await player.beginPracticePlayback(meditation, 60_000, vi.fn(), interrupted);
    player.setSession({ authenticated: true, csrfToken: 'test-next', user: { id: 'next-qa' } });
    expect(interrupted).toHaveBeenCalledOnce();
    await lease!.play();
    expect(player.snapshot.album).toBeNull();
    expect(player.snapshot.playing).toBe(false);
  });

  it('cancels deferred native preparation before it can start after unmount', async () => {
    let finish!: () => void;
    const deferred = new Promise<void>(resolve => { finish = resolve; });
    vi.spyOn(player.audio as NativeTalkAudio, 'setQueue').mockImplementation(async () => { await deferred; });
    const play = vi.spyOn(player.audio, 'play');
    const abort = new AbortController();
    const pending = player.beginPracticePlayback(meditation, 60_000, vi.fn(), vi.fn(), abort.signal);
    await vi.waitFor(() => expect((player.audio as NativeTalkAudio).setQueue).toHaveBeenCalledOnce());
    abort.abort();
    finish();
    expect(await pending).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('refreshes the native practice clock before navigation without creating new playback or HTTP', async () => {
    const state = vi.fn();
    const lease = await player.beginPracticePlayback(meditation, 60_000, state, vi.fn());
    state.mockClear();
    await player.refreshPracticePlayback();
    expect(state).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
    lease!.stop();
  });

  it('releases failed native playback instead of reporting a successful session music start', async () => {
    const audio = player.audio as NativeTalkAudio;
    vi.spyOn(audio, 'refreshState').mockImplementation(async () => {
      audio.error = { code: 3, message: 'test decode failure' };
      return undefined;
    });
    await expect(player.beginPracticePlayback(meditation, 60_000, vi.fn(), vi.fn())).rejects.toThrow('test decode failure');
    expect(player.snapshot.album).toBeNull();
    expect(player.snapshot.playing).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
