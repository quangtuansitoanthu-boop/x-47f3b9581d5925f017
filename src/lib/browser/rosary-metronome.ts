import type { AudioPlayerController, PracticeAudioLease } from './audio-player-controller';
import { cacheNativeTalk, hasNativeTalkAudio, ROSARY_AUDIO_ALBUM_ID } from './native-talk-audio';
import { nativeAudioPrincipalRevision } from './native-audio-principal';
import { isNativeApp } from './native-platform';
import { createRosaryWave, planRosaryAudioChunks, rosaryChunkProgress, rosaryCountAtPosition, ROSARY_SAMPLE_RATE, validateRosaryRhythm, type RosaryInterval } from '$lib/domain/practice/rosary-rhythm';

export interface RosaryMetronomeState {
  count: number; target: number; playing: boolean; completed: boolean; error: string;
  positionSeconds?: number; observedAtMs?: number;
  intervalMs?: RosaryInterval; phaseStartCount?: number; phaseStartPositionSeconds?: number;
}
export interface RosaryMetronomeOptions {
  intervalMs: RosaryInterval; target: number; title: string;
}

/** Audio transport owns cadence, including native sleep/background. No JS timer manufactures ticks. */
export function createRosaryMetronome(callbacks: {
  onState: (state: RosaryMetronomeState) => void;
  onInterrupted: () => void;
}) {
  let generation = 0;
  let disposed = false;
  let lease: PracticeAudioLease | null = null;
  let request: AbortController | null = null;
  let web: HTMLAudioElement | null = null;
  let webPlayer: AudioPlayerController | null = null;
  let objectUrls: string[] = [];
  let options: RosaryMetronomeOptions | null = null;
  let phaseStartCount = 0;
  let phaseStartPositionSeconds = 0;
  let sessionOpen = false;
  let decodedPulse: Int16Array | null = null;
  let resumeWork: Promise<void> | null = null;
  let state: RosaryMetronomeState = { count: 0, target: 0, playing: false, completed: false, error: '' };

  function publish(position: number, playing: boolean, completed: boolean, error = '', observedAtMs = Date.now(), acceptedCount?: number) {
    if (!options || disposed) return;
    state = { count: Math.max(state.count, phaseStartCount + (acceptedCount ?? rosaryCountAtPosition(position, options.target - phaseStartCount, options.intervalMs))), target: options.target, playing, completed, error,
      positionSeconds: phaseStartPositionSeconds + position, observedAtMs: Number.isFinite(observedAtMs) ? observedAtMs : Date.now(),
      intervalMs: options.intervalMs, phaseStartCount, phaseStartPositionSeconds };
    callbacks.onState({ ...state });
  }
  function releaseTransport() {
    generation += 1;
    request?.abort(); request = null;
    const previous = lease; lease = null; previous?.stop();
    if (web) { web.pause(); web.removeAttribute('src'); web.load(); web = null; }
    webPlayer = null;
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];
    state = { ...state, playing: false };
  }
  function stop() { sessionOpen = false; releaseTransport(); }
  async function begin(next: RosaryMetronomeOptions, acceptedCount = 0, elapsedSeconds = 0) {
    if (disposed) throw new Error('rosary_metronome_disposed');
    validateRosaryRhythm(next.target, next.intervalMs);
    releaseTransport();
    options = next;
    phaseStartCount = acceptedCount;
    phaseStartPositionSeconds = elapsedSeconds;
    state = { count: acceptedCount, target: next.target, playing: false, completed: false, error: '', positionSeconds: elapsedSeconds,
      intervalMs: next.intervalMs, phaseStartCount, phaseStartPositionSeconds };
    const selectedGeneration = generation;
    const principalRevision = nativeAudioPrincipalRevision();
    const current = () => !disposed && selectedGeneration === generation && principalRevision === nativeAudioPrincipalRevision();
    const controller = new AbortController(); request = controller;
    const assertCurrent = () => { if (!current()) throw new DOMException('Rosary request cancelled', 'AbortError'); };
    try {
      if (isNativeApp() && !hasNativeTalkAudio()) throw new Error('rosary_native_audio_unavailable');
      if (!decodedPulse) {
        const response = await fetch('/assets/audio/tieng-mo.m4a', { signal: controller.signal });
        if (!response.ok) throw new Error('rosary_audio_unavailable');
        const encoded = await response.arrayBuffer(); assertCurrent();
        const AudioContextClass = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error('rosary_audio_unavailable');
        const context = new AudioContextClass({ sampleRate: ROSARY_SAMPLE_RATE });
        try {
          const decoded = await context.decodeAudioData(encoded); assertCurrent();
          const source = decoded.getChannelData(0);
          // Match the existing short rosary tap rather than repeating a long bundled recording.
          const length = Math.min(source.length, Math.round(decoded.sampleRate * .4));
          const pulse = new Int16Array(Math.round(length * ROSARY_SAMPLE_RATE / decoded.sampleRate));
          for (let i = 0; i < pulse.length; i++) pulse[i] = Math.round(Math.max(-1, Math.min(1, source[Math.floor(i * decoded.sampleRate / ROSARY_SAMPLE_RATE)])) * 32767);
          decodedPulse = pulse;
        } finally { await context.close(); }
      }
      assertCurrent();
      const chunks = planRosaryAudioChunks(next.target - acceptedCount, next.intervalMs);
      const generated = new Map<string, Blob>();
      for (const chunk of chunks) {
        if (!generated.has(chunk.slot)) generated.set(chunk.slot, createRosaryWave(decodedPulse, chunk.beats, next.intervalMs, { leadingInterval: chunk.leadingInterval, bells: chunk.bells }));
      }
      if (hasNativeTalkAudio()) {
        // Three bounded slots, independent of session length; body is reused by the native playlist.
        const urls = new Map<string, string>();
        for (const [slot, blob] of generated) {
          const url = new URL(`/assets/audio/rosary-rhythm-v2-${slot}.wav`, document.baseURI).href;
          await cacheNativeTalk(url, blob, undefined, current, { replace: true }); assertCurrent();
          urls.set(slot, url);
        }
        const { getAudioPlayer } = await import('$lib/stores/audio-player.svelte');
        const player = await getAudioPlayer(); assertCurrent();
        const nextLease = await player.beginPracticePlayback({
          id: ROSARY_AUDIO_ALBUM_ID, title: next.title, description: '',
          tracks: chunks.map(chunk => ({ title: next.title, url: urls.get(chunk.slot)! })),
        }, 1, nativeState => {
          if (!current()) return;
          const chunk = chunks[nativeState.trackIndex];
          if (!chunk) return;
          const progress = rosaryChunkProgress(chunk, nativeState.position, next.intervalMs, nativeState.playing);
          const completed = nativeState.ended && nativeState.trackIndex === chunks.length - 1;
          publish(progress.positionSeconds, nativeState.playWhenReady && !completed && !nativeState.error, completed, nativeState.error, nativeState.observedAtMs, progress.count);
        }, () => {
          if (!current()) return;
          lease = null; state = { ...state, playing: false };
          callbacks.onState({ ...state }); callbacks.onInterrupted();
        }, controller.signal, { finite: true });
        if (!current()) { nextLease?.stop(); return; }
        if (!nextLease) throw new Error('rosary_native_audio_unavailable');
        lease = nextLease;
        await lease.refresh();
      } else {
        const { getAudioPlayer } = await import('$lib/stores/audio-player.svelte');
        const player = await getAudioPlayer();
        await player.ready; assertCurrent();
        // Pause through the existing owner so the lecture's resume position is retained.
        if (player.snapshot.playing || !player.audio.paused) player.pause();
        webPlayer = player;
        const urls = new Map<string, string>();
        for (const [slot, blob] of generated) { const url = URL.createObjectURL(blob); urls.set(slot, url); objectUrls.push(url); }
        let index = 0;
        const audio = new Audio(urls.get(chunks[0].slot)); web = audio; audio.loop = false;
        const update = () => {
          if (!current()) return;
          const progress = rosaryChunkProgress(chunks[index], audio.currentTime, next.intervalMs, !audio.paused);
          publish(progress.positionSeconds, !audio.paused && !audio.ended, audio.ended && index === chunks.length - 1,
            audio.error ? 'rosary_audio_unavailable' : '', Date.now(), progress.count);
        };
        audio.addEventListener('ended', () => {
          update();
          if (!current() || index === chunks.length - 1) return;
          index += 1; audio.src = urls.get(chunks[index].slot)!;
          void audio.play().catch(() => { if (current()) publish((state.positionSeconds ?? phaseStartPositionSeconds) - phaseStartPositionSeconds, false, false, 'rosary_audio_unavailable', Date.now(), state.count - phaseStartCount); });
        });
        for (const event of ['timeupdate', 'play', 'pause', 'error']) audio.addEventListener(event, update);
        await audio.play(); assertCurrent(); update();
      }
    } catch (cause) {
      if (current()) {
        releaseTransport();
        state = { ...state, playing: false, error: cause instanceof Error ? cause.message : 'rosary_audio_unavailable' };
        callbacks.onState({ ...state });
      }
      throw cause;
    }
  }
  async function start(next: RosaryMetronomeOptions) {
    sessionOpen = true;
    await begin(next);
  }
  function pause() { lease?.pause(); web?.pause(); }
  async function resume(intervalMs?: RosaryInterval) {
    if (resumeWork) throw new Error('rosary_tempo_change_in_progress');
    const work = (async () => {
      if (!sessionOpen || !options || disposed) throw new Error('rosary_audio_not_started');
      if (intervalMs !== undefined) validateRosaryRhythm(options.target, intervalMs);
      const selectedGeneration = generation, principalRevision = nativeAudioPrincipalRevision();
      await refresh();
      if (selectedGeneration !== generation || principalRevision !== nativeAudioPrincipalRevision() || !sessionOpen) throw new DOMException('Rosary request cancelled', 'AbortError');
      if (state.completed) throw new Error('rosary_session_completed');
      const changed = intervalMs !== undefined && intervalMs !== options.intervalMs;
      if (changed && state.playing) throw new Error('rosary_tempo_requires_pause');
      if ((changed || (!lease && !web)) && state.count < state.target) {
        await begin({ ...options, intervalMs: intervalMs ?? options.intervalMs }, state.count, state.positionSeconds ?? 0);
      } else if (lease) await lease.play();
      else if (web) {
        if (webPlayer && (webPlayer.snapshot.playing || !webPlayer.audio.paused)) webPlayer.pause();
        await web.play();
      }
      else throw new Error('rosary_audio_not_started');
    })();
    resumeWork = work;
    try { await work; }
    finally { if (resumeWork === work) resumeWork = null; }
  }
  async function refresh() {
    if (lease) await lease.refresh();
    else if (web) web.dispatchEvent(new Event('timeupdate'));
  }
  return { start, pause, resume, stop, refresh, dispose() { stop(); disposed = true; } };
}
