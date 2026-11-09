import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';
import { resolveApiUrl } from './native-api';
import type { AudioAlbum } from './audio-player-controller';
import { nativeAudioPlugin, nativeAudioPrincipalRevision, waitForNativeAudioPrincipal } from './native-audio-principal';
export const MEDITATION_AUDIO_ALBUM_ID = 'practice:meditation';
export const ROSARY_AUDIO_ALBUM_ID = 'practice:rosary';

export interface NativeAudioState {
  queueId: string; trackIndex: number; position: number; duration: number;
  playing: boolean; playWhenReady: boolean; buffering: boolean; ended: boolean;
  speed: number; volume: number; error: string; sleepRemainingMs: number; sleepAtEnd: boolean;
  album?: AudioAlbum;
  repeat?: 0 | 1 | 2;
  observedAtMs?: number;
}
export interface NativeTalkPlugin {
  selectPrincipal(options: { principalKey: string }): Promise<void>;
  setQueue(options: { queueId: string; albumId: string; tracks: { title: string; url: string }[]; album: string; artist: string; artwork: string; originalArtwork: string; index: number; position: number }): Promise<NativeAudioState>;
  play(): Promise<NativeAudioState>; pause(): Promise<NativeAudioState>; stop(): Promise<NativeAudioState>;
  seek(options: { position: number }): Promise<NativeAudioState>;
  options(options: { speed?: number; volume?: number; repeat?: number }): Promise<NativeAudioState>;
  sleep(options: { remainingMs: number; atEnd: boolean }): Promise<NativeAudioState>;
  getState(): Promise<NativeAudioState>;
  peek(): Promise<Partial<NativeAudioState>>;
  cacheStatus(options: { key: string }): Promise<{ bytes: number }>;
  cacheChunk(options: { key: string; offset: number; data: string; last: boolean }): Promise<void>;
  backgroundStatus(): Promise<{ restricted: boolean; batteryOptimized: boolean }>;
  openBackgroundSettings(): Promise<void>;
  addListener(event: 'state', listener: (state: NativeAudioState) => void): Promise<PluginListenerHandle>;
}
export const nativeTalkPlugin = nativeAudioPlugin;
export function hasNativeTalkAudio(): boolean {
  return isNativeApp() && ['android', 'ios'].includes(nativePlatform()) && Capacitor.isPluginAvailable('DharmaAudio');
}
export function nativeTalkUrl(url: string): string {
  const resolved = resolveApiUrl(url);
  const parsed = new URL(resolved, typeof document === 'undefined' ? 'https://localhost' : document.baseURI);
  if (parsed.hostname === 'localhost' && ['https:', 'capacitor:'].includes(parsed.protocol)) return `asset:///public${parsed.pathname}`;
  return parsed.href;
}

/** Copy in bounded chunks: never pass an entire lecture as base64 through the bridge. */
const cacheWrites = new Map<string, Promise<void>>();
export async function cacheNativeTalk(url: string, blob: Blob, plugin: Pick<NativeTalkPlugin, 'cacheStatus' | 'cacheChunk'> = nativeTalkPlugin, isCurrent: () => boolean = () => true, options: { replace?: boolean } = {}): Promise<void> {
  const key = nativeTalkUrl(url);
  const revision = nativeAudioPrincipalRevision();
  const assertCurrent = () => {
    if (revision !== nativeAudioPrincipalRevision() || !isCurrent()) throw new DOMException('Native audio principal changed', 'AbortError');
  };
  const previous = cacheWrites.get(key);
  const work = (previous ?? Promise.resolve()).catch(() => {}).then(async () => {
    assertCurrent(); await waitForNativeAudioPrincipal(); assertCurrent();
    await writeNativeTalk(key, blob, plugin, assertCurrent, Boolean(options.replace));
  });
  cacheWrites.set(key, work);
  try { await work; }
  finally { if (cacheWrites.get(key) === work) cacheWrites.delete(key); }
}
async function writeNativeTalk(key: string, blob: Blob, plugin: Pick<NativeTalkPlugin, 'cacheStatus' | 'cacheChunk'>, assertCurrent: () => void, replace = false): Promise<void> {
  const status = await plugin.cacheStatus({ key }); assertCurrent();
  if (!replace && status.bytes === blob.size) return;
  const size = 384 * 1024;
  for (let offset = 0; offset < blob.size; offset += size) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer());
    assertCurrent();
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await plugin.cacheChunk({ key, offset, data: btoa(binary), last: offset + size >= blob.size });
    assertCurrent();
  }
}

/** A small audio-element port so web and Android share one UI and progress pipeline. */
export class NativeTalkAudio extends EventTarget {
  src = '';
  preload = 'metadata';
  duration = 0;
  paused = true;
  error: { code: number; message: string } | null = null;
  private position = 0;
  private rate = 1;
  private loudness = 1;
  private silent = false;
  private queueId = '';
  private trackIndex = -1;
  private playing = false;
  ended = false;
  private tracks: string[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private listener: Promise<PluginListenerHandle>;
  private disposed = false;
  private latestState: NativeAudioState | undefined;
  private refreshWork: Promise<NativeAudioState | undefined> | undefined;
  private readonly foreground = () => {
    if (document.visibilityState === 'visible' && this.queueId) void this.refreshState().catch(cause => this.report(cause));
  };

  constructor(private readonly plugin: NativeTalkPlugin = nativeTalkPlugin) {
    super();
    this.listener = plugin.addListener('state', state => this.accept(state));
    // Keep registration failures for commands, but do not reject globally while idle.
    void this.listener.catch(() => undefined);
    document.addEventListener('visibilitychange', this.foreground);
  }
  private command(run: () => Promise<NativeAudioState>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const revision = nativeAudioPrincipalRevision();
    const work = this.chain.then(async () => {
      await this.listener;
      await waitForNativeAudioPrincipal();
      if (revision !== nativeAudioPrincipalRevision()) return;
      this.accept(await run());
    });
    this.chain = work.catch(() => {});
    return work;
  }
  async recover(): Promise<NativeAudioState | null> {
    await waitForNativeAudioPrincipal();
    const revision = nativeAudioPrincipalRevision();
    const state = await this.plugin.peek();
    if (revision !== nativeAudioPrincipalRevision()) return null;
    return state.queueId && state.album?.tracks?.length ? state as NativeAudioState : null;
  }
  async refreshState(): Promise<NativeAudioState | undefined> {
    if (this.refreshWork) return this.refreshWork;
    const work = (async () => {
      await this.command(() => this.plugin.getState());
      return this.latestState;
    })();
    this.refreshWork = work;
    try { return await work; }
    finally { if (this.refreshWork === work) this.refreshWork = undefined; }
  }
  adopt(state: NativeAudioState) {
    this.queueId = state.queueId;
    this.loudness = state.volume;
    this.tracks = state.album?.tracks.map(track => nativeTalkUrl(track.url)) ?? [];
    this.src = state.album?.tracks[state.trackIndex]?.url || '';
    this.trackIndex = state.trackIndex;
    this.accept(state);
  }
  private fire(type: string) { this.dispatchEvent(new Event(type)); }
  private report(cause: unknown) {
    this.error = { code: 3, message: cause instanceof Error ? cause.message : String(cause) };
    this.fire('error');
  }
  private send(run: () => Promise<NativeAudioState>) { void this.command(run).catch(cause => this.report(cause)); }
  private accept(state: NativeAudioState) {
    if (this.disposed || !this.queueId || state.queueId !== this.queueId) return;
    this.latestState = state;
    const trackChanged = state.trackIndex !== this.trackIndex;
    const durationChanged = state.duration !== this.duration;
    const wasPaused = this.paused;
    const wasPlaying = this.playing;
    const wasEnded = this.ended;
    this.ended = state.ended;
    this.trackIndex = state.trackIndex;
    this.src = this.tracks[state.trackIndex] ?? this.src;
    this.position = state.position;
    this.duration = state.duration;
    this.paused = state.ended || !state.playWhenReady;
    this.playing = state.playing && !state.ended;
    this.rate = state.speed;
    if (!state.error) this.error = null;
    if (trackChanged) this.dispatchEvent(new CustomEvent('trackchange', { detail: state.trackIndex }));
    if (trackChanged || durationChanged) this.fire('loadedmetadata');
    if (wasPaused && !this.paused) this.fire('play');
    if (!wasPaused && this.paused) this.fire('pause');
    if (!wasPlaying && state.playing) this.fire('playing');
    if (state.playWhenReady && !state.playing && !state.ended) this.fire('waiting');
    this.dispatchEvent(new CustomEvent('nativesleep', { detail: state }));
    this.fire('timeupdate');
    if (state.error && state.error !== this.error?.message) this.report(state.error);
    if (state.ended && !wasEnded) this.fire('ended');
  }
  async setQueue(album: AudioAlbum, index: number, position: number): Promise<void> {
    const artwork = album.artwork?.split('#pos=')[0]?.trim();
    this.queueId = `${album.id}:${Date.now()}:${Math.random()}`;
    const queueId = this.queueId;
    this.trackIndex = index;
    this.tracks = album.tracks.map(track => nativeTalkUrl(track.url));
    this.src = nativeTalkUrl(album.tracks[index].url);
    this.position = position;
    this.duration = 0;
    this.error = null;
    this.ended = false;
    await this.command(() => this.plugin.setQueue({
      queueId, albumId: album.id,
      tracks: album.tracks.map(track => ({ ...track, url: nativeTalkUrl(track.url) })),
      album: album.title, artist: album.description || 'Tu tập',
      artwork: artwork ? nativeTalkUrl(artwork) : '',
      originalArtwork: album.artwork || '',
      index, position,
    }));
  }
  get currentTime() { return this.position; }
  get isPracticePlayback() { return [MEDITATION_AUDIO_ALBUM_ID, ROSARY_AUDIO_ALBUM_ID].some(id => this.queueId.startsWith(`${id}:`)); }
  set currentTime(position: number) { this.position = position; this.send(() => this.plugin.seek({ position })); }
  get playbackRate() { return this.rate; }
  set playbackRate(speed: number) { this.rate = speed; if (this.queueId) this.send(() => this.plugin.options({ speed })); }
  get volume() { return this.loudness; }
  set volume(volume: number) { this.loudness = volume; if (this.queueId) this.send(() => this.plugin.options({ volume: this.silent ? 0 : volume })); }
  get muted() { return this.silent; }
  set muted(muted: boolean) { this.silent = muted; if (this.queueId) this.send(() => this.plugin.options({ volume: muted ? 0 : this.loudness })); }
  async play() { await this.command(() => this.plugin.play()); }
  pause() { if (this.queueId) this.send(() => this.plugin.pause()); }
  setRepeat(repeat: number) { if (this.queueId) this.send(() => this.plugin.options({ repeat })); }
  setSleep(remainingMs: number, atEnd: boolean) { if (this.queueId) this.send(() => this.plugin.sleep({ remainingMs, atEnd })); }
  removeAttribute(name: string) {
    if (name !== 'src') return;
    this.src = ''; this.queueId = ''; this.position = 0; this.duration = 0; this.paused = true;
    this.send(() => this.plugin.stop());
  }
  load() { /* MediaController prepares the playlist in setQueue. */ }
  dispose() {
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.foreground);
    void this.listener.then(listener => listener.remove()).catch(() => {
      // The bridge may already be closed; teardown must not reject globally.
    });
  }
}
