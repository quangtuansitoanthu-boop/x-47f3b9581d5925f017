import { afterEach, describe, expect, it, vi } from 'vitest';
const nativeSounds = vi.hoisted(() => ({ enabled: false, play: vi.fn() }));
vi.mock('../../src/lib/browser/practice-sound-native', () => ({
  hasNativePracticeSounds: () => nativeSounds.enabled,
  playNativePracticeSound: nativeSounds.play,
}));
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { downloadAudioTrack, clearAllPracticeAudioCache } from '../../src/lib/browser/practice-audio-cache';
import {
  AMBIENT_SOUND_OPTIONS,
  AMBIENT_SOUND_TRACKS,
  createAmbientSoundController,
  getAmbientSoundLabel,
  getAmbientSoundOption
} from '../../src/lib/browser/ambient-sound';

describe('ambient-sound engine', () => {
  afterEach(() => { nativeSounds.enabled = false; vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('keeps heavy rain on Android native output across pause/resume without WebView focus requests', () => {
    nativeSounds.enabled = true;
    const audio = vi.fn();
    vi.stubGlobal('Audio', audio);
    const controller = createAmbientSoundController(() => true);
    controller.start('heavy_rain');
    controller.start('heavy_rain');
    expect(nativeSounds.play).toHaveBeenCalledTimes(1);
    controller.stop();
    controller.start('heavy_rain');
    expect(nativeSounds.play.mock.calls.map(call => call[0])).toEqual([
      { channel: 'ambient', source: AMBIENT_SOUND_TRACKS.heavy_rain, volume: 0.5 },
      { channel: 'ambient', stop: true },
      { channel: 'ambient', source: AMBIENT_SOUND_TRACKS.heavy_rain, volume: 0.5 },
    ]);
    expect(audio).not.toHaveBeenCalled();
    controller.destroy();
    expect(nativeSounds.play).toHaveBeenLastCalledWith({ channel: 'ambient', stop: true });
  });

  it('cleans the native bowl interval and pending sounds when paused or destroyed', () => {
    vi.useFakeTimers();
    nativeSounds.enabled = true;
    const controller = createAmbientSoundController(() => true);
    controller.start('bowl');
    vi.advanceTimersByTime(90_000);
    expect(nativeSounds.play).toHaveBeenCalledTimes(2);
    controller.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(nativeSounds.play).toHaveBeenLastCalledWith({ channel: 'ambient', stop: true });
    controller.destroy();
    vi.advanceTimersByTime(90_000);
    expect(nativeSounds.play).toHaveBeenCalledTimes(3);
  });

  it('passes the bundled ambient path to Android even after a WebView download', async () => {
    nativeSounds.enabled = true;
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }), delete: async () => true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('audio', { headers: { 'content-type': 'audio/mpeg' } })));
    await downloadAudioTrack(AMBIENT_SOUND_TRACKS.heavy_rain!);
    const controller = createAmbientSoundController(() => true);
    try {
      controller.start('heavy_rain');
      expect(nativeSounds.play).toHaveBeenCalledWith({ channel: 'ambient', source: AMBIENT_SOUND_TRACKS.heavy_rain, volume: 0.5 });
    } finally {
      controller.destroy();
      await clearAllPracticeAudioCache();
    }
  });
  it('exposes standard ambient sound options with icons and labels', () => {
    expect(AMBIENT_SOUND_OPTIONS.length).toBe(8);
    const ids = AMBIENT_SOUND_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      'none',
      'rain',
      'white_noise',
      'stream',
      'heavy_rain',
      'light_rain',
      'thunder_rain',
      'bowl'
    ]);

    const rainOption = getAmbientSoundOption('rain');
    expect(rainOption?.label).toBe('Tiếng Mưa Rơi');

    const whiteNoiseOption = getAmbientSoundOption('white_noise');
    expect(whiteNoiseOption?.label).toBe('Tiếng Ồn Trắng');

    const streamOption = getAmbientSoundOption('stream');
    expect(streamOption?.label).toBe('Tiếng nước Chảy');

    const heavyRainOption = getAmbientSoundOption('heavy_rain');
    expect(heavyRainOption?.label).toBe('Tiếng Trời Mưa Lớn');

    const lightRainOption = getAmbientSoundOption('light_rain');
    expect(lightRainOption?.label).toBe('Âm thanh tiếng trời Mưa nhẹ');

    const thunderRainOption = getAmbientSoundOption('thunder_rain');
    expect(thunderRainOption?.label).toBe('Âm thanh Mưa Gió và Sấm Sét');
  });

  it('ensures all realistic ambient sound track files exist on disk', () => {
    const trackEntries = Object.entries(AMBIENT_SOUND_TRACKS);
    expect(trackEntries.length).toBe(6);

    for (const [, trackPath] of trackEntries) {
      expect(trackPath).toBeDefined();
      if (!trackPath) continue;
      expect(trackPath.startsWith('/assets/audio/ambient/')).toBe(true);
      // Strip leading '/' and check existence in root assets directory
      const relativePath = trackPath.replace(/^\//, '');
      const fullPath = resolve(process.cwd(), relativePath);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  it('formats ambient sound labels correctly', () => {
    expect(getAmbientSoundLabel('none')).toBe('');
    expect(getAmbientSoundLabel('rain')).toBe('🌧️ Tiếng Mưa Rơi');
    expect(getAmbientSoundLabel('white_noise')).toBe('📻 Tiếng Ồn Trắng');
    expect(getAmbientSoundLabel('stream')).toBe('🌊 Tiếng nước Chảy');
    expect(getAmbientSoundLabel('heavy_rain')).toBe('⛈️ Tiếng Trời Mưa Lớn');
    expect(getAmbientSoundLabel('light_rain')).toBe('🌦️ Âm thanh tiếng trời Mưa nhẹ');
    expect(getAmbientSoundLabel('thunder_rain')).toBe('🌩️ Âm thanh Mưa Gió và Sấm Sét');
    expect(getAmbientSoundLabel('bowl')).toBe('🧘 Chuông bát Tây Tạng');
  });

  it('initializes and handles start/stop/setVolume safely without browser crash', () => {
    const controller = createAmbientSoundController();
    expect(typeof controller.start).toBe('function');
    expect(typeof controller.stop).toBe('function');
    expect(typeof controller.setVolume).toBe('function');
    expect(typeof controller.destroy).toBe('function');

    // Safe execution even when Audio/AudioContext might not be supported in test env
    controller.start('rain');
    controller.setVolume(0.8);
    controller.stop();
    controller.start('bowl');
    controller.stop();
    controller.destroy();
  });
});
