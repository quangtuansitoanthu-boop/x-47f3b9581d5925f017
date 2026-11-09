import type { AppLocale } from '$lib/i18n/translations';
import {
  CAN,
  CHI,
  getDayCanChi,
  getHoangDaoInfo,
  getMondayOfWeek,
  solarToLunar,
  type CalendarDayItem,
  type LunarDay,
} from './lunar-calendar';
import { getLunarEvent } from './lunar-events';

const WEEKDAY_NAMES_SHORT: Record<AppLocale, string[]> = {
  vi: ['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'CN'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

const WEEKDAY_NAMES_FULL: Record<AppLocale, string[]> = {
  vi: ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function getVietnamNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export interface DayDetailInfo {
  solarDateTitle: string; // 'Thứ Ba, ngày 22/09/2026' or 'Tuesday, September 22, 2026'
  solarWeekday: string; // 'Thứ Ba' or 'Tuesday'
  solarRemainder: string; // ', ngày 22/09/2026' or ', September 22, 2026'
  lunarDateTitle: string; // '12/8/2026 (Bính Ngọ)'
  lunarDayMonth: string; // '12/08'
  lunarYearCanChi: string; // 'Bính Ngọ'
  dayCanChiName: string; // 'Kỷ Hợi'
  starName: string;
  isHoangDao: boolean;
  badges: { text: string; type: 'chay' | 'via' | 'ram' | 'mung1' | 'hoangdao' | 'hacdao' }[];
  kiengDam: { reason: string; harm: string } | null;
}

const STAR_NAMES_VI = [
  'Thanh Long (Hoàng Đạo)',
  'Minh Đường (Hoàng Đạo)',
  'Thiên Hình (Hắc Đạo)',
  'Chu Tước (Hắc Đạo)',
  'Kim Quỹ (Hoàng Đạo)',
  'Kim Đường (Hoàng Đạo)',
  'Bạch Hổ (Hắc Đạo)',
  'Ngọc Đường (Hoàng Đạo)',
  'Thiên Lao (Hắc Đạo)',
  'Huyền Vũ (Hắc Đạo)',
  'Tư Mệnh (Hoàng Đạo)',
  'Câu Trận (Hắc Đạo)',
];

const STAR_NAMES_EN = [
  'Azure Dragon (Auspicious)',
  'Bright Hall (Auspicious)',
  'Heavenly Penalty (Inauspicious)',
  'Vermilion Bird (Inauspicious)',
  'Golden Coffer (Auspicious)',
  'Golden Hall (Auspicious)',
  'White Tiger (Inauspicious)',
  'Jade Hall (Auspicious)',
  'Heavenly Prison (Inauspicious)',
  'Black Tortoise (Inauspicious)',
  'Life Governor (Auspicious)',
  'Hook Array (Inauspicious)',
];

const CAN_ELEMENT_EN: Record<string, string> = {
  'Giáp': 'Wood',
  'Ất': 'Wood',
  'Bính': 'Fire',
  'Đinh': 'Fire',
  'Mậu': 'Earth',
  'Kỷ': 'Earth',
  'Canh': 'Metal',
  'Tân': 'Metal',
  'Nhâm': 'Water',
  'Quý': 'Water',
};

const CHI_ANIMAL_EN: Record<string, string> = {
  'Tý': 'Rat',
  'Sửu': 'Ox',
  'Dần': 'Tiger',
  'Mão': 'Cat/Rabbit',
  'Thìn': 'Dragon',
  'Tỵ': 'Snake',
  'Ngọ': 'Horse',
  'Mùi': 'Goat',
  'Thân': 'Monkey',
  'Dậu': 'Rooster',
  'Tuất': 'Dog',
  'Hợi': 'Pig',
};

export function formatCanChiEn(can: string, chi: string): string {
  const element = CAN_ELEMENT_EN[can] ?? '';
  const animal = CHI_ANIMAL_EN[chi] ?? '';
  if (element && animal) {
    return `${element} ${animal}`;
  }
  return animal || element || '';
}

export function getLocalizedStar(starName: string, locale: AppLocale = 'vi'): string {
  if (locale !== 'en') return starName;
  const idx = STAR_NAMES_VI.indexOf(starName);
  if (idx >= 0) return STAR_NAMES_EN[idx];
  return starName.replace('(Hoàng Đạo)', '(Auspicious)').replace('(Hắc Đạo)', '(Inauspicious)');
}

export function buildDayDetail(item: CalendarDayItem, locale: AppLocale = 'vi'): DayDetailInfo {
  const weekdayIndex = item.date.getDay() === 0 ? 6 : item.date.getDay() - 1;
  const solarWeekday = WEEKDAY_NAMES_FULL[locale][weekdayIndex];
  const solarRemainder = locale === 'en'
    ? `, ${MONTH_NAMES_EN[item.solarMonth - 1]} ${pad(item.solarDay)}, ${item.solarYear}`
    : `, ngày ${pad(item.solarDay)}/${pad(item.solarMonth)}/${item.solarYear}`;
  const solarDateTitle = `${solarWeekday}${solarRemainder}`;
  const canYear = CAN[(item.lunar.year + 6) % 10];
  const chiYear = CHI[(item.lunar.year + 8) % 12];
  const yearCanChi = locale === 'en'
    ? formatCanChiEn(canYear, chiYear)
    : `${canYear} ${chiYear}`;
  const leapSuffix = item.lunar.leap ? (locale === 'en' ? ' (leap)' : ' (nhuận)') : '';
  const lunarDateTitle = `${item.lunar.day}/${item.lunar.month}${leapSuffix}/${item.lunar.year} (${yearCanChi})`;
  const lunarDayMonth = `${pad(item.lunar.day)}/${pad(item.lunar.month)}`;

  const badges: DayDetailInfo['badges'] = [];

  if (item.viaName) {
    badges.push({ text: `🙏 ${item.viaName}`, type: 'via' });
  }
  if (item.isRam) {
    badges.push({ text: locale === 'en' ? '🌕 Full Moon Day' : '🌕 Ngày Rằm', type: 'ram' });
  } else if (item.isMung1) {
    badges.push({ text: locale === 'en' ? '🌑 New Moon Day' : '🌑 Mùng Một', type: 'mung1' });
  }
  if (item.isThapTrai && !item.isRam && !item.isMung1) {
    badges.push({
      text: locale === 'en' ? '📿 Fasting Day (Vegetarian)' : '📿 Ngày Thập Trai (Ăn Chay)',
      type: 'chay'
    });
  }
  const starName = getLocalizedStar(item.starName, locale);
  if (item.isHoangDao) {
    badges.push({
      text: `✨ ${starName}`,
      type: 'hoangdao'
    });
  }

  const eventInfo = getLunarEvent(item.date, locale);
  const dayCanChiName = locale === 'en'
    ? formatCanChiEn(item.canChi.can, item.canChi.chi)
    : item.canChi.fullName;

  return {
    solarDateTitle,
    solarWeekday,
    solarRemainder,
    lunarDateTitle,
    lunarDayMonth,
    lunarYearCanChi: yearCanChi,
    dayCanChiName,
    starName,
    isHoangDao: item.isHoangDao,
    badges,
    kiengDam: eventInfo.kiengDam,
  };
}

export interface WeekCalendarData {
  days: CalendarDayItem[];
  weekTitle: string; // 'Tháng 9, 2026' or 'September 2026'
  lunarMonthTitle: string; // 'Tháng 8 Âm lịch' or 'Lunar Month 8'
  mondayDate: Date;
  sundayDate: Date;
}

export function buildWeekCalendar(anchorDate: Date, todayDate?: Date, locale: AppLocale = 'vi'): WeekCalendarData {
  const actualToday = todayDate ?? getVietnamNow();
  const todayKey = `${actualToday.getFullYear()}-${pad(actualToday.getMonth() + 1)}-${pad(actualToday.getDate())}`;

  const monday = getMondayOfWeek(anchorDate);
  const days: CalendarDayItem[] = [];

  for (let i = 0; i < 7; i++) {
    const curDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateKey = `${curDate.getFullYear()}-${pad(curDate.getMonth() + 1)}-${pad(curDate.getDate())}`;
    const solarDay = curDate.getDate();
    const solarMonth = curDate.getMonth() + 1;
    const solarYear = curDate.getFullYear();
    const dayOfWeekName = WEEKDAY_NAMES_SHORT[locale][i];
    const isSunday = i === 6;
    const isToday = dateKey === todayKey;

    const lunar = solarToLunar(solarDay, solarMonth, solarYear);
    const canChi = getDayCanChi(solarDay, solarMonth, solarYear);
    const hoangDao = getHoangDaoInfo(lunar.month, canChi.chiIndex);
    const lunarEvent = getLunarEvent(curDate, locale);

    const isRam = lunar.day === 15;
    const isMung1 = lunar.day === 1;
    const isThapTrai = lunarEvent.isThapTrai;

    // Orange dot: Buddhist via festival, Ram, Mung 1, or Thap Trai (fast day)
    const hasOrangeDot = isThapTrai || isRam || isMung1 || Boolean(lunarEvent.viaName);
    // Green dot: Hoang Dao auspicious day
    const hasGreenDot = hoangDao.isHoangDao;

    const lunarDayStr = isMung1 ? `1/${lunar.month}` : String(lunar.day);
    const solarFullTitle = locale === 'en'
      ? `${WEEKDAY_NAMES_FULL.en[i]}, ${MONTH_NAMES_EN[solarMonth - 1]} ${pad(solarDay)}, ${solarYear}`
      : `${WEEKDAY_NAMES_FULL.vi[i]}, ngày ${pad(solarDay)}/${pad(solarMonth)}/${solarYear}`;
    const canYear = CAN[(lunar.year + 6) % 10];
    const chiYear = CHI[(lunar.year + 8) % 12];
    const yearCanChi = locale === 'en'
      ? formatCanChiEn(canYear, chiYear)
      : `${canYear} ${chiYear}`;
    const leapSuffix = lunar.leap ? (locale === 'en' ? ' (leap)' : ' (nhuận)') : '';
    const lunarFullStr = `${lunar.day}/${lunar.month}${leapSuffix}/${lunar.year} (${yearCanChi})`;

    days.push({
      date: curDate,
      dateKey,
      dayOfWeekName,
      solarDay,
      solarMonth,
      solarYear,
      solarDateStr: `${pad(solarDay)}/${pad(solarMonth)}/${solarYear}`,
      solarFullTitle,
      lunar,
      lunarDayStr,
      lunarFullStr,
      canChi,
      isToday,
      isSunday,
      isHoangDao: hoangDao.isHoangDao,
      starName: getLocalizedStar(hoangDao.starName, locale),
      isThapTrai,
      isRam,
      isMung1,
      viaName: lunarEvent.viaName,
      hasThoKhangDot: Boolean(lunarEvent.kiengDam),
      hasOrangeDot,
      hasGreenDot,
    });
  }

  // Week titles
  const middleDay = days[3] ?? days[0];
  const weekTitle = locale === 'en'
    ? `${MONTH_NAMES_EN[middleDay.solarMonth - 1]} ${middleDay.solarYear}`
    : `Tháng ${middleDay.solarMonth}, ${middleDay.solarYear}`;
  const lunarMonthTitle = locale === 'en'
    ? `Lunar M${middleDay.lunar.month}`
    : `Tháng ${middleDay.lunar.month} Âm lịch`;
  const sunday = days[6].date;

  return {
    days,
    weekTitle,
    lunarMonthTitle,
    mondayDate: monday,
    sundayDate: sunday,
  };
}

export interface MonthCalendarData {
  days: CalendarDayItem[];
  monthTitle: string;
  lunarMonthTitle: string;
}

export function buildMonthCalendar(anchorDate: Date, todayDate?: Date, locale: AppLocale = 'vi'): MonthCalendarData {
  const actualToday = todayDate ?? getVietnamNow();
  const todayKey = `${actualToday.getFullYear()}-${pad(actualToday.getMonth() + 1)}-${pad(actualToday.getDate())}`;

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startMonday = getMondayOfWeek(firstDayOfMonth);
  const endSunday = new Date(getMondayOfWeek(lastDayOfMonth).getTime() + 6 * 86400000);

  const days: CalendarDayItem[] = [];
  const current = new Date(startMonday.getFullYear(), startMonday.getMonth(), startMonday.getDate());

  while (current <= endSunday) {
    const curDate = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const dateKey = `${curDate.getFullYear()}-${pad(curDate.getMonth() + 1)}-${pad(curDate.getDate())}`;
    const solarDay = curDate.getDate();
    const solarMonth = curDate.getMonth() + 1;
    const solarYear = curDate.getFullYear();
    const dayOfWeek = (curDate.getDay() + 6) % 7;
    const dayOfWeekName = WEEKDAY_NAMES_SHORT[locale][dayOfWeek];
    const isSunday = dayOfWeek === 6;
    const isToday = dateKey === todayKey;

    const lunar = solarToLunar(solarDay, solarMonth, solarYear);
    const canChi = getDayCanChi(solarDay, solarMonth, solarYear);
    const hoangDao = getHoangDaoInfo(lunar.month, canChi.chiIndex);
    const lunarEvent = getLunarEvent(curDate, locale);

    const isRam = lunar.day === 15;
    const isMung1 = lunar.day === 1;
    const isThapTrai = lunarEvent.isThapTrai;
    const hasOrangeDot = isThapTrai || isRam || isMung1 || Boolean(lunarEvent.viaName);
    const hasGreenDot = hoangDao.isHoangDao;

    const lunarDayStr = isMung1 ? `1/${lunar.month}` : String(lunar.day);
    const solarFullTitle = locale === 'en'
      ? `${WEEKDAY_NAMES_FULL.en[dayOfWeek]}, ${MONTH_NAMES_EN[solarMonth - 1]} ${pad(solarDay)}, ${solarYear}`
      : `${WEEKDAY_NAMES_FULL.vi[dayOfWeek]}, ngày ${pad(solarDay)}/${pad(solarMonth)}/${solarYear}`;
    const canYear = CAN[(lunar.year + 6) % 10];
    const chiYear = CHI[(lunar.year + 8) % 12];
    const yearCanChi = locale === 'en'
      ? formatCanChiEn(canYear, chiYear)
      : `${canYear} ${chiYear}`;
    const leapSuffix = lunar.leap ? (locale === 'en' ? ' (leap)' : ' (nhuận)') : '';
    const lunarFullStr = `${lunar.day}/${lunar.month}${leapSuffix}/${lunar.year} (${yearCanChi})`;

    days.push({
      date: curDate,
      dateKey,
      dayOfWeekName,
      solarDay,
      solarMonth,
      solarYear,
      solarDateStr: `${pad(solarDay)}/${pad(solarMonth)}/${solarYear}`,
      solarFullTitle,
      lunar,
      lunarDayStr,
      lunarFullStr,
      canChi,
      isToday,
      isSunday,
      isHoangDao: hoangDao.isHoangDao,
      starName: getLocalizedStar(hoangDao.starName, locale),
      isThapTrai,
      isRam,
      isMung1,
      viaName: lunarEvent.viaName,
      hasThoKhangDot: Boolean(lunarEvent.kiengDam),
      hasOrangeDot,
      hasGreenDot,
    });

    current.setDate(current.getDate() + 1);
  }

  const monthTitle = locale === 'en'
    ? `${MONTH_NAMES_EN[month]} ${year}`
    : `Tháng ${month + 1}, ${year}`;
  const midDay = days[Math.floor(days.length / 2)];
  const lunarMonthTitle = locale === 'en'
    ? `Lunar M${midDay?.lunar.month ?? 1}`
    : `Tháng ${midDay?.lunar.month ?? 1} Âm lịch`;

  return {
    days,
    monthTitle,
    lunarMonthTitle,
  };
}
