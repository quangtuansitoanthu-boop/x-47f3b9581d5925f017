import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => false, nativePlatform: () => 'web' }));
import { showUnifiedNotification } from '$lib/browser/native-notifications';

const show = vi.fn();
const getRegistration = vi.fn();
const construct = vi.fn(function (_title: string, _options: NotificationOptions) {});
beforeEach(() => {
  vi.clearAllMocks();
  show.mockResolvedValue(undefined);
  vi.stubGlobal('Notification', construct);
  vi.stubGlobal('navigator', { serviceWorker: {
    getRegistration,
    // Không có worker hoạt động thì ready có thể chờ vô hạn.
    ready: new Promise(() => {}),
  } });
});
afterEach(() => vi.unstubAllGlobals());

it.each([undefined, { active: null }])('falls back without waiting forever when no active service worker exists (%s)', async registration => {
  getRegistration.mockResolvedValue(registration);
  const pending = showUnifiedNotification('Reminder', 'Practice');
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(construct).toHaveBeenCalledExactlyOnceWith('Reminder', expect.objectContaining({ body: 'Practice' }));
  await pending;
});

it('uses the active service worker for mobile-browser notification compatibility', async () => {
  getRegistration.mockResolvedValue({ active: {}, showNotification: show });
  const pending = showUnifiedNotification('Reminder', 'Practice');
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(show).toHaveBeenCalledExactlyOnceWith('Reminder', expect.objectContaining({ body: 'Practice' }));
  expect(construct).not.toHaveBeenCalled();
  await pending;
});

it.each(['lookup', 'delivery'])('retains constructor fallback when service worker %s fails', async failure => {
  getRegistration.mockResolvedValue({ active: {}, showNotification: show });
  if (failure === 'lookup') getRegistration.mockRejectedValue(new Error('unavailable'));
  else show.mockRejectedValue(new Error('unavailable'));
  const pending = showUnifiedNotification('Reminder', 'Practice');
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(construct).toHaveBeenCalledOnce();
  await pending;
});
