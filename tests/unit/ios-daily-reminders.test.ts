import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: () => 'ios' }));
vi.mock('$lib/utils/haptics', () => ({ triggerHaptic: vi.fn() }));
const personal = vi.hoisted(() => ({ enabled: false, events: [] as Array<import('../../src/lib/browser/personal-lunar-events').PersonalLunarEvent> }));
vi.mock('$lib/browser/personal-lunar-events', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/lib/browser/personal-lunar-events')>(),
  loadPersonalLunarEvents: () => personal.events,
  isPersonalEventsNotificationEnabled: () => personal.enabled,
}));
const os = vi.hoisted(() => ({ pending: vi.fn(), schedule: vi.fn(), cancel: vi.fn(), delivered: vi.fn(), removeDelivered: vi.fn(), permission: vi.fn(), request: vi.fn(), channel: vi.fn() }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {
  getPending: os.pending, schedule: os.schedule, cancel: os.cancel, checkPermissions: os.permission,
  requestPermissions: os.request, createChannel: os.channel,
  getDeliveredNotifications: os.delivered, removeDeliveredNotifications: os.removeDelivered,
} }));
import { buildUpcomingNotificationBatch, DEFAULT_PRACTICE_REMINDER_SETTINGS, sendTestNotification, startReminderSystemSync, syncRemindersWithSystem } from '$lib/browser/practice-reminder-service';

const settings = () => {
  const value = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
  value.lunar.thapTrai = value.lunar.viaPhat = value.lunar.thoKhangBaoGiam = false;
  return value;
};
beforeEach(() => {
  vi.clearAllMocks();
  personal.enabled = false; personal.events = [];
  os.pending.mockResolvedValue({ notifications: [{ id: 42, extra: { type: 'lunar_eve' } }, { id: 777, extra: { type: 'another_tool' } }] });
  os.permission.mockResolvedValue({ display: 'granted' });
  os.schedule.mockResolvedValue(undefined);
  os.cancel.mockResolvedValue(undefined);
  os.delivered.mockReset().mockResolvedValue({ notifications: [] });
  os.removeDelivered.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each(['malformed', 'unreadable'])('preserves the iOS schedule when saved settings are %s', async failure => {
  const raw = '{interrupted';
  const storage = {
    getItem: vi.fn(() => { if (failure === 'unreadable') throw new Error('storage unavailable'); return raw; }),
    setItem: vi.fn(),
  };
  vi.stubGlobal('localStorage', storage);
  await expect(syncRemindersWithSystem()).rejects.toThrow();
  expect(os.schedule).not.toHaveBeenCalled();
  expect(os.cancel).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  if (failure === 'malformed') expect(storage.getItem()).toBe(raw);
});

it.each([null, '{}'])('keeps default daily reminders for absent or legacy saved iOS settings (%s)', async raw => {
  const storage = { getItem: vi.fn(() => raw), setItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  expect((await syncRemindersWithSystem()).success).toBe(true);
  const daily = os.schedule.mock.calls[0][0].notifications.filter((item: { extra?: { type?: string } }) => item.extra?.type === 'daily_schedule');
  expect(daily).toHaveLength(2);
  expect(daily.map((item: { schedule: { on: { hour: number; minute: number } } }) => item.schedule.on)).toEqual([{ hour: 5, minute: 30 }, { hour: 19, minute: 30 }]);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it.each(['opt-out', 'master-disabled'])('clears delivered private titles on %s even with denied permission', async mode => {
  const value = settings();
  if (mode === 'master-disabled') value.masterEnabled = false;
  os.permission.mockResolvedValue({ display: 'denied' });
  os.delivered.mockResolvedValue({ notifications: [
    { id: 51, extra: { type: 'personal_eve' } },
    { id: 42, extra: { type: 'lunar_eve' } }, { id: 777, extra: { type: 'another_tool' } },
  ] });
  await syncRemindersWithSystem(value);
  expect(os.removeDelivered).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 51, extra: { type: 'personal_eve' } }] });
  expect(os.schedule).not.toHaveBeenCalled();
  expect(os.request).not.toHaveBeenCalled();
});

it.each(['read', 'remove'])('retries principal delivered-cleanup %s failure before scheduling another principal', async operation => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  const stop = startReminderSystemSync(() => 'vi');
  try {
    await syncRemindersWithSystem(settings());
    personal.enabled = true;
    os.schedule.mockClear();
    os.delivered.mockResolvedValue({ notifications: [{ id: 51, extra: { type: 'personal_eve' } }] });
    (operation === 'read' ? os.delivered : os.removeDelivered).mockRejectedValueOnce(new Error('Notification Center unavailable'));
    window.dispatchEvent(new Event('quangtu:session-changed'));
    // Queue this explicit sync behind the event so a failure cannot be hidden by an unrelated timer.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(os.schedule).not.toHaveBeenCalled();
    expect((await syncRemindersWithSystem(settings())).success).toBe(true);
    expect(os.removeDelivered).toHaveBeenCalledWith({ notifications: [{ id: 51, extra: { type: 'personal_eve' } }] });
    expect(os.schedule).toHaveBeenCalledOnce();
    expect(os.removeDelivered.mock.invocationCallOrder.at(-1)).toBeLessThan(os.schedule.mock.invocationCallOrder[0]);
  } finally { stop(); }
});

it('cleans a newer principal revision that arrives while delivered removal is pending', async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  const stop = startReminderSystemSync(() => 'vi');
  let release!: () => void;
  try {
    await syncRemindersWithSystem(settings());
    personal.enabled = true;
    os.schedule.mockClear(); os.delivered.mockClear(); os.removeDelivered.mockClear();
    os.delivered.mockResolvedValue({ notifications: [{ id: 51, extra: { type: 'personal_eve' } }] });
    os.removeDelivered.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    window.dispatchEvent(new Event('quangtu:session-changed'));
    await vi.waitFor(() => expect(os.removeDelivered).toHaveBeenCalledOnce());
    expect(os.schedule).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('quangtu:session-changed'));
    release();
    await syncRemindersWithSystem(settings());
    expect(os.delivered).toHaveBeenCalledTimes(2);
    expect(os.removeDelivered).toHaveBeenCalledTimes(2);
    expect(os.removeDelivered.mock.invocationCallOrder[1]).toBeLessThan(os.schedule.mock.invocationCallOrder[0]);
  } finally { release?.(); stop(); }
});

it.each([0, 3])('fits dense real-calendar reminders into the iOS budget with %s foreign requests', async foreignCount => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 0, 0));
  personal.enabled = true;
  personal.events = Array.from({ length: 30 }, (_, index) => ({
    id: `monthly-${index + 1}`, title: `Ngày lễ ${index + 1}`, calendarMode: 'lunar',
    lunarDay: index + 1, lunarMonth: 0, frequency: 'monthly', type: 'gia-dinh', createdAt: '2026-01-01',
  }));
  const foreign = Array.from({ length: foreignCount }, (_, index) => ({ id: 700 + index, extra: { type: 'another_tool' } }));
  os.pending.mockResolvedValue({ notifications: [{ id: 42, extra: { type: 'lunar_eve' } }, ...foreign] });
  const value = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
  const full = buildUpcomingNotificationBatch(value, 45);
  const recurringIds = full.filter(item => item.schedule?.repeats).map(item => item.id);
  const nearest = full.filter(item => item.schedule?.at)
    .sort((a, b) => a.schedule!.at!.getTime() - b.schedule!.at!.getTime());
  expect(full.length).toBeGreaterThan(64);
  expect(recurringIds).toHaveLength(2);
  type Item = { id: number; schedule?: { at?: Date; repeats?: boolean } };
  let retained: Item[] = [];
  // The 64-request budget follows Doist's published experience with its own
  // UNUserNotificationCenter scheduler, not an Apple-guaranteed eviction policy.
  // Model last-64 retention to expose why sending an oversized batch is unsafe.
  os.schedule.mockImplementationOnce(async ({ notifications }: { notifications: Item[] }) => {
    retained = notifications.slice(-(64 - foreignCount));
  });
  const result = await syncRemindersWithSystem(value);
  const requested = os.schedule.mock.calls[0][0].notifications as Item[];
  expect(result.details).toMatchObject({ mode: 'ios-batch', horizonDays: 45, limited: true, capacity: 64 - foreignCount });
  const lastOneOff = requested.filter(item => item.schedule?.at).map(item => item.schedule!.at!.getTime());
  if (lastOneOff.length) expect(result.details?.actualOneOffThrough).toBe(new Date(Math.max(...lastOneOff)).toISOString());
  expect.soft(requested.length + foreignCount).toBeLessThanOrEqual(64);
  expect.soft(retained.filter(item => item.schedule?.repeats).map(item => item.id)).toEqual(recurringIds);
  const retainedOnce = retained.filter(item => item.schedule?.at).map(item => item.id);
  expect.soft(retainedOnce).toEqual(nearest.slice(0, 64 - foreignCount - recurringIds.length).map(item => item.id));
  expect(os.pending).toHaveBeenCalledOnce();
  expect(os.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 42 }] });
});

it('passes daily and weekly times, weekdays and sound from settings through the iOS SDK', async () => {
  const value = settings();
  value.dailySchedules[1].days = [0, 1, 6];
  expect(await syncRemindersWithSystem(value)).toMatchObject({ success: true, scheduledCount: 4, details: { mode: 'ios-batch', horizonDays: 45 } });
  const items = os.schedule.mock.calls[0][0].notifications;
  expect(items[0]).toMatchObject({ id: 1000, schedule: { on: { hour: 5, minute: 30 }, repeats: true }, sound: 'default', extra: { target: '/tu-tap' } });
  expect(items.slice(1).map((item: { schedule: { on: { weekday: number } } }) => item.schedule.on.weekday)).toEqual([1, 2, 7]);
  expect(items.every((item: { sound?: string }) => item.sound === 'default')).toBe(true);
  expect(os.channel).not.toHaveBeenCalled();
  expect(os.request).not.toHaveBeenCalled();
  expect(os.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 42 }] });
  expect(os.schedule.mock.invocationCallOrder[0]).toBeLessThan(os.cancel.mock.invocationCallOrder[0]);
  expect(os.pending).toHaveBeenCalledOnce();
});

it('keeps the user-selected silent mode while retaining both daily schedules', async () => {
  const value = settings(); value.soundEnabled = false;
  expect((await syncRemindersWithSystem(value)).scheduledCount).toBe(2);
  expect(os.schedule.mock.calls[0][0].notifications.every((item: { sound?: string }) => item.sound === undefined)).toBe(true);
});

it('preserves existing reminders when permission is denied', async () => {
  os.permission.mockResolvedValue({ display: 'denied' });
  expect(await syncRemindersWithSystem(settings())).toMatchObject({ success: false, scheduledCount: 0, details: { reason: 'permission-denied' } });
  expect(os.request).not.toHaveBeenCalled(); expect(os.schedule).not.toHaveBeenCalled(); expect(os.cancel).not.toHaveBeenCalled();
});

it('does not discard old schedules when the iOS scheduler rejects an edit', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    os.schedule.mockRejectedValue(new Error('OS rejected schedule'));
    expect((await syncRemindersWithSystem(settings())).success).toBe(false);
    expect(os.cancel).not.toHaveBeenCalled();
  } finally { error.mockRestore(); }
});

it('removes opted-out personal notifications even when iOS permission is denied', async () => {
  os.pending.mockResolvedValue({ notifications: [
    { id: 51, extra: { type: 'personal_eve' } },
    { id: 52, extra: { type: 'personal_morning' } },
    { id: 42, extra: { type: 'lunar_eve' } },
    { id: 777, extra: { type: 'another_tool' } },
  ] });
  os.permission.mockResolvedValue({ display: 'denied' });
  expect(await syncRemindersWithSystem(settings())).toMatchObject({ success: false, scheduledCount: 0, details: { reason: 'permission-denied' } });
  expect(os.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 51 }, { id: 52 }] });
  expect(os.schedule).not.toHaveBeenCalled();
  expect(os.request).not.toHaveBeenCalled();
});

it.each([true, false])('uses the selected sound mode for the iOS test notification: %s', async soundEnabled => {
  const value = settings();
  value.soundEnabled = soundEnabled;
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'tutam_practice_reminders_v1' ? JSON.stringify(value) : null });
  expect(await sendTestNotification()).toBe(true);
  expect(os.schedule).toHaveBeenCalledExactlyOnceWith({ notifications: [expect.objectContaining({
    id: 999999,
    sound: soundEnabled ? 'default' : undefined,
  })] });
  expect(os.request).not.toHaveBeenCalled();
});

it('does not report the iOS master switch disabled when cancellation fails', async () => {
  const value = settings();
  value.masterEnabled = false;
  os.cancel.mockRejectedValue(new Error('OS rejected cancellation'));
  await expect(syncRemindersWithSystem(value)).rejects.toThrow('OS rejected cancellation');
  expect(os.schedule).not.toHaveBeenCalled();
});

it('does not report a replacement successful while obsolete iOS notifications remain', async () => {
  os.cancel.mockRejectedValue(new Error('OS rejected cancellation'));
  await expect(syncRemindersWithSystem(settings())).rejects.toThrow('OS rejected cancellation');
  expect(os.schedule).toHaveBeenCalledOnce();
  expect(os.schedule.mock.invocationCallOrder[0]).toBeLessThan(os.cancel.mock.invocationCallOrder[0]);
});

it('does not schedule for the next principal when old private iOS notifications cannot be removed', async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const stop = startReminderSystemSync(() => 'vi');
  try {
    await syncRemindersWithSystem(settings());
    os.pending.mockClear();
    os.schedule.mockClear();
    os.cancel.mockClear();
    os.pending.mockResolvedValue({ notifications: [{ id: 51, extra: { type: 'personal_eve' } }] });
    os.cancel.mockRejectedValueOnce(new Error('OS rejected cancellation'));
    window.dispatchEvent(new Event('quangtu:session-changed'));
    await vi.waitFor(() => expect(os.cancel).toHaveBeenCalled());
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(os.schedule).not.toHaveBeenCalled();
    os.cancel.mockResolvedValue(undefined);
    expect((await syncRemindersWithSystem(settings())).success).toBe(true);
    expect(os.schedule).toHaveBeenCalledOnce();
  } finally {
    stop();
    warning.mockRestore();
  }
});
