import { describe, expect, it } from 'vitest';
import { parseCalendarWidgetDate } from '../../src/lib/browser/calendar-widget-link';
import { resolveNativeAppPath } from '../../src/lib/browser/native-app-links';

describe('calendar widget deep links', () => {
  it('retains the selected date and calendar anchor through the native allowlist', () => {
    const path = resolveNativeAppPath('vn.quangtu.tutam:///?calendarDate=2026-11-01#home-calendar');
    expect(path).toBe('/?calendarDate=2026-11-01#home-calendar');
    const date = parseCalendarWidgetDate(new URL(path!, 'https://quangtu.vn').searchParams.get('calendarDate'));
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(1);
  });

  it('accepts leap days without interpreting the date as a UTC instant', () => {
    const date = parseCalendarWidgetDate('2028-02-29');
    expect(date?.getFullYear()).toBe(2028);
    expect(date?.getMonth()).toBe(1);
    expect(date?.getDate()).toBe(29);
    expect(date?.getHours()).toBe(12);
  });

  it.each([null, undefined, '', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01',
    '2026-11-00', '2026-11-32', '26-11-01', '2026-1-01', '2026-11-1', '0000-01-01',
    '0099-01-01', '2026-11-01T00:00:00Z', ' 2026-11-01', '2026-11-01 ', '<script>'])
  ('ignores invalid dates instead of rolling into a different day: %s', (value) => {
    expect(parseCalendarWidgetDate(value)).toBeNull();
  });
});
