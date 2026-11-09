import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const barrier = vi.hoisted(() => ({ wait: vi.fn(async () => undefined), revision: vi.fn(() => 1) }));
vi.mock('$lib/browser/native-audio-principal', () => ({
  nativeAudioPlugin: {},
  waitForNativeAudioPrincipal: barrier.wait,
  nativeAudioPrincipalRevision: barrier.revision,
}));

import { NativeTalkAudio, cacheNativeTalk, type NativeAudioState, type NativeTalkPlugin } from '$lib/browser/native-talk-audio';

const state: NativeAudioState = {
  queueId: 'talk-a', trackIndex: 0, position: 12, duration: 45,
  playing: false, playWhenReady: false, buffering: false, ended: false,
  speed: 1, volume: 1, error: '', sleepRemainingMs: 0, sleepAtEnd: false,
  album: { id: 'talk-a', title: 'Talk A', description: '', tracks: [{ title: 'Part 1', url: 'https://media.quangtu.vn/part.mp3' }] },
};
const returnsState = () => vi.fn(async () => state);
let plugin: NativeTalkPlugin;

beforeEach(() => {
  vi.clearAllMocks();
  barrier.wait.mockResolvedValue(undefined);
  barrier.revision.mockReturnValue(1);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible', baseURI: 'https://localhost' }));
  plugin = {
    selectPrincipal: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
    peek: returnsState(), getState: returnsState(), setQueue: returnsState(),
    play: returnsState(), pause: returnsState(), stop: returnsState(), seek: returnsState(),
    options: returnsState(), sleep: returnsState(),
    cacheStatus: vi.fn(async () => ({ bytes: 0 })), cacheChunk: vi.fn(async () => undefined),
    backgroundStatus: vi.fn(async () => ({ restricted: false, batteryOptimized: false })),
    openBackgroundSettings: vi.fn(async () => undefined),
  };
});
afterEach(() => vi.unstubAllGlobals());

it('does not peek or recover widget audio before native principal validation completes', async () => {
  let finish: () => void = () => undefined;
  barrier.wait.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const audio = new NativeTalkAudio(plugin);
  const pending = audio.recover();
  await Promise.resolve();
  expect(plugin.peek).not.toHaveBeenCalled();
  finish();
  expect(await pending).toEqual(state);
  audio.dispose();
});

it('discards a late peek response after another principal is selected', async () => {
  let complete: (value: NativeAudioState) => void = () => undefined;
  vi.mocked(plugin.peek).mockReturnValue(new Promise<NativeAudioState>((resolve) => { complete = resolve; }));
  const audio = new NativeTalkAudio(plugin);
  const pending = audio.recover();
  await vi.waitFor(() => expect(plugin.peek).toHaveBeenCalledOnce());
  barrier.revision.mockReturnValue(2);
  complete(state);
  expect(await pending).toBeNull();
  audio.dispose();
});

it('does not replay an old queued command after the principal generation changes', async () => {
  let finish: () => void = () => undefined;
  barrier.wait.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const audio = new NativeTalkAudio(plugin);
  const pending = audio.play();
  await vi.waitFor(() => expect(barrier.wait).toHaveBeenCalled());
  barrier.revision.mockReturnValue(2);
  finish();
  await pending;
  expect(plugin.play).not.toHaveBeenCalled();
  audio.dispose();
});

it('does not migrate offline bytes after the selected principal changes during native cache inspection', async () => {
  let complete!: (status: { bytes: number }) => void;
  vi.mocked(plugin.cacheStatus).mockReturnValue(new Promise(resolve => { complete = resolve; }));
  const pending = cacheNativeTalk('https://media.quangtu.vn/private-cache.mp3', new Blob(['private bytes']), plugin);
  await vi.waitFor(() => expect(plugin.cacheStatus).toHaveBeenCalledOnce());
  barrier.revision.mockReturnValue(2);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  complete({ bytes: 0 });
  await rejected;
  expect(plugin.cacheChunk).not.toHaveBeenCalled();
});
