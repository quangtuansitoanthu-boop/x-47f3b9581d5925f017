/**
 * Practice Reminder Service
 *
 * Manages Buddhist practice reminder schedules:
 * 1. Tho Khang Bao Giam (Chastity & vital energy conservation days)
 * 2. Thap Trai (10 Lunar fasting days) & Buddha / Bodhisattva feast days
 * 3. Daily practice sessions (Morning, Evening, and custom slots)
 *
 * Works 100% offline via Capacitor Local Notifications (Android/iOS)
 * with graceful web fallbacks and real-time synchronization.
 */

import { browser } from '$app/environment';
import { getLunarEvent, getLunarEventForLunarDay } from '$lib/components/lunar/lunar-events';
import { nativePlatform } from './native-platform';
import { replaceDurableReminderPlan, clearDurablePersonalReminders, sendDurableTestNotification, type DurableReminderPlan } from './durable-reminders';
import {
  getPendingReminderNotifications,
  isReminderNotification,
  cancelUnifiedNotifications,
  clearDeliveredPersonalReminderNotifications,
  getUnifiedNotificationPermission,
  requestUnifiedNotificationPermission,
  scheduleUnifiedNotifications,
  showUnifiedNotification,
  type UnifiedNotificationScheduleOptions,
} from './native-notifications';
import { triggerHaptic } from '$lib/utils/haptics';
import { getPersonalEventsForDate, loadPersonalLunarEvents, isPersonalEventsNotificationEnabled } from './personal-lunar-events';

export interface DailyScheduleItem {
  id: string;
  label: string;
  practice?: string; // Tên công phu người dùng tự nhập (ví dụ: Lễ Phật sám hối, Niệm Phật...)
  time: string; // 'HH:mm' format
  enabled: boolean;
  days: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
}

export interface LunarReminderConfig {
  thoKhangBaoGiam: boolean; // Remind days from Tho Khang Bao Giam
  thapTrai: boolean;        // Remind 10 lunar fasting days
  viaPhat: boolean;         // Remind Buddha & Bodhisattva feast days
  notifyEveBefore: boolean; // Notify at 19:30 on the evening before
  notifyMorningOf: boolean; // Notify at 06:00 on the morning of
}

export interface PracticeReminderSettings {
  masterEnabled: boolean;
  lunar: LunarReminderConfig;
  dailySchedules: DailyScheduleItem[];
  soundEnabled: boolean;
  vibrateEnabled: boolean;
  personal?: PersonalReminderConfig;
}

export interface PersonalReminderConfig {
  beforeEnabled: boolean;
  dayEnabled: boolean;
  daysBefore: number;
  beforeTime: string;
  dayTime: string;
}

export interface ReminderSyncResult {
  scheduledCount: number;
  success: boolean;
  details?: {
    mode: 'android-durable' | 'ios-batch' | 'web-unsupported' | 'disabled';
    reason: null | 'permission-denied' | 'permission-required' | 'unsupported' | 'capacity' | 'schedule-failed';
    ruleCount?: number;
    requestedCount?: number;
    capacity?: number;
    horizonDays?: number;
    limited?: boolean;
    alarmMode?: 'exact' | 'inexact' | 'off';
    actualOneOffThrough?: string;
  };
}

export function resolvePersonalReminderConfig(settings: Pick<PracticeReminderSettings, 'personal' | 'lunar'>): PersonalReminderConfig {
  const config = settings.personal;
  const validTime = (value: unknown): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  return {
    beforeEnabled: typeof config?.beforeEnabled === 'boolean' ? config.beforeEnabled : settings.lunar.notifyEveBefore,
    dayEnabled: typeof config?.dayEnabled === 'boolean' ? config.dayEnabled : settings.lunar.notifyMorningOf,
    daysBefore: Number.isInteger(config?.daysBefore) && config!.daysBefore >= 1 && config!.daysBefore <= 100 ? config!.daysBefore : 1,
    beforeTime: validTime(config?.beforeTime) ? config.beforeTime : '19:30',
    dayTime: validTime(config?.dayTime) ? config.dayTime : '06:00',
  };
}

export const STORAGE_KEY_PRACTICE_REMINDERS = 'tutam_practice_reminders_v1';

export const DEFAULT_PRACTICE_REMINDER_SETTINGS: PracticeReminderSettings = {
  masterEnabled: true,
  lunar: {
    thoKhangBaoGiam: true,
    thapTrai: true,
    viaPhat: true,
    notifyEveBefore: true,
    notifyMorningOf: true,
  },
  dailySchedules: [
    {
      id: 'morning',
      label: 'Thời khóa sáng',
      practice: 'Lễ Phật & Kinh sáng',
      time: '05:30',
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6],
    },
    {
      id: 'evening',
      label: 'Thời khóa tối',
      practice: 'Tụng kinh & Niệm Phật',
      time: '19:30',
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6],
    },
  ],
  soundEnabled: true,
  vibrateEnabled: true,
};

export function clonePracticeReminderSettings(settings: PracticeReminderSettings): PracticeReminderSettings {
  return {
    ...settings,
    lunar: { ...settings.lunar },
    dailySchedules: settings.dailySchedules.map(schedule => ({ ...schedule, days: [...schedule.days] })),
    ...(settings.personal ? { personal: { ...settings.personal } } : {}),
  };
}

/**
 * Load settings from localStorage with deep merge against default values
 */
export function loadReminderSettings(strict = false): PracticeReminderSettings {
  if (!browser || typeof localStorage === 'undefined') {
    return clonePracticeReminderSettings(DEFAULT_PRACTICE_REMINDER_SETTINGS);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRACTICE_REMINDERS);
    if (!raw) return clonePracticeReminderSettings(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    const parsed = JSON.parse(raw);

    return {
      masterEnabled: typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : true,
      personal: resolvePersonalReminderConfig({ personal: parsed.personal, lunar: {
        notifyEveBefore: typeof parsed.lunar?.notifyEveBefore === 'boolean' ? parsed.lunar.notifyEveBefore : true,
        notifyMorningOf: typeof parsed.lunar?.notifyMorningOf === 'boolean' ? parsed.lunar.notifyMorningOf : true,
        thoKhangBaoGiam: false, thapTrai: false, viaPhat: false,
      } }),
      lunar: {
        thoKhangBaoGiam:
          typeof parsed.lunar?.thoKhangBaoGiam === 'boolean'
            ? parsed.lunar.thoKhangBaoGiam
            : DEFAULT_PRACTICE_REMINDER_SETTINGS.lunar.thoKhangBaoGiam,
        thapTrai:
          typeof parsed.lunar?.thapTrai === 'boolean'
            ? parsed.lunar.thapTrai
            : DEFAULT_PRACTICE_REMINDER_SETTINGS.lunar.thapTrai,
        viaPhat:
          typeof parsed.lunar?.viaPhat === 'boolean'
            ? parsed.lunar.viaPhat
            : DEFAULT_PRACTICE_REMINDER_SETTINGS.lunar.viaPhat,
        notifyEveBefore:
          typeof parsed.lunar?.notifyEveBefore === 'boolean'
            ? parsed.lunar.notifyEveBefore
            : DEFAULT_PRACTICE_REMINDER_SETTINGS.lunar.notifyEveBefore,
        notifyMorningOf:
          typeof parsed.lunar?.notifyMorningOf === 'boolean'
            ? parsed.lunar.notifyMorningOf
            : DEFAULT_PRACTICE_REMINDER_SETTINGS.lunar.notifyMorningOf,
      },
      dailySchedules:
        Array.isArray(parsed.dailySchedules)
          ? parsed.dailySchedules.map((s: any) => ({
              id: typeof s.id === 'string' ? s.id : `custom_${Date.now()}`,
              label: typeof s.label === 'string' ? s.label : 'Thời khóa',
              practice:
                typeof s.practice === 'string'
                  ? s.practice
                  : s.id === 'morning'
                    ? 'Lễ Phật & Kinh sáng'
                    : s.id === 'evening'
                      ? 'Tụng kinh & Niệm Phật'
                      : '',
              time: typeof s.time === 'string' ? s.time : '05:30',
              enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
              days: Array.isArray(s.days) ? s.days : [0, 1, 2, 3, 4, 5, 6],
            }))
          : clonePracticeReminderSettings(DEFAULT_PRACTICE_REMINDER_SETTINGS).dailySchedules,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_PRACTICE_REMINDER_SETTINGS.soundEnabled,
      vibrateEnabled:
        typeof parsed.vibrateEnabled === 'boolean'
          ? parsed.vibrateEnabled
          : DEFAULT_PRACTICE_REMINDER_SETTINGS.vibrateEnabled,
    };
  } catch (err) {
    if (strict) throw err;
    console.warn('Failed to parse reminder settings, using defaults:', err);
    return clonePracticeReminderSettings(DEFAULT_PRACTICE_REMINDER_SETTINGS);
  }
}

/**
 * Persist settings to localStorage
 */
export function saveReminderSettings(settings: PracticeReminderSettings): boolean {
  if (!browser || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY_PRACTICE_REMINDERS, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a deterministic 32-bit positive integer ID for notifications
 */
function makeNotificationId(prefix: number, year: number, month: number, day: number, slot: number): number {
  // prefix: 1 (daily), 2 (eve before), 3 (morning of)
  // Ensures < 2,147,483,647 (32-bit signed int max)
  const yPart = (year % 100) * 10_000_000;
  const mPart = month * 100_000;
  const dPart = day * 1_000;
  const pPart = prefix * 100;
  return (yPart + mPart + dPart + pPart + slot) % 2_000_000_000;
}

/**
 * Calculate upcoming scheduled notifications for the next `daysAhead` days (default: 45 days)
 */
export function buildUpcomingNotificationBatch(
  settings: PracticeReminderSettings,
  daysAhead = 45,
  locale = 'vi',
  context?: { now: Date; lunarEvent: typeof getLunarEvent; personalEnabled: boolean },
): UnifiedNotificationScheduleOptions[] {
  if (!settings.masterEnabled) return [];

  const isEn = locale === 'en';
  const batch: UnifiedNotificationScheduleOptions[] = [];
  const now = context?.now ?? new Date();
  const nowMs = now.getTime();

  // 1. Daily practice schedules
  // Using native repeat rules where possible
  settings.dailySchedules.forEach((item, index) => {
    if (!item.enabled) return;
    const [hStr, mStr] = item.time.split(':');
    const hour = Number(hStr) || 0;
    const minute = Number(mStr) || 0;
    if (!/^\d{2}:\d{2}$/.test(item.time) || hour > 23 || minute > 59) return;
    const days = [...new Set(item.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))];

    const notifId = 1000 + index;
    const practiceName = item.practice?.trim();
    const defaultSlotLabel =
      item.id === 'morning'
        ? (isEn ? 'Morning Practice' : 'Thời khóa sáng')
        : item.id === 'evening'
          ? (isEn ? 'Evening Practice' : 'Thời khóa tối')
          : (item.label || (isEn ? 'Practice Session' : 'Thời khóa tu tập'));

    const title = practiceName
      ? `⏰ ${practiceName}`
      : `⏰ ${defaultSlotLabel}`;

    const body = practiceName
      ? (isEn
          ? `Time for ${practiceName} (${item.time}). Warmly inviting you to begin your practice.`
          : `Đã đến giờ ${practiceName} (${item.time}). Kính mời quý đạo hữu cùng lắng lòng tu tập.`)
      : (isEn
          ? `Time for ${defaultSlotLabel} (${item.time}). Warmly inviting you to begin your practice.`
          : `Đã đến giờ ${defaultSlotLabel} (${item.time}). Kính mời quý đạo hữu cùng lắng lòng tu tập.`);

    // If repeats daily (all 7 days)
    if (days.length === 7) {
      batch.push({
        id: notifId,
        title,
        body,
        schedule: {
          on: { hour, minute },
          repeats: true,
          allowWhileIdle: true,
        },
        extra: { type: 'daily_schedule', slotId: item.id, target: '/tu-tap' },
      });
    } else {
      // Repeat on specific weekdays (Capacitor weekday: 1 = Sun, 2 = Mon, ..., 7 = Sat)
      days.forEach((dayNum) => {
        const weekday = dayNum + 1; // 0..6 -> 1..7
        batch.push({
          id: notifId * 10 + weekday,
          title,
          body,
          schedule: {
            on: { weekday, hour, minute },
            repeats: true,
            allowWhileIdle: true,
          },
          extra: { type: 'daily_schedule', slotId: item.id, target: '/tu-tap' },
        });
      });
    }
  });

  // 2. Lunar events & Tho Khang Bao Giam schedules (next `daysAhead` days)
  const hasLunarEnabled =
    settings.lunar.thoKhangBaoGiam || settings.lunar.thapTrai || settings.lunar.viaPhat;

  if (hasLunarEnabled && (settings.lunar.notifyEveBefore || settings.lunar.notifyMorningOf)) {
    for (let offset = 0; offset <= daysAhead; offset++) {
      const eventDate = new Date(now);
      eventDate.setDate(now.getDate() + offset);
      eventDate.setHours(0, 0, 0, 0);

      const lunarInfo = (context?.lunarEvent ?? getLunarEvent)(eventDate, locale);

      const isThoKhang = Boolean(lunarInfo.kiengDam) && settings.lunar.thoKhangBaoGiam;
      const isThapTrai = Boolean(lunarInfo.isThapTrai) && settings.lunar.thapTrai;
      const isViaPhat = Boolean(lunarInfo.viaName) && settings.lunar.viaPhat;

      if (!isThoKhang && !isThapTrai && !isViaPhat) {
        continue;
      }

      const lunarDayStr = `${lunarInfo.lunarDay}/${lunarInfo.lunarMonth} Âm lịch`;
      const viaTitle = isViaPhat ? lunarInfo.viaName || '' : '';

      // (A) Eve Before Notification (19:30 on the evening before)
      if (settings.lunar.notifyEveBefore) {
        const eveDate = new Date(eventDate);
        eveDate.setDate(eveDate.getDate() - 1);
        eveDate.setHours(19, 30, 0, 0);

        if (eveDate.getTime() > nowMs) {
          let eveTitle = '';
          let eveBody = '';

          if (isThoKhang && (isThapTrai || isViaPhat)) {
            const extraPart = viaTitle || (isEn ? 'Fasting Day' : 'Ngày Thập Trai');
            eveTitle = isEn
              ? `🌸 Tomorrow: ${extraPart} & Chastity Day`
              : `🌸 Ngày mai: ${extraPart} & Thọ Khang Bảo Giám`;
            eveBody = isEn
              ? `Tomorrow (${lunarDayStr}) is ${extraPart} and an abstinence day in Shou Kang Bao Jian. Cultivate purity of mind and body starting tonight.`
              : `Ngày mai (${lunarDayStr}) là ${extraPart} và ngày cữ theo Thọ Khang Bảo Giám. Kính nhắc quý đạo hữu chủ động giữ gìn thân tâm thanh tịnh từ tối nay.`;
          } else if (isThoKhang) {
            eveTitle = isEn
              ? '🌸 Tomorrow: Chastity & Vitality Preservation Day'
              : '🌸 Ngày mai: Thọ Khang Bảo Giám (Kiêng hành dâm)';
            const reason = lunarInfo.kiengDam?.reason ? ` (${lunarInfo.kiengDam.reason})` : '';
            eveBody = isEn
              ? `Tomorrow (${lunarDayStr}) is a designated abstinence day in Shou Kang Bao Jian. Cultivate purity of mind and body starting tonight.`
              : `Ngày mai (${lunarDayStr}) là ngày cữ theo Thọ Khang Bảo Giám${reason}. Khuyên nên thanh tâm quả dục, kiêng hành dâm để bảo tồn nguyên khí và tích phước đức.`;
          } else if (isViaPhat) {
            eveTitle = isEn
              ? `🙏 Tomorrow: ${viaTitle}`
              : `🙏 Ngày mai: ${viaTitle}`;
            eveBody = isEn
              ? `Tomorrow (${lunarDayStr}) is a sacred Buddhist feast day. Warmly inviting you to prepare vegetarian meals, observe precepts, and chant.`
              : `Ngày mai (${lunarDayStr}) là ${viaTitle}. Kính chúc quý đạo hữu chuẩn bị hương hoa, phát tâm ăn chay, tụng kinh niệm Phật.`;
          } else if (isThapTrai) {
            eveTitle = isEn
              ? '🌱 Tomorrow: Ten Fasting Observance Day'
              : '🌱 Ngày mai: Ngày Thập Trai (Ăn chay)';
            eveBody = isEn
              ? `Tomorrow (${lunarDayStr}) is a Ten Fasting Day. A mindful reminder to observe vegetarian meals and practice loving-kindness.`
              : `Ngày mai (${lunarDayStr}) là ngày Thập Trai. Kính nhắc quý đạo hữu chuẩn bị thọ trai thanh tịnh, dưỡng tâm từ bi.`;
          }

          const eveId = makeNotificationId(
            2,
            eventDate.getFullYear(),
            eventDate.getMonth() + 1,
            eventDate.getDate(),
            1,
          );

          batch.push({
            id: eveId,
            title: eveTitle,
            body: eveBody,
            schedule: {
              at: eveDate,
              allowWhileIdle: true,
            },
            extra: {
              type: 'lunar_eve',
              lunarDay: lunarInfo.lunarDay,
              lunarMonth: lunarInfo.lunarMonth,
              target: '/tu-tap',
            },
          });
        }
      }

      // (B) Morning Of Notification (06:00 on the day of the event)
      if (settings.lunar.notifyMorningOf) {
        const morningDate = new Date(eventDate);
        morningDate.setHours(6, 0, 0, 0);

        if (morningDate.getTime() > nowMs) {
          let mornTitle = '';
          let mornBody = '';

          if (isThoKhang && (isThapTrai || isViaPhat)) {
            const extraPart = viaTitle || (isEn ? 'Fasting Day' : 'Thập Trai');
            mornTitle = isEn
              ? `🙏 Today: ${extraPart} & Chastity Day`
              : `🙏 Hôm nay: ${extraPart} & Thọ Khang Bảo Giám`;
            mornBody = isEn
              ? `Today (${lunarDayStr}): Fellow practitioners are invited to observe vegetarian meals, chant, cultivate virtue, and conserve vitality.`
              : `Hôm nay ngày ${lunarDayStr}: Kính mời quý đạo hữu phát tâm ăn chay, niệm Phật, giữ gìn thân khẩu ý thanh tịnh và kiêng hành dâm để tích phúc dưỡng sinh.`;
          } else if (isThoKhang) {
            mornTitle = isEn
              ? '🌸 Today: Shou Kang Bao Jian Abstinence Day'
              : '🌸 Hôm nay: Ngày kiêng kỵ Thọ Khang Bảo Giám';
            mornBody = isEn
              ? `Today (${lunarDayStr}): Cultivate inner purity, practice mindfulness, and conserve vital energy.`
              : `Hôm nay ngày ${lunarDayStr}: Khuyên nên thanh tâm quả dục, kiêng hành dâm để bảo tồn nguyên khí, tránh tổn hao thọ mạng.`;
          } else if (isViaPhat) {
            mornTitle = isEn
              ? `🙏 Today: ${viaTitle}`
              : `🙏 Hôm nay: ${viaTitle}`;
            mornBody = isEn
              ? `Today (${lunarDayStr}) is ${viaTitle}. May your practice be peaceful, joyful, and steadfast.`
              : `Hôm nay ngày ${lunarDayStr} là ${viaTitle}. Kính chúc quý đạo hữu vạn sự an lạc, tâm bồ đề kiên cố.`;
          } else if (isThapTrai) {
            mornTitle = isEn
              ? '🌱 Today: Ten Fasting Observance Day'
              : '🌱 Hôm nay: Ngày Thập Trai (Ăn chay)';
            mornBody = isEn
              ? `Today (${lunarDayStr}) is a Ten Fasting Day. Wishing you peace and mindful merit accumulation.`
              : `Hôm nay ngày ${lunarDayStr} là ngày Thập Trai. Chúc quý đạo hữu một ngày an lành, tinh tấn tu niệm.`;
          }

          const mornId = makeNotificationId(
            3,
            eventDate.getFullYear(),
            eventDate.getMonth() + 1,
            eventDate.getDate(),
            2,
          );

          batch.push({
            id: mornId,
            title: mornTitle,
            body: mornBody,
            schedule: {
              at: morningDate,
              allowWhileIdle: true,
            },
            extra: {
              type: 'lunar_morning',
              lunarDay: lunarInfo.lunarDay,
              lunarMonth: lunarInfo.lunarMonth,
              target: '/tu-tap',
            },
          });
        }
      }
    }
  }

  if (context?.personalEnabled ?? isPersonalEventsNotificationEnabled()) {
    const events = loadPersonalLunarEvents();
    const timing = resolvePersonalReminderConfig(settings);
    // Tìm cả ngày lễ ngoài cửa sổ để không bỏ lời nhắc trước tối đa 100 ngày.
    for (let offset = 0; offset <= daysAhead + (timing.beforeEnabled ? timing.daysBefore : 0); offset++) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const matches = getPersonalEventsForDate(date, events);
      if (!matches.length) continue;
      const titles = matches.map(event => event.title).join('; ');
      for (const eve of [true, false]) {
        if (eve ? !timing.beforeEnabled : !timing.dayEnabled) continue;
        const reminderOffset = offset - (eve ? timing.daysBefore : 0);
        if (reminderOffset < 0 || reminderOffset > daysAhead) continue;
        const at = new Date(date);
        if (eve) at.setDate(at.getDate() - timing.daysBefore);
        const [hour, minute] = (eve ? timing.beforeTime : timing.dayTime).split(':').map(Number);
        at.setHours(hour, minute, 0, 0);
        if (at.getTime() <= nowMs) continue;
        batch.push({
          id: makeNotificationId(eve ? 4 : 5, date.getFullYear(), date.getMonth() + 1, date.getDate(), 0),
          title: eve && timing.daysBefore > 1
            ? (isEn ? `🗓️ In ${timing.daysBefore} days: Personal anniversary` : `🗓️ Còn ${timing.daysBefore} ngày: Ngày lễ cá nhân`)
            : isEn ? (eve ? '🗓️ Tomorrow: Personal anniversary' : '🗓️ Today: Personal anniversary') : (eve ? '🗓️ Ngày mai: Ngày lễ cá nhân' : '🗓️ Hôm nay: Ngày lễ cá nhân'),
          body: titles,
          schedule: { at, allowWhileIdle: true },
          extra: { type: eve ? 'personal_eve' : 'personal_morning', eventIds: matches.map(event => event.id), target: '/' },
        });
      }
    }
  }
  // iOS không lấy âm thanh từ cấu hình channel Android hoặc cấu hình plugin chung.
  return settings.soundEnabled ? batch.map(item => ({ ...item, sound: 'default' })) : batch;
}

/** Compile all lunar calendar shapes, including short/leap months, without an expiry date. */
export function buildDurableReminderPlan(settings: PracticeReminderSettings, locale = 'vi'): DurableReminderPlan {
  const lunar: DurableReminderPlan['lunar'] = {};
  const now = new Date(2000, 0, 1, 12);
  for (let month = 1; month <= 12; month++) for (const length of [29, 30]) for (const leap of [false, true]) for (let day = 1; day <= length; day++) {
    const info = getLunarEventForLunarDay({ day, month, year: 2000, leap }, length, locale);
    const items = buildUpcomingNotificationBatch({ ...settings, dailySchedules: [] }, 1, locale, { now, lunarEvent: () => info, personalEnabled: false });
    const entry: DurableReminderPlan['lunar'][string] = {};
    for (const item of items) {
      const slot = item.extra?.type === 'lunar_eve' ? 'eve' : 'morning';
      entry[slot] = { title: item.title, body: item.body, target: '/tu-tap' };
    }
    if (Object.keys(entry).length) lunar[`${month}-${day}-${length}-${leap ? 1 : 0}`] = entry;
  }
  const daily = buildUpcomingNotificationBatch({ ...settings, lunar: { ...settings.lunar, thoKhangBaoGiam: false, thapTrai: false, viaPhat: false } }, 0, locale, { now, lunarEvent: getLunarEvent, personalEnabled: false }).map(item => ({
    id: item.id, title: item.title, body: item.body,
    key: `${item.extra?.slotId}:${item.schedule!.on!.weekday ?? 'all'}`,
    hour: item.schedule!.on!.hour!, minute: item.schedule!.on!.minute!,
    days: item.schedule!.on!.weekday ? [item.schedule!.on!.weekday! - 1] : [0, 1, 2, 3, 4, 5, 6],
  }));
  return { version: 1, enabled: settings.masterEnabled, locale, daily, lunar,
    personal: isPersonalEventsNotificationEnabled() && settings.masterEnabled ? loadPersonalLunarEvents(true) : [],
    eve: settings.lunar.notifyEveBefore, morning: settings.lunar.notifyMorningOf,
    personalTiming: resolvePersonalReminderConfig(settings),
    sound: settings.soundEnabled, vibrate: settings.vibrateEnabled };
}

/**
 * Synchronize settings with OS / Capacitor Notification scheduler
 */
let principalCleanupRevision = 0;
let clearedPrincipalRevision = 0;

async function performReminderSync(
  customSettings?: PracticeReminderSettings,
  locale = 'vi',
): Promise<ReminderSyncResult> {
  const mode = nativePlatform() === 'android' ? 'android-durable' : nativePlatform() === 'ios' ? 'ios-batch' : 'web-unsupported';
  const permissionReason = (value: string): NonNullable<ReminderSyncResult['details']>['reason'] =>
    value === 'denied' ? 'permission-denied' : value === 'unsupported' ? 'unsupported' : value === 'granted' ? null : 'permission-required';
  // Lỗi hủy phải chặn lịch của chủ mới; lần đồng bộ sau thử lại phần còn thiếu.
  while (clearedPrincipalRevision < principalCleanupRevision) {
    const revision = principalCleanupRevision;
    if (nativePlatform() === 'android') await clearDurablePersonalReminders();
    const pending = await getPendingReminderNotifications();
    await cancelUnifiedNotifications(pending.filter(item => String(item.extra?.type).startsWith('personal_')).map(item => item.id), true);
    await clearDeliveredPersonalReminderNotifications();
    clearedPrincipalRevision = revision;
  }
  const settings = customSettings ?? loadReminderSettings(nativePlatform() !== 'web');
  if (!settings.masterEnabled || !isPersonalEventsNotificationEnabled()) {
    await clearDeliveredPersonalReminderNotifications();
  }
  if (nativePlatform() === 'android') {
    // Persist first, even if permission is denied; never discard source events or legacy alarms on failure.
    const permission = settings.masterEnabled ? await getUnifiedNotificationPermission() : 'granted';
    // Đồng bộ nền không được mở hộp thoại; chỉ lần lưu cài đặt do người dùng mới xin quyền.
    const granted = permission === 'prompt' && customSettings ? await requestUnifiedNotificationPermission() : permission;
    const result = await replaceDurableReminderPlan(buildDurableReminderPlan(settings, locale));
    // The native plan is durable before migrating the old 45-day alarms.
    const pending = await getPendingReminderNotifications();
    await cancelUnifiedNotifications(pending.map(item => item.id), true);
    return { scheduledCount: result.ruleCount, success: !settings.masterEnabled || granted === 'granted', details: {
      mode: settings.masterEnabled ? mode : 'disabled', reason: settings.masterEnabled ? permissionReason(granted) : null,
      ...(Number.isSafeInteger(result.ruleCount) && result.ruleCount >= 0 ? { ruleCount: result.ruleCount } : {}),
      ...(result.alarmMode ? { alarmMode: result.alarmMode } : {}),
    } };
  }
  const ios = nativePlatform() === 'ios';
  const allPending = await getPendingReminderNotifications(ios);
  let pending = ios ? allPending.filter(isReminderNotification) : allPending;

  // If master toggle is disabled: cancel all reminders
  if (!settings.masterEnabled) {
    await cancelUnifiedNotifications(pending.map(item => item.id), true);
    return { scheduledCount: 0, success: true, details: { mode: 'disabled', reason: null } };
  }

  // Opt-out phải xóa nội dung riêng cả khi người dùng đã thu hồi quyền hệ thống.
  if (!isPersonalEventsNotificationEnabled()) {
    const privateItems = pending.filter(item => String(item.extra?.type).startsWith('personal_'));
    await cancelUnifiedNotifications(privateItems.map(item => item.id), true);
    pending = pending.filter(item => !String(item.extra?.type).startsWith('personal_'));
  }

  // Ensure permission before scheduling
  const permission = await getUnifiedNotificationPermission();
  if (permission === 'denied' || permission === 'unsupported') return { scheduledCount: 0, success: false, details: { mode, reason: permissionReason(permission) } };
  if (permission !== 'granted') {
    if (!customSettings) return { scheduledCount: 0, success: false, details: { mode, reason: 'permission-required' } };
    // If not granted yet, try to request
    const requested = await requestUnifiedNotificationPermission();
    if (requested !== 'granted') {
      return { scheduledCount: 0, success: false, details: { mode, reason: permissionReason(requested) } };
    }
  }

  // Build full upcoming batch (look-ahead 45 days)
  let batch = buildUpcomingNotificationBatch(settings, 45, locale);
  const requestedCount = batch.length;
  let schedulerCapacity: number | undefined;
  if (ios) {
    // Conservative app-wide budget based on published scheduler experience;
    // reserve other tools' requests and retain recurring practice rules first.
    const foreignCount = new Set(allPending.filter(item => !isReminderNotification(item)).map(item => item.id)).size;
    const capacity = Math.max(0, 64 - foreignCount);
    schedulerCapacity = capacity;
    const recurring = batch.filter(item => item.schedule?.repeats);
    if (recurring.length > capacity || (batch.length > 0 && capacity === 0)) return { scheduledCount: 0, success: false, details: { mode, reason: 'capacity', requestedCount, capacity, horizonDays: 45, limited: true } };
    if (batch.length > capacity) {
      const upcoming = batch.filter(item => !item.schedule?.repeats)
        .sort((a, b) => a.schedule!.at!.getTime() - b.schedule!.at!.getTime());
      batch = [...recurring, ...upcoming.slice(0, capacity - recurring.length)];
    }
  }
  const success = await scheduleUnifiedNotifications(batch);
  if (success) {
    const nextIds = new Set(batch.map(item => item.id));
    await cancelUnifiedNotifications(pending.filter(item => !nextIds.has(item.id)).map(item => item.id), true);
  }
  const acceptedOneOffTimes = success && ios && batch.length < requestedCount
    ? batch.filter(item => !item.schedule?.repeats).map(item => item.schedule?.at?.getTime() ?? Number.NaN).filter(Number.isFinite)
    : [];
  return { scheduledCount: success ? batch.length : 0, success, details: { mode,
    reason: mode === 'web-unsupported' ? 'unsupported' : !success ? 'schedule-failed' : batch.length < requestedCount ? 'capacity' : null,
    requestedCount, ...(schedulerCapacity !== undefined ? { capacity: schedulerCapacity } : {}),
    ...(ios ? { horizonDays: 45 } : {}), limited: batch.length < requestedCount,
    ...(acceptedOneOffTimes.length ? { actualOneOffThrough: new Date(Math.max(...acceptedOneOffTimes)).toISOString() } : {}),
  } };
}

// Serialize native writes: a slower previous sync must not replace a newer edit.
let syncQueue: Promise<unknown> = Promise.resolve();
let latestSyncResult: ReminderSyncResult | null = null;
const syncResultListeners = new Set<(result: ReminderSyncResult | null) => void>();
function publishSyncResult(result: ReminderSyncResult | null): void {
  latestSyncResult = result;
  for (const listener of syncResultListeners) listener(result);
}
export function subscribeReminderSyncStatus(listener: (result: ReminderSyncResult | null) => void): () => void {
  syncResultListeners.add(listener); listener(latestSyncResult);
  return () => syncResultListeners.delete(listener);
}
export function syncRemindersWithSystem(customSettings?: PracticeReminderSettings, locale = 'vi'): Promise<ReminderSyncResult> {
  // Settings use the same JSON format as device storage. Svelte $state proxies
  // cannot be structuredClone'd; serialize now so queued writes keep this edit.
  const settings: PracticeReminderSettings | undefined = customSettings ? JSON.parse(JSON.stringify(customSettings)) : undefined;
  const revision = principalCleanupRevision;
  const next = syncQueue.catch(() => undefined).then(() => performReminderSync(settings, locale)).then(result => {
    if (revision === principalCleanupRevision) publishSyncResult(result);
    return result;
  });
  syncQueue = next;
  return next;
}

/** Refresh after edits, account switches, locale changes and return from background. */
export function startReminderSystemSync(getLocale: () => string): () => void {
  let disposed = false;
  const refresh = () => {
    if (!disposed) void syncRemindersWithSystem(undefined, getLocale()).catch(() => undefined);
  };
  const accountChanged = () => {
    principalCleanupRevision += 1;
    publishSyncResult(null);
    refresh();
  };
  const visible = () => { if (document.visibilityState === 'visible') refresh(); };
  const events = ['quangtu:personal-events-changed', 'quangtu:personal-events-notify-toggled', 'quangtu:locale-changed'];
  events.forEach(event => window.addEventListener(event, refresh));
  window.addEventListener('quangtu:session-changed', accountChanged);
  document.addEventListener('visibilitychange', visible);
  refresh();
  return () => {
    disposed = true;
    events.forEach(event => window.removeEventListener(event, refresh));
    window.removeEventListener('quangtu:session-changed', accountChanged);
    document.removeEventListener('visibilitychange', visible);
  };
}

/**
 * Send an immediate test notification to verify display, sound, and vibration
 */
export async function sendTestNotification(locale = 'vi'): Promise<boolean> {
  const isEn = locale === 'en';
  const settings = loadReminderSettings();
  if (settings.vibrateEnabled) triggerHaptic('medium');

  const title = isEn ? '🔔 Tu Tap Test Notification' : '🔔 Kiểm tra thông báo Tu Tập';
  const body = isEn
    ? 'Practice reminder is active! Notifications for Shou Kang Bao Jian, Fasting Days, and daily sessions are set.'
    : 'Nhắc nhở tu tập hoạt động tốt! Các ngày Thọ Khang Bảo Giám, Thập Trai và thời khóa tu tập đã sẵn sàng.';

  const permission = await getUnifiedNotificationPermission();
  if (permission !== 'granted') {
    const requested = await requestUnifiedNotificationPermission();
    if (requested !== 'granted') return false;
  }

  if (nativePlatform() === 'android') {
    return (await sendDurableTestNotification({ title, body, sound: settings.soundEnabled, vibrate: settings.vibrateEnabled })).shown;
  }
  await showUnifiedNotification(title, body, 999999, settings.soundEnabled ? 'default' : undefined);
  return true;
}
