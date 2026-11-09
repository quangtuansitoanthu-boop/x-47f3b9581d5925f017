import { describe, expect, it } from 'vitest';
import { defaultPersonalEventDate, personalEventFormIssue, solarDateForLunarDay } from '../../src/lib/domain/personal-event-form';
import { solarToLunar } from '../../src/lib/components/lunar/lunar-calendar';

describe('personal event form rules', () => {
  const valid = { title: 'Ngày gia đình', type: 'gia-dinh', frequency: 'yearly', calendarMode: 'solar', solarDay: 29, solarMonth: 2, lunarDay: 1, lunarMonth: 1 };
  it('keeps supported leap-day and monthly day-31 recurrence while rejecting impossible yearly dates', () => {
    expect(personalEventFormIssue(valid, ['gia-dinh'])).toBeNull();
    expect(personalEventFormIssue({ ...valid, solarDay: 31 }, ['gia-dinh'])).toBe('invalidSolarDate');
    expect(personalEventFormIssue({ ...valid, frequency: 'monthly', solarDay: 31 }, ['gia-dinh'])).toBeNull();
    expect(personalEventFormIssue({ ...valid, title: '  ' }, ['gia-dinh'])).toBe('missingTitle');
  });
  it.each([new Date(2026, 0, 1, 10), new Date(2026, 11, 31, 10)])('defaults to the actual local date across lunar-year boundaries: %s', today => {
    const result = defaultPersonalEventDate(today);
    expect(result).toMatchObject({ solarDay: today.getDate(), solarMonth: today.getMonth() + 1, year: today.getFullYear() });
    expect(solarDateForLunarDay(result.lunarDay, result.lunarMonth, result.year, { day: result.solarDay, month: result.solarMonth }))
      .toEqual({ day: today.getDate(), month: today.getMonth() + 1, year: today.getFullYear() });
  });
  it('converts a lunar choice to a real date in the displayed Gregorian year', () => {
    const solar = solarDateForLunarDay(6, 3, 2026)!;
    expect(solar.year).toBe(2026);
    expect(solarToLunar(solar.day, solar.month, solar.year)).toMatchObject({ day: 6, month: 3 });
  });
});
