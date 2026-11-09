import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listener: vi.fn(), pending: vi.fn(), cancel: vi.fn(), delivered: vi.fn(), removeDelivered: vi.fn(), platform: vi.fn(() => 'android'), checkExact: vi.fn(), changeExact: vi.fn(), schedule: vi.fn(), channel: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: mocks.platform }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { addListener: mocks.listener, getPending: mocks.pending, cancel: mocks.cancel, getDeliveredNotifications: mocks.delivered, removeDeliveredNotifications: mocks.removeDelivered, checkExactNotificationSetting: mocks.checkExact, changeExactNotificationSetting: mocks.changeExact, schedule: mocks.schedule, createChannel: mocks.channel } }));
import { cancelAllUnifiedNotifications, getPendingReminderNotifications, cancelUnifiedNotifications, getExactReminderPermission, requestExactReminderPermission } from '../../src/lib/browser/native-notifications';
import { scheduleUnifiedNotifications } from '../../src/lib/browser/native-notifications';
import { clearDeliveredPersonalReminderNotifications } from '../../src/lib/browser/native-notifications';
import { addNotificationActionListener } from '../../src/lib/browser/native-notifications';
beforeEach(() => { mocks.pending.mockReset(); mocks.cancel.mockReset().mockResolvedValue(undefined); mocks.platform.mockReturnValue('android'); mocks.schedule.mockReset().mockResolvedValue(undefined); mocks.channel.mockReset().mockResolvedValue(undefined); });
afterEach(() => vi.restoreAllMocks());
it('finishes notification teardown when its native bridge is already closed', async () => {
  let removals = 0;
  mocks.listener.mockResolvedValueOnce({ remove: async () => { removals++; throw new Error('Native bridge closed'); } });
  const remove = await addNotificationActionListener(() => {});
  expect(remove).toBeTypeOf('function');
  remove!();
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(removals).toBe(1);
});
it.each(['android', 'ios'])('removes only delivered personal reminders on %s using supported APIs', async platform => {
  mocks.platform.mockReturnValue(platform);
  const privateItems = platform === 'android'
    ? [{ id: 51, tag: 'tutam-personal', data: { 'android.title': 'Private event' } }]
    : [{ id: 51, extra: { type: 'personal_eve' } }, { id: 52, extra: { type: 'personal_morning' } }];
  mocks.delivered.mockReset().mockResolvedValue({ notifications: [...privateItems,
    { id: 42, tag: 'tutam-reminder', extra: { type: 'lunar_eve' } }, { id: 777, tag: 'another_tool', extra: { type: 'another_tool' } }, { id: 888 }] });
  mocks.removeDelivered.mockReset().mockResolvedValue(undefined);
  await clearDeliveredPersonalReminderNotifications();
  expect(mocks.delivered).toHaveBeenCalledOnce();
  expect(mocks.removeDelivered).toHaveBeenCalledExactlyOnceWith({ notifications: privateItems });
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it('preserves public and unowned delivered notifications without calling an empty removal', async () => {
  mocks.delivered.mockReset().mockResolvedValue({ notifications: [{ id: 42, extra: { type: 'daily_schedule' } }, { id: 777 }] });
  mocks.removeDelivered.mockReset();
  await clearDeliveredPersonalReminderNotifications();
  expect(mocks.removeDelivered).not.toHaveBeenCalled();
});
it.each(['read', 'remove'])('propagates delivered personal cleanup %s failures for retry', async operation => {
  mocks.platform.mockReturnValue('ios');
  mocks.delivered.mockReset().mockResolvedValue({ notifications: [{ id: 51, extra: { type: 'personal_eve' } }] });
  mocks.removeDelivered.mockReset().mockResolvedValue(undefined);
  (operation === 'read' ? mocks.delivered : mocks.removeDelivered).mockRejectedValueOnce(new Error('Notification Center unavailable'));
  await expect(clearDeliveredPersonalReminderNotifications()).rejects.toThrow('Notification Center unavailable');
});
it('sends the selected iOS notification sound without invoking Android channels', async () => {
  mocks.platform.mockReturnValue('ios');
  expect(await scheduleUnifiedNotifications([{ id: 1000, title: 'Morning', body: 'Practice', sound: 'default', schedule: { on: { hour: 5, minute: 30 }, repeats: true } }])).toBe(true);
  expect(mocks.channel).not.toHaveBeenCalled();
  expect(mocks.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({ sound: 'default', id: 1000 })] });
});
it('checks exact access without opening Android settings automatically', async () => {
  mocks.checkExact.mockResolvedValue({ exact_alarm: 'denied' });
  expect(await getExactReminderPermission()).toBe('denied');
  expect(mocks.changeExact).not.toHaveBeenCalled();
  mocks.checkExact.mockResolvedValue({ exact_alarm: 'granted' });
  expect(await getExactReminderPermission()).toBe('granted');
});
it('opens Android alarm settings only through an explicit request', async () => {
  await requestExactReminderPermission();
  expect(mocks.changeExact).toHaveBeenCalledOnce();
});
it('does not invoke Android-only APIs on iOS', async () => {
  mocks.platform.mockReturnValueOnce('ios');
  expect(await getExactReminderPermission()).toBe('unsupported');
});
it('cancels all pending IDs through the supported Capacitor 7 API', async () => {
  mocks.pending.mockResolvedValue({ notifications: [{ id: 10 }, { id: 20 }] });
  await cancelAllUnifiedNotifications();
  expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 10 }, { id: 20 }] });
});
it('does not call cancel with an empty notification list', async () => {
  mocks.pending.mockResolvedValue({ notifications: [] });
  await cancelAllUnifiedNotifications();
  expect(mocks.pending).toHaveBeenCalledOnce();
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it('leaves unrelated scheduled notifications outside the reminder scheduler', async () => {
  mocks.pending.mockResolvedValue({ notifications: [{ id: 1, extra: { type: 'personal_eve' } }, { id: 2, extra: { type: 'lunar_morning' } }, { id: 3, extra: { type: 'other_feature' } }, { id: 4 }] });
  expect((await getPendingReminderNotifications()).map(item => item.id)).toEqual([1, 2]);
});
it('does not interpret an OS read failure as an empty schedule', async () => {
  mocks.pending.mockRejectedValue(new Error('OS unavailable'));
  await expect(getPendingReminderNotifications()).rejects.toThrow('OS unavailable');
});
it('reports migration cancellation failures so they can be retried', async () => {
  mocks.cancel.mockRejectedValue(new Error('OS rejected cancellation'));
  await expect(cancelUnifiedNotifications([123], true)).rejects.toThrow('OS rejected cancellation');
});
