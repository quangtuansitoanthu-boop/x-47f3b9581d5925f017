import type { PracticeLog, PracticePeriod } from './logs';
import { formatVietnamDate as formatSharedVietnamDate } from '../../utils/vietnam-date-format';
import { buildPracticeSummary } from '../../i18n/practice-summary';

function vietnamFormatter() {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric'
  });
}

export function getVietnamIsoDate(now = new Date()): string {
  const parts = vietnamFormatter().formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function shiftVietnamDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  const nextYear = utc.getUTCFullYear();
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(utc.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function formatVietnamDate(isoDate: string): string {
  return formatSharedVietnamDate(isoDate);
}

export function getLogsByPeriod(logs: PracticeLog[], period: PracticePeriod, now = new Date()): PracticeLog[] {
  const today = getVietnamIsoDate(now);

  if (period === 'day') {
    return logs.filter((log) => log.date === today);
  }

  if (period === 'week') {
    const firstDay = shiftVietnamDate(today, -6);
    return logs.filter((log) => log.date >= firstDay && log.date <= today);
  }

  if (period === 'month') {
    const monthPrefix = today.slice(0, 7);
    return logs.filter((log) => log.date.startsWith(monthPrefix));
  }

  if (period === 'year') {
    const year = today.slice(0, 4);
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;
    return logs.filter((log) => log.date >= startOfYear && log.date <= endOfYear);
  }

  return logs;
}

export function calculatePracticeStreak(logs: PracticeLog[], now = new Date()): number {
  const today = getVietnamIsoDate(now);
  // Bản ghi cũ sai ngày vẫn được giữ; chỉ loại khỏi phép tính chuỗi hiện tại.
  const uniqueDates = [...new Set(logs.map((log) => log.date).filter((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date > today) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }))].sort((left, right) => right.localeCompare(left, 'vi'));
  if (!uniqueDates.length) return 0;

  let streak = 0;
  let expected = today;

  if (uniqueDates[0] !== expected) {
    const yesterday = shiftVietnamDate(expected, -1);
    if (uniqueDates[0] !== yesterday) return 0;
    expected = yesterday;
  }

  for (const date of uniqueDates) {
    if (date !== expected) break;
    streak += 1;
    expected = shiftVietnamDate(expected, -1);
  }

  return streak;
}

export function buildSummarySentence(period: PracticePeriod, logs: PracticeLog[], locale: 'vi' | 'en' = 'vi'): string {
  return buildPracticeSummary(period, logs, locale);
}

export function summarizePracticeStats(logs: PracticeLog[], period: PracticePeriod, now = new Date(), locale: 'vi' | 'en' = 'vi') {
  const scopedLogs = getLogsByPeriod(logs, period, now);
  const total = scopedLogs.reduce((sum, log) => sum + log.count, 0);
  const activeDays = new Set(scopedLogs.map((log) => log.date)).size;
  const streak = calculatePracticeStreak(logs, now);

  return {
    activeDays,
    scopedLogs,
    streak,
    summary: buildSummarySentence(period, scopedLogs, locale),
    total
  };
}
