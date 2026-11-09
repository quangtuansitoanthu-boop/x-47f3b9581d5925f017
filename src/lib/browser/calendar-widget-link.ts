export const CALENDAR_WIDGET_DATE_EVENT = 'quangtu:calendar-widget-date';

export function parseCalendarWidgetDate(value: string | null | undefined): Date | null {
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  // Ngày trong widget là ngày lịch, không phải thời điểm UTC; buổi trưa tránh biên DST.
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}
