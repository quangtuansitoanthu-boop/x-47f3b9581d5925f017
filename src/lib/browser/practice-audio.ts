import { createReaderTextToSpeech } from '$lib/components/reader/reader-text-to-speech';
import { hasNativeTalkAudio, MEDITATION_AUDIO_ALBUM_ID, type NativeAudioState } from './native-talk-audio';
import type { PracticeAudioLease } from './audio-player-controller';
import { hasNativePracticeSounds, playNativePracticeSound } from './practice-sound-native';
import { getPlayablePracticeAudioUrl } from './practice-audio-cache';

const MEDITATION_TRACKS = [
  '/assets/audio/nhac-thien-01.m4a',
  '/assets/audio/nhac-thien-02.m4a',
  '/assets/audio/nhac-thien-03.m4a'
] as const;

export const PRACTICE_WOODEN_FISH_TRACK = '/assets/audio/tieng-mo.m4a';
export const ROSARY_TAP_TRACK = '/assets/audio/rosary-tap.m4a';
export type MeditationTrack = (typeof MEDITATION_TRACKS)[number];

export interface MeditationTrackOption {
  label: string;
  track: MeditationTrack;
}

export const MEDITATION_TRACK_OPTIONS: readonly MeditationTrackOption[] = [
  { label: 'Nhạc Thiền 1 — Tĩnh lặng', track: MEDITATION_TRACKS[0] },
  { label: 'Nhạc Thiền 2 — Thanh tịnh', track: MEDITATION_TRACKS[1] },
  { label: 'Nhạc Thiền 3 — An lạc', track: MEDITATION_TRACKS[2] }
];

export interface PracticeAudioState {
  meditationActive: boolean;
  moActive: boolean;
  selectedTrack: MeditationTrack | null;
}

export interface PracticeAudioController {
  destroy(): void;
  getState(): PracticeAudioState;
  pauseMeditation(): void;
  playMeditationCompletion(text: string, locale: string, onUnavailable: () => void): void;
  stopMeditationCompletion(): void;
  playPracticeCue(kind: 'bell' | 'bowl' | 'khánh', delaySeconds?: number): boolean;
  playRosaryTap(enabled: boolean): void;
  playWoodenFishBeat(enabled: boolean): void;
  resumeMeditation(): Promise<boolean>;
  setMeditationTrack(track: MeditationTrack, options?: MeditationPlaybackOptions): Promise<boolean>;
  hasNativeMeditation(): boolean;
  refreshMeditation(): Promise<void>;
  stopAll(): void;
  toggleMeditation(track: MeditationTrack): Promise<boolean>;
  toggleMo(): Promise<boolean>;
}

export interface MeditationPlaybackOptions {
  remainingMs: number;
  title: string;
  onNativeState: (state: NativeAudioState) => void;
  onInterrupted: () => void;
}

function createAudioElement(source: string, loop = false): HTMLAudioElement {
  const element = new Audio(source);
  element.loop = loop;
  element.preload = 'auto';
  return element;
}

export function createPracticeAudioController(): PracticeAudioController {
  const meditation = createAudioElement('', true);
  const mo = createAudioElement(PRACTICE_WOODEN_FISH_TRACK, true);
  mo.preload = 'none';
  const rosaryTap = createAudioElement(ROSARY_TAP_TRACK);
  rosaryTap.volume = 0.8;

  let state: PracticeAudioState = {
    meditationActive: false,
    moActive: false,
    selectedTrack: null
  };
  let destroyed = false;
  let nativeMeditation: PracticeAudioLease | null = null;
  let nativeRequest: AbortController | null = null;
  let backgroundMeditation = false;
  let musicDeadline = 0;
  let pausedRemaining = 0;
  let pendingCompletion: { text: string; locale: string; onUnavailable: () => void } | null = null;
  let meditationGeneration = 0;
  let meditationPlayRequestVersion = 0;
  let moGeneration = 0;
  let completionTimer: ReturnType<typeof setTimeout> | null = null;
  let completionSpeech: ReturnType<typeof createReaderTextToSpeech> | null = null;
  const cueContexts = new Set<AudioContext>();

  function stopMeditationCompletion(): void {
    if (hasNativePracticeSounds()) playNativePracticeSound({ channel: 'cue', stop: true });
    pendingCompletion = null;
    if (completionTimer !== null) clearTimeout(completionTimer);
    completionTimer = null;
    completionSpeech?.stop();
    completionSpeech = null;
    for (const context of cueContexts) void context.close().catch(() => undefined);
    cueContexts.clear();
  }

  function playMeditationCompletion(text: string, locale: string, onUnavailable: () => void): void {
    if (destroyed) return;
    stopMeditationCompletion();
    if (document.visibilityState === 'hidden') { pendingCompletion = { text, locale, onUnavailable }; return; }
    // Chừa khoảng ngân giữa ba tiếng chuông, rồi mới đọc lời xả thiền.
    for (let index = 0; index < 3; index += 1) playPracticeCue('bell', index * 2.5);
    completionSpeech = createReaderTextToSpeech({
      getText: () => text,
      getLocale: () => locale,
      initialRate: 0.9,
      onState: () => {},
      onNotify: onUnavailable,
    });
    completionTimer = setTimeout(() => {
      completionTimer = null;
      completionSpeech?.play();
    }, 7_500);
  }

  function syncHiddenState(): void {
    if (document.visibilityState === 'hidden') {
      if (!backgroundMeditation) { stopAll(); return; }
      stopMeditationCompletion();
      moGeneration += 1;
      mo.pause();
      mo.currentTime = 0;
      stopTap();
      state = { ...state, moActive: false };
    } else if (pendingCompletion) {
      const pending = pendingCompletion;
      playMeditationCompletion(pending.text, pending.locale, pending.onUnavailable);
    }
  }

  function enforceMusicDeadline(): void {
    if (musicDeadline && Date.now() >= musicDeadline) pauseMeditation();
  }
  meditation.addEventListener('timeupdate', enforceMusicDeadline);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', syncHiddenState);
  }

  async function toggleMo(): Promise<boolean> {
    if (destroyed) return false;
    if (state.moActive) {
      moGeneration += 1;
      mo.pause();
      mo.currentTime = 0;
      state = { ...state, moActive: false };
      return false;
    }
    const generation = ++moGeneration;
    try {
      mo.currentTime = 0;
      await mo.play();
      if (destroyed || generation !== moGeneration) return false;
      state = { ...state, moActive: true };
      return true;
    } catch {
      if (generation !== moGeneration) return false;
      state = { ...state, moActive: false };
      return false;
    }
  }

  async function setMeditationTrack(track: MeditationTrack, options?: MeditationPlaybackOptions): Promise<boolean> {
    if (destroyed || !MEDITATION_TRACKS.includes(track)) return false;
    if (options && (!Number.isFinite(options.remainingMs) || options.remainingMs <= 0)) return false;
    const generation = ++meditationGeneration;
    nativeRequest?.abort();
    nativeRequest = null;
    const oldLease = nativeMeditation;
    nativeMeditation = null;
    oldLease?.stop();
    backgroundMeditation = Boolean(options);
    musicDeadline = options ? Date.now() + options.remainingMs : 0;
    pausedRemaining = 0;
    state = { ...state, selectedTrack: track };
    try {
      const playableUrl = getPlayablePracticeAudioUrl(track);
      if (options && hasNativeTalkAudio()) {
        const request = new AbortController();
        nativeRequest = request;
        const { getAudioPlayer } = await import('$lib/stores/audio-player.svelte');
        const player = await getAudioPlayer();
        if (destroyed || generation !== meditationGeneration) return false;
        meditation.pause();
        // Native player cannot read WebView blob URLs; all practice tracks are bundled.
        const nativeUrl = new URL(track, document.baseURI).href;
        const lease = await player.beginPracticePlayback({
          id: MEDITATION_AUDIO_ALBUM_ID, title: options.title, description: '',
          tracks: [{ title: options.title, url: nativeUrl }],
        }, Math.max(1, musicDeadline - Date.now()), (nativeState) => {
          if (destroyed || generation !== meditationGeneration) return;
          state = { ...state, meditationActive: nativeState.playWhenReady && !nativeState.ended && !nativeState.error };
          options.onNativeState(nativeState);
        }, () => {
          if (destroyed || generation !== meditationGeneration) return;
          nativeMeditation = null;
          state = { ...state, meditationActive: false };
          options.onInterrupted();
        }, request.signal);
        if (destroyed || generation !== meditationGeneration) { lease?.stop(); return false; }
        if (!lease) return false;
        nativeMeditation = lease;
        nativeRequest = null;
        musicDeadline = 0;
        state = { ...state, meditationActive: true };
        return true;
      }
      meditation.src = playableUrl;
      meditation.loop = true;
      await meditation.play();
      if (destroyed || generation !== meditationGeneration) return false;
      state = { ...state, meditationActive: true };
      return true;
    } catch {
      if (generation !== meditationGeneration) return false;
      state = { ...state, meditationActive: false };
      return false;
    }
  }

  async function toggleMeditation(track: MeditationTrack): Promise<boolean> {
    if (state.meditationActive && state.selectedTrack === track) {
      meditationGeneration += 1;
      const lease = nativeMeditation;
      nativeMeditation = null;
      lease?.stop();
      meditation.pause();
      meditation.currentTime = 0;
      state = { ...state, meditationActive: false };
      return false;
    }
    return setMeditationTrack(track);
  }

  function pauseMeditation(): void {
    meditationPlayRequestVersion += 1;
    if (!nativeMeditation) meditationGeneration += 1;
    nativeMeditation?.pause();
    if (musicDeadline) pausedRemaining = Math.max(0, musicDeadline - Date.now());
    musicDeadline = 0;
    meditation.pause();
    state = { ...state, meditationActive: false };
  }

  async function resumeMeditation(): Promise<boolean> {
    if (destroyed || !state.selectedTrack) return false;
    const generation = nativeMeditation ? meditationGeneration : ++meditationGeneration;
    const requestVersion = ++meditationPlayRequestVersion;
    try {
      if (nativeMeditation) await nativeMeditation.play();
      else {
        if (pausedRemaining) musicDeadline = Date.now() + pausedRemaining;
        await meditation.play();
      }
      if (destroyed || generation !== meditationGeneration || requestVersion !== meditationPlayRequestVersion) return false;
      state = { ...state, meditationActive: true };
      return true;
    } catch {
      if (generation !== meditationGeneration || requestVersion !== meditationPlayRequestVersion) return false;
      state = { ...state, meditationActive: false };
      return false;
    }
  }

  function playPracticeCue(kind: 'bell' | 'bowl' | 'khánh', delaySeconds = 0): boolean {
    if (destroyed || document.visibilityState === 'hidden') return false;
    if (backgroundMeditation && hasNativePracticeSounds()) {
      playNativePracticeSound({ channel: 'cue', cue: kind, delayMs: Math.round(Math.max(0, delaySeconds) * 1000) });
      return true;
    }
    const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Context = globalThis.AudioContext ?? browser.webkitAudioContext;
    if (!Context) return false;
    try {
      const context = new Context();
      cueContexts.add(context);
      const startAt = context.currentTime + Math.max(0, delaySeconds);
      const duration = kind === 'bell' ? 1.8 : kind === 'bowl' ? 1.25 : 0.75;
      const baseFrequency = kind === 'bell' ? 660 : kind === 'bowl' ? 440 : 880;
      const partials = [
        { frequency: baseFrequency, peak: 0.18, ratio: 1 },
        { frequency: baseFrequency * 2.01, peak: 0.05, ratio: 0.72 },
      ];
      let ended = 0;
      for (const partial of partials) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const partialDuration = duration * partial.ratio;
        oscillator.type = kind === 'khánh' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(partial.frequency, startAt);
        oscillator.frequency.exponentialRampToValueAtTime(partial.frequency * 0.86, startAt + partialDuration);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(partial.peak, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + partialDuration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + partialDuration);
        oscillator.addEventListener('ended', () => {
          ended += 1;
          if (ended === partials.length && cueContexts.delete(context)) void context.close().catch(() => undefined);
        }, { once: true });
      }
      void context.resume().catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }

  function stopTap(): void {
    rosaryTap.pause();
    rosaryTap.currentTime = 0;
  }

  function stopAll(): void {
    stopMeditationCompletion();
    meditationGeneration += 1;
    nativeRequest?.abort();
    nativeRequest = null;
    const lease = nativeMeditation;
    nativeMeditation = null;
    lease?.stop();
    backgroundMeditation = false;
    musicDeadline = 0;
    pausedRemaining = 0;
    moGeneration += 1;
    meditation.pause();
    meditation.currentTime = 0;
    mo.pause();
    mo.currentTime = 0;
    stopTap();
    state = { ...state, meditationActive: false, moActive: false };
  }

  function playRosaryTap(enabled: boolean): void {
    if (!enabled || destroyed || state.moActive) return;
    rosaryTap.currentTime = 0;
    void rosaryTap.play().catch(() => undefined);
  }

  function playWoodenFishBeat(enabled: boolean): void {
    if (enabled && !destroyed && backgroundMeditation && hasNativePracticeSounds()) {
      playNativePracticeSound({ channel: 'cue', cue: 'wooden-fish' });
      return;
    }
    playRosaryTap(enabled);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', syncHiddenState);
    }
    stopAll();
    meditation.removeEventListener('timeupdate', enforceMusicDeadline);
    meditation.src = '';
    mo.src = '';
    rosaryTap.src = '';
    state = { meditationActive: false, moActive: false, selectedTrack: null };
  }

  return {
    destroy,
    getState: () => ({ ...state }),
    pauseMeditation,
    playMeditationCompletion,
    stopMeditationCompletion,
    playPracticeCue,
    playRosaryTap,
    playWoodenFishBeat,
    resumeMeditation,
    setMeditationTrack,
    hasNativeMeditation: () => nativeMeditation !== null,
    refreshMeditation: async () => { await nativeMeditation?.refresh(); },
    stopAll,
    toggleMeditation,
    toggleMo
  };
}

export { MEDITATION_TRACKS };
