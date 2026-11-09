export const ADMIN_DATE_RANGE_OPTIONS = [
  { group: 'recent', label: 'Hôm nay', value: 'today' },
  { group: 'recent', label: 'Hôm qua', value: 'yesterday' },
  { group: 'recent', label: '7 ngày gần nhất', value: '7d' },
  { group: 'recent', label: '28 ngày gần nhất', value: '28d' },
  { group: 'recent', label: '91 ngày gần nhất', value: '91d' },
  { group: 'calendar', label: 'Tháng này', value: 'month' },
  { group: 'calendar', label: 'Tháng trước', value: 'last-month' },
  { group: 'calendar', label: 'Năm nay', value: 'year' },
  { group: 'calendar', label: '12 tháng gần nhất', value: '365d' },
] as const;

export type AdminDateRange = (typeof ADMIN_DATE_RANGE_OPTIONS)[number]['value'] | '30d';
export type AdminTrafficInterval = 'day' | 'month';

export interface AdminDateRangeWindow {
  days: number;
  endDate: string;
  interval: AdminTrafficInterval;
  range: AdminDateRange;
  startDate: string;
}

export const DEFAULT_ADMIN_DATE_RANGE: AdminDateRange = '28d';

const RANGE_VALUES = new Set<string>([...ADMIN_DATE_RANGE_OPTIONS.map((option) => option.value), '30d']);

export function normalizeAdminDateRange(value: unknown): AdminDateRange {
  return typeof value === 'string' && RANGE_VALUES.has(value)
    ? value as AdminDateRange
    : DEFAULT_ADMIN_DATE_RANGE;
}

export function adminDateRangeLabel(value: unknown): string {
  const range = normalizeAdminDateRange(value);
  if (range === '30d') return '30 ngày gần nhất';
  return ADMIN_DATE_RANGE_OPTIONS.find((option) => option.value === range)?.label ?? '28 ngày gần nhất';
}

export function resolveAdminDateRange(value: unknown, today: string): AdminDateRangeWindow {
  const range = normalizeAdminDateRange(value);
  let startDate = today;
  let endDate = today;

  if (range === 'yesterday') {
    startDate = shiftDate(today, -1);
    endDate = startDate;
  } else if (range === '7d') {
    startDate = shiftDate(today, -6);
  } else if (range === '28d') {
    startDate = shiftDate(today, -27);
  } else if (range === '30d') {
    startDate = shiftDate(today, -29);
  } else if (range === '91d') {
    startDate = shiftDate(today, -90);
  } else if (range === 'month') {
    startDate = `${today.slice(0, 7)}-01`;
  } else if (range === 'last-month') {
    const monthStart = `${today.slice(0, 7)}-01`;
    startDate = monthBoundary(today, -1);
    endDate = shiftDate(monthStart, -1);
  } else if (range === 'year') {
    startDate = `${today.slice(0, 4)}-01-01`;
  } else if (range === '365d') {
    const currentMonthStart = `${today.slice(0, 7)}-01`;
    startDate = monthBoundary(today, -12);
    endDate = shiftDate(currentMonthStart, -1);
  }

  return {
    days: inclusiveDays(startDate, endDate),
    endDate,
    interval: range === 'year' || range === '365d' ? 'month' : 'day',
    range,
    startDate,
  };
}

export function adminDateRangeBuckets(window: AdminDateRangeWindow): string[] {
  if (window.interval === 'month') {
    return Array.from({ length: inclusiveMonths(window.startDate, window.endDate) }, (_, index) => monthBoundary(window.startDate, index));
  }
  return Array.from({ length: window.days }, (_, index) => shiftDate(window.startDate, index));
}

function monthBoundary(dateKey: string, monthDelta: number): string {
  const [year, month] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + monthDelta, 1)).toISOString().slice(0, 10);
}

function shiftDate(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function inclusiveMonths(startDate: string, endDate: string): number {
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);
  return Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth + 1);
}
