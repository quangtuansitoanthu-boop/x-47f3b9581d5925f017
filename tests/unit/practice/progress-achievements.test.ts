import { describe, expect, it } from 'vitest';
import {
  aggregatePracticeDays,
  buildPracticeHeatmap,
  calculatePracticeStreaks,
  dateKeyInTimeZone,
  earnedPracticeBadges,
  normalizeSelectedPracticeBadge,
  getBadgeDefinition,
  PRACTICE_BADGE_DEFINITIONS,
} from '../../../src/lib/domain/practice/progress-achievements';

describe('practice aggregation and achievements', () => {
  it.each([
    [9999, 9, 'streak-3000'],
    [10000, 10, 'streak-10000'],
    [19999, 10, 'streak-10000'],
    [20000, 11, 'streak-20000'],
  ])('unlocks long-term badges at exactly %i days', (longestStreak, count, last) => {
    const earned = earnedPracticeBadges({ longestStreak, totalAcceptedCount: 1_000_000 });
    expect(earned).toHaveLength(count);
    expect(earned.at(-1)).toBe(last);
    for (const id of ['streak-10000', 'streak-20000'] as const) {
      expect(normalizeSelectedPracticeBadge(id, earned)).toBe(earned.includes(id) ? id : null);
    }
  });

  it('provides eleven ordered, uniquely identified achievement tiers', () => {
    expect(PRACTICE_BADGE_DEFINITIONS.map((badge) => badge.tier)).toEqual(
      Array.from({ length: 11 }, (_, index) => index + 1),
    );
    expect(new Set(PRACTICE_BADGE_DEFINITIONS.map((badge) => badge.id)).size).toBe(11);
    expect(getBadgeDefinition('streak-10000')?.title).toBe('Vạn Nhật Liên Tâm');
    expect(getBadgeDefinition('streak-20000')?.title).toBe('Hằng Tâm Diệu Hạnh');
  });

  it('groups accepted activity on the account timezone boundary', () => {
    const sessions = [
      { acceptedCount: 18, acceptedDurationSeconds: 30, completedAt: '2026-09-04T16:59:00.000Z' },
      { acceptedCount: 27, acceptedDurationSeconds: 40, completedAt: '2026-09-04T17:01:00.000Z' },
    ];
    expect(aggregatePracticeDays(sessions, 'Asia/Ho_Chi_Minh')).toEqual([
      { acceptedCount: 18, acceptedDurationSeconds: 30, date: '2026-09-04', sessionCount: 1 },
      { acceptedCount: 27, acceptedDurationSeconds: 40, date: '2026-09-05', sessionCount: 1 },
    ]);
    expect(dateKeyInTimeZone(new Date('2026-09-04T17:01:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-09-05');
  });

  it('builds an exact 365-day heatmap with non-color totals', () => {
    const heatmap = buildPracticeHeatmap([
      { acceptedCount: 18, acceptedDurationSeconds: 60, date: '2026-09-04', sessionCount: 1 },
    ], '2026-09-04');
    expect(heatmap).toHaveLength(365);
    expect(heatmap.at(-1)).toEqual({
      acceptedCount: 18, acceptedDurationSeconds: 60, active: true, date: '2026-09-04', sessionCount: 1,
    });
    expect(heatmap[0].active).toBe(false);
  });

  it('calculates current/longest streak and versioned badge thresholds', () => {
    const aggregates = Array.from({ length: 21 }, (_, index) => ({
      acceptedCount: 500,
      acceptedDurationSeconds: 60,
      date: new Date(Date.UTC(2026, 7, 15 + index)).toISOString().slice(0, 10),
      sessionCount: 1,
    }));
    expect(calculatePracticeStreaks(aggregates, '2026-09-04')).toEqual({ current: 21, longest: 21 });
    const earned21 = earnedPracticeBadges({ longestStreak: 21, totalAcceptedCount: 10_500 });
    expect(earned21).toEqual(['streak-7']);
    expect(normalizeSelectedPracticeBadge('streak-7', earned21)).toBe('streak-7');
    expect(normalizeSelectedPracticeBadge('streak-30', earned21)).toBeNull();

    const earned365 = earnedPracticeBadges({ longestStreak: 365, totalAcceptedCount: 50_000 });
    expect(earned365).toEqual([
      'streak-7', 'streak-30', 'streak-90', 'streak-180', 'streak-300', 'streak-365',
    ]);
    expect(normalizeSelectedPracticeBadge('streak-365', earned365)).toBe('streak-365');

    const earned3000 = earnedPracticeBadges({ longestStreak: 3000, totalAcceptedCount: 100_000 });
    expect(earned3000).toHaveLength(9);
    expect(earned3000.at(-1)).toBe('streak-3000');
  });
});
