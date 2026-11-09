import { solarToLunar } from '$lib/components/lunar/lunar-calendar';

export type PersonalEventFormIssue = 'missingTitle' | 'missingFrequency' | 'missingType'
  | 'invalidLunarDay' | 'invalidLunarMonth' | 'invalidSolarDay' | 'invalidSolarMonth' | 'invalidSolarDate';

interface PersonalEventForm {
  title: string;
  frequency?: string;
  type: string;
  calendarMode?: string;
  lunarDay: number;
  lunarMonth: number;
  solarDay?: number;
  solarMonth?: number;
}

/** Cùng quy tắc cho modal và bản nháp trong cài đặt; không ghi hoặc đổi dữ liệu. */
export function personalEventFormIssue(value: PersonalEventForm, allowedTypes: readonly string[]): PersonalEventFormIssue | null {
  if (!value.title.trim()) return 'missingTitle';
  if (value.frequency !== 'yearly' && value.frequency !== 'monthly') return 'missingFrequency';
  if (!allowedTypes.includes(value.type)) return 'missingType';
  const monthly = value.frequency === 'monthly';
  if (value.calendarMode === 'solar') {
    const day = Number(value.solarDay), month = Number(value.solarMonth);
    if (!Number.isInteger(month) || month < 1 || month > 12) return 'invalidSolarMonth';
    if (!Number.isInteger(day) || day < 1 || day > 31) return 'invalidSolarDay';
    const maximum = monthly ? 31 : [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return day > maximum ? 'invalidSolarDate' : null;
  }
  if (!Number.isInteger(Number(value.lunarDay)) || Number(value.lunarDay) < 1 || Number(value.lunarDay) > 30) return 'invalidLunarDay';
  if (!monthly && (!Number.isInteger(Number(value.lunarMonth)) || Number(value.lunarMonth) < 1 || Number(value.lunarMonth) > 12)) return 'invalidLunarMonth';
  return null;
}

export function defaultPersonalEventDate(today: Date) {
  const solarDay = today.getDate(), solarMonth = today.getMonth() + 1, year = today.getFullYear();
  const lunar = solarToLunar(solarDay, solarMonth, year);
  return { solarDay, solarMonth, year, lunarDay: lunar.day, lunarMonth: lunar.month };
}

export function lunarDateForSolarDay(day: number, month: number, year: number) {
  const date = new Date(year, month - 1, day);
  if (!Number.isInteger(day) || !Number.isInteger(month) || date.getFullYear() !== year
    || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return solarToLunar(day, month, year);
}

/** Year là năm dương hiển thị, không phải năm âm; giữ đúng ngày đã có khi nó khớp. */
export function solarDateForLunarDay(day: number, month: number, year: number, preferred?: { day: number; month: number }) {
  if (!Number.isInteger(day) || day < 1 || day > 30 || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (preferred) {
    const lunar = lunarDateForSolarDay(preferred.day, preferred.month, year);
    if (lunar?.day === day && lunar.month === month) return { ...preferred, year };
  }
  const cursor = new Date(year, 0, 1, 12);
  while (cursor.getFullYear() === year) {
    const solarDay = cursor.getDate(), solarMonth = cursor.getMonth() + 1;
    const lunar = solarToLunar(solarDay, solarMonth, year);
    if (lunar.day === day && lunar.month === month) return { day: solarDay, month: solarMonth, year };
    cursor.setDate(solarDay + 1);
  }
  return null;
}
