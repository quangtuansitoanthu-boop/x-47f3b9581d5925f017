import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatToday,
  solarToLunar,
} from '../../../src/lib/components/lunar/lunar-calendar';

afterEach(() => vi.useRealTimers());

it('formats the homepage lunar date from the Vietnam civil day', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-13T03:00:00Z'));

  expect(formatToday()).toEqual({
    solar: 'Thứ Năm, ngày 13/08/2026',
    lunar: '1/7/2026 (Bính Ngọ)',
  });
});

describe('lunar calendar', () => {
  it('keeps the August 2026 new-moon boundary on the correct Vietnam civil day', () => {
    expect(solarToLunar(12, 8, 2026, 7)).toEqual({ day: 30, month: 6, year: 2026, leap: false });
    expect(solarToLunar(13, 8, 2026, 7)).toEqual({ day: 1, month: 7, year: 2026, leap: false });
  });

  it('preserves known lunar-new-year boundaries', () => {
    expect(solarToLunar(10, 2, 2024, 7)).toEqual({ day: 1, month: 1, year: 2024, leap: false });
    expect(solarToLunar(29, 1, 2025, 7)).toEqual({ day: 1, month: 1, year: 2025, leap: false });
    expect(solarToLunar(17, 2, 2026, 7)).toEqual({ day: 1, month: 1, year: 2026, leap: false });
  });

  it('preserves the 2023 leap-month boundary', () => {
    expect(solarToLunar(22, 3, 2023, 7)).toEqual({ day: 1, month: 2, year: 2023, leap: true });
    expect(solarToLunar(19, 4, 2023, 7)).toEqual({ day: 29, month: 2, year: 2023, leap: true });
    expect(solarToLunar(20, 4, 2023, 7)).toEqual({ day: 1, month: 3, year: 2023, leap: false });
  });
});
