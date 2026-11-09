import { describe, expect, it } from 'vitest';
import { getPreceptStats, normalizePreceptRecords, recordPreceptDay } from '../../../src/lib/domain/practice/precepts';

describe('precept reflection history', () => {
  it('never imports legacy abstinence days as five-precept practice', () => {
    expect(normalizePreceptRecords({ cleanSince: '2020-01-01', longestStreakDays: 100 })).toEqual([]);
    expect(getPreceptStats([], '2026-10-28').longest).toBe(0);
  });
  it('requires all five explicit answers, keeps failed reflections and replaces only today', () => {
    expect(() => recordPreceptDay([], '2026-10-28', ['kept'])).toThrow();
    const failed = recordPreceptDay([], '2026-10-27', ['kept', 'kept', 'review', 'kept', 'kept']);
    const kept = recordPreceptDay(failed, '2026-10-28', Array(5).fill('kept'));
    expect(getPreceptStats(kept, '2026-10-28')).toEqual({ total: 1, current: 1, longest: 1 });
    expect(recordPreceptDay(kept, '2026-10-28', Array(5).fill('review'))).toHaveLength(2);
  });
  it('counts consecutive calendar dates without inventing missed records', () => {
    let rows = recordPreceptDay([], '2026-10-26', Array(5).fill('kept'));
    rows = recordPreceptDay(rows, '2026-10-27', Array(5).fill('kept'));
    expect(getPreceptStats(rows, '2026-10-28')).toEqual({ total: 2, current: 2, longest: 2 });
    expect(getPreceptStats(rows, '2026-10-29').current).toBe(0);
    expect(rows).toHaveLength(2);
  });
  it('rejects malformed, impossible, duplicate and future persisted dates safely', () => {
    const answers = Array(5).fill('kept');
    expect(normalizePreceptRecords([{ date: '2026-02-30', answers }, { date: '2026-10-28', answers }, { date: '2026-10-28', answers }])).toHaveLength(1);
    expect(getPreceptStats([{ date: '2026-10-29', answers }], '2026-10-28').total).toBe(0);
  });
});
