import { LEGACY_LOCAL_STORAGE_KEYS, type StorageLike } from './storage-contract';
import { nativePlatform } from './native-platform';
import { localizeLunarEvent, type LunarEventNotificationInfo } from '$lib/components/lunar/lunar-events';
import {
  getUnifiedNotificationPermission,
  requestUnifiedNotificationPermission,
  showUnifiedNotification,
} from './native-notifications';

export type { LunarEventNotificationInfo } from '$lib/components/lunar/lunar-events';

export interface LunarNotificationRuntime {
  permission: NotificationPermission;
  show: (title: string, options: NotificationOptions) => Promise<void> | void;
  storage: StorageLike;
}

function getSavedLocale(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('tutam_locale') || 'vi';
    }
  } catch {}
  return 'vi';
}

export function createLunarReminder(rawInfo: LunarEventNotificationInfo, locale?: string): {
  options: NotificationOptions;
  title: string;
} {
  const activeLocale = locale || getSavedLocale();
  const info = activeLocale === 'en' ? (localizeLunarEvent(rawInfo, 'en') ?? rawInfo) : rawInfo;

  let title = 'Nhắc nhở ngày Thập Trai';
  let body = '';

  if (activeLocale === 'en') {
    title = 'Ten Fasting Day Reminder';
    body = `Today is a Ten Fasting Day (Lunar ${info.lunarDay}/${info.lunarMonth}). Fellow practitioners are warmly invited to observe vegetarian meals, keep precepts, and cultivate virtue.`;

    if (info.isThapTrai && info.viaName) {
      title = `Ten Fasting Day & ${info.viaName}`;
      body = `Today is a Ten Fasting Day and ${info.viaName} (Lunar ${info.lunarDay}/${info.lunarMonth}). Fellow practitioners are warmly invited to observe vegetarian meals, keep precepts, chant, recite mantras, and practice virtue.`;
    } else if (info.viaName) {
      title = `Reminder: ${info.viaName}`;
      body = `Today is ${info.viaName} (Lunar ${info.lunarDay}/${info.lunarMonth}). Fellow practitioners are warmly invited to observe vegetarian meals, keep precepts, and cultivate virtue.`;
    } else if (info.isThapTrai) {
      body = `Today is a Ten Fasting Day (Lunar ${info.lunarDay}/${info.lunarMonth}). Fellow practitioners are warmly invited to observe vegetarian meals, keep precepts, chant, recite mantras, and cultivate virtue.`;
    } else if (info.kiengDam) {
      title = 'Reminder: Abstinence Day';
      const harm = info.kiengDam.harm ? `, risk if not observed: "${info.kiengDam.harm}"` : '';
      body = `Today is an abstinence day according to the Shou Kang Bao Jian calendar, reason: "${info.kiengDam.reason}"${harm}`;
    }
  } else {
    const dayPrefix = info.lunarDay <= 10 ? 'mùng' : 'ngày';
    body = `Hôm nay là ngày Thập Trai (${dayPrefix} ${info.lunarDay} âm lịch). Hãy cùng phát tâm ăn chay, hành thiện và công phu!`;

    if (info.isThapTrai && info.viaName) {
      title = `Thập Trai & ${info.viaName}`;
      body = `Hôm nay là ngày Thập Trai và ${info.viaName} (${dayPrefix} ${info.lunarDay}/${info.lunarMonth}). Kính mời đạo hữu phát tâm ăn chay, giữ giới, tụng kinh, trì chú, phóng sinh, hành thiện, những ngày này công đức được nhân lên rất nhiều lần, ngược lại nếu làm ác thì chịu tội nghiệp rất lớn.`;
    } else if (info.viaName) {
      title = `Nhắc nhở: ${info.viaName}`;
      body = `Hôm nay là ${info.viaName} (${dayPrefix} ${info.lunarDay}/${info.lunarMonth}). Kính mời đạo hữu phát tâm ăn chay, giữ giới, tụng kinh, trì chú, phóng sinh, hành thiện, những ngày này công đức được nhân lên rất nhiều lần, ngược lại nếu làm ác thì chịu tội nghiệp rất lớn.`;
    } else if (info.isThapTrai) {
      body = `Hôm nay là ngày Thập Trai (${dayPrefix} ${info.lunarDay} âm lịch). Kính mời đạo hữu phát tâm ăn chay, giữ giới, tụng kinh, trì chú, phóng sinh, hành thiện, những ngày này công đức được nhân lên rất nhiều lần, ngược lại nếu làm ác thì chịu tội nghiệp rất lớn.`;
    } else if (info.kiengDam) {
      title = 'Nhắc nhở: Kiêng Hành Dâm';
      const harm = info.kiengDam.harm ? `, tác hại nếu không kiêng dâm: "${info.kiengDam.harm}"` : '';
      body = `Hôm nay là ngày kiêng thủ dâm, hành dâm (kể cả vợ chồng) theo Thọ Khang Bảo Giám, lý do: "${info.kiengDam.reason}"${harm}`;
    }
  }

  return {
    title,
    options: {
      body,
      icon: '/assets/branding/tu-tap-logo.png',
      badge: '/assets/branding/tu-tap-logo.png',
      tag: 'thap-trai-reminder',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level runtime helper (kept for backward compat / testing)
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerDailyLunarNotification(
  info: LunarEventNotificationInfo,
  todayKey: string,
  runtime: LunarNotificationRuntime,
  locale?: string,
): Promise<boolean> {
  if (!info.isEvent || runtime.permission !== 'granted') return false;
  if (runtime.storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.uposathaNotifiedDate) === todayKey) return false;

  const reminder = createLunarReminder(info, locale);
  await runtime.show(reminder.title, reminder.options);
  runtime.storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.uposathaNotifiedDate, todayKey);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified (native + web) public helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fire the daily lunar reminder using the unified notification layer
 * (native Capacitor on Android/iOS, ServiceWorker on web).
 * Safe to call on every app launch — will skip if already sent today.
 */
export async function triggerBrowserLunarNotification(
  info: LunarEventNotificationInfo,
  todayKey: string,
  locale?: string,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  // Lịch native Android/iOS sở hữu thông báo và các công tắc nhắc nhở.
  // Banner khi mở app không được gửi trùng hoặc vượt qua lịch đã tắt.
  if (nativePlatform() !== 'web') return false;
  if (!info.isEvent) return false;

  // Check if already notified today
  try {
    if (localStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.uposathaNotifiedDate) === todayKey) {
      return false;
    }
  } catch {
    // localStorage may be unavailable; proceed anyway
  }

  // Check unified permission (works for both native and web)
  const permission = await getUnifiedNotificationPermission();
  if (permission !== 'granted') return false;

  const reminder = createLunarReminder(info, locale);
  await showUnifiedNotification(reminder.title, reminder.options.body as string);

  try {
    localStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.uposathaNotifiedDate, todayKey);
  } catch {
    // best-effort
  }
  return true;
}

/**
 * Request notification permission and immediately fire a welcome notification.
 * Works on both native Android/iOS (via Capacitor) and web browsers.
 */
export async function requestBrowserLunarNotificationPermission(
  locale?: string,
): Promise<NotificationPermission | 'unsupported'> {
  const permission = await requestUnifiedNotificationPermission();
  if (permission !== 'granted') return permission as NotificationPermission | 'unsupported';

  const activeLocale = locale || getSavedLocale();
  const isEn = activeLocale === 'en';
  const title = isEn ? 'Cultivation with Quang Tu' : 'Tu tập cùng Quang Từ';
  const body = isEn
    ? 'Thank you for enabling Ten Fasting Days & Buddhist Memorial Day reminders!'
    : 'Cảm ơn đạo hữu đã bật thông báo nhắc nhở tu tập ngày Thập Trai / Vía Phật!';

  await showUnifiedNotification(title, body);
  return 'granted';
}
