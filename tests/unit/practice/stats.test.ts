import { describe, expect, it } from 'vitest';

import { calculatePracticeStreak, summarizePracticeStats } from '../../../src/lib/domain/practice/stats';
import type { PracticeLog } from '../../../src/lib/domain/practice/logs';

const LOGS: PracticeLog[] = [
  { id: 1, date: '2026-07-31', type: 'Niệm danh hiệu', count: 108, note: '', created: '2026-07-31T01:00:00.000Z' },
  { id: 2, date: '2026-07-30', type: 'Tụng kinh', count: 2, note: '', created: '2026-07-30T01:00:00.000Z' },
  { id: 3, date: '2026-07-28', type: 'Lễ Phật', count: 3, note: '', created: '2026-07-28T01:00:00.000Z' },
  { id: 4, date: '2026-07-01', type: 'Trì chú', count: 5, note: '', created: '2026-07-01T01:00:00.000Z' }
];

describe('practice stats', () => {
  it('ignores future records for the current streak without changing saved data or period totals', () => {
    const logs: PracticeLog[] = [
      Object.freeze({ ...LOGS[0], id: 201, date: '2026-11-07' }),
      Object.freeze({ ...LOGS[0], id: 202, date: '2026-11-08' }),
      Object.freeze({ ...LOGS[0], id: 203, date: '2026-11-09' }),
    ];
    const before = JSON.stringify(logs);
    const now = new Date('2026-11-08T06:00:00Z');
    expect(calculatePracticeStreak(logs, now)).toBe(2);
    expect(summarizePracticeStats(logs, 'month', now).total).toBe(324);
    expect(JSON.stringify(logs)).toBe(before);
    expect(calculatePracticeStreak([logs[2]], now)).toBe(0);
  });

  it('ignores invalid stored dates and retains a streak ending yesterday across the Vietnam day boundary', () => {
    const logs: PracticeLog[] = [
      { ...LOGS[0], date: '2026-03-01' },
      { ...LOGS[0], id: 2, date: '2026-02-28' },
      { ...LOGS[0], id: 3, date: '2026-02-30' },
      { ...LOGS[0], id: 4, date: 'invalid-date' },
    ];
    expect(calculatePracticeStreak(logs, new Date('2026-03-01T17:00:00Z'))).toBe(2);
    expect(calculatePracticeStreak(logs, new Date('2026-03-02T17:00:00Z'))).toBe(0);
  });

  it('uses Vietnam-local day boundaries for summaries', () => {
    const stats = summarizePracticeStats(LOGS, 'day', new Date('2026-07-30T20:00:00.000Z'));
    expect(stats.total).toBe(108);
    expect(stats.summary).toContain('Hôm nay bạn đã niệm được 108 biến.');
  });

  it('forwards the selected language while keeping Vietnamese as the default', () => {
    const logs: PracticeLog[] = [{ ...LOGS[0], type: 'Lễ Phật', count: 3 }];
    const now = new Date('2026-07-31T10:00:00Z');
    expect(summarizePracticeStats(logs, 'day', now).summary).toBe('Hôm nay bạn đã lễ được 3 lạy.');
    const english = summarizePracticeStats(logs, 'day', now, 'en');
    expect(english.summary).toContain('3 prostrations');
    expect(english).toMatchObject({ activeDays: 1, streak: 1, total: 3 });
    expect(summarizePracticeStats(logs, 'week', now).summary).toContain('7 ngày gần nhất');
    expect(summarizePracticeStats(logs, 'week', now, 'en').summary).toContain('past 7 days');
  });

  it('calculates week, month and streak deterministically', () => {
    const week = summarizePracticeStats(LOGS, 'week', new Date('2026-07-31T10:00:00.000Z'));
    const month = summarizePracticeStats(LOGS, 'month', new Date('2026-07-31T10:00:00.000Z'));

    expect(week.total).toBe(113);
    expect(week.activeDays).toBe(3);
    expect(week.streak).toBe(2);
    expect(month.total).toBe(118);
  });

  it('keeps legacy numeric totals and saved records while describing mixed units separately', () => {
    const logs: PracticeLog[] = [
      Object.freeze({ ...LOGS[0], id: 30, type: 'Lễ Phật', count: 3 }),
      Object.freeze({ ...LOGS[0], id: 31, type: 'Ngồi thiền', count: 15 }),
      Object.freeze({ ...LOGS[0], id: 32, type: 'Chép kinh', count: 1 }),
    ];
    const before = JSON.stringify(logs);
    const stats = summarizePracticeStats(logs, 'day', new Date('2026-07-31T10:00:00Z'));
    expect(stats).toMatchObject({ total: 19, activeDays: 1, streak: 1 });
    expect(stats.scopedLogs).toHaveLength(3);
    expect(stats.summary).toBe('Hôm nay bạn đã lễ được 3 lạy, ngồi thiền được 15 phút và chép kinh được 1 lượt.');
    expect(JSON.stringify(logs)).toBe(before);
  });

  it('formats summaries for Chép kinh and Chép danh hiệu correctly', () => {
    const manualLogs: PracticeLog[] = [
      {
        id: 10,
        date: '2026-08-01',
        type: 'Chép kinh',
        count: 5,
        note: 'Chép Kinh Phổ Môn',
        created: '2026-08-01T02:00:00.000Z',
        campaignId: 'camp-1',
        campaignTitle: 'Cộng đồng Chép Kinh'
      },
      {
        id: 11,
        date: '2026-08-01',
        type: 'Chép danh hiệu',
        count: 108,
        note: 'Nam Mô A Di Đà Phật',
        created: '2026-08-01T03:00:00.000Z'
      }
    ];

    const stats = summarizePracticeStats(manualLogs, 'day', new Date('2026-08-01T10:00:00.000Z'));
    expect(stats.total).toBe(113);
    expect(stats.activeDays).toBe(1);
    expect(stats.summary).toContain('chép kinh được 5 lượt');
    expect(stats.summary).toContain('chép danh hiệu được 108 câu');
  });

  it('formats summaries for Ngồi thiền with minutes instead of biến', () => {
    const meditationLogs: PracticeLog[] = [
      {
        id: 20,
        date: '2026-08-02',
        type: 'Ngồi thiền',
        count: 45,
        note: 'Ngồi thiền 45 phút',
        created: '2026-08-02T05:00:00.000Z'
      }
    ];

    const stats = summarizePracticeStats(meditationLogs, 'day', new Date('2026-08-02T10:00:00.000Z'));
    expect(stats.summary).toBe('Hôm nay bạn đã ngồi thiền được 45 phút.');
  });

  it('calculates annual statistics with Jan 1 to Dec 31 window', () => {
    const annualLogs: PracticeLog[] = [
      { id: 101, date: '2025-12-31', type: 'Niệm danh hiệu', count: 50, note: '', created: '2025-12-31T10:00:00.000Z' },
      { id: 102, date: '2026-01-01', type: 'Niệm danh hiệu', count: 100, note: '', created: '2026-01-01T10:00:00.000Z' },
      { id: 103, date: '2026-06-15', type: 'Tụng kinh', count: 1, note: 'Kinh Dược Sư', created: '2026-06-15T10:00:00.000Z' },
      { id: 104, date: '2026-12-31', type: 'Lễ Phật', count: 108, note: '', created: '2026-12-31T10:00:00.000Z' },
      { id: 105, date: '2027-01-01', type: 'Niệm danh hiệu', count: 70, note: '', created: '2027-01-01T10:00:00.000Z' }
    ];

    const yearStats = summarizePracticeStats(annualLogs, 'year', new Date('2026-07-15T10:00:00.000Z'));
    expect(yearStats.total).toBe(209); // 100 + 1 + 108
    expect(yearStats.activeDays).toBe(3);
    expect(yearStats.summary).toContain('Năm nay bạn đã');
    expect(yearStats.summary).toContain('niệm được 100 biến');
    expect(yearStats.summary).toContain('tụng được 1 biến');
    expect(yearStats.summary).toContain('lễ được 108 lạy');

    const emptyStats = summarizePracticeStats([], 'year', new Date('2026-07-15T10:00:00.000Z'));
    expect(emptyStats.summary).toBe('Năm nay bạn chưa ghi nhận công phu nào.');
  });
});
