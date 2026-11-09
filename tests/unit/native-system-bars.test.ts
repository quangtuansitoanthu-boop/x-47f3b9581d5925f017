import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setStyle: vi.fn(), iosStyle: vi.fn(), iosBackground: vi.fn(),
  native: false, platform: 'web',
}));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ setStyle: mocks.setStyle }) }));
vi.mock('../../src/lib/browser/native-platform', () => ({
  isNativeApp: () => mocks.native, nativePlatform: () => mocks.platform,
}));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: mocks.iosStyle, setBackgroundColor: mocks.iosBackground },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));
import { overrideNativeSystemBars, syncNativeSystemBars } from '../../src/lib/browser/native-system-bars';

afterEach(() => { vi.clearAllMocks(); mocks.native = false; mocks.platform = 'web'; });

it.each([true, false])('uses the Android inset owner for dark=%s without legacy StatusBar calls', async (dark) => {
  mocks.native = true; mocks.platform = 'android';
  await syncNativeSystemBars(dark, '#15120d');
  expect(mocks.setStyle).toHaveBeenCalledExactlyOnceWith({ dark, backgroundColor: '#15120d' });
  expect(mocks.iosStyle).not.toHaveBeenCalled();
  expect(mocks.iosBackground).not.toHaveBeenCalled();
});

it('preserves iOS style and background updates', async () => {
  mocks.native = true; mocks.platform = 'ios';
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.iosStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
  expect(mocks.iosBackground).toHaveBeenCalledWith({ color: '#FAF1E4' });
  expect(mocks.setStyle).not.toHaveBeenCalled();
});

it('does not call native plugins on web', async () => {
  await syncNativeSystemBars(true, '#15120d');
  expect(mocks.setStyle).not.toHaveBeenCalled();
  expect(mocks.iosStyle).not.toHaveBeenCalled();
});

it('keeps theme usable if the Android bridge rejects a call', async () => {
  mocks.native = true; mocks.platform = 'android';
  mocks.setStyle.mockRejectedValueOnce(new Error('Bridge unavailable'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(syncNativeSystemBars(true, '#15120d')).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});

it('keeps light status text on a dark modal when the app theme changes, then restores the latest theme', async () => {
  mocks.native = true; mocks.platform = 'ios';
  await syncNativeSystemBars(false, '#FAF1E4');
  const restore = overrideNativeSystemBars(true, '#171320');
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.iosStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
  expect(mocks.iosBackground).toHaveBeenLastCalledWith({ color: '#171320' });
  restore();
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.iosStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
  expect(mocks.iosBackground).toHaveBeenLastCalledWith({ color: '#FAF1E4' });
});

it('restores Android system bars after a modal closes before an earlier bridge update completes', async () => {
  mocks.native = true; mocks.platform = 'android';
  let finish!: () => void;
  mocks.setStyle.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const initial = syncNativeSystemBars(false, '#FAF1E4');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const restore = overrideNativeSystemBars(true, '#171320');
  restore();
  finish();
  await initial;
  await syncNativeSystemBars(false, '#FAF1E4');
  expect(mocks.setStyle.mock.calls.map(([appearance]) => appearance)).toEqual([
    { dark: false, backgroundColor: '#FAF1E4' },
    { dark: true, backgroundColor: '#171320' },
    { dark: false, backgroundColor: '#FAF1E4' },
    { dark: false, backgroundColor: '#FAF1E4' },
  ]);
});

it('does not retain native modal overrides in the web runtime', async () => {
  const restore = overrideNativeSystemBars(true, '#171320');
  restore();
  expect(mocks.iosStyle).not.toHaveBeenCalled();
  expect(mocks.setStyle).not.toHaveBeenCalled();
});
