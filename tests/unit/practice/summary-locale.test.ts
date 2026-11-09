import { describe, expect, it } from 'vitest';
import { buildPracticeSummary } from '../../../src/lib/i18n/practice-summary';
import type { PracticeLog, PracticeType } from '../../../src/lib/domain/practice/logs';

function log(type: PracticeType, count: number, id = 1): PracticeLog {
  return { id, type, count, date: '2026-11-08', created: '2026-11-08T06:00:00Z', note: 'Tên người dùng đã lưu' };
}

describe('localized practice summaries', () => {
  it('formats mixed quantities in English without adding unlike units or rewriting saved names', () => {
    const logs = [log('Lễ Phật', 3), log('Ngồi thiền', 15, 2), log('Chép kinh', 1, 3)];
    const before = JSON.stringify(logs);
    expect(buildPracticeSummary('day', logs, 'en')).toBe('Today you offered 3 prostrations, meditated for 15 minutes and transcribed sutras 1 time.');
    expect(JSON.stringify(logs)).toBe(before);
  });

  it('preserves the default Vietnamese contract and groups repeated practice types', () => {
    expect(buildPracticeSummary('day', [log('Lễ Phật', 3), log('Ngồi thiền', 15), log('Chép kinh', 1)]))
      .toBe('Hôm nay bạn đã lễ được 3 lạy, ngồi thiền được 15 phút và chép kinh được 1 lượt.');
    expect(buildPracticeSummary('month', [log('Lễ Phật', 3), log('Lễ Phật', 2)], 'en'))
      .toBe('This month you offered 5 prostrations.');
  });

  it.each([
    ['Niệm danh hiệu', 'recited Buddha names 1 time'],
    ['Trì chú', 'chanted mantras 1 time'],
    ['Tụng kinh', 'recited sutras 1 time'],
    ['Lễ Phật', 'offered 1 prostration'],
    ['Ngồi thiền', 'meditated for 1 minute'],
    ['Nghe pháp thoại', 'listened to Dharma talks for 1 minute'],
    ['Chép kinh', 'transcribed sutras 1 time'],
    ['Chép danh hiệu', 'copied 1 sacred name'],
    ['Thọ giới', 'received precepts 1 time'],
    ['Khác', 'practiced 1 time'],
  ] as const)('uses the correct English quantity for %s', (type, phrase) => {
    expect(buildPracticeSummary('year', [log(type, 1)], 'en')).toBe(`This year you ${phrase}.`);
  });

  it.each(['day', 'week', 'month', 'year'] as const)('localizes empty %s summaries', period => {
    const text = buildPracticeSummary(period, [], 'en');
    expect(text).toContain('You have not recorded any practice');
    expect(text).not.toContain('bạn');
  });

  it('describes the rolling seven-day period accurately in both locales', () => {
    expect(buildPracticeSummary('week', [log('Chép danh hiệu', 108)], 'en'))
      .toBe('Over the past 7 days you copied 108 sacred names.');
    expect(buildPracticeSummary('week', [log('Lễ Phật', 3)]))
      .toBe('Trong 7 ngày gần nhất bạn đã lễ được 3 lạy.');
    expect(buildPracticeSummary('week', []))
      .toBe('Trong 7 ngày gần nhất bạn chưa ghi nhận công phu nào.');
  });
});
