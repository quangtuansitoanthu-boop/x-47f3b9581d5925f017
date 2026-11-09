const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function calendarLabel(date: CalendarDate): string {
  return `${twoDigits(date.day)}/${twoDigits(date.month)}/${date.year}`;
}

function validCalendarDate(year: number, month: number, day: number): CalendarDate | null {
  if (![year, month, day].every(Number.isInteger) || year < 1 || month < 1 || month > 12 || day < 1) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day, 12));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return { year, month, day };
}

function timestampCalendarDate(value: string): CalendarDate | null {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: 'numeric',
    month: 'numeric',
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric'
  }).formatToParts(timestamp);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return validCalendarDate(numberPart('year'), numberPart('month'), numberPart('day'));
}

export function parseVietnamDate(value: string | null | undefined): CalendarDate | null {
  const source = String(value ?? '').trim();
  if (!source) return null;

  const legacy = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/u);
  if (legacy) return validCalendarDate(Number(legacy[3]), Number(legacy[2]), Number(legacy[1]));

  const calendar = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|\s)/u);
  if (calendar) return validCalendarDate(Number(calendar[1]), Number(calendar[2]), Number(calendar[3]));

  return timestampCalendarDate(source);
}

const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatVietnamDate(value: string | null | undefined, locale?: string): string {
  const source = String(value ?? '').trim();
  const date = parseVietnamDate(source);
  if (!date) return source;
  if (locale === 'en') {
    return `${EN_MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
  }
  return calendarLabel(date);
}

export function formatVietnamDateWithWeekday(value: string | null | undefined, locale?: string): string {
  const source = String(value ?? '').trim();
  const date = parseVietnamDate(source);
  if (!date) return source;
  const dayIndex = new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).getUTCDay();
  if (locale === 'en') {
    return `${EN_WEEKDAYS[dayIndex]}, ${EN_MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
  }
  const weekday = WEEKDAYS[dayIndex];
  return `${weekday}, ngày ${calendarLabel(date)}`;
}
