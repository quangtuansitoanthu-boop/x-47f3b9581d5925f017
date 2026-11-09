export interface LunarDay { day: number; month: number; year: number; leap: boolean; }
const integer = Math.floor;

export function julianDay(day: number, month: number, year: number): number {
  const a = integer((14 - month) / 12), y = year + 4800 - a, m = month + 12 * a - 3;
  const gregorian = day + integer((153 * m + 2) / 5) + 365 * y + integer(y / 4) - integer(y / 100) + integer(y / 400) - 32045;
  return gregorian < 2299161 ? day + integer((153 * m + 2) / 5) + 365 * y + integer(y / 4) - 32083 : gregorian;
}

function newMoon(k: number): number {
  const t = k / 1236.85, t2 = t * t, t3 = t2 * t, radians = Math.PI / 180;
  let jd = 2415020.75933 + 29.53058868 * k + .0001178 * t2 - .000000155 * t3;
  jd += .00033 * Math.sin((166.56 + 132.87 * t - .009173 * t2) * radians);
  const m = 359.2242 + 29.10535608 * k - .0000333 * t2 - .00000347 * t3;
  const moon = 306.0253 + 385.81691806 * k + .0107306 * t2 + .00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - .0016528 * t2 - .00000239 * t3;
  let correction = (.1734 - .000393 * t) * Math.sin(m * radians) + .0021 * Math.sin(2 * radians * m);
  correction = correction - .4068 * Math.sin(moon * radians) + .0161 * Math.sin(2 * radians * moon);
  correction -= .0004 * Math.sin(3 * radians * moon);
  correction += .0104 * Math.sin(2 * radians * f) - .0051 * Math.sin(radians * (m + moon));
  correction = correction - .0074 * Math.sin(radians * (m - moon)) + .0004 * Math.sin(radians * (2 * f + m));
  correction = correction - .0004 * Math.sin(radians * (2 * f - m)) - .0006 * Math.sin(radians * (2 * f + moon));
  correction += .001 * Math.sin(radians * (2 * f - moon)) + .0005 * Math.sin(radians * (2 * moon + m));
  const delta = t < -11 ? .001 + .000839 * t + .0002261 * t2 - .00000845 * t3 - .000000081 * t * t3 : -.000278 + .000265 * t + .000262 * t2;
  return jd + correction - delta;
}

function sunLongitude(julian: number): number {
  const t = (julian - 2451545) / 36525, t2 = t * t, radians = Math.PI / 180;
  const m = 357.5291 + 35999.0503 * t - .0001559 * t2 - .00000048 * t * t2;
  const l0 = 280.46645 + 36000.76983 * t + .0003032 * t2;
  let delta = (1.9146 - .004817 * t - .000014 * t2) * Math.sin(radians * m);
  delta += (.019993 - .000101 * t) * Math.sin(2 * radians * m) + .00029 * Math.sin(3 * radians * m);
  const longitude = (l0 + delta) * radians;
  return integer((longitude - Math.PI * 2 * integer(longitude / (Math.PI * 2))) / Math.PI * 6);
}

const newMoonDay = (k: number, timezone: number) => integer(newMoon(k) + .5 + timezone / 24);
const sunLongitudeAt = (day: number, timezone: number) => sunLongitude(day - .5 - timezone / 24);

function lunarMonth11(year: number, timezone: number): number {
  const k = integer((julianDay(31, 12, year) - 2415021) / 29.530588853);
  const moon = newMoonDay(k, timezone);
  return sunLongitudeAt(moon, timezone) >= 9 ? newMoonDay(k - 1, timezone) : moon;
}

function leapMonthOffset(month11: number, timezone: number): number {
  const k = integer((month11 - 2415021.076998695) / 29.530588853 + .5);
  let previous = 0, index = 1, arc = sunLongitudeAt(newMoonDay(k + index, timezone), timezone);
  do { previous = arc; arc = sunLongitudeAt(newMoonDay(k + ++index, timezone), timezone); } while (arc !== previous && index < 14);
  return index - 1;
}

export function solarToLunar(day: number, month: number, year: number, timezone = 7): LunarDay {
  const number = julianDay(day, month, year), k = integer((number - 2415021.076998695) / 29.530588853);
  let start = newMoonDay(k + 1, timezone);
  if (start > number) start = newMoonDay(k, timezone);
  let a11 = lunarMonth11(year, timezone), b11 = a11, lunarYear: number;
  if (a11 >= start) { lunarYear = year; a11 = lunarMonth11(year - 1, timezone); }
  else { lunarYear = year + 1; b11 = lunarMonth11(year + 1, timezone); }
  const lunarDay = number - start + 1, difference = integer((start - a11) / 29);
  let leap = false, lunarMonth = difference + 11;
  if (b11 - a11 > 365) {
    const offset = leapMonthOffset(a11, timezone);
    if (difference >= offset) { lunarMonth = difference + 10; leap = difference === offset; }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && difference < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap };
}

export function lunarToSolar(lunarDay: number, lunarMonth: number, lunarYear: number): { day: number; month: number; year: number } {
  // Approximate start around lunarMonth * 29.5 days into the year
  const approxDate = new Date(lunarYear, 0, 15);
  approxDate.setDate(approxDate.getDate() + (lunarMonth - 1) * 29 + lunarDay);

  const scanStart = new Date(approxDate.getTime() - 35 * 86400000);
  for (let offset = 0; offset <= 75; offset++) {
    const cur = new Date(scanStart.getTime() + offset * 86400000);
    const d = cur.getDate();
    const m = cur.getMonth() + 1;
    const y = cur.getFullYear();
    const l = solarToLunar(d, m, y);
    if (l.day === lunarDay && l.month === lunarMonth && (l.year === lunarYear || Math.abs(l.year - lunarYear) <= 1)) {
      return { day: d, month: m, year: y };
    }
  }

  // Wider fallback scan from start of lunar year
  const startYear = new Date(lunarYear, 0, 1);
  for (let offset = 0; offset <= 420; offset++) {
    const cur = new Date(startYear.getTime() + offset * 86400000);
    const d = cur.getDate();
    const m = cur.getMonth() + 1;
    const y = cur.getFullYear();
    const l = solarToLunar(d, m, y);
    if (l.day === lunarDay && l.month === lunarMonth) {
      return { day: d, month: m, year: y };
    }
  }

  return { day: lunarDay, month: lunarMonth, year: lunarYear };
}

export const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
export const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

export function getDayCanChi(day: number, month: number, year: number): { can: string; chi: string; fullName: string; chiIndex: number } {
  const jd = julianDay(day, month, year);
  const canIndex = (jd + 9) % 10;
  const chiIndex = (jd + 1) % 12;
  return {
    can: CAN[canIndex],
    chi: CHI[chiIndex],
    fullName: `${CAN[canIndex]} ${CHI[chiIndex]}`,
    chiIndex,
  };
}

const STAR_NAMES = [
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

export function getHoangDaoInfo(lunarMonth: number, dayChiIndex: number): { isHoangDao: boolean; starName: string } {
  const startChi = ((lunarMonth - 1) % 6) * 2;
  const offset = (dayChiIndex - startChi + 12) % 12;
  const hoangDaoOffsets = [0, 1, 4, 5, 7, 10];
  const isHoangDao = hoangDaoOffsets.includes(offset);
  return {
    isHoangDao,
    starName: STAR_NAMES[offset],
  };
}

export interface CalendarDayItem {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  dayOfWeekName: string; // 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'CN'
  solarDay: number;
  solarMonth: number;
  solarYear: number;
  solarDateStr: string; // '22/09/2026'
  solarFullTitle: string; // 'Thứ Ba, ngày 22/09/2026'
  lunar: LunarDay;
  lunarDayStr: string; // '12' or '1/8' if mung 1
  lunarFullStr: string; // '12/8/2026 (Bính Ngọ)'
  canChi: { can: string; chi: string; fullName: string; chiIndex: number };
  isToday: boolean;
  isSunday: boolean;
  isHoangDao: boolean;
  starName: string;
  isThapTrai: boolean;
  isRam: boolean;
  isMung1: boolean;
  viaName: string | null;
  hasOrangeDot: boolean;
  hasGreenDot: boolean;
  hasThoKhangDot?: boolean;
}

export function getMondayOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

export function formatToday(locale: 'vi' | 'en' = 'vi'): { solar: string; lunar: string } {
  const vietnam = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const weekdaysVi = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lunar = solarToLunar(vietnam.getDate(), vietnam.getMonth() + 1, vietnam.getFullYear());
  const pad = (value: number) => String(value).padStart(2, '0');
  const leapText = lunar.leap ? (locale === 'en' ? ' (leap)' : ' (nhuận)') : '';
  const solarStr = locale === 'en'
    ? `${weekdaysEn[vietnam.getDay()]}, ${monthsEn[vietnam.getMonth()]} ${pad(vietnam.getDate())}, ${vietnam.getFullYear()}`
    : `${weekdaysVi[vietnam.getDay()]}, ngày ${pad(vietnam.getDate())}/${pad(vietnam.getMonth() + 1)}/${vietnam.getFullYear()}`;
  return {
    solar: solarStr,
    lunar: `${lunar.day}/${lunar.month}${leapText}/${lunar.year} (${CAN[(lunar.year + 6) % 10]} ${CHI[(lunar.year + 8) % 12]})`
  };
}
