import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  revision: 0, native: true, lecturePlaying: false, pauseLecture: vi.fn(), available: true, onState: null as null | ((state: any) => void), onInterrupted: null as null | (() => void),
  lease: { pause: vi.fn(), play: vi.fn(async () => {}), stop: vi.fn(), refresh: vi.fn(async () => {}) },
  begin: vi.fn(),
}));
vi.mock('$lib/browser/native-talk-audio', () => ({
  hasNativeTalkAudio: () => bridge.available, cacheNativeTalk: vi.fn(async () => {}), ROSARY_AUDIO_ALBUM_ID: 'practice:rosary',
}));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => bridge.native }));
vi.mock('$lib/browser/native-audio-principal', () => ({ nativeAudioPrincipalRevision: () => bridge.revision }));
vi.mock('$lib/stores/audio-player.svelte', () => ({ getAudioPlayer: async () => ({ beginPracticePlayback: bridge.begin,
  ready: Promise.resolve(), snapshot: { get playing() { return bridge.lecturePlaying; } },
  audio: { get paused() { return !bridge.lecturePlaying; } }, pause: bridge.pauseLecture,
}) }));
import { createRosaryMetronome } from '../../../src/lib/browser/rosary-metronome';
import { cacheNativeTalk } from '../../../src/lib/browser/native-talk-audio';

describe('rosary native transport ownership', () => {
  beforeEach(() => {
    bridge.revision = 0; bridge.native = true; bridge.lecturePlaying = false; bridge.available = true; bridge.onState = null; bridge.onInterrupted = null;
    vi.clearAllMocks();
    bridge.pauseLecture.mockImplementation(() => { bridge.lecturePlaying = false; });
    bridge.lease.refresh.mockImplementation(async () => {});
    bridge.begin.mockImplementation(async (_album, _duration, onState, onInterrupted) => {
      bridge.onState = onState; bridge.onInterrupted = onInterrupted; return bridge.lease;
    });
    vi.stubGlobal('document', { baseURI: 'https://localhost/' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    vi.stubGlobal('AudioContext', class {
      decodeAudioData = async () => ({ sampleRate: 8000, getChannelData: () => new Float32Array([.5, -.5, 0]) });
      close = async () => {};
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('decodes the bundled pulse with the prefixed audio context on older supported WebViews', async () => {
    vi.stubGlobal('webkitAudioContext', globalThis.AudioContext);
    vi.stubGlobal('AudioContext', undefined);
    const rhythm = createRosaryMetronome({ onState: vi.fn(), onInterrupted: vi.fn() });
    await rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' });
    expect(bridge.begin).toHaveBeenCalledOnce();
    rhythm.dispose();
  });

  it('fails closed on native without a background-capable bridge', async () => {
    bridge.available = false;
    const onState = vi.fn(), rhythm = createRosaryMetronome({ onState, onInterrupted: vi.fn() });
    await expect(rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' })).rejects.toThrow('rosary_native_audio_unavailable');
    expect(fetch).not.toHaveBeenCalled();
    expect(bridge.begin).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'rosary_native_audio_unavailable' }));
    rhythm.dispose();
  });

  it('counts only published native position, preserving pause and allowing the bell tail to finish', async () => {
    const onState = vi.fn(), rhythm = createRosaryMetronome({ onState, onInterrupted: vi.fn() });
    await rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' });
    expect(bridge.begin).toHaveBeenCalledWith(expect.objectContaining({ id: 'practice:rosary' }), 1, expect.any(Function), expect.any(Function), expect.any(AbortSignal), { finite: true });
    bridge.onState?.({ trackIndex: 0, position: 50.1, observedAtMs: 1234567890000, playWhenReady: true, ended: false, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 50, playing: true, completed: false, positionSeconds: 50.1, observedAtMs: 1234567890000 }));
    rhythm.pause();
    expect(bridge.lease.pause).toHaveBeenCalledOnce();
    bridge.onState?.({ trackIndex: 0, position: 50.1, playWhenReady: false, ended: false, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 50, playing: false }));
    await rhythm.resume();
    expect(bridge.lease.play).toHaveBeenCalledOnce();
    bridge.onState?.({ trackIndex: 0, position: 108.5, playWhenReady: true, ended: false, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 108, completed: false }));
    bridge.onState?.({ trackIndex: 0, position: 117, playWhenReady: false, ended: true, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 108, completed: true }));
    rhythm.dispose();
  });

  it('ignores late playback events and interrupted callbacks after stop or principal replacement', async () => {
    const onState = vi.fn(), onInterrupted = vi.fn();
    const rhythm = createRosaryMetronome({ onState, onInterrupted });
    await rhythm.start({ target: 108, intervalMs: 750, title: 'Niệm Phật' });
    const oldState = bridge.onState, oldInterrupted = bridge.onInterrupted;
    rhythm.stop();
    oldState?.({ trackIndex: 0, position: 80, playWhenReady: true, ended: true, error: '' }); oldInterrupted?.();
    expect(onState).not.toHaveBeenCalled(); expect(onInterrupted).not.toHaveBeenCalled();
    await expect(rhythm.resume()).rejects.toThrow('rosary_audio_not_started');
    await rhythm.start({ target: 108, intervalMs: 750, title: 'Niệm Phật' });
    bridge.revision++;
    bridge.onState?.({ trackIndex: 0, position: 80, playWhenReady: true, ended: true, error: '' });
    expect(onState).not.toHaveBeenCalled();
    rhythm.dispose();
  });

  it('uses a native20track playlist with only3cache slots for10800 at2seconds and completes only the final bells', async () => {
    const onState = vi.fn(), rhythm = createRosaryMetronome({ onState, onInterrupted: vi.fn() });
    await rhythm.start({ target: 10800, intervalMs: 2000, title: 'Niệm Phật' });
    const playlist = bridge.begin.mock.calls[0][0];
    expect(playlist.tracks).toHaveLength(20);
    expect(new Set(playlist.tracks.map((track: { url: string }) => track.url)).size).toBe(3);
    expect(cacheNativeTalk).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(cacheNativeTalk).mock.calls) {
      expect(call[1].size).toBeLessThan(32 * 1024 * 1024);
      expect(call[4]).toEqual({ replace: true });
    }
    bridge.onState?.({ trackIndex: 0, position: 1082, playWhenReady: true, playing: false, ended: true, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 540, completed: false }));
    // A prepared/buffering next chunk must not credit its immediate pulse before playback starts.
    bridge.onState?.({ trackIndex: 1, position: 0, playWhenReady: true, playing: false, ended: false, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 540, completed: false }));
    bridge.onState?.({ trackIndex: 1, position: 0, playWhenReady: true, playing: true, ended: false, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 541, positionSeconds: 1082 }));
    bridge.onState?.({ trackIndex: 19, position: 1088, playWhenReady: false, playing: false, ended: true, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 10800, completed: true, positionSeconds: 21610 }));
    rhythm.dispose();
  });

  it('changes tempo only on resume, retaining authoritative accepted count and cumulative played position', async () => {
    const onState = vi.fn(), rhythm = createRosaryMetronome({ onState, onInterrupted: vi.fn() });
    await rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' });
    const oldState = bridge.onState;
    bridge.onState?.({ trackIndex: 0, position: 50, playing: true, playWhenReady: true, ended: false, error: '' });
    rhythm.pause();
    bridge.onState?.({ trackIndex: 0, position: 50, playing: false, playWhenReady: false, ended: false, error: '' });
    // Pause acknowledgment caught another valid tick before the native transport actually stopped.
    bridge.lease.refresh.mockImplementationOnce(async () => {
      bridge.onState?.({ trackIndex: 0, position: 51.25, playing: false, playWhenReady: false, ended: false, error: '' });
    });
    await rhythm.resume(750);
    expect(bridge.begin).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();
    expect(bridge.begin.mock.calls[1][0].tracks).toHaveLength(1);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 51, target: 108, positionSeconds: 51.25, intervalMs: 1000 }));
    bridge.onState?.({ trackIndex: 0, position: .75, playing: true, playWhenReady: true, ended: false, error: '', observedAtMs: 1234567890000 });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 52, target: 108, positionSeconds: 52, intervalMs: 750, phaseStartCount: 51, phaseStartPositionSeconds: 51.25 }));
    oldState?.({ trackIndex: 0, position: 100, playing: true, playWhenReady: true, ended: false, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 52 }));
    //57remaining ticks +lead +bells; total logical position includes the old51.25played seconds.
    bridge.onState?.({ trackIndex: 0, position: 51.5, playing: false, playWhenReady: false, ended: true, error: '' });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ count: 108, target: 108, positionSeconds: 102.75, completed: true }));
    rhythm.dispose();
  });

  it('refuses a tempo change while playing and retains the original queue', async () => {
    const rhythm = createRosaryMetronome({ onState: vi.fn(), onInterrupted: vi.fn() });
    await rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' });
    bridge.onState?.({ trackIndex: 0, position: 1, playing: true, playWhenReady: true, ended: false, error: '' });
    await expect(rhythm.resume(750)).rejects.toThrow('rosary_tempo_requires_pause');
    expect(bridge.begin).toHaveBeenCalledOnce();
    rhythm.dispose();
  });

  it('keeps the existing three-bell tail if tempo is changed after all beads have sounded', async () => {
    const rhythm = createRosaryMetronome({ onState: vi.fn(), onInterrupted: vi.fn() });
    await rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' });
    bridge.onState?.({ trackIndex: 0, position: 110, playing: false, playWhenReady: false, ended: false, error: '' });
    await rhythm.resume(750);
    expect(bridge.begin).toHaveBeenCalledOnce();
    expect(bridge.lease.play).toHaveBeenCalledOnce();
    rhythm.dispose();
  });

  it('does not rebuild or replay if stopped while authoritative pause refresh is pending', async () => {
    const rhythm = createRosaryMetronome({ onState: vi.fn(), onInterrupted: vi.fn() });
    await rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' });
    bridge.onState?.({ trackIndex: 0, position: 5, playing: false, playWhenReady: false, ended: false, error: '' });
    let release!: () => void;
    bridge.lease.refresh.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const pending = rhythm.resume(750);
    rhythm.stop(); release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(bridge.begin).toHaveBeenCalledOnce();
    expect(bridge.lease.play).not.toHaveBeenCalled();
    rhythm.dispose();
  });

  it('pauses the existing web lecture owner before starting or resuming automatic rhythm', async () => {
    bridge.native = false; bridge.available = false; bridge.lecturePlaying = true;
    const play = vi.fn(async () => { expect(bridge.lecturePlaying).toBe(false); });
    vi.stubGlobal('Audio', class extends EventTarget {
      paused = true; ended = false; currentTime = 0; loop = false; error = null;
      async play() { await play(); this.paused = false; this.dispatchEvent(new Event('play')); }
      pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
      removeAttribute() {} load() {}
    });
    const rhythm = createRosaryMetronome({ onState: vi.fn(), onInterrupted: vi.fn() });
    await rhythm.start({ target: 108, intervalMs: 1000, title: 'Niệm Phật' });
    expect(bridge.pauseLecture).toHaveBeenCalledOnce();
    rhythm.pause(); bridge.lecturePlaying = true;
    await rhythm.resume();
    expect(bridge.pauseLecture).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);
    rhythm.dispose();
  });
});
