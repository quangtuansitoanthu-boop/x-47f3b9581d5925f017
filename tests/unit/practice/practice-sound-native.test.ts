import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ platform: 'android', available: true, play: vi.fn(async () => {}) }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => native.available },
  registerPlugin: () => ({ practiceSound: native.play }),
}));
vi.mock('../../../src/lib/browser/native-platform', () => ({
  isNativeApp: () => native.platform !== 'web', nativePlatform: () => native.platform,
}));
import { hasNativePracticeSounds, playNativePracticeSound } from '../../../src/lib/browser/practice-sound-native';

afterEach(() => { native.platform = 'android'; native.available = true; vi.restoreAllMocks(); native.play.mockReset(); });

describe('Android practice sound bridge', () => {
  it.each(['web', 'ios'])('preserves the existing %s output', platform => {
    native.platform = platform;
    expect(hasNativePracticeSounds()).toBe(false);
  });
  it('requires the installed native audio plugin', () => {
    expect(hasNativePracticeSounds()).toBe(true);
    native.available = false;
    expect(hasNativePracticeSounds()).toBe(false);
  });
  it('handles an unavailable method without starting a competing WebView output', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    native.play.mockRejectedValueOnce(new Error('not implemented'));
    playNativePracticeSound({ channel: 'cue', cue: 'bell' });
    await Promise.resolve();
    expect(warning).toHaveBeenCalledOnce();
    expect(native.play).toHaveBeenCalledOnce();
  });
});
