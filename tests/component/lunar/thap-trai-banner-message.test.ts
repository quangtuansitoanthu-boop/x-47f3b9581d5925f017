import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LunarEventNotificationInfo } from '../../../src/lib/browser/lunar-notifications';
import ThapTraiBannerMessage from '../../../src/lib/components/lunar/ThapTraiBannerMessage.svelte';
import ThapTraiBanner from '../../../src/lib/components/lunar/ThapTraiBanner.svelte';
import * as localeContext from '../../../src/lib/stores/locale.svelte';
import { getLunarEvent } from '../../../src/lib/components/lunar/lunar-events';
import { solarToLunar } from '../../../src/lib/components/lunar/lunar-calendar';
import HomeDailyReminders from '../../../src/lib/components/home/HomeDailyReminders.svelte';

const thoKhangOnly: LunarEventNotificationInfo = {
  isEvent: true,
  isThapTrai: false,
  viaName: null,
  kiengDam: { reason: 'Ngày Nguyệt Hối', harm: 'Giảm thọ' },
  lunarDay: 25,
  lunarMonth: 6,
};

function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

describe('Thập Trai banner message', () => {
  it('starts the compact hub reminder collapsed and keeps other callers expanded', () => {
    const compact = render(ThapTraiBanner, { props: { alwaysShow: true, compact: true } }).body;
    const standard = render(ThapTraiBanner, { props: { alwaysShow: true } }).body;
    expect(compact).toContain('aria-expanded="false"');
    expect(compact).not.toContain('daily-reminder-message');
    expect(standard).toContain('aria-expanded="true"');
    expect(standard).toContain('daily-reminder-message');
  });

  it.each([1, 10, 11, 24, 30])('renders the lunar day wording for day %i', (day) => {
    const html = render(ThapTraiBannerMessage, {
      props: {
        eventInfo: { ...thoKhangOnly, isThapTrai: true, kiengDam: null, lunarDay: day },
        lunar: { day, month: 6, year: 2026, leap: false },
      },
    }).body;
    expect(visibleText(html)).toContain(`(${day <= 10 ? 'mùng' : 'ngày'} ${day}/6 Âm lịch)`);
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('passes the selected solar date from home into the reminder', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T05:00:00Z'));
    const html = render(HomeDailyReminders, { props: { selectedDate: new Date(2026, 10, 1) } }).body;
    const text = visibleText(html);
    expect(text).toContain('Ngày 01/11/2026 (Dương lịch) là ngày Thập Trai');
    expect(text).toContain('23/9');
    expect(text).not.toContain('Hôm nay');
    expect(html).toContain('Nhắc nhở hành trì cho ngày đã chọn');
  });

  it('uses November 1 solar and lunar details while today is October 31', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T05:00:00Z'));
    const selectedDate = new Date(2026, 10, 1);
    const text = visibleText(render(ThapTraiBannerMessage, {
      props: { selectedDate, eventInfo: getLunarEvent(selectedDate), lunar: solarToLunar(1, 11, 2026) },
    }).body);
    expect(text).toContain('Ngày 01/11/2026 (Dương lịch) là ngày Thập Trai');
    expect(text).toContain('23/9');
    expect(text).not.toContain('Hôm nay');
  });

  it('uses an explicit date in English reminders and warnings', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T05:00:00Z'));
    vi.spyOn(localeContext, 'getLocaleContext').mockReturnValue(localeContext.createLocaleStore('en'));
    const text = visibleText(render(ThapTraiBannerMessage, {
      props: { selectedDate: new Date(2026, 10, 1), eventInfo: thoKhangOnly, lunar: { day: 25, month: 6, year: 2026, leap: false } },
    }).body);
    expect(text).toContain('The date 01/11/2026 (Gregorian) is Lunar 25/6');
    expect(text).toContain('⚠️ The date 01/11/2026 (Gregorian) is an abstinence day');
    expect(text).not.toContain('Today');
  });

  it.each([new Date(2026, 10, 1), new Date(2026, 9, 30), new Date(2027, 0, 1)])('names a selected non-today solar date in the reminder and warning (%s)', (selectedDate) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T05:00:00Z'));
    const text = visibleText(render(ThapTraiBannerMessage, {
      props: { eventInfo: thoKhangOnly, lunar: { day: 25, month: 6, year: 2026, leap: false }, selectedDate },
    }).body);
    const date = `${String(selectedDate.getDate()).padStart(2, '0')}/${String(selectedDate.getMonth() + 1).padStart(2, '0')}/${selectedDate.getFullYear()}`;
    expect(text).toContain(`Ngày ${date} (Dương lịch) là ngày 25/6 Âm lịch.`);
    expect(text).toContain(`⚠️ Ngày ${date} (Dương lịch) là ngày kiêng`);
    expect(text).not.toContain('Hôm nay');
    expect(text).toContain('Ngày Nguyệt Hối');
    expect(text).toContain('Giảm thọ');
  });

  it('keeps today wording for the selected current Vietnam date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T18:00:00Z'));
    const text = visibleText(render(ThapTraiBannerMessage, {
      props: { eventInfo: thoKhangOnly, lunar: { day: 25, month: 6, year: 2026, leap: false }, selectedDate: new Date(2026, 10, 1) },
    }).body);
    expect(text).toContain('Hôm nay là ngày 25/6 Âm lịch.');
    expect(text).toContain('⚠️ Hôm nay là ngày kiêng');
  });

  it('renders a Thọ Khang-only day without presenting it as Thập Trai', () => {
    const body = render(ThapTraiBannerMessage, {
      props: {
        eventInfo: thoKhangOnly,
        lunar: { day: 25, month: 6, year: 2026, leap: false },
      },
    }).body;
    const text = visibleText(body);

    expect(text).toContain('Hôm nay là ngày 25/6 Âm lịch. Kính mời đạo hữu tinh tấn tu tập.');
    expect(text).not.toContain('Hôm nay là ngày (ngày 25/6 Âm lịch).');
    expect(text).not.toContain('phát tâm ăn chay');
    expect(text).not.toContain('Thập Trai');
    expect(text).toContain('Ngày Nguyệt Hối');
    expect(text).toContain('Giảm thọ');
  });

  it('keeps the devotional invitation for combined Thập Trai and vía days', () => {
    const body = render(ThapTraiBannerMessage, {
      props: {
        eventInfo: {
          isEvent: true,
          isThapTrai: true,
          viaName: 'Vía Đức Phật',
          kiengDam: null,
          lunarDay: 8,
          lunarMonth: 7,
        },
        lunar: { day: 8, month: 7, year: 2026, leap: false },
      },
    }).body;
    const text = visibleText(body);

    expect(text).toContain('Hôm nay là ngày Thập Trai và cũng là ngày Vía Đức Phật');
    expect(text).toContain('phát tâm ăn chay');
    expect(text).not.toContain('Kính mời đạo hữu tinh tấn tu tập.');
  });

  it.each([
    {
      name: 'vía-only',
      eventInfo: {
        isEvent: true,
        isThapTrai: false,
        viaName: 'Vía Đức Phật',
        kiengDam: null,
        lunarDay: 8,
        lunarMonth: 7,
      } satisfies LunarEventNotificationInfo,
      lunar: { day: 8, month: 7, year: 2026, leap: false },
      expected: 'Hôm nay là ngày Vía Đức Phật (mùng 8/7 Âm lịch).',
    },
    {
      name: 'Thập Trai-only',
      eventInfo: {
        isEvent: true,
        isThapTrai: true,
        viaName: null,
        kiengDam: null,
        lunarDay: 18,
        lunarMonth: 6,
      } satisfies LunarEventNotificationInfo,
      lunar: { day: 18, month: 6, year: 2026, leap: false },
      expected: 'Hôm nay là ngày Thập Trai (ngày 18/6 Âm lịch).',
    },
    {
      name: 'legacy-script fallback',
      eventInfo: null,
      lunar: { day: 18, month: 6, year: 2026, leap: false },
      expected: 'Hôm nay là ngày Thập Trai (ngày 18/6 Âm lịch).',
    },
  ])('preserves the $name devotional wording', ({ eventInfo, lunar, expected }) => {
    const text = visibleText(render(ThapTraiBannerMessage, {
      props: { eventInfo, lunar },
    }).body);

    expect(text).toContain(expected);
    expect(text).toContain('phát tâm ăn chay');
    expect(text).not.toContain('Kính mời đạo hữu tinh tấn tu tập.');
  });
});
