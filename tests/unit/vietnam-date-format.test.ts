import { describe, expect, it } from 'vitest';
import { formatVietnamDate, formatVietnamDateWithWeekday } from '../../src/lib/utils/vietnam-date-format';

describe('Vietnam date formatting', () => {
  it('preserves legacy day/month/year values without US date parsing', () => {
    expect(formatVietnamDate('3/8/2026')).toBe('03/08/2026');
    expect(formatVietnamDate('11/06/2026')).toBe('11/06/2026');
    expect(formatVietnamDateWithWeekday('11/06/2026')).toBe('Thứ năm, ngày 11/06/2026');
  });

  it('formats ISO calendar dates as day/month/year', () => {
    expect(formatVietnamDate('2026-08-03')).toBe('03/08/2026');
    expect(formatVietnamDateWithWeekday('2026-06-11')).toBe('Thứ năm, ngày 11/06/2026');
  });

  it('uses the Vietnam calendar day for timestamp values', () => {
    expect(formatVietnamDate('2026-06-10T18:30:00.000Z')).toBe('11/06/2026');
  });

  it('does not invent a date for invalid input', () => {
    expect(formatVietnamDate('31/02/2026')).toBe('31/02/2026');
    expect(formatVietnamDate('')).toBe('');
  });
});
