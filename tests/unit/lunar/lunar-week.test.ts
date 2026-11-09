import { describe, expect, it } from 'vitest';
import { buildDayDetail, buildWeekCalendar, buildMonthCalendar } from '../../../src/lib/components/lunar/lunar-week';

describe('lunar week calendar', () => {
  it.each([buildWeekCalendar, buildMonthCalendar])('projects Tho Khang markers without changing fasting or feast markers', build => {
    const date = new Date(2026, 1, 17);
    const calendar = build(date, date);
    const tet = calendar.days.find(day => day.dateKey === '2026-02-17')!;
    expect(tet.hasThoKhangDot).toBe(true);
    expect(tet.isThapTrai).toBe(true);
    expect(tet.viaName).toContain('Di Lặc');
    const following = calendar.days.find(day => day.dateKey === '2026-02-18')!;
    expect(following.hasThoKhangDot).toBe(false);
    expect(following.isThapTrai).toBe(false);
    expect(following.viaName).toBeNull();
  });
  it('builds the week of 22/09/2026 correctly matching user reference', () => {
    // 2026-09-22 is Tuesday
    const today = new Date(2026, 8, 22); // Month is 0-indexed: 8 is September
    const week = buildWeekCalendar(today, today);

    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.dayOfWeekName)).toEqual(['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'CN']);
    expect(week.days.map((d) => d.solarDay)).toEqual([21, 22, 23, 24, 25, 26, 27]);
    expect(week.days.map((d) => d.lunar.day)).toEqual([11, 12, 13, 14, 15, 16, 17]);

    // Today is day 22
    const day22 = week.days.find((d) => d.solarDay === 22);
    expect(day22?.isToday).toBe(true);

    // Day 25 is Ram (15 am lich) and Hoang Dao (Nham Dan) -> Orange dot and Green dot
    const day25 = week.days.find((d) => d.solarDay === 25);
    expect(day25?.lunar.day).toBe(15);
    expect(day25?.isRam).toBe(true);
    expect(day25?.hasOrangeDot).toBe(true);
    expect(day25?.hasGreenDot).toBe(true);

    // Day 26 is Quy Mao -> Hoang Dao -> Green dot
    const day26 = week.days.find((d) => d.solarDay === 26);
    expect(day26?.hasGreenDot).toBe(true);

    // Sunday is day 27
    const day27 = week.days.find((d) => d.solarDay === 27);
    expect(day27?.isSunday).toBe(true);

    // Day detail
    const detail22 = buildDayDetail(day22!);
    expect(detail22.solarWeekday).toBe('Thứ Ba');
    expect(detail22.lunarDateTitle).toContain('12/8/2026');
  });
});
