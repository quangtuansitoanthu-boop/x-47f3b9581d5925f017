import { describe, expect, it } from 'vitest';
import { partitionRosaryDaySegments, rosaryPlaybackAnchor } from '../../../src/lib/domain/practice/rosary-day-segments';

describe('native rosary ticks across Vietnam midnight', () => {
  it('attributes only remaining ticks at the new tempo across midnight without replaying prior counts', () => {
    const observed = Date.parse('2026-11-08T00:00:00.500+07:00');
    const anchor = rosaryPlaybackAnchor(observed, 12, 750, 5, 10.5);
    expect(partitionRosaryDaySegments(5, 7, 750, anchor)).toEqual([
      { date: '2026-11-07', firstTickAtMs: observed - 750, count: 1 },
      { date: '2026-11-08', firstTickAtMs: observed, count: 1 },
    ]);
    expect(partitionRosaryDaySegments(7, 7, 750, anchor)).toEqual([]);
    expect(rosaryPlaybackAnchor(observed + 10000, 12, 750, 5, 10.5)).toBe(anchor + 10000);
  });
  it('assigns23:59:59 to the old day and exact00:00:00 to the new day', () => {
    const anchor = Date.parse('2026-11-07T23:59:58+07:00');
    expect(partitionRosaryDaySegments(0, 3, 1000, anchor)).toEqual([
      { date: '2026-11-07', firstTickAtMs: anchor + 1000, count: 1 },
      { date: '2026-11-08', firstTickAtMs: anchor + 2000, count: 2 },
    ]);
  });
  it('returns no duplicate segments on repeated observations and omits already accepted ticks', () => {
    const anchor = Date.parse('2026-11-07T23:59:58+07:00');
    expect(partitionRosaryDaySegments(3, 3, 1000, anchor)).toEqual([]);
    expect(partitionRosaryDaySegments(1, 3, 1000, anchor)).toEqual([
      { date: '2026-11-08', firstTickAtMs: anchor + 2000, count: 2 },
    ]);
  });
  it('uses the shifted anchor after pause without crediting silent elapsed wall time', () => {
    const oldAnchor = Date.parse('2026-11-07T23:59:55+07:00');
    // First2ticks played before pausing for10seconds. The next source observation's anchor shifts10seconds.
    expect(partitionRosaryDaySegments(2, 3, 1000, oldAnchor + 10000)).toEqual([
      { date: '2026-11-08', firstTickAtMs: oldAnchor + 13000, count: 1 },
    ]);
  });
  it('rejects backwards or fractional counters instead of fabricating daily entries', () => {
    expect(() => partitionRosaryDaySegments(3, 2, 1000, Date.now())).toThrow();
    expect(() => partitionRosaryDaySegments(0, 1.5, 1000, Date.now())).toThrow();
  });
});
