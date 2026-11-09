import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createRosaryCompletion, ROSARY_COMPLETION_KEY } from '../../../src/lib/browser/rosary-completion';
import { getPracticeStorage } from '../../../src/lib/browser/practice-storage';
import { acceptRosaryInteraction, createRosarySession, rosaryEvidence, resolveRosarySelection, ROSARY_PHRASES,
  ROSARY_SIZES, ROSARY_DAILY_GOALS, ROSARY_MINIMUM_INTERACTION_MS } from '../../../src/lib/domain/practice/guided-sessions';
import { buildRosaryLogEvidence } from '../../../src/lib/domain/practice/rosary-log-sync';
import { practiceUi } from '../../../src/lib/i18n/practice-ui';

const route = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const ast = ts.createSourceFile('route.ts', route.slice(route.indexOf('>') + 1, route.indexOf('</script>')), ts.ScriptTarget.Latest, true);
const names = ['requestRosaryExit', 'closeRosary', 'resetRosary', 'resetRosaryCount', 'settleRestoredRosaryCount',
  'finishRosaryEvidence', 'leaveRosary', 'resumeRosaryVisit', 'readGuidedSettings', 'saveGuidedSettings',
  'ensureCurrentRosaryDay', 'bumpRosary'];
const compiled = ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && names.includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  let failure: 'log' | 'evidence' | 'reset-count' | 'reset-receipt' | 'settings' | null = null;
  let today = '2026-11-03';
  let clock = 1600;
  const values = new Map<string, string>();
  const selectedStorage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failure === 'log' && key === 'tt_practice_logs_v1') throw new Error('quota_log');
      if (failure === 'settings' && key === 'settings') throw new Error('quota_settings');
      if (failure === 'reset-count' && key === 'tt_rosary_count' && value === '0') throw new Error('quota_count');
      if (failure === 'reset-receipt' && key === ROSARY_COMPLETION_KEY) {
        const receipt = JSON.parse(value);
        if (!receipt.resetPending && receipt.accounted === 0 && values.has(ROSARY_COMPLETION_KEY)) throw new Error('quota_receipt');
      }
      values.set(key, value);
    } };
  const storage = getPracticeStorage(selectedStorage);
  // Mobile khởi tạo receipt trước khi nhận lần niệm đầu tiên; phiên dưới đây có 3 hạt mới chưa chốt.
  createRosaryCompletion(selectedStorage).initializeRestoredCount(0, today);
  storage.savePreferences({ rosaryCount: 3 });
  const oldLog = { id: 1, date: '2026-11-03', type: 'Niệm danh hiệu' as const, count: 10,
    note: 'Lần hạt: Nam mô Quán Thế Âm Bồ Tát', created: '2026-11-03T01:00:00Z' };
  storage.saveLog(oldLog);
  values.set('settings', JSON.stringify({ rosaryDate: today, rosaryPhrase: ROSARY_PHRASES[0], rosarySize: 108, rosaryDailyGoal: 1000 }));
  const finished = new Set<string>();
  const finish = vi.fn((handle: { clientSessionId: string }) => {
    if (failure === 'evidence') throw new Error('quota_outbox');
    finished.add(handle.clientSessionId);
    return true;
  });
  const push = vi.fn();
  const report = vi.fn();
  const stopRhythm = vi.fn();
  const pauseRhythm = vi.fn();
  const endRoutineSpy = vi.fn();
  const initial = { ...createRosarySession({ dailyCountBeforeSession: 0, dailyGoal: 1000,
    phrase: ROSARY_PHRASES[0], size: 108, startedAtMs: 0 }), acceptedCount: 3, lastAcceptedAtMs: 1200 };
  const api = runInNewContext(`
    let confirmation = null; let rosaryEndStage = null; let rosaryEndError = ''; let screen = 'rosary';
    let preferences = storage.getPreferences(); let logs = storage.getLogs();
    let rosarySession = initial; let rosaryEvidenceHandle = { clientSessionId: 'rosary:close-test' };
    let rosaryDate = '2026-11-03'; let rosaryPhrase = phrase; let customRosaryPhrases = [];
    let rosaryVisitCount = 3; let rosaryVisitPhrases = [phrase];
    let rosarySize = 108; let rosaryDailyGoal = 1000; let lastRosaryInteractionAtMs = null;
    let rosaryCustomText = ''; let rosaryCustomType = 'Niệm danh hiệu'; let meditationSetup = {};
    let activeRoutine = null; let routinePaused = false; let routineAdvancing = false; let routineIndex = 0;
    function endRoutine() { endRoutineSpy(); activeRoutine = null; routinePaused = false; }
    ${compiled}
    ({ request: requestRosaryExit, close: closeRosary, cancel() { rosaryEndStage = null; },
      back: leaveRosary, reset: resetRosary, bump: bumpRosary, resume: resumeRosaryVisit,
      refresh: readGuidedSettings,
      setRoutine(paused = false, advancing = false) {
        activeRoutine = { steps: [{ kind: 'rosary', automatic: false, count: 108 }] };
        routinePaused = paused; routineAdvancing = advancing;
      },
      pauseRoutine(value) { routinePaused = value; },
      reload() { preferences = storage.getPreferences(); logs = storage.getLogs(); rosarySession = null;
        rosaryEvidenceHandle = null; rosaryVisitCount = 0; readGuidedSettings(); resumeRosaryVisit(); screen = 'rosary'; },
      snapshot() { return { stage: rosaryEndStage, error: rosaryEndError, count: preferences.rosaryCount,
        visit: rosaryVisitCount, session: Boolean(rosarySession), screen, date: rosaryDate }; } });
  `, {
    initial, storage, phrase: ROSARY_PHRASES[0], principalStorage: () => selectedStorage,
    stopRhythm, rhythm: { pause: pauseRhythm }, endRoutineSpy, advanceRoutine: vi.fn(),
    createRosaryCompletion, resolveRosarySelection, buildRosaryLogEvidence, rosaryEvidence,
    practiceEvidence: { hasFinished: (handle: { clientSessionId: string }) => finished.has(handle.clientSessionId), finish },
    performance: { now: () => clock }, startPracticeEvidence: () => ({ clientSessionId: `rosary:${clock}` }),
    acceptRosaryInteraction, createRosarySession, ROSARY_MINIMUM_INTERACTION_MS,
    showPracticeFeedback() {}, localizeUi: Object.assign((text: string) => text, { locale: () => 'vi-VN' }),
    getVietnamIsoDate: () => today, practiceUi, localeStore: { current: 'vi' },
    ROSARY_PHRASES, ROSARY_SIZES, ROSARY_DAILY_GOALS, GUIDED_SETTINGS_KEY: 'settings',
    loadCustomRosaryPhrases() {}, MEDITATION_TRACKS: [], DEFAULT_MEDITATION_SETUP: {},
    reportPracticeEvidenceFailure: report, syncClient: { push }, syncSession: { authenticated: false },
    rosaryReturnScreen: 'catalog', currentArticle: null, suspendScriptureEvidence() {}, closeToolUrl() {},
  }) as { request(): void; close(fromHistory?: boolean, summary?: boolean): void; cancel(): void;
    back(fromHistory?: boolean): void; reset(): void; bump(delta: number): boolean;
    refresh(): void; reload(): void; resume(): void;
    setRoutine(paused?: boolean, advancing?: boolean): void; pauseRoutine(value: boolean): void;
    snapshot(): { stage: string | null; error: string; count: number; visit: number; session: boolean; screen: string; date: string } };
  return { ...api, storage, values, oldLog, finish, push, report, stopRhythm, pauseRhythm, endRoutineSpy,
    fail(mode: typeof failure) { failure = mode; }, nextDay() { today = '2026-11-04'; clock += 500; } };
}

describe('ending a rosary resets only its successfully settled counter', () => {
  it('resets persisted/displayed counts but keeps journal records and the completed visit summary', () => {
    const h = harness();
    h.request();
    h.close(false, true);
    expect(h.snapshot()).toMatchObject({ stage: 'complete', count: 0, visit: 3, session: false });
    expect(h.storage.getPreferences().rosaryCount).toBe(0);
    const logs = h.storage.getLogs();
    expect(logs).toContainEqual(h.oldLog);
    expect(logs).toContainEqual(expect.objectContaining({ count: 3, note: `Lần hạt: ${ROSARY_PHRASES[0]}` }));
    expect(logs).toHaveLength(2);
    h.close();
    expect(h.snapshot()).toMatchObject({ screen: 'catalog', count: 0, visit: 3 });
    expect(h.storage.getLogs()).toEqual(logs);
    expect(h.finish).toHaveBeenCalledOnce();
  });

  it.each(['log', 'evidence'] as const)('does not reset or leave on %s failure; retry keeps one completed record', mode => {
    const h = harness();
    h.fail(mode);
    h.request();
    h.close(false, true);
    expect(h.snapshot()).toMatchObject({ stage: 'confirm', count: 3, visit: 3, session: true });
    expect(h.storage.getPreferences().rosaryCount).toBe(3);
    h.fail(null);
    h.close(false, true);
    expect(h.snapshot()).toMatchObject({ stage: 'complete', count: 0, visit: 3 });
    expect(h.storage.getLogs()).toHaveLength(2);
    expect(h.storage.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(13);
  });

  it.each(['reset-count', 'reset-receipt'] as const)('recovers an interrupted %s reset without duplicating the settled log/evidence', mode => {
    const h = harness();
    h.fail(mode);
    h.request();
    h.close(false, true);
    expect(h.snapshot().stage).toBe('confirm');
    expect(h.snapshot().visit).toBe(3);
    expect(JSON.parse(h.values.get(ROSARY_COMPLETION_KEY)!)).toMatchObject({ resetPending: true });
    const logs = h.storage.getLogs();
    expect(logs).toHaveLength(2);
    h.fail(null);
    h.close(false, true);
    expect(h.snapshot()).toMatchObject({ stage: 'complete', count: 0, visit: 3 });
    expect(h.storage.getPreferences().rosaryCount).toBe(0);
    expect(h.storage.getLogs()).toEqual(logs);
    expect(h.finish).toHaveBeenCalledOnce();
    expect(JSON.parse(h.values.get(ROSARY_COMPLETION_KEY)!)).toMatchObject({ resetPending: false, accounted: 0 });
  });

  it('does not save or reset when the end confirmation is cancelled', () => {
    const h = harness();
    const before = [...h.values.entries()];
    h.request();
    h.cancel();
    expect(h.snapshot()).toMatchObject({ count: 3, visit: 3, session: true, screen: 'rosary' });
    expect([...h.values.entries()]).toEqual(before);
    expect(h.finish).not.toHaveBeenCalled();
  });
});

describe('unfinished rosary resumes until an explicit reset or confirmed end', () => {
  it('pauses audio while the end confirmation is open without settling or changing the counter', () => {
    const h = harness();
    const before = [...h.values.entries()];
    h.request();
    expect(h.pauseRhythm).toHaveBeenCalledOnce();
    expect(h.finish).not.toHaveBeenCalled();
    expect([...h.values.entries()]).toEqual(before);
  });

  it('does not count manual beads while a routine is paused, then resumes the same session', () => {
    const h = harness();
    h.setRoutine(true);
    const before = [...h.values.entries()];
    expect(h.bump(1)).toBe(false);
    expect([...h.values.entries()]).toEqual(before);
    expect(h.snapshot()).toMatchObject({ count: 3, session: true });
    h.pauseRoutine(false);
    expect(h.bump(1)).toBe(true);
    expect(h.snapshot()).toMatchObject({ count: 4, session: true });
  });

  it('manual Back stops the routine only after settling its beads and preserves the unfinished counter', () => {
    const h = harness();
    h.setRoutine();
    h.back();
    expect(h.stopRhythm).toHaveBeenCalledOnce();
    expect(h.endRoutineSpy).toHaveBeenCalledOnce();
    expect(h.finish).toHaveBeenCalledOnce();
    expect(h.snapshot()).toMatchObject({ screen: 'catalog', count: 3, session: false });
    expect(h.storage.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(13);
  });

  it('a routine-driven Back transition does not cancel the remaining routine', () => {
    const h = harness();
    h.setRoutine(false, true);
    h.back();
    expect(h.stopRhythm).toHaveBeenCalledOnce();
    expect(h.endRoutineSpy).not.toHaveBeenCalled();
    expect(h.finish).toHaveBeenCalledOnce();
    expect(h.storage.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(13);
  });

  it('Back returns to the catalog without confirmation/reset; reload resumes and summary includes all unfinished beads', () => {
    const h = harness();
    h.back();
    expect(h.snapshot()).toMatchObject({ screen: 'catalog', stage: null, count: 3, visit: 3 });
    expect(h.storage.getPreferences().rosaryCount).toBe(3);
    const checkpointLogs = h.storage.getLogs();
    h.reload();
    expect(h.snapshot()).toMatchObject({ count: 3, visit: 3 });
    expect(h.storage.getLogs()).toEqual(checkpointLogs);
    expect(h.bump(1)).toBe(true);
    h.request();
    h.close(false, true);
    expect(h.snapshot()).toMatchObject({ count: 0, visit: 4, stage: 'complete' });
    expect(h.storage.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(14);
  });

  it('keeps the unfinished counter across midnight and records only new beads on the new date', () => {
    const h = harness();
    h.nextDay();
    h.refresh();
    expect(h.snapshot()).toMatchObject({ count: 3, visit: 3, date: '2026-11-04' });
    expect(h.bump(1)).toBe(true);
    h.request();
    h.close(false, true);
    expect(h.snapshot()).toMatchObject({ count: 0, visit: 4 });
    expect(h.storage.getLogs()).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-11-03', count: 3, note: `Lần hạt: ${ROSARY_PHRASES[0]}` }),
      expect.objectContaining({ date: '2026-11-04', count: 1, note: `Lần hạt: ${ROSARY_PHRASES[0]}` }),
    ]));
  });

  it('recovers a date carry interrupted before settings were saved without crediting the old counter twice', () => {
    const h = harness();
    h.nextDay();
    h.fail('settings');
    h.refresh();
    const checkpoint = h.storage.getLogs();
    expect(h.storage.getPreferences().rosaryCount).toBe(3);
    expect(JSON.parse(h.values.get('settings')!).rosaryDate).toBe('2026-11-03');
    expect(JSON.parse(h.values.get(ROSARY_COMPLETION_KEY)!)).toMatchObject({ counterDate: '2026-11-04', accounted: 3 });
    h.fail(null);
    h.reload();
    expect(h.snapshot()).toMatchObject({ count: 3, visit: 3, date: '2026-11-04' });
    expect(h.storage.getLogs()).toEqual(checkpoint);
    expect(h.bump(1)).toBe(true);
    h.request(); h.close(false, true);
    expect(h.storage.getLogs()).toHaveLength(3);
    expect(h.storage.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(14);
  });

  it('only an explicit reset clears the unfinished count while retaining the completed journal', () => {
    const h = harness();
    h.reset();
    expect(h.snapshot()).toMatchObject({ count: 0, visit: 0 });
    expect(h.storage.getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(13);
  });
});
