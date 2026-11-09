import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  check: vi.fn(),
  request: vi.fn(),
}));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: mocks.native, nativePlatform: mocks.platform }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {
  checkExactNotificationSetting: mocks.check,
  changeExactNotificationSetting: mocks.request,
} }));

const marker = 'tt_exact_alarm_startup_requested_v1';
let saved: Map<string, string>;
let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const load = async () => (await import('../../src/lib/browser/native-notifications')).requestStartupExactReminderPermission;

beforeEach(() => {
  vi.resetModules();
  mocks.native.mockReset().mockReturnValue(true);
  mocks.platform.mockReset().mockReturnValue('android');
  mocks.check.mockReset().mockResolvedValue({ exact_alarm: 'denied' });
  mocks.request.mockReset().mockResolvedValue({ exact_alarm: 'denied' });
  saved = new Map();
  storage = {
    getItem: vi.fn((key: string) => saved.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }),
    removeItem: vi.fn((key: string) => { saved.delete(key); }),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

it('records the launch request before opening settings and does not reopen after refusal or a later launch', async () => {
  mocks.request.mockImplementation(async () => {
    expect(saved.has(marker)).toBe(true);
    return { exact_alarm: 'denied' };
  });
  const request = await load();
  await request();
  await request();
  vi.resetModules();
  await (await load())();
  expect(mocks.request).toHaveBeenCalledOnce();
});

it('does not open settings when exact access is already granted', async () => {
  mocks.check.mockResolvedValue({ exact_alarm: 'granted' });
  await (await load())();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('keeps startup usable if the permission check is unavailable', async () => {
  mocks.check.mockRejectedValue(new Error('unsupported'));
  await expect((await load())()).resolves.toBeUndefined();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('does not open settings repeatedly when the launch marker cannot be persisted', async () => {
  const unavailable = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
    removeItem() { throw new Error('storage unavailable'); },
  };
  vi.stubGlobal('localStorage', unavailable);
  vi.stubGlobal('window', { localStorage: unavailable });
  const request = await load();
  await expect(request()).resolves.toBeUndefined();
  await expect(request()).resolves.toBeUndefined();
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each(['ios', 'web'])('does not request Android special access on %s', async platform => {
  mocks.platform.mockReturnValue(platform);
  mocks.native.mockReturnValue(platform !== 'web');
  await (await load())();
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('coalesces concurrent startup calls into one settings launch', async () => {
  let finish: (value: { exact_alarm: string }) => void = () => {};
  mocks.check.mockImplementation(() => new Promise<{ exact_alarm: string }>(resolve => { finish = resolve; }));
  const request = await load();
  const first = request();
  const second = request();
  await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
  finish({ exact_alarm: 'denied' });
  await Promise.all([first, second]);
  expect(mocks.request).toHaveBeenCalledOnce();
});

it('does not open settings if startup is disposed while checking the permission', async () => {
  let active = true;
  let finish: (value: { exact_alarm: string }) => void = () => {};
  mocks.check.mockImplementation(() => new Promise<{ exact_alarm: string }>(resolve => { finish = resolve; }));
  const pending = (await load())(() => active);
  await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
  active = false;
  finish({ exact_alarm: 'denied' });
  await pending;
  expect(saved.has(marker)).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
});

it('does not persist a failed settings launch as a refusal and allows a later launch to retry', async () => {
  mocks.request.mockRejectedValueOnce(new Error('activity unavailable'));
  await expect((await load())()).resolves.toBeUndefined();
  expect(saved.has(marker)).toBe(false);
  vi.resetModules();
  await (await load())();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(saved.has(marker)).toBe(true);
});
