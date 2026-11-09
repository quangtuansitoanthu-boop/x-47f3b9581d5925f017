import { describe, expect, it, vi, afterEach } from 'vitest';

import { buildBuddhistCalendarTimeline } from '../../src/lib/browser/buddhist-calendar-widget-data';
import { CAN, CHI, solarToLunar } from '../../src/lib/components/lunar/lunar-calendar';
import { getLunarEvent } from '../../src/lib/components/lunar/lunar-events';
import type { PersonalLunarEvent } from '../../src/lib/browser/personal-lunar-events';

afterEach(() => vi.unstubAllGlobals());

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

describe('Buddhist calendar widget timeline', () => {
  it('uses English calendar copy while retaining personal names and the legacy Vietnamese default', () => {
    const date = new Date(2026, 10, 6, 12);
    const english = buildBuddhistCalendarTimeline(date, 1, undefined, 'en');
    expect(english.locale).toBe('en');
    expect(english.days[0].solarDate).toContain('Friday');
    expect(english.days[0].lunarMonthYear).toContain('Month');
    expect(buildBuddhistCalendarTimeline(date, 1).locale).toBe('vi');
  });
  const personal: PersonalLunarEvent = { id: 'family', title: 'Giỗ gia đình', note: 'Tưởng niệm', type: 'gia-dinh',
    lunarDay: 24, lunarMonth: 9, calendarMode: 'solar', solarDay: 2, solarMonth: 11, frequency: 'yearly', createdAt: '2026-01-01' };

  it('projects existing personal calendar rules without changing the public-only contract', () => {
    const events = [personal, { ...personal, id: 'lunar', calendarMode: 'lunar' as const },
      { ...personal, id: 'monthly', solarMonth: 1, frequency: 'monthly' as const }];
    const timeline = buildBuddhistCalendarTimeline(new Date(2026, 10, 2), 2, { owner: 'user:alice', events });
    expect(timeline.personalOwner).toBe('user:alice');
    expect(timeline.days[0].personalEventCount).toBe(3);
    expect(timeline.days[0].personalEvents?.map(event => event.id)).toEqual(['family', 'lunar']);
    expect(timeline.days[1].personalEventCount).toBe(0);
    expect(buildBuddhistCalendarTimeline(new Date(2026, 10, 2), 1)).not.toHaveProperty('personalOwner');
    expect(events[0]).toEqual(personal);
  });

  it('keeps exact totals but bounds projected text and bytes for a full cached timeline', () => {
    const events = Array.from({ length: 250 }, (_, i) => ({ ...personal, id: `event-${i}`, title: '🌸'.repeat(250),
      note: 'Nội dung riêng '.repeat(300), frequency: 'monthly' as const }));
    const timeline = buildBuddhistCalendarTimeline(new Date(2026, 10, 2), 400, { owner: 'guest', events });
    expect(timeline.days[0].personalEventCount).toBe(250);
    expect(timeline.days[0].personalEvents).toHaveLength(2);
    for (const day of timeline.days) for (const event of day.personalEvents ?? []) {
      expect(event.title.length).toBeLessThanOrEqual(160);
      expect(event.note!.length).toBeLessThanOrEqual(160);
      expect(event.title).not.toMatch(/[\uD800-\uDBFF]$/u);
    }
    expect(new TextEncoder().encode(JSON.stringify(timeline)).byteLength).toBeLessThan(2_000_000);
    expect(JSON.stringify(timeline)).not.toContain('csrf');
    expect(events[0].note.length).toBeGreaterThan(160);
  });

  it('does not move solar leap anniversaries or replace the existing lunar recurrence policy', () => {
    const events = [{ ...personal, calendarMode: 'solar' as const, solarDay: 29, solarMonth: 2 }];
    const ordinary = buildBuddhistCalendarTimeline(new Date(2027, 1, 28), 2, { owner: 'guest', events });
    expect(ordinary.days.map(day => day.personalEventCount)).toEqual([0, 0]);
    const leap = buildBuddhistCalendarTimeline(new Date(2028, 1, 29), 1, { owner: 'guest', events });
    expect(leap.days[0].personalEventCount).toBe(1);
  });

  it('accepts legacy empty notes and falls back to the existing Other event category', () => {
    const legacy = { ...personal, note: null, type: undefined } as unknown as PersonalLunarEvent;
    const timeline = buildBuddhistCalendarTimeline(new Date(2026, 10, 2), 1, { owner: 'guest', events: [legacy] });
    expect(timeline.days[0].personalEventCount).toBe(1);
    expect(timeline.days[0].personalEvents?.[0]).toMatchObject({ title: 'Giỗ gia đình', type: 'khac' });
    expect(timeline.days[0].personalEvents?.[0]).not.toHaveProperty('note');
  });
  it('builds 400 consecutive civil days across month and year boundaries without a request', () => {
    const fetch = vi.fn(() => { throw new Error('Widget calendar must stay local'); });
    vi.stubGlobal('fetch', fetch);
    const start = new Date(2026, 9, 29, 23, 59, 59);
    const original = start.getTime();
    const timeline = buildBuddhistCalendarTimeline(start);

    expect(timeline.days).toHaveLength(400);
    expect(Number.isNaN(Date.parse(timeline.generatedAt))).toBe(false);
    expect(start.getTime()).toBe(original);
    const expected = new Date(2026, 9, 29, 12);
    for (const day of timeline.days) {
      expect(day.date).toBe(dateKey(expected));
      expect(day.solarDateShort).toBe(`${pad(expected.getDate())}/${pad(expected.getMonth() + 1)}/${expected.getFullYear()}`);
      expect(day.solarDate).toContain(day.solarDateShort);
      expected.setDate(expected.getDate() + 1);
    }
    expect(new Set(timeline.days.map(day => day.date)).size).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps lunar dates and observances identical to the existing calendar owner', () => {
    const start = new Date(2026, 0, 1, 12);
    const timeline = buildBuddhistCalendarTimeline(start, 400);
    const date = new Date(start);

    for (const day of timeline.days) {
      const lunar = solarToLunar(date.getDate(), date.getMonth() + 1, date.getFullYear());
      const event = getLunarEvent(date);
      expect(day.lunarDay).toBe(String(lunar.day));
      expect(day.lunarMonthYear).toContain(pad(lunar.month));
      expect(day.lunarMonthYear).toContain(`${CAN[(lunar.year + 6) % 10]} ${CHI[(lunar.year + 8) % 12]}`);
      expect(Boolean(day.fastingNote)).toBe(event.isThapTrai);
      expect(day.buddhistHoliday ?? null).toBe(event.viaName);
      expect(Boolean(day.thoKhangNote)).toBe(event.kiengDam !== null);
      date.setDate(date.getDate() + 1);
    }
  });

  it('omits absent notes and never adds a private event to an ordinary day', () => {
    const day = buildBuddhistCalendarTimeline(new Date(2026, 1, 18), 1).days[0];

    expect(day).toMatchObject({ date: '2026-02-18', lunarDay: '2' });
    expect(day).not.toHaveProperty('fastingNote');
    expect(day).not.toHaveProperty('buddhistHoliday');
    expect(day).not.toHaveProperty('thoKhangNote');
    expect(day).not.toHaveProperty('personalNote');
    expect(day).not.toHaveProperty('owner');
    expect(day).not.toHaveProperty('principal');
  });

  it('preserves leap-month suppression of annual holidays and marks the lunar month', () => {
    const timeline = buildBuddhistCalendarTimeline(new Date(2023, 2, 22), 29);
    expect(timeline.days).toHaveLength(29);
    expect(timeline.days[0].lunarMonthYear.toLocaleLowerCase('vi')).toContain('nhuận');
    for (const day of timeline.days) expect(day).not.toHaveProperty('buddhistHoliday');
  });

  it('retains short lunar-month observances at the existing rollover boundary', () => {
    const timeline = buildBuddhistCalendarTimeline(new Date(2023, 3, 18, 23, 59), 3);
    expect(timeline.days.map(day => day.date)).toEqual(['2023-04-18', '2023-04-19', '2023-04-20']);
    expect(timeline.days.map(day => day.lunarDay)).toEqual(['28', '29', '1']);
    for (const [offset, day] of timeline.days.entries()) {
      const event = getLunarEvent(new Date(2023, 3, 18 + offset));
      expect(Boolean(day.fastingNote)).toBe(event.isThapTrai);
      expect(day.buddhistHoliday ?? null).toBe(event.viaName);
    }
  });
});
