import { expect, it } from 'vitest';
import { getPersonalEventsForDate, findNextPersonalEvent, formatPersonalEventDateText, type PersonalLunarEvent } from '../../src/lib/browser/personal-lunar-events';
const event: PersonalLunarEvent = { id: 'solar', title: 'Anniversary', lunarDay: 11, lunarMonth: 9, calendarMode: 'solar', solarDay: 20, solarMonth: 10, frequency: 'yearly', type: 'gia-dinh', createdAt: '2026-10-22' };
it('matches solar anniversaries by their original day across years, not the old converted lunar date', () => {
  for (const year of [2026, 2027, 2028]) {
    expect(getPersonalEventsForDate(new Date(year, 9, 20), [event])).toEqual([event]);
    expect(getPersonalEventsForDate(new Date(year, 9, 21), [event])).toEqual([]);
  }
  expect(formatPersonalEventDateText(event)).toContain('20/10 Dương lịch');
});
it('does not move February 29 to another date in non-leap years', () => {
  const leap = { ...event, solarDay: 29, solarMonth: 2 };
  expect(getPersonalEventsForDate(new Date(2027, 1, 28), [leap])).toEqual([]);
  expect(getPersonalEventsForDate(new Date(2028, 1, 29), [leap])).toEqual([leap]);
});
it('calculates the next anniversary using actual calendar days', () => {
  expect(findNextPersonalEvent(new Date(2027, 9, 18), [event])).toMatchObject({ event, daysLeft: 2 });
});
