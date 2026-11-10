import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadPersonalLunarEvents,
  savePersonalLunarEvents,
  addPersonalLunarEvent,
  updatePersonalLunarEvent,
  deletePersonalLunarEvent,
  getPersonalEventsForLunarDate,
  hasPersonalEventOnLunarDate,
  formatLunarDayLabel,
  formatPersonalEventDateText,
  type PersonalLunarEvent,
} from '../../src/lib/browser/personal-lunar-events';

describe('personal-lunar-events', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
    });
  });

  it('adds, updates, and deletes personal lunar events', () => {
    const added = addPersonalLunarEvent({
      title: 'Giỗ Bố',
      lunarDay: 15,
      lunarMonth: 7,
      frequency: 'yearly',
      type: 'gio-chap',
      note: 'Cúng chay',
    });

    expect(added.id).toBeDefined();
    expect(added.title).toBe('Giỗ Bố');
    expect(loadPersonalLunarEvents().length).toBe(1);

    updatePersonalLunarEvent(added.id, { title: 'Giỗ Bố (Năm Giáp Thìn)' });
    const list = loadPersonalLunarEvents();
    expect(list[0].title).toBe('Giỗ Bố (Năm Giáp Thìn)');

    deletePersonalLunarEvent(added.id);
    expect(loadPersonalLunarEvents().length).toBe(0);
  });

  it('matches yearly events only on the exact day and month', () => {
    addPersonalLunarEvent({
      title: 'Giỗ Bố',
      lunarDay: 15,
      lunarMonth: 7,
      frequency: 'yearly',
      type: 'gio-chap',
    });

    expect(hasPersonalEventOnLunarDate(15, 7)).toBe(true);
    expect(hasPersonalEventOnLunarDate(15, 8)).toBe(false);
    expect(hasPersonalEventOnLunarDate(1, 7)).toBe(false);

    const matches = getPersonalEventsForLunarDate(15, 7);
    expect(matches.length).toBe(1);
    expect(matches[0].title).toBe('Giỗ Bố');
  });

  it('matches monthly events on the same day across every month', () => {
    addPersonalLunarEvent({
      title: 'Phóng Sinh Hàng Tháng',
      lunarDay: 1,
      lunarMonth: 0,
      frequency: 'monthly',
      type: 'phat-nguyen',
    });

    expect(hasPersonalEventOnLunarDate(1, 1)).toBe(true);
    expect(hasPersonalEventOnLunarDate(1, 6)).toBe(true);
    expect(hasPersonalEventOnLunarDate(1, 12)).toBe(true);
    expect(hasPersonalEventOnLunarDate(15, 1)).toBe(false);

    const month1 = getPersonalEventsForLunarDate(1, 1);
    expect(month1.length).toBe(1);
    expect(month1[0].title).toBe('Phóng Sinh Hàng Tháng');
  });

  it('supports solar calendarMode and preserves solarDay/solarMonth', () => {
    const added = addPersonalLunarEvent({
      title: 'Kỷ niệm ngày cưới',
      lunarDay: 10,
      lunarMonth: 9,
      calendarMode: 'solar',
      solarDay: 20,
      solarMonth: 10,
      frequency: 'yearly',
      type: 'gia-dinh',
    });

    expect(added.calendarMode).toBe('solar');
    expect(added.solarDay).toBe(20);
    expect(added.solarMonth).toBe(10);

    const reloaded = loadPersonalLunarEvents();
    expect(reloaded[0].calendarMode).toBe('solar');
    expect(reloaded[0].solarDay).toBe(20);
    expect(reloaded[0].solarMonth).toBe(10);
  });

  it('formats lunar day label accurately in Vietnamese and English', () => {
    expect(formatLunarDayLabel(1)).toBe('Mồng 1');
    expect(formatLunarDayLabel(6)).toBe('Mồng 6');
    expect(formatLunarDayLabel(10)).toBe('Mồng 10');
    expect(formatLunarDayLabel(11)).toBe('Ngày 11');
    expect(formatLunarDayLabel(15)).toBe('Ngày 15');
    expect(formatLunarDayLabel(30)).toBe('Ngày 30');
    expect(formatLunarDayLabel(6, true)).toBe('Day 06');
    expect(formatLunarDayLabel(15, true)).toBe('Day 15');
  });

  it('formats personal event date text for display', () => {
    const yearlyEvent: PersonalLunarEvent = {
      id: 'e1',
      title: 'Giỗ Ông',
      lunarDay: 6,
      lunarMonth: 7,
      frequency: 'yearly',
      type: 'gio-chap',
      createdAt: '2026-01-01',
    };
    expect(formatPersonalEventDateText(yearlyEvent, false)).toBe('🗓️ Mồng 6 Tháng 07 Âm Lịch');
    expect(formatPersonalEventDateText(yearlyEvent, true)).toBe('🗓️ Day 06 Month 07 Lunar');

    const monthlyEvent: PersonalLunarEvent = {
      id: 'e2',
      title: 'Phóng sinh',
      lunarDay: 1,
      lunarMonth: 0,
      frequency: 'monthly',
      type: 'phat-nguyen',
      createdAt: '2026-01-01',
    };
    expect(formatPersonalEventDateText(monthlyEvent, false)).toBe('🗓️ Mồng 1 hàng tháng (Âm lịch)');
    expect(formatPersonalEventDateText(monthlyEvent, true)).toBe('🗓️ Day 01 monthly (Lunar)');
  });

  it('labels legacy lunar month-zero recurrence as monthly without changing solar recurrence', () => {
    const legacy: PersonalLunarEvent = {
      id: 'legacy-monthly', title: 'Giỗ Ông', lunarDay: 6, lunarMonth: 0,
      type: 'gio-chap', createdAt: '2026-01-01',
    };
    for (const event of [legacy, { ...legacy, frequency: 'yearly' as const }]) {
      expect(formatPersonalEventDateText(event, false)).toBe('🗓️ Mồng 6 hàng tháng (Âm lịch)');
      expect(formatPersonalEventDateText(event, true)).toBe('🗓️ Day 06 monthly (Lunar)');
      expect(getPersonalEventsForLunarDate(6, 7, [event])).toEqual([event]);
    }
    const solar: PersonalLunarEvent = { ...legacy, calendarMode: 'solar', solarDay: 6, solarMonth: 7 };
    expect(formatPersonalEventDateText(solar, false)).toBe('🗓️ 06/07 Dương lịch');
    expect(formatPersonalEventDateText(solar, true)).toBe('🗓️ 06/07 Solar');
  });
});
