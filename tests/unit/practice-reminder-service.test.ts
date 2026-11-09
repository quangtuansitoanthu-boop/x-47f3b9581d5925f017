import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({
  browser: true,
}));

vi.mock('$lib/utils/haptics', () => ({
  triggerHaptic: vi.fn(),
}));

const personal = vi.hoisted(() => ({ enabled: true, events: [{ id: 'qa', title: 'Giỗ gia đình QA', calendarMode: 'solar', solarDay: 23, solarMonth: 10, lunarDay: 1, lunarMonth: 1, type: 'gia-dinh', createdAt: '2026-01-01' }] }));
vi.mock('$lib/browser/personal-lunar-events', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/browser/personal-lunar-events')>(),
  loadPersonalLunarEvents: () => personal.events,
  isPersonalEventsNotificationEnabled: () => personal.enabled,
}));

vi.mock('$lib/browser/native-notifications', () => ({
  cancelAllUnifiedNotifications: vi.fn().mockResolvedValue(undefined),
  getPendingReminderNotifications: vi.fn().mockResolvedValue([]),
  cancelUnifiedNotifications: vi.fn().mockResolvedValue(undefined),
  clearDeliveredPersonalReminderNotifications: vi.fn().mockResolvedValue(undefined),
  getUnifiedNotificationPermission: vi.fn().mockResolvedValue('granted'),
  requestUnifiedNotificationPermission: vi.fn().mockResolvedValue('granted'),
  scheduleUnifiedNotifications: vi.fn().mockResolvedValue(true),
  showUnifiedNotification: vi.fn().mockResolvedValue(undefined),
}));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  };
}

import {
  DEFAULT_PRACTICE_REMINDER_SETTINGS,
  loadReminderSettings,
  saveReminderSettings,
  buildUpcomingNotificationBatch,
  syncRemindersWithSystem,
  type PracticeReminderSettings,
} from '$lib/browser/practice-reminder-service';
import { cancelUnifiedNotifications, getPendingReminderNotifications, scheduleUnifiedNotifications, getUnifiedNotificationPermission, requestUnifiedNotificationPermission } from '$lib/browser/native-notifications';
import { getLunarEvent } from '$lib/components/lunar/lunar-events';

describe('PracticeReminderService', () => {
  it('includes the selected sound mode in daily notifications for iOS', () => {
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    const audible = buildUpcomingNotificationBatch(settings, 0).filter(item => item.extra?.type === 'daily_schedule');
    expect(audible).toHaveLength(2);
    expect(audible.every(item => 'sound' in item && item.sound === 'default')).toBe(true);
    settings.soundEnabled = false;
    const silent = buildUpcomingNotificationBatch(settings, 0).filter(item => item.extra?.type === 'daily_schedule');
    expect(silent.every(item => !('sound' in item) || item.sound === undefined)).toBe(true);
  });
  it.each(['thapTrai', 'viaPhat', 'thoKhangBaoGiam'] as const)('schedules exactly one previous-evening and event-morning reminder for %s', (category) => {
    let eventDate: Date | undefined;
    for (let offset = 0; offset < 370; offset++) {
      const date = new Date(2026, 0, 1 + offset);
      const info = getLunarEvent(date, 'vi');
      if (category === 'thapTrai' ? info.isThapTrai : category === 'viaPhat' ? info.viaName : info.kiengDam) { eventDate = date; break; }
    }
    expect(eventDate).toBeDefined();
    const previousNoon = new Date(eventDate!); previousNoon.setDate(previousNoon.getDate() - 1); previousNoon.setHours(12);
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    settings.dailySchedules = [];
    settings.lunar.thapTrai = settings.lunar.viaPhat = settings.lunar.thoKhangBaoGiam = false;
    settings.lunar[category] = true;
    const reminders = buildUpcomingNotificationBatch(settings, 1, 'vi', { now: previousNoon, lunarEvent: getLunarEvent, personalEnabled: false });
    const eve = new Date(previousNoon); eve.setHours(19, 30, 0, 0);
    const morning = new Date(eventDate!); morning.setHours(6, 0, 0, 0);
    expect(reminders.map(item => item.schedule?.at)).toEqual([eve, morning]);
    expect(new Set(reminders.map(item => item.id)).size).toBe(2);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    personal.enabled = true;
    personal.events[0].calendarMode = 'solar';
    personal.events[0].solarDay = 23;
    personal.events[0].solarMonth = 10;
    vi.mocked(getPendingReminderNotifications).mockResolvedValue([]);
    vi.mocked(scheduleUnifiedNotifications).mockResolvedValue(true);
    vi.mocked(getUnifiedNotificationPermission).mockResolvedValue('granted');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 22, 12));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());
  it('reports a failed local save and preserves the previous reminder settings', () => {
    const key = 'tutam_practice_reminders_v1';
    localStorage.setItem(key, 'previous');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(saveReminderSettings(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS))).toBe(false);
    expect(localStorage.getItem(key)).toBe('previous');
  });

  it('acknowledges a successful local save', () => {
    expect(saveReminderSettings(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS))).toBe(true);
  });
  it('refuses to replace durable settings from corrupt local storage', () => {
    localStorage.setItem('tutam_practice_reminders_v1', '{interrupted');
    expect(() => loadReminderSettings(true)).toThrow();
    expect(localStorage.getItem('tutam_practice_reminders_v1')).toBe('{interrupted');
  });

  it('respects the separate personal reminder toggle', () => {
    personal.enabled = false;
    expect(buildUpcomingNotificationBatch(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), 2).filter(item => String(item.extra?.type).startsWith('personal_'))).toEqual([]);
  });

  it('keeps legacy personal timing flags when loading settings without the new fields', () => {
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    delete settings.personal;
    settings.lunar.notifyEveBefore = false;
    saveReminderSettings(settings);
    expect(loadReminderSettings().personal).toEqual({ beforeEnabled: false, dayEnabled: true, daysBefore: 1, beforeTime: '19:30', dayTime: '06:00' });
  });

  it('normalizes invalid stored personal times and day limits without overwriting stored bytes', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRACTICE_REMINDER_SETTINGS, personal: { beforeEnabled: false, dayEnabled: false, daysBefore: 101, beforeTime: '24:00', dayTime: '6:00' } });
    localStorage.setItem('tutam_practice_reminders_v1', raw);
    expect(loadReminderSettings().personal).toEqual({ beforeEnabled: false, dayEnabled: false, daysBefore: 1, beforeTime: '19:30', dayTime: '06:00' });
    expect(localStorage.getItem('tutam_practice_reminders_v1')).toBe(raw);
  });

  it('schedules a 100-day advance reminder across the year boundary inside the notification horizon', () => {
    const now = new Date(2026, 11, 20, 12);
    const target = new Date(2026, 11, 20 + 100);
    personal.events[0].solarDay = target.getDate();
    personal.events[0].solarMonth = target.getMonth() + 1;
    const settings = { ...structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), personal: { beforeEnabled: true, dayEnabled: true, daysBefore: 100, beforeTime: '18:45', dayTime: '08:15' } };
    const batch = buildUpcomingNotificationBatch(settings, 1, 'vi', { now }).filter(item => String(item.extra?.type).startsWith('personal_'));
    expect(batch).toHaveLength(1);
    expect(batch[0].schedule?.at).toEqual(new Date(2026, 11, 20, 18, 45));
    expect(batch[0].title).toContain('100');
    expect(batch[0].title).not.toContain('Ngày mai');
  });

  it('uses independent personal times and switches without changing daily or lunar schedules', () => {
    const legacy = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    const settings = { ...legacy, personal: { beforeEnabled: false, dayEnabled: true, daysBefore: 3, beforeTime: '18:45', dayTime: '08:15' } };
    const original = buildUpcomingNotificationBatch(legacy, 2);
    const batch = buildUpcomingNotificationBatch(settings, 2);
    expect(batch.filter(item => !String(item.extra?.type).startsWith('personal_'))).toEqual(original.filter(item => !String(item.extra?.type).startsWith('personal_')));
    const personalBatch = batch.filter(item => String(item.extra?.type).startsWith('personal_'));
    expect(personalBatch).toHaveLength(1);
    expect(personalBatch[0].schedule?.at).toEqual(new Date(2026, 9, 23, 8, 15));
  });

  it('also schedules monthly lunar anniversaries without requiring general lunar toggles', () => {
    personal.events[0].calendarMode = 'lunar';
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    settings.lunar.viaPhat = settings.lunar.thapTrai = settings.lunar.thoKhangBaoGiam = false;
    const batch = buildUpcomingNotificationBatch(settings, 370);
    expect(batch.filter(item => item.extra?.type === 'personal_morning').length).toBeGreaterThan(0);
    expect(batch.some(item => item.extra?.type === 'lunar_morning')).toBe(false);
  });

  it('retains previous reminders when the OS rejects a new schedule', async () => {
    vi.mocked(getPendingReminderNotifications).mockResolvedValue([{ id: 42 }]);
    vi.mocked(scheduleUnifiedNotifications).mockResolvedValue(false);
    expect(await syncRemindersWithSystem()).toMatchObject({ success: false, scheduledCount: 0 });
    expect(cancelUnifiedNotifications).not.toHaveBeenCalled();
  });

  it('removes obsolete owned reminders only after successful scheduling', async () => {
    vi.mocked(getPendingReminderNotifications).mockResolvedValue([{ id: 42 }, { id: 1000 }]);
    await syncRemindersWithSystem();
    expect(cancelUnifiedNotifications).toHaveBeenCalledWith([42], true);
    expect(vi.mocked(scheduleUnifiedNotifications).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(cancelUnifiedNotifications).mock.invocationCallOrder[0]);
  });

  it('does not prompt again when permission is denied', async () => {
    vi.mocked(getUnifiedNotificationPermission).mockResolvedValue('denied');
    expect((await syncRemindersWithSystem()).success).toBe(false);
    expect(requestUnifiedNotificationPermission).not.toHaveBeenCalled();
    expect(scheduleUnifiedNotifications).not.toHaveBeenCalled();
  });

  it('preserves an intentionally empty daily schedule', () => {
    saveReminderSettings({ ...structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), dailySchedules: [] });
    expect(loadReminderSettings().dailySchedules).toEqual([]);
  });

  it('schedules personal solar anniversaries on the previous evening and event morning', () => {
    const batch = buildUpcomingNotificationBatch(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), 2);
    const personal = batch.filter(item => String(item.extra?.type).startsWith('personal_'));
    expect(personal).toHaveLength(2);
    expect(personal.map(item => item.schedule?.at)).toEqual([new Date(2026, 9, 22, 19, 30), new Date(2026, 9, 23, 6)]);
    expect(personal.every(item => item.body.includes('Giỗ gia đình QA'))).toBe(true);
    expect(new Set(batch.map(item => item.id)).size).toBe(batch.length);
  });

  it('loads default settings with Tho Khang Bao Giam, Thap Trai, and Via Phat enabled', () => {
    const settings = loadReminderSettings();
    expect(settings.masterEnabled).toBe(true);
    expect(settings.lunar.thoKhangBaoGiam).toBe(true);
    expect(settings.lunar.thapTrai).toBe(true);
    expect(settings.lunar.viaPhat).toBe(true);
    expect(settings.lunar.notifyEveBefore).toBe(true);
    expect(settings.lunar.notifyMorningOf).toBe(true);
    expect(settings.dailySchedules.length).toBeGreaterThanOrEqual(2);
    expect(settings.dailySchedules[0].id).toBe('morning');
    expect(settings.dailySchedules[1].id).toBe('evening');
  });

  it('saves and reloads custom settings accurately', () => {
    const custom: PracticeReminderSettings = {
      masterEnabled: true,
      lunar: {
        thoKhangBaoGiam: false, // user turned off Tho Khang
        thapTrai: true,
        viaPhat: true,
        notifyEveBefore: true,
        notifyMorningOf: false,
      },
      dailySchedules: [
        {
          id: 'morning',
          label: 'Thời khóa sáng',
          practice: 'Lễ Phật sám hối 108 lạy',
          time: '05:00',
          enabled: true,
          days: [1, 2, 3, 4, 5],
        },
      ],
      soundEnabled: false,
      vibrateEnabled: true,
    };

    saveReminderSettings(custom);
    const loaded = loadReminderSettings();
    expect(loaded.lunar.thoKhangBaoGiam).toBe(false);
    expect(loaded.lunar.thapTrai).toBe(true);
    expect(loaded.lunar.notifyMorningOf).toBe(false);
    expect(loaded.dailySchedules[0].time).toBe('05:00');
    expect(loaded.dailySchedules[0].practice).toBe('Lễ Phật sám hối 108 lạy');
    expect(loaded.soundEnabled).toBe(false);
  });

  it('generates upcoming notifications including daily schedules and lunar events', () => {
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    const batch = buildUpcomingNotificationBatch(settings, 15, 'vi');

    // Must include daily recurring notifications
    const dailyItems = batch.filter((item) => item.extra?.type === 'daily_schedule');
    expect(dailyItems.length).toBeGreaterThanOrEqual(2);

    // Must include lunar notifications (Tho Khang, Thap Trai, or Via)
    const lunarItems = batch.filter(
      (item) => item.extra?.type === 'lunar_eve' || item.extra?.type === 'lunar_morning',
    );
    expect(lunarItems.length).toBeGreaterThan(0);
  });

  it('excludes Tho Khang notifications when user toggles thoKhangBaoGiam off', () => {
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    settings.lunar.thoKhangBaoGiam = false;
    settings.lunar.thapTrai = true;
    settings.lunar.viaPhat = false;

    const batch = buildUpcomingNotificationBatch(settings, 15, 'vi');
    // None of the notifications should mention Tho Khang Bao Giam
    for (const notif of batch) {
      if (notif.extra?.type === 'lunar_eve' || notif.extra?.type === 'lunar_morning') {
        expect(notif.title).not.toContain('Thọ Khang');
        expect(notif.body).not.toContain('Thọ Khang');
      }
    }
  });

  it('returns empty batch when master switch is disabled', () => {
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    settings.masterEnabled = false;

    const batch = buildUpcomingNotificationBatch(settings, 15, 'vi');
    expect(batch).toEqual([]);
  });
});
