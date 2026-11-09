import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/browser/native-platform', () => ({ nativePlatform: () => 'android' }));
vi.mock('$lib/utils/haptics', () => ({ triggerHaptic: mocks.haptic }));
vi.mock('$lib/browser/personal-lunar-events', () => ({ loadPersonalLunarEvents: () => [], isPersonalEventsNotificationEnabled: () => true, getPersonalEventsForDate: () => [] }));
const mocks = vi.hoisted(() => ({ replace: vi.fn(), cancel: vi.fn(), permission: vi.fn(), pending: vi.fn(), requestPermission: vi.fn(), testNotification: vi.fn(), show: vi.fn(), haptic: vi.fn() }));
vi.mock('$lib/browser/durable-reminders', () => ({ replaceDurableReminderPlan: mocks.replace, clearDurablePersonalReminders: vi.fn(), sendDurableTestNotification: mocks.testNotification }));
vi.mock('$lib/browser/native-notifications', () => ({ getPendingReminderNotifications: mocks.pending, cancelUnifiedNotifications: mocks.cancel, clearDeliveredPersonalReminderNotifications: vi.fn().mockResolvedValue(undefined), getUnifiedNotificationPermission: mocks.permission, requestUnifiedNotificationPermission: mocks.requestPermission, showUnifiedNotification: mocks.show }));
import { syncRemindersWithSystem, sendTestNotification, DEFAULT_PRACTICE_REMINDER_SETTINGS, STORAGE_KEY_PRACTICE_REMINDERS } from '$lib/browser/practice-reminder-service';
beforeEach(() => { vi.clearAllMocks(); mocks.pending.mockResolvedValue([{ id: 123 }]); mocks.permission.mockResolvedValue('granted'); mocks.replace.mockResolvedValue({ ruleCount: 99 }); mocks.requestPermission.mockResolvedValue('granted'); mocks.testNotification.mockResolvedValue({ shown: true }); mocks.show.mockResolvedValue(undefined); });
it('snapshots reactive settings from the Svelte editor without a DataCloneError', async () => {
  const settings = new Proxy(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), {});
  expect((await syncRemindersWithSystem(settings)).success).toBe(true);
  expect(mocks.replace).toHaveBeenCalledOnce();
});
it('persists the background plan even when reading legacy notifications fails', async () => {
  mocks.pending.mockRejectedValue(new Error('legacy preferences unreadable'));
  await expect(syncRemindersWithSystem(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS))).rejects.toThrow('legacy preferences unreadable');
  expect(mocks.replace).toHaveBeenCalledOnce();
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it('keeps the old alarms when the durable write fails', async () => {
  mocks.replace.mockRejectedValue(new Error('disk full'));
  await expect(syncRemindersWithSystem(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS))).rejects.toThrow('disk full');
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it('migrates legacy alarms only after the durable rules are acknowledged', async () => {
  expect(await syncRemindersWithSystem(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS))).toMatchObject({ success: true, scheduledCount: 99, details: { mode: 'android-durable', ruleCount: 99, reason: null } });
  expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(mocks.cancel.mock.invocationCallOrder[0]);
  expect(mocks.cancel).toHaveBeenCalledWith([123], true);
});
it('persists rules while denied without claiming notification delivery', async () => {
  mocks.permission.mockResolvedValue('denied');
  expect((await syncRemindersWithSystem(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS))).success).toBe(false);
  expect(mocks.replace).toHaveBeenCalledOnce();
});
it('refreshes background rules without prompting for permission', async () => {
  mocks.permission.mockResolvedValue('prompt');
  expect((await syncRemindersWithSystem()).success).toBe(false);
  expect(mocks.requestPermission).not.toHaveBeenCalled();
  expect(mocks.replace).toHaveBeenCalledOnce();
});
it('requests permission when the user saves enabled reminder settings', async () => {
  mocks.permission.mockResolvedValue('prompt');
  expect((await syncRemindersWithSystem(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS))).success).toBe(true);
  expect(mocks.requestPermission).toHaveBeenCalledOnce();
});

it.each([[false, false], [false, true], [true, false], [true, true]])(
  'tests Android sound=%s and vibration=%s through the durable delivery channel without replacing saved rules',
  async (sound, vibrate) => {
    const settings = { ...structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), soundEnabled: sound, vibrateEnabled: vibrate };
    const raw = JSON.stringify(settings);
    const storage = { getItem: vi.fn((key: string) => key === STORAGE_KEY_PRACTICE_REMINDERS ? raw : null), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    try {
      expect(await sendTestNotification('en')).toBe(true);
      expect(mocks.testNotification).toHaveBeenCalledExactlyOnceWith({
        title: '🔔 Tu Tap Test Notification',
        body: 'Practice reminder is active! Notifications for Shou Kang Bao Jian, Fasting Days, and daily sessions are set.',
        sound,
        vibrate,
      });
      expect(mocks.show).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.pending).not.toHaveBeenCalled();
      expect(mocks.cancel).not.toHaveBeenCalled();
      expect(mocks.haptic).toHaveBeenCalledTimes(vibrate ? 1 : 0);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.getItem(STORAGE_KEY_PRACTICE_REMINDERS)).toBe(raw);
    } finally { vi.unstubAllGlobals(); }
  },
);

it('does not claim an Android test notification was shown if native delivery was refused', async () => {
  mocks.testNotification.mockResolvedValue({ shown: false });
  expect(await sendTestNotification('en')).toBe(false);
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.cancel).not.toHaveBeenCalled();
});
