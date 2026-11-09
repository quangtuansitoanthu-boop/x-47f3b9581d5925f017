import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchCalendarDay } from '../../../src/lib/browser/calendar-day-rollover';
import { getVietnamIsoDate, summarizePracticeStats } from '../../../src/lib/domain/practice/stats';
import { practiceLogUnit } from '../../../src/lib/i18n/practice-ui';
import type { PracticeLog } from '../../../src/lib/domain/practice/logs';

const route = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const ast = ts.createSourceFile('route.ts', route.slice(route.indexOf('>') + 1, route.indexOf('</script>')), ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['refreshTrackerDate', 'setCatalogOverlay', 'saveManualLog'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n');
let description = '';
function findDescription(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'description'
    && node.initializer.getText(ast).startsWith("confirmation === 'delete-log'")) description = node.initializer.getText(ast);
  ts.forEachChild(node, findDescription);
}
findDescription(ast);
const code = ts.transpileModule(`${functions}\nthis.refresh = refreshTrackerDate; this.overlay = setCatalogOverlay; this.save = saveManualLog; this.description = () => (${description});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function harness() {
  const shown: string[] = [];
  const state = {
    Date, recommendationClock: new Date(), getVietnamIsoDate, practiceLogUnit,
    localeStore: { current: 'vi' }, syncSession: { authenticated: false, user: null },
    sessionPrincipalId: () => null, manualLogMutationPending: false,
    manualLogModalOpen: true, isEn: false, logs: [] as PracticeLog[],
    storage: { saveLog: (entry: PracticeLog) => [entry], savePreferences: (next: { trackerOpen: boolean }) => next },
    preferences: { trackerOpen: false }, recommendationsCollapsed: true, continueReadingCollapsed: true,
    showPracticeFeedback: (text: string) => shown.push(text), alertInApp: vi.fn(),
    writeToolUrl: vi.fn(), closeToolUrl: vi.fn(),
    confirmation: 'delete-log', pendingDeleteLogId: 1, pendingDeleteLogIds: [1], t: {},
    refresh: () => {}, overlay: (_action: string, _open: boolean, _history: boolean) => {},
    save: async (_entry: PracticeLog) => {}, description: () => '',
  };
  runInNewContext(code, state);
  return { state, shown };
}

function log(type: PracticeLog['type']): PracticeLog {
  return { id: 1, type, count: 3, date: '2026-11-08', created: '2026-11-08T01:00:00Z', note: 'Nội dung đã lưu' };
}

describe('practice tracker route day and unit regressions', () => {
  it.each([
    ['Lễ Phật', 'lạy'], ['Chép kinh', 'lượt'], ['Chép danh hiệu', 'câu'],
    ['Ngồi thiền', 'phút'], ['Nghe pháp thoại', 'phút'], ['Thọ giới', 'lần'], ['Niệm danh hiệu', 'biến'],
  ] as const)('uses the saved activity unit when recording and deleting %s', async (type, unit) => {
    const { state, shown } = harness();
    const entry = Object.freeze(log(type));
    await state.save(entry);
    expect(shown.at(-1)).toContain(`(3 ${unit})`);
    expect(state.manualLogModalOpen).toBe(false);
    state.logs = [entry];
    expect(state.description()).toContain(`(3 ${unit})`);
    expect(entry.count).toBe(3);
    state.pendingDeleteLogIds = [1, 2];
    state.logs = [entry, { ...entry, id: 2 }];
    expect(state.description()).toContain(`tổng: 6 ${unit}`);
  });

  it('refreshes the real Vietnam day after midnight without adding timers on repeated opens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T16:59:59Z'));
    const documentEvents = Object.assign(new EventTarget(), { hidden: false });
    const windowEvents = new EventTarget();
    vi.stubGlobal('document', documentEvents); vi.stubGlobal('window', windowEvents);
    const { state } = harness();
    const oldLogs = [log('Lễ Phật')];
    expect(summarizePracticeStats(oldLogs, 'day', state.recommendationClock).activeDays).toBe(1);
    const dispose = watchCalendarDay(state.refresh);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1101);
    expect(getVietnamIsoDate(state.recommendationClock)).toBe('2026-11-09');
    expect(summarizePracticeStats(oldLogs, 'day', state.recommendationClock).activeDays).toBe(0);
    for (let i = 0; i < 5; i++) state.overlay('cong-phu', true, false);
    expect(vi.getTimerCount()).toBe(1);
    dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it('recalculates on foreground resume and reopen after a missed midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T16:00:00Z'));
    const documentEvents = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', documentEvents); vi.stubGlobal('window', new EventTarget());
    const { state } = harness();
    const dispose = watchCalendarDay(state.refresh);
    documentEvents.hidden = true;
    vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
    documentEvents.hidden = false;
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(getVietnamIsoDate(state.recommendationClock)).toBe('2026-11-10');
    state.recommendationClock = new Date('2026-11-08T16:00:00Z');
    state.overlay('cong-phu', true, false);
    expect(getVietnamIsoDate(state.recommendationClock)).toBe('2026-11-10');
    dispose();
    vi.setSystemTime(new Date('2026-11-11T01:00:00Z'));
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(getVietnamIsoDate(state.recommendationClock)).toBe('2026-11-10');
  });
});
