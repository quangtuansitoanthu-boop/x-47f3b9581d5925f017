import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_DATE_RANGE,
  ADMIN_DATE_RANGE_OPTIONS,
  adminDateRangeLabel,
  adminDateRangeBuckets,
  normalizeAdminDateRange,
  resolveAdminDateRange,
} from '../../src/lib/domain/admin-date-range';

describe('admin date ranges', () => {
  it('defaults invalid input to 28 days while preserving the legacy 30-day contract', () => {
    expect(DEFAULT_ADMIN_DATE_RANGE).toBe('28d');
    expect(normalizeAdminDateRange(undefined)).toBe('28d');
    expect(normalizeAdminDateRange('unknown')).toBe('28d');
    expect(normalizeAdminDateRange('30d')).toBe('30d');
    expect(adminDateRangeLabel('30d')).toBe('30 ngày gần nhất');
  });

  it('offers the useful rolling and calendar presets in the shared menu', () => {
    expect(ADMIN_DATE_RANGE_OPTIONS.map((option) => option.value)).toEqual([
      'today', 'yesterday', '7d', '28d', '91d', 'month', 'last-month', 'year', '365d',
    ]);
  });

  it('resolves rolling and calendar presets with inclusive date boundaries', () => {
    expect(resolveAdminDateRange('today', '2026-08-07')).toEqual({
      days: 1, endDate: '2026-08-07', interval: 'day', range: 'today', startDate: '2026-08-07',
    });
    expect(resolveAdminDateRange('yesterday', '2026-08-07')).toEqual({
      days: 1, endDate: '2026-08-06', interval: 'day', range: 'yesterday', startDate: '2026-08-06',
    });
    expect(resolveAdminDateRange('28d', '2026-08-07')).toEqual({
      days: 28, endDate: '2026-08-07', interval: 'day', range: '28d', startDate: '2026-07-11',
    });
    expect(resolveAdminDateRange('91d', '2026-08-07')).toEqual({
      days: 91, endDate: '2026-08-07', interval: 'day', range: '91d', startDate: '2026-05-09',
    });
    expect(resolveAdminDateRange('last-month', '2026-08-07')).toEqual({
      days: 31, endDate: '2026-07-31', interval: 'day', range: 'last-month', startDate: '2026-07-01',
    });
    expect(resolveAdminDateRange('year', '2026-08-07')).toEqual({
      days: 219, endDate: '2026-08-07', interval: 'month', range: 'year', startDate: '2026-01-01',
    });
    expect(resolveAdminDateRange('365d', '2026-08-07')).toEqual({
      days: 365, endDate: '2026-07-31', interval: 'month', range: '365d', startDate: '2025-08-01',
    });
  });

  it('groups the current year into calendar months through the current month', () => {
    const window = resolveAdminDateRange('year', '2026-08-07');
    expect(adminDateRangeBuckets(window)).toEqual([
      '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
      '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01',
    ]);
  });

  it('creates exactly 12 calendar buckets for the annual chart', () => {
    const window = resolveAdminDateRange('365d', '2026-08-07');
    expect(adminDateRangeBuckets(window)).toEqual([
      '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01',
      '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01',
    ]);
  });

  it('keeps twelve completed months across January rollover and leap years', () => {
    const january = resolveAdminDateRange('365d', '2026-01-12');
    expect(january).toEqual({
      days: 365, endDate: '2025-12-31', interval: 'month', range: '365d', startDate: '2025-01-01',
    });
    expect(adminDateRangeBuckets(january)).toHaveLength(12);

    const leapYear = resolveAdminDateRange('365d', '2024-03-15');
    expect(leapYear).toEqual({
      days: 366, endDate: '2024-02-29', interval: 'month', range: '365d', startDate: '2023-03-01',
    });
    expect(adminDateRangeBuckets(leapYear).at(-1)).toBe('2024-02-01');
  });
});
