import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const completionSpeech = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn() }));
const nativeSounds = vi.hoisted(() => ({ enabled: false, play: vi.fn() }));
const nativePlayback = vi.hoisted(() => ({ enabled: false, begin: vi.fn() }));
vi.mock('../../../src/lib/browser/native-talk-audio', () => ({
  hasNativeTalkAudio: () => nativePlayback.enabled,
  MEDITATION_AUDIO_ALBUM_ID: 'practice:meditation',
}));
vi.mock('$lib/stores/audio-player.svelte', () => ({ getAudioPlayer: async () => ({ beginPracticePlayback: nativePlayback.begin }) }));
vi.mock('../../../src/lib/browser/practice-sound-native', () => ({
  hasNativePracticeSounds: () => nativeSounds.enabled,
  playNativePracticeSound: nativeSounds.play,
}));
const speechFactory = vi.hoisted(() => vi.fn((_options: Parameters<typeof import('../../../src/lib/components/reader/reader-text-to-speech').createReaderTextToSpeech>[0]) => completionSpeech));
vi.mock('../../../src/lib/components/reader/reader-text-to-speech', () => ({
  createReaderTextToSpeech: speechFactory,
}));

import {
  MEDITATION_TRACK_OPTIONS,
  PRACTICE_WOODEN_FISH_TRACK,
  createPracticeAudioController
} from '../../../src/lib/browser/practice-audio';
import { downloadAudioTrack, clearAllPracticeAudioCache } from '../../../src/lib/browser/practice-audio-cache';

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];

  currentTime = 0;
  loop = false;
  preload = '';
  src: string;
  volume = 1;
  pause = vi.fn();
  play = vi.fn(async () => undefined);

  constructor(source = '') {
    super();
    this.src = source;
    MockAudio.instances.push(this);
  }
}

class MockAudioParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class MockOscillator {
  type: OscillatorType = 'sine';
  frequency = new MockAudioParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  addEventListener = vi.fn();
}

class MockGain {
  gain = new MockAudioParam();
  connect = vi.fn();
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  currentTime = 10;
  destination = {};
  oscillators: MockOscillator[] = [];
  close = vi.fn(async () => undefined);
  resume = vi.fn(async () => undefined);

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createOscillator = vi.fn(() => {
    const oscillator = new MockOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  });

  createGain = vi.fn(() => new MockGain());
}

describe('practice audio', () => {
  const documentListeners = new Map<string, EventListener>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    nativeSounds.enabled = false;
    nativePlayback.enabled = false;
    nativePlayback.begin.mockReset();
    MockAudio.instances = [];
    MockAudioContext.instances = [];
    vi.stubGlobal('Audio', MockAudio);
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('window', { clearTimeout, setTimeout });
    documentListeners.clear();
    vi.stubGlobal('document', {
      baseURI: 'https://local.invalid/',
      visibilityState: 'visible',
      addEventListener: vi.fn((name: string, listener: EventListener) => documentListeners.set(name, listener)),
      removeEventListener: vi.fn((name: string, listener: EventListener) => {
        if (documentListeners.get(name) === listener) documentListeners.delete(name);
      })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps native meditation paused when a deferred resume resolves after pause without revoking the lease callbacks', async () => {
    nativePlayback.enabled = true;
    let finishPlay!: () => void;
    const lease = {
      pause: vi.fn(), play: vi.fn(() => new Promise<void>(resolve => { finishPlay = resolve; })),
      stop: vi.fn(), refresh: vi.fn(async () => undefined),
    };
    nativePlayback.begin.mockResolvedValue(lease);
    const onNativeState = vi.fn();
    const controller = createPracticeAudioController();
    try {
      expect(await controller.setMeditationTrack(MEDITATION_TRACK_OPTIONS[0].track, {
        remainingMs: 930_000, title: 'Thiền', onNativeState, onInterrupted: vi.fn(),
      })).toBe(true);
      controller.pauseMeditation();
      const pending = controller.resumeMeditation();
      expect(lease.play).toHaveBeenCalledOnce();
      controller.pauseMeditation();
      finishPlay();
      expect(await pending).toBe(false);
      expect(controller.getState().meditationActive).toBe(false);
      expect(lease.stop).not.toHaveBeenCalled();
      nativePlayback.begin.mock.calls[0][2]({ playWhenReady: false, ended: false, error: '', sleepRemainingMs: 900_000 });
      expect(onNativeState).toHaveBeenCalledOnce();
      lease.play.mockResolvedValue(undefined);
      expect(await controller.resumeMeditation()).toBe(true);
      expect(controller.getState().meditationActive).toBe(true);
      expect(nativePlayback.begin).toHaveBeenCalledOnce();
    } finally { controller.destroy(); }
  });

  it('does not touch or play the tap sound while sound is disabled', () => {
    const controller = createPracticeAudioController();
    const tap = MockAudio.instances[2];

    controller.playRosaryTap(false);

    expect(tap.pause).not.toHaveBeenCalled();
    expect(tap.play).not.toHaveBeenCalled();
  });

  it('uses bundled native meditation assets without requesting an audio download', async () => {
    nativePlayback.enabled = true;
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }), delete: async () => true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('audio', { headers: { 'content-type': 'audio/mp4' } })));
    const track = MEDITATION_TRACK_OPTIONS[1].track;
    expect(await downloadAudioTrack(track)).toBe(track);
    expect(fetch).not.toHaveBeenCalled();
    nativePlayback.begin.mockResolvedValue({ pause() {}, play: async () => {}, stop() {}, refresh: async () => {} });
    const controller = createPracticeAudioController();
    try {
      expect(await controller.setMeditationTrack(track, { remainingMs: 60_000, title: 'Thiền', onNativeState() {}, onInterrupted() {} })).toBe(true);
      expect(nativePlayback.begin.mock.calls[0][0].tracks[0].url).toBe(new URL(track, document.baseURI).href);
    } finally {
      controller.destroy();
      await clearAllPracticeAudioCache();
    }
  });

  it('keeps guided music on lock, then enforces its deadline without a UI timer tick', async () => {
    vi.setSystemTime(0);
    const controller = createPracticeAudioController();
    await controller.setMeditationTrack('/assets/audio/nhac-thien-01.m4a', {
      remainingMs: 5_000, title: 'Thiền', onNativeState() {}, onInterrupted() {},
    });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    documentListeners.get('visibilitychange')?.(new Event('visibilitychange'));
    expect(controller.getState().meditationActive).toBe(true);
    expect(MockAudio.instances[0].pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    MockAudio.instances[0].dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().meditationActive).toBe(false);
    expect(MockAudio.instances[0].pause).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('defers a completion which arrives while hidden until the user returns', () => {
    const controller = createPracticeAudioController();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    controller.playMeditationCompletion('Lời kết', 'vi', vi.fn());
    vi.advanceTimersByTime(8_000);
    expect(completionSpeech.play).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    documentListeners.get('visibilitychange')?.(new Event('visibilitychange'));
    vi.advanceTimersByTime(7_500);
    expect(completionSpeech.play).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('plays the real wooden-fish asset once while sound is enabled', () => {
    const controller = createPracticeAudioController();
    const tap = MockAudio.instances[2];

    controller.playRosaryTap(true);

    expect(tap.src).toBe(PRACTICE_WOODEN_FISH_TRACK);
    expect(tap.pause).toHaveBeenCalledTimes(1);
    expect(tap.play).toHaveBeenCalledTimes(1);
  });

  it('only exposes meditation and wooden-fish assets that exist through the public symlink', async () => {
    const controller = createPracticeAudioController();
    const meditation = MockAudio.instances[0];

    expect(MEDITATION_TRACK_OPTIONS.map((option) => option.label)).toEqual([
      'Nhạc Thiền 1 — Tĩnh lặng',
      'Nhạc Thiền 2 — Thanh tịnh',
      'Nhạc Thiền 3 — An lạc'
    ]);
    for (const source of [...MEDITATION_TRACK_OPTIONS.map((option) => option.track), PRACTICE_WOODEN_FISH_TRACK]) {
      expect(source.startsWith('/assets/audio/')).toBe(true);
      expect(existsSync(resolve('static', source.slice(1))) || existsSync(resolve(source.slice(1)))).toBe(true);
    }
    await expect(controller.setMeditationTrack(MEDITATION_TRACK_OPTIONS[2].track)).resolves.toBe(true);
    expect(meditation.src).toBe('/assets/audio/nhac-thien-03.m4a');
    expect(controller.getState()).toEqual({
      meditationActive: true,
      moActive: false,
      selectedTrack: '/assets/audio/nhac-thien-03.m4a'
    });
  });

  it('synthesizes deterministic cue partials without requiring another media asset', () => {
    const controller = createPracticeAudioController();

    expect(controller.playPracticeCue('bell', 0.5)).toBe(true);
    expect(controller.playPracticeCue('bowl')).toBe(true);
    expect(controller.playPracticeCue('khánh')).toBe(true);
    expect(MockAudioContext.instances).toHaveLength(3);
    expect(MockAudioContext.instances.every((context) => context.oscillators.length === 2)).toBe(true);
  });

  it('keeps unavailable cue and resume failures non-blocking', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const controller = createPracticeAudioController();
    expect(controller.playPracticeCue('bell')).toBe(false);
    await expect(controller.resumeMeditation()).resolves.toBe(false);
  });

  it.each(['vi', 'en'])('rings three spaced bells before speaking the %s completion', async (locale) => {
    const controller = createPracticeAudioController();
    const notify = vi.fn();
    controller.playMeditationCompletion('Completion blessing', locale, notify);
    expect(MockAudioContext.instances).toHaveLength(3);
    expect(MockAudioContext.instances.map(context => context.oscillators[0].start.mock.calls[0][0]))
      .toEqual([10, 12.5, 15]);
    expect(completionSpeech.play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(7_500);
    expect(completionSpeech.play).toHaveBeenCalledTimes(1);
    const options = speechFactory.mock.calls.at(-1)?.[0];
    expect(options?.getText()).toBe('Completion blessing');
    expect(options?.getLocale()).toBe(locale);
    options?.onNotify('engine error');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each(['stopMeditationCompletion', 'stopAll', 'destroy'] as const)(
    '%s cancels queued bells and speech without a late announcement', async (action) => {
      const controller = createPracticeAudioController();
      controller.playMeditationCompletion('Completion blessing', 'vi', vi.fn());
      controller[action]();
      await vi.runAllTimersAsync();
      expect(completionSpeech.play).not.toHaveBeenCalled();
      expect(completionSpeech.stop).toHaveBeenCalled();
      expect(MockAudioContext.instances.every(context => context.close.mock.calls.length === 1)).toBe(true);
    },
  );

  it('stops a spoken completion when hidden and can start a fresh completion', async () => {
    const controller = createPracticeAudioController();
    controller.playMeditationCompletion('First', 'vi', vi.fn());
    await vi.advanceTimersByTimeAsync(7_500);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    documentListeners.get('visibilitychange')?.(new Event('visibilitychange'));
    expect(completionSpeech.stop).toHaveBeenCalled();
    controller.playMeditationCompletion('Hidden', 'en', vi.fn());
    await vi.runAllTimersAsync();
    expect(completionSpeech.play).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    controller.playMeditationCompletion('Second', 'en', vi.fn());
    await vi.advanceTimersByTimeAsync(7_500);
    expect(completionSpeech.play).toHaveBeenCalledTimes(2);
    controller.destroy();
    controller.playMeditationCompletion('Late', 'vi', vi.fn());
    await vi.runAllTimersAsync();
    expect(completionSpeech.play).toHaveBeenCalledTimes(2);
  });

  it('does not reactivate deferred meditation audio after principal cleanup', async () => {
    let resolvePlay!: () => void;
    const controller = createPracticeAudioController();
    const meditation = MockAudio.instances[0];
    meditation.play.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolvePlay = resolve;
    }));

    const start = controller.setMeditationTrack(MEDITATION_TRACK_OPTIONS[0].track);
    controller.stopAll();
    resolvePlay();

    await expect(start).resolves.toBe(false);
    expect(meditation.pause).toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      meditationActive: false,
      moActive: false,
      selectedTrack: MEDITATION_TRACK_OPTIONS[0].track,
    });
  });

  it('fully releases listeners, timers and audio sources when destroyed', () => {
    const controller = createPracticeAudioController();
    const instances = [...MockAudio.instances];
    const visibilityListener = documentListeners.get('visibilitychange');

    controller.playRosaryTap(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(visibilityListener).toBeTypeOf('function');

    controller.destroy();

    expect(vi.getTimerCount()).toBe(0);
    expect(documentListeners.has('visibilitychange')).toBe(false);
    expect(instances.every((audio) => audio.src === '')).toBe(true);
    expect(controller.getState()).toEqual({
      meditationActive: false,
      moActive: false,
      selectedTrack: null
    });
    controller.playRosaryTap(true);
    expect(instances[2].play).toHaveBeenCalledTimes(1);
  });

  it('destroys the controller when the Tu Tập page unmounts', () => {
    const page = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
    const teardown = page.slice(page.indexOf('return () => {'), page.indexOf('</script>'));
    expect(teardown).toContain('cleanupPracticeResources();');
    expect(teardown).toContain('audio?.destroy();');
  });

  it('fences guided meditation resources after its deferred audio setup', () => {
    const page = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
    const start = page.slice(
      page.indexOf('async function startGuidedMeditation'),
      page.indexOf('function pauseGuidedMeditation'),
    );
    const deferredAudio = start.indexOf('await audio?.setMeditationTrack');
    const generationFence = start.indexOf('generation !== practiceSyncGeneration', deferredAudio);
    expect(deferredAudio).toBeGreaterThan(0);
    expect(generationFence).toBeGreaterThan(deferredAudio);
    expect(start.indexOf('refreshAudioState();', generationFence)).toBeGreaterThan(generationFence);
    expect(start.indexOf('wakeLock?.request()', generationFence)).toBeGreaterThan(generationFence);
    expect(start.indexOf('startMeditationTickers();', generationFence)).toBeGreaterThan(generationFence);
  });

  it('allows selecting and switching meditation tracks, and toggles off on reselecting same track', async () => {
    const controller = createPracticeAudioController();
    const meditation = MockAudio.instances[0];

    // Select track 1
    const started = await controller.toggleMeditation(MEDITATION_TRACK_OPTIONS[0].track);
    expect(started).toBe(true);
    expect(controller.getState().meditationActive).toBe(true);
    expect(controller.getState().selectedTrack).toBe(MEDITATION_TRACK_OPTIONS[0].track);
    expect(meditation.src).toBe(MEDITATION_TRACK_OPTIONS[0].track);
    expect(meditation.play).toHaveBeenCalledTimes(1);

    // Switch to track 2
    const switched = await controller.toggleMeditation(MEDITATION_TRACK_OPTIONS[1].track);
    expect(switched).toBe(true);
    expect(controller.getState().meditationActive).toBe(true);
    expect(controller.getState().selectedTrack).toBe(MEDITATION_TRACK_OPTIONS[1].track);
    expect(meditation.src).toBe(MEDITATION_TRACK_OPTIONS[1].track);

    // Toggle off track 2
    const stopped = await controller.toggleMeditation(MEDITATION_TRACK_OPTIONS[1].track);
    expect(stopped).toBe(false);
    expect(controller.getState().meditationActive).toBe(false);
    expect(meditation.pause).toHaveBeenCalled();
  });

  it('plays Android meditation bells and beats without starting additional WebView audio', async () => {
    nativeSounds.enabled = true;
    const controller = createPracticeAudioController();
    await controller.setMeditationTrack(MEDITATION_TRACK_OPTIONS[0].track, {
      remainingMs: 900_000, title: 'Meditation', onNativeState() {}, onInterrupted() {},
    });
    MockAudio.instances.forEach(audio => audio.play.mockClear());
    controller.playPracticeCue('bell', 0.55);
    controller.playWoodenFishBeat(true);
    expect(nativeSounds.play).toHaveBeenCalledWith({ channel: 'cue', cue: 'bell', delayMs: 550 });
    expect(nativeSounds.play).toHaveBeenCalledWith({ channel: 'cue', cue: 'wooden-fish' });
    expect(MockAudioContext.instances).toHaveLength(0);
    expect(MockAudio.instances.every(audio => audio.play.mock.calls.length === 0)).toBe(true);
    controller.destroy();
    expect(nativeSounds.play).toHaveBeenCalledWith({ channel: 'cue', stop: true });
  });

  it('wires delete-log confirmation and meditation background music in Tu Tap page', () => {
    const page = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
    expect(page).toContain("'delete-log': {");
    expect(page).toContain('pendingDeleteLogId');
    expect(page).toContain('requestDeleteLog');
    expect(page).toContain('onDeleteLog={requestDeleteLog}');
    expect(page).toContain('onSelectMeditationTrack={handleSelectMeditationTrack}');
    expect(page).toContain('onStopMeditationMusic={handleStopMeditationMusic}');
  });
});
