import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fullscreen: vi.fn(), hide: vi.fn(), show: vi.fn(),
  native: true, platform: 'android',
}));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ setFullscreen: mocks.fullscreen }) }));
vi.mock('../../src/lib/browser/native-platform', () => ({
  isNativeApp: () => mocks.native, nativePlatform: () => mocks.platform,
}));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { hide: mocks.hide, show: mocks.show } }));
import { setImmersiveFullscreen } from '../../src/lib/browser/native-fullscreen';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.native = true; mocks.platform = 'android'; });

it('hides and restores Android status bars through the installed system bar owner', async () => {
  await expect(setImmersiveFullscreen(true)).resolves.toBe(true);
  await expect(setImmersiveFullscreen(false)).resolves.toBe(false);
  expect(mocks.fullscreen.mock.calls).toEqual([[{ enabled: true }], [{ enabled: false }]]);
  expect(mocks.hide).not.toHaveBeenCalled();
  expect(mocks.show).not.toHaveBeenCalled();
});

it('restores bars after a pending enter finishes, including teardown during entry', async () => {
  let finish!: () => void;
  mocks.fullscreen.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const enter = setImmersiveFullscreen(true);
  await vi.waitFor(() => expect(mocks.fullscreen).toHaveBeenCalledTimes(1));
  const leave = setImmersiveFullscreen(false);
  await Promise.resolve();
  expect(mocks.fullscreen).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([enter, leave]);
  expect(mocks.fullscreen.mock.calls).toEqual([[{ enabled: true }], [{ enabled: false }]]);
});

it('preserves iOS status bar hide and restore', async () => {
  mocks.platform = 'ios';
  await setImmersiveFullscreen(true);
  await setImmersiveFullscreen(false);
  expect(mocks.hide).toHaveBeenCalledTimes(1);
  expect(mocks.show).toHaveBeenCalledTimes(1);
  expect(mocks.fullscreen).not.toHaveBeenCalled();
});

it('keeps exit available after a rejected bridge operation', async () => {
  mocks.fullscreen.mockRejectedValueOnce(new Error('Bridge unavailable'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(setImmersiveFullscreen(true)).resolves.toBe(true);
    await expect(setImmersiveFullscreen(false)).resolves.toBe(false);
    expect(mocks.fullscreen).toHaveBeenCalledTimes(2);
  } finally { warning.mockRestore(); }
});

it('preserves browser fullscreen and its CSS fallback without native calls', async () => {
  mocks.native = false; mocks.platform = 'web';
  const requestFullscreen = vi.fn().mockResolvedValue(undefined);
  const exitFullscreen = vi.fn().mockResolvedValue(undefined);
  const element = { requestFullscreen } as unknown as HTMLElement;
  vi.stubGlobal('document', { documentElement: element, fullscreenElement: element, exitFullscreen });
  await expect(setImmersiveFullscreen(true, element)).resolves.toBe(true);
  expect(requestFullscreen).toHaveBeenCalledTimes(1);
  await expect(setImmersiveFullscreen(false)).resolves.toBe(false);
  expect(exitFullscreen).toHaveBeenCalledTimes(1);
  requestFullscreen.mockRejectedValueOnce(new Error('Not supported'));
  await expect(setImmersiveFullscreen(true, element)).resolves.toBe(true);
  expect(mocks.fullscreen).not.toHaveBeenCalled();
  expect(mocks.hide).not.toHaveBeenCalled();
});
