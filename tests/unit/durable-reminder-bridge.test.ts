import { beforeEach, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ platform: 'android', testNotification: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ nativePlatform: () => bridge.platform }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ testNotification: bridge.testNotification }) }));
import { sendDurableTestNotification } from '$lib/browser/durable-reminders';

const options = { title: 'Test', body: 'Reminder', sound: false, vibrate: false };
beforeEach(() => {
  vi.clearAllMocks();
  bridge.platform = 'android';
  bridge.testNotification.mockResolvedValue({ shown: true });
});

it('passes both notification modes to the installed Android bridge', async () => {
  expect(await sendDurableTestNotification(options)).toEqual({ shown: true });
  expect(bridge.testNotification).toHaveBeenCalledExactlyOnceWith(options);
});

it.each(['web', 'ios'])('does not call the Android-only test method on %s', async platform => {
  bridge.platform = platform;
  expect(await sendDurableTestNotification(options)).toEqual({ shown: false });
  expect(bridge.testNotification).not.toHaveBeenCalled();
});

it('handles an older installed native binary without claiming successful delivery', async () => {
  bridge.testNotification.mockRejectedValue(new Error('testNotification is not implemented'));
  expect(await sendDurableTestNotification(options)).toEqual({ shown: false });
});

it('only reports delivery when the native response explicitly acknowledges it', async () => {
  bridge.testNotification.mockResolvedValue({});
  expect(await sendDurableTestNotification(options)).toEqual({ shown: false });
});
