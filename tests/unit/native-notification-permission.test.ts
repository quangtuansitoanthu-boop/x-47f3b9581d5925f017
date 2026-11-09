import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ native: true, request: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => bridge.native, nativePlatform: () => 'ios' }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { requestPermissions: bridge.request } }));
import { requestUnifiedNotificationPermission } from '$lib/browser/native-notifications';

beforeEach(() => { bridge.native = true; bridge.request.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

it('shares one native authorization request across concurrent reminder entry points', async () => {
  let finish!: (value: { display: string }) => void;
  bridge.request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = requestUnifiedNotificationPermission();
  const second = requestUnifiedNotificationPermission();
  await vi.waitFor(() => expect(bridge.request).toHaveBeenCalled());
  const calls = bridge.request.mock.calls.length;
  finish({ display: 'granted' });
  await expect(Promise.all([first, second])).resolves.toEqual(['granted', 'granted']);
  expect(calls).toBe(1);
});

it('allows a retry after a native bridge failure instead of caching unsupported forever', async () => {
  bridge.request.mockRejectedValueOnce(new Error('bridge unavailable')).mockResolvedValueOnce({ display: 'granted' });
  await expect(requestUnifiedNotificationPermission()).resolves.toBe('unsupported');
  await expect(requestUnifiedNotificationPermission()).resolves.toBe('granted');
});

it('keeps browser authorization on its existing browser API', async () => {
  bridge.native = false;
  const requestPermission = vi.fn(async () => 'denied');
  vi.stubGlobal('window', { Notification: {} });
  vi.stubGlobal('Notification', { requestPermission });
  await expect(requestUnifiedNotificationPermission()).resolves.toBe('denied');
  expect(requestPermission).toHaveBeenCalledOnce();
  expect(bridge.request).not.toHaveBeenCalled();
});
