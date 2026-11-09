import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NativeTalkAudio, cacheNativeTalk, nativeTalkUrl, type NativeAudioState } from '../../../src/lib/browser/native-talk-audio';

const album = { id: 'talks', title: 'Pháp thoại', description: 'Quang Từ', tracks: [
  { title: 'Bài một', url: 'https://media.quangtu.vn/one.mp3' },
  { title: 'Bài hai', url: 'https://media.quangtu.vn/two.mp3' },
] };
let state: NativeAudioState;
let publish: (state: NativeAudioState) => void;
let plugin: any;
beforeEach(() => {
  vi.stubGlobal('document', Object.assign(new EventTarget(), { baseURI: 'https://localhost', visibilityState: 'visible' }));
  state = { queueId: '', trackIndex: 0, position: 0, duration: 120, playing: false, playWhenReady: false,
    buffering: false, ended: false, speed: 1, volume: 1, error: '', sleepRemainingMs: 0, sleepAtEnd: false };
  plugin = {
    addListener: vi.fn(async (_: string, listener: typeof publish) => { publish = listener; return { remove: vi.fn() }; }),
    setQueue: vi.fn(async (options: any) => { state = { ...state, queueId: options.queueId, trackIndex: options.index, position: options.position }; return state; }),
    play: vi.fn(async () => (state = { ...state, playing: true, playWhenReady: true })),
    pause: vi.fn(async () => (state = { ...state, playing: false, playWhenReady: false })),
    stop: vi.fn(async () => ({ ...state, queueId: '' })),
    options: vi.fn(async (options: any) => (state = { ...state, ...options })),
    seek: vi.fn(async (options: any) => (state = { ...state, ...options })),
    sleep: vi.fn(async () => state),
    peek: vi.fn(async () => state),
    getState: vi.fn(async () => state),
  };
});
afterEach(() => vi.unstubAllGlobals());

it('gives Android the entire playlist and restores the selected position', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 1, 42);
  expect(plugin.setQueue).toHaveBeenCalledWith(expect.objectContaining({ albumId: 'talks', tracks: album.tracks, index: 1, position: 42 }));
  await audio.play();
  expect(audio.currentTime).toBe(42);
  expect(audio.paused).toBe(false);
  audio.dispose();
});

it('maps bundled meditation to a local native asset instead of fetching it from the backend', () => {
  expect(nativeTalkUrl('https://localhost/assets/audio/nhac-thien-01.m4a'))
    .toBe('asset:///public/assets/audio/nhac-thien-01.m4a');
});

it('keeps missing album artwork empty instead of sending the app logo as a cover', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  expect(plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: '', originalArtwork: '' }));
  await audio.setQueue({ ...album, artwork: '   ' }, 0, 0);
  expect(plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: '' }));
  audio.dispose();
});

it('passes the actual album cover to native while retaining its original crop metadata', async () => {
  const audio = new NativeTalkAudio(plugin);
  const artwork = 'https://localhost/covers/album.png#pos=50%25%2012%25';
  await audio.setQueue({ ...album, artwork }, 0, 0);
  expect(plugin.setQueue).toHaveBeenLastCalledWith(expect.objectContaining({
    artwork: 'asset:///public/covers/album.png', originalArtwork: artwork,
  }));
  audio.dispose();
});

it('coalesces foreground and practice clock refreshes through one native state read', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  await Promise.all([audio.refreshState(), audio.refreshState()]);
  expect(plugin.getState).toHaveBeenCalledOnce();
  audio.dispose();
});

it('syncs lock-screen pause, seeking and autonomous next-track changes', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  await audio.play();
  const pause = vi.fn(); const track = vi.fn();
  audio.addEventListener('pause', pause);
  audio.addEventListener('trackchange', track);
  publish({ ...state, playing: false, playWhenReady: false, position: 65 });
  expect(pause).toHaveBeenCalledOnce();
  expect(audio.currentTime).toBe(65);
  publish({ ...state, trackIndex: 1, playing: true, playWhenReady: true, position: 3 });
  expect(track).toHaveBeenCalledOnce();
  expect(audio.currentTime).toBe(3);
  audio.dispose();
});

it('reports the final native state as paused and never buffering after the album ends', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 1, 0); await audio.play();
  const waiting = vi.fn(); const ended = vi.fn();
  audio.addEventListener('waiting', waiting); audio.addEventListener('ended', ended);
  publish({ ...state, trackIndex: 1, position: 120, playing: false, playWhenReady: true, ended: true });
  expect(audio.paused).toBe(true);
  expect(waiting).not.toHaveBeenCalled();
  publish({ ...state, ended: true, playing: false });
  expect(ended).toHaveBeenCalledOnce();
  audio.dispose();
});

it('updates the current source when the service advances while the screen is off', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0); await audio.play();
  publish({ ...state, trackIndex: 1, position: 1 });
  expect(audio.src).toBe(album.tracks[1].url);
  audio.dispose();
});

it('ignores stale queue events when another album has been selected', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  const old = { ...state };
  await audio.setQueue({ ...album, id: 'new' }, 0, 20);
  publish({ ...old, playing: true, playWhenReady: true, position: 90 });
  expect(audio.currentTime).toBe(20);
  expect(audio.paused).toBe(true);
  audio.dispose();
});

it('does not drop a queued stop when the UI controller is destroyed', async () => {
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  await audio.play();
  audio.pause(); audio.removeAttribute('src'); audio.load(); audio.dispose();
  await vi.waitFor(() => expect(plugin.stop).toHaveBeenCalledOnce());
  expect(plugin.pause).toHaveBeenCalledOnce();
});

it('finishes teardown safely when the native listener can no longer be removed', async () => {
  const remove = vi.fn().mockRejectedValue(new Error('Native bridge closed'));
  plugin.addListener.mockResolvedValueOnce({ remove });
  const audio = new NativeTalkAudio(plugin);
  await audio.setQueue(album, 0, 0);
  audio.dispose();
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
});

it('keeps a failed listener registration observable to commands without rejecting globally while idle', async () => {
  plugin.addListener = async () => { throw new Error('Native listener unavailable'); };
  const audio = new NativeTalkAudio(plugin);
  // A user can leave the player idle before attempting playback or closing it.
  await new Promise(resolve => setTimeout(resolve, 10));
  await expect(audio.play()).rejects.toThrow('Native listener unavailable');
  expect(plugin.play).not.toHaveBeenCalled();
  audio.dispose();
});

it('reattaches to a running native session without replacing its playlist or position', async () => {
  state = { ...state, queueId: 'existing', album, trackIndex: 1, position: 77, playing: true, playWhenReady: true };
  const audio = new NativeTalkAudio(plugin);
  const recovered = await audio.recover();
  expect(recovered?.album?.id).toBe('talks');
  audio.adopt(recovered!);
  expect(audio.currentTime).toBe(77);
  expect(audio.paused).toBe(false);
  expect(plugin.setQueue).not.toHaveBeenCalled();
  audio.dispose();
});

it('transfers offline audio in bounded chunks and reuses a completed native copy', async () => {
  const bytes = new Uint8Array(900_000).fill(42);
  const blob = new Blob([bytes]);
  const cache = { cacheStatus: vi.fn(async () => ({ bytes: 0 })), cacheChunk: vi.fn(async () => {}) };
  await cacheNativeTalk(album.tracks[0].url, blob, cache);
  expect(cache.cacheChunk).toHaveBeenCalledTimes(3);
  const chunks = cache.cacheChunk.mock.calls.map(call => (call as unknown as [{ data: string; offset: number; last: boolean }])[0]);
  expect(chunks.map(chunk => chunk.offset)).toEqual([0, 393216, 786432]);
  expect(chunks.map(chunk => chunk.last)).toEqual([false, false, true]);
  expect(chunks.every(chunk => chunk.data.length < 800000)).toBe(true);
  expect(chunks.map(chunk => atob(chunk.data).length).reduce((a, b) => a + b)).toBe(bytes.length);
  cache.cacheStatus.mockResolvedValue({ bytes: blob.size });
  cache.cacheChunk.mockClear();
  await cacheNativeTalk(album.tracks[0].url, blob, cache);
  expect(cache.cacheChunk).not.toHaveBeenCalled();
  // Generated finite tracks reuse one slot; equal bytes do not prove equal cadence/content.
  await cacheNativeTalk(album.tracks[0].url, blob, cache, () => true, { replace: true });
  expect(cache.cacheChunk).toHaveBeenCalledTimes(3);
});
