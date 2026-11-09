import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translations } from '../../../src/lib/i18n/translations';
import PracticeTracker from '../../../src/lib/components/practice/tracker/PracticeTracker.svelte';

const locale = vi.hoisted(() => ({ current: 'vi' as 'vi' | 'en' }));
vi.mock('../../../src/lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ get current() { return locale.current; }, get t() { return translations[locale.current]; } }) }));
beforeEach(() => { locale.current = 'vi'; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-30T10:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

const log = Object.freeze({ id: 1, date: '2026-10-23', type: 'Niệm danh hiệu' as const, count: 18, note: 'Nam mô Địa Tạng Vương Bồ Tát', created: '2026-10-23T08:00:00Z' });
const props = {
  activePeriod: 'month' as const, historyOpen: false, logs: [log], recentLogs: [log],
  stats: { total: 18, activeDays: 2, streak: 1, summary: 'Tháng này bạn đã niệm được 18 biến.' },
  trackerOpen: true, onHistoryToggle() {}, onNewLog() {}, onPeriodChange() {}, onToggle() {},
};

describe('practice tracker', () => {
  it.each(['vi', 'en'] as const)('describes the rolling seven-day period and grouped entries (%s)', language => {
    locale.current = language;
    const html = render(PracticeTracker, { props: { ...props, activePeriod: 'week' } }).body;
    expect(html).toContain(language === 'vi' ? '7 ngày gần nhất' : 'Last 7 days');
    expect(html).toContain(language === 'vi' ? 'Mỗi mục gộp công phu cùng ngày, cùng loại và nội dung.' : 'Each entry groups practice with the same date, type and content.');
    expect(html).not.toContain(language === 'vi' ? '>Tuần này<' : '>This week<');
  });

  it('recalculates grouped entries and routine summaries using the caller date after midnight', () => {
    const nextDay = Object.freeze({ ...log, date: '2026-10-31' });
    const routine = Object.freeze({ ...nextDay, id: 9, type: 'Khác' as const, note: 'Thời khóa sáng' });
    const html = render(PracticeTracker, { props: { ...props, activePeriod: 'day', logs: [nextDay], recentLogs: [nextDay],
      routineSummaries: [routine], currentDate: new Date('2026-10-30T17:01:00Z') } }).body;
    expect(html.replace(/ class="[^"]*"/gu, '')).toContain('<strong>1</strong><span>Mục công phu hôm nay</span>');
    expect(html).toContain('Thời khóa sáng');
    expect(nextDay.date).toBe('2026-10-31');
  });

  it('renders one complete daily total even when the recent raw-record window cuts through a group', () => {
    const logs = Array.from({ length: 12 }, (_, index) => ({ ...log, id: index + 1, count: 108 }));
    const html = render(PracticeTracker, { props: { ...props, logs, recentLogs: logs.slice(0, 10), historyOpen: true } }).body;
    expect((html.match(/class="tt-tracker__log-item/g) ?? [])).toHaveLength(1);
    expect((html.match(/class="tt-history-item/g) ?? [])).toHaveLength(1);
    expect(html).toContain('1296 biến');
    expect(html).not.toContain('108 biến');
  });
  it('localizes the new interface while keeping saved names unchanged', () => {
    locale.current = 'en';
    const html = render(PracticeTracker, { props }).body;
    expect(html).toContain('My Practice Journal');
    expect(html).toContain('A little practice, every day');
    expect(html).toContain('Day streak');
    expect(html).toContain('Practice entries this month');
    expect(html).toContain('Days practiced');
    expect(html).toContain('Practice period');
    expect(html).toContain(log.note);
  });
  it('provides one manual action and announces the selected period', () => {
    const html = render(PracticeTracker, { props }).body;
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gu) ?? [];
    expect(buttons.filter((button) => /tt-tracker__(?:btn-add|recent-add)/u.test(button))).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>\s*Tháng này/u);
    expect(html).toContain('href="/tien-do-tu-tap"');
  });

  it('preserves saved names, dates and counts with accessible delete actions', () => {
    const before = JSON.stringify(props.logs);
    const html = render(PracticeTracker, { props: { ...props, onDeleteLog() {} } }).body;
    expect(html).toContain(log.note);
    expect(html).toContain('23/10/2026');
    expect(html).toContain('18 biến');
    expect(html).toContain('aria-label="Xóa mục này"');
    expect(JSON.stringify(props.logs)).toBe(before);
  });

  it('shows talk duration as minutes without changing persisted counts or notes', () => {
    const talk = Object.freeze({ ...log, type: 'Nghe pháp thoại' as const, count: 25, note: 'Bài giảng đã nghe' });
    const before = JSON.stringify(talk);
    const html = render(PracticeTracker, { props: { ...props, logs: [talk], recentLogs: [talk], historyOpen: true } }).body;
    expect(html).toContain('25 phút');
    expect(html).toContain(talk.note);
    expect(JSON.stringify(talk)).toBe(before);
  });
  it('keeps the empty state and saved history reachable', () => {
    const html = render(PracticeTracker, { props: { ...props, recentLogs: [], historyOpen: true } }).body;
    expect(html).toContain('Bạn chưa ghi nhận công phu nào.');
    expect(html).toContain('Lịch sử công phu');
    expect(html).toContain(log.note);
  });

  it.each(['pt_drive_74959767068eaae1db4846f62b62eda8:0', 'tt_1781742129070', 'completed-tool:Lễ Phật'])('shows a readable activity type for internal ID %s without rewriting the saved note', note => {
    const legacy = Object.freeze({ ...log, note });
    const html = render(PracticeTracker, { props: { ...props, recentLogs: [legacy], logs: [legacy], historyOpen: true } }).body;
    expect(html).not.toContain(legacy.note);
    expect(html).toContain(note === 'tt_1781742129070' ? 'NIỆM DANH HIỆU CÁC VỊ PHẬT BỒ TÁT' : legacy.type);
    expect(legacy.note).toBe(note);
  });

  it('counts journal entries separately from quantities and days without rewriting mixed saved data', () => {
    const logs = [
      Object.freeze({ ...log, id: 2, date: '2026-10-30', type: 'Lễ Phật' as const, count: 3 }),
      Object.freeze({ ...log, id: 3, date: '2026-10-30', type: 'Ngồi thiền' as const, count: 15 }),
      Object.freeze({ ...log, id: 4, date: '2026-10-30', type: 'Chép kinh' as const, count: 1 }),
      Object.freeze({ ...log, id: 5, date: '2026-10-01', count: 108 }),
      Object.freeze({ ...log, id: 6, date: '2025-10-30', count: 108 }),
    ];
    const before = JSON.stringify(logs);
    for (const [period, count, label] of [
      ['day', 3, 'Mục công phu hôm nay'], ['week', 3, 'Mục công phu 7 ngày gần nhất'],
      ['month', 4, 'Mục công phu tháng này'], ['year', 4, 'Mục công phu năm nay'],
    ] as const) {
      const html = render(PracticeTracker, { props: { ...props, activePeriod: period, logs, recentLogs: logs.slice(0, 3),
        stats: { ...props.stats, total: 19, activeDays: period === 'day' ? 1 : 2 } } }).body;
      expect(html.replace(/ class="[^"]*"/gu, '')).toContain(`<strong>${count}</strong><span>${label}</span>`);
      expect(html).toContain('Ngày có công phu');
      expect(html).not.toContain('Phiên ghi nhận');
      expect(html).toContain('3 lạy');
      expect(html).toContain('15 phút');
      expect(html).toContain('1 lượt');
    }
    expect(JSON.stringify(logs)).toBe(before);
  });

  it.each(['vi', 'en'] as const)('uses activity-specific quantities in recent and historical records (%s)', language => {
    locale.current = language;
    const types = ['Lễ Phật', 'Ngồi thiền', 'Nghe pháp thoại', 'Chép kinh', 'Chép danh hiệu'] as const;
    const logs = types.map((type, index) => Object.freeze({ ...log, id: index + 10, type, count: type === 'Chép danh hiệu' ? 108 : index + 1, note: type }));
    const html = render(PracticeTracker, { props: { ...props, logs, recentLogs: logs, historyOpen: true } }).body;
    for (const quantity of language === 'vi' ? ['1 lạy', '2 phút', '3 phút', '4 lượt', '108 câu'] : ['1 prostrations', '2 mins', '3 mins', '4 sessions', '108 phrases']) expect(html).toContain(quantity);
  });
});
