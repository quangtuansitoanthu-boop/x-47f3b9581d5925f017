import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ platform: vi.fn(() => 'android'), show: vi.fn(), storage: { getItem: vi.fn(() => null), setItem: vi.fn() } }));
vi.mock('$lib/browser/native-platform', () => ({ nativePlatform: mocks.platform }));
vi.mock('$lib/browser/native-notifications', () => ({ getUnifiedNotificationPermission: async () => 'granted', showUnifiedNotification: mocks.show }));
import { triggerBrowserLunarNotification } from '$lib/browser/lunar-notifications';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const event = { isEvent: true, isThapTrai: true, viaName: '', kiengDam: null, lunarDay: 8, lunarMonth: 7 };
it('leaves Android lunar delivery to the persisted scheduler instead of notifying again on app launch', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('localStorage', mocks.storage);
  expect(await triggerBrowserLunarNotification(event, '2026-08-02')).toBe(false);
  expect(mocks.show).not.toHaveBeenCalled();
  expect(mocks.storage.setItem).not.toHaveBeenCalled();
});
it('leaves iOS lunar delivery to its scheduled reminders without bypassing disabled reminder settings on launch', async () => {
  mocks.platform.mockReturnValueOnce('ios');
  vi.stubGlobal('window', {}); vi.stubGlobal('localStorage', mocks.storage);
  expect(await triggerBrowserLunarNotification(event, '2026-08-02')).toBe(false);
  expect(mocks.show).not.toHaveBeenCalled();
  expect(mocks.storage.setItem).not.toHaveBeenCalled();
});
it('keeps foreground reminders on the web', async () => {
  mocks.platform.mockReturnValueOnce('web');
  vi.stubGlobal('window', {}); vi.stubGlobal('localStorage', mocks.storage);
  expect(await triggerBrowserLunarNotification(event, '2026-08-02')).toBe(true);
  expect(mocks.show).toHaveBeenCalledOnce();
});
