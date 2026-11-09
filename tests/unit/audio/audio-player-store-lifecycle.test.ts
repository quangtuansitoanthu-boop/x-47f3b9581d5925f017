import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ subscribe: vi.fn(() => vi.fn()) }));
vi.mock('$lib/browser/audio-sync', () => ({ selectAudioSyncPrincipal: vi.fn() }));
vi.mock('$lib/browser/audio-player-controller', () => ({
  AudioPlayerController: class {
    subscribe = state.subscribe;
    setSession = vi.fn();
  },
}));
afterEach(() => vi.unstubAllGlobals());

it('does not attach a player listener after the last store subscriber has left during initialization', async () => {
  vi.resetModules();
  vi.stubGlobal('window', {});
  const { audioPlayer, getAudioPlayer } = await import('$lib/stores/audio-player.svelte');
  const unsubscribe = audioPlayer.subscribe(() => {});
  unsubscribe();
  await getAudioPlayer();
  await Promise.resolve();
  expect(state.subscribe).not.toHaveBeenCalled();
});
