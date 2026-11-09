import { CAN, CHI, solarToLunar } from '$lib/components/lunar/lunar-calendar';
import { getLunarEvent } from '$lib/components/lunar/lunar-events';
import { buddhistCalendarWidgetCopy } from '$lib/i18n/buddhist-calendar-widget';
import { getPersonalEventsForDate, PERSONAL_EVENT_TYPES, type PersonalLunarEvent } from './personal-lunar-events';

export interface CalendarWidgetPersonalEvent {
  id: string;
  title: string;
  note?: string;
  type: PersonalLunarEvent['type'];
}

export interface CalendarWidgetPersonalSource {
  owner: string;
  events: readonly PersonalLunarEvent[];
}

export interface BuddhistCalendarWidgetDay {
  date: string;
  solarDate: string;
  solarDateShort: string;
  lunarDay: string;
  lunarMonthYear: string;
  fastingNote?: string;
  buddhistHoliday?: string;
  thoKhangNote?: string;
  personalEventCount?: number;
  personalEvents?: CalendarWidgetPersonalEvent[];
}

const pad = (value: number) => String(value).padStart(2, '0');

function widgetText(value: string): string {
  const text = value.trim();
  if (text.length <= 160) return text;
  let cut = text.slice(0, 159);
  if (/[\uD800-\uDBFF]$/u.test(cut)) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function personalSourceEvents(source: CalendarWidgetPersonalSource): PersonalLunarEvent[] {
  if (!source || typeof source.owner !== 'string' || !/^(guest|user:\S.*)$/u.test(source.owner)
    || /[\u0000-\u001f\u007f]/u.test(source.owner) || new TextEncoder().encode(source.owner).byteLength > 256
    || !Array.isArray(source.events) || source.events.length > 10_000) throw new RangeError('Invalid personal widget source');
  const ids = new Set<string>();
  for (const event of source.events) {
    if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 160 || ids.has(event.id)
      || typeof event.title !== 'string' || !event.title.trim()
      || (event.note != null && typeof event.note !== 'string')) throw new RangeError('Invalid personal widget event');
    ids.add(event.id);
  }
  return [...source.events];
}

// Dùng lại lịch hiện có, không nhân bản quy tắc tháng nhuận hoặc tháng thiếu ở native.
export function buildBuddhistCalendarTimeline(start: Date, count = 400, personalSource?: CalendarWidgetPersonalSource, locale = 'vi'): {
  locale?: 'vi' | 'en';
  generatedAt: string;
  days: BuddhistCalendarWidgetDay[];
  personalOwner?: string;
} {
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(count) || count < 1 || count > 400) {
    throw new RangeError('Invalid calendar widget timeline');
  }
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  const copy = buddhistCalendarWidgetCopy(locale);
  const days: BuddhistCalendarWidgetDay[] = [];
  const personal = personalSource ? personalSourceEvents(personalSource) : undefined;
  for (let offset = 0; offset < count; offset++) {
    const lunar = solarToLunar(current.getDate(), current.getMonth() + 1, current.getFullYear());
    const event = getLunarEvent(current, locale);
    const solarDateShort = `${pad(current.getDate())}/${pad(current.getMonth() + 1)}/${current.getFullYear()}`;
    const matching = personal ? getPersonalEventsForDate(current, personal) : undefined;
    days.push({
      date: `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`,
      solarDate: `${copy.weekdays[current.getDay()]}, ${solarDateShort}`,
      solarDateShort,
      lunarDay: String(lunar.day),
      lunarMonthYear: `${locale === 'en' ? 'Month' : 'Tháng'} ${pad(lunar.month)}${lunar.leap ? locale === 'en' ? ' leap' : ' nhuận' : ''} • ${CAN[(lunar.year + 6) % 10]} ${CHI[(lunar.year + 8) % 12]}`,
      ...(event.isThapTrai ? { fastingNote: copy.fastingNote } : {}),
      ...(event.viaName ? { buddhistHoliday: event.viaName } : {}),
      ...(event.kiengDam ? { thoKhangNote: `${copy.abstinenceNote} ${event.kiengDam.reason}` } : {}),
      ...(matching ? {
        personalEventCount: matching.length,
        // Chỉ chiếu hai mục để native hiển thị; tổng thật và liên kết ngày giữ toàn bộ mục còn lại trong app.
        personalEvents: matching.slice(0, 2).map(item => ({ id: item.id,
          type: PERSONAL_EVENT_TYPES.some(type => type.type === item.type) ? item.type : 'khac' as const, title: widgetText(item.title),
          ...(item.note?.trim() ? { note: widgetText(item.note) } : {}) })),
      } : {}),
    });
    current.setDate(current.getDate() + 1);
  }
  return { locale: locale === 'en' ? 'en' : 'vi', generatedAt: new Date().toISOString(), days, ...(personalSource ? { personalOwner: personalSource.owner } : {}) };
}
