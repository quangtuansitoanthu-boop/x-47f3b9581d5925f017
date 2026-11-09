import { render } from 'svelte/server';
import { afterEach, expect, it, vi } from 'vitest';
import { translations } from '$lib/i18n/translations';
import PracticeTracker from '$lib/components/practice/tracker/PracticeTracker.svelte';
import type { PracticeLog } from '$lib/domain/practice/logs';

const locale = vi.hoisted(() => ({ current: 'vi' as 'vi' | 'en' }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({
  get current() { return locale.current; }, get t() { return translations[locale.current]; },
}) }));
afterEach(() => { vi.useRealTimers(); locale.current = 'vi'; });

it.each(['vi', 'en'] as const)('shows period-filtered routine notes without counting their quantities (%s)', language => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T12:00:00Z')); locale.current = language;
  const routineSummaries: PracticeLog[] = [
    { id: 1, date: '2026-11-07', type: 'Khác', count: 999, note: 'Thời Khóa Tối · 35 phút', created: '2026-11-07T12:00:00Z' },
    { id: 2, date: '2026-11-06', type: 'Khác', count: 999, note: 'Yesterday routine', created: '2026-11-06T12:00:00Z' },
  ];
  const before = JSON.stringify(routineSummaries);
  const html = render(PracticeTracker, { props: {
    activePeriod: 'day', historyOpen: false, logs: [], recentLogs: [], routineSummaries,
    stats: { activeDays: 0, streak: 0, total: 0, summary: 'No quantified practice' }, trackerOpen: true,
    onHistoryToggle() {}, onNewLog() {}, onPeriodChange() {}, onToggle() {},
  } }).body;
  expect(html).toContain(language === 'vi' ? 'Thời khóa đã hoàn thành' : 'Completed routines');
  expect(html).toContain('Thời Khóa Tối · 35 phút');
  expect(html).toContain('datetime="2026-11-07"');
  expect(html).not.toContain('Yesterday routine');
  expect(html).not.toContain('999');
  expect(html.replace(/ class="[^"]*"/gu, '')).toContain(`<strong>0</strong><span>${language === 'vi' ? 'Mục công phu hôm nay' : 'Practice entries today'}</span>`);
  expect(JSON.stringify(routineSummaries)).toBe(before);
});
