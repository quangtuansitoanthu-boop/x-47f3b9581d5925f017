import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceMeditationSession, cancelMeditationSession, createMeditationSession, meditationDurationSeconds, type MeditationSessionState } from '../../../src/lib/domain/practice/guided-sessions';

// Chạy chính các hàm scheduler của route để bắt vòng lặp bị nhân mà không mock Svelte.
const route = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const script = route.slice(route.indexOf('>') + 1, route.indexOf('</script>'));
const ast = ts.createSourceFile('practice.ts', script, ts.ScriptTarget.Latest, true);
const names = new Set(['startMeditationTickers', 'stopMeditationTickers', 'stepMeditation']);
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? ''));
const compiled = ts.transpileModule(functions.map((node) => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function createHarness() {
  let session = createMeditationSession(15 * 60, 0);
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const completed = vi.fn();
  const harness = runInNewContext(`
    let meditationSession = initialSession;
    let meditationTicker = null;
    let meditationFrame = 0;
    function applyMeditationTransition(transition) {
      meditationSession = transition.state;
      onTransition(transition.state);
    }
    ${compiled}
    ({ start: startMeditationTickers, stop: stopMeditationTickers,
       setSession(value) { meditationSession = value; } });
  `, {
    initialSession: session,
    audio: { hasNativeMeditation: () => false },
    Date,
    advanceMeditationSession,
    onTransition(value: MeditationSessionState) {
      session = value;
      if (value.phase === 'completed') completed();
    },
    performance: { now: () => Date.now() },
    setInterval, clearInterval,
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id: number) { frames.delete(id); },
  }) as { start(): void; stop(): void; setSession(value: MeditationSessionState): void };
  return { ...harness, frames, completed, getSession: () => session };
}

afterEach(() => vi.useRealTimers());

describe('meditation scheduler lifetime', () => {
  it.each(['close', 'switch', 'current'])('scopes a deferred music failure to the current guided session (%s)', async action => {
    const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node)
      && ['startGuidedMeditation', 'sessionPrincipalId'].includes(node.name?.text ?? ''));
    const source = ts.transpileModule(nodes.map(node => node.getText(ast)).join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    let finishAudio!: (played: boolean) => void;
    const feedback = vi.fn(), wake = vi.fn(), tick = vi.fn();
    const harness = runInNewContext(`
      let practiceSyncGeneration = 0, syncSession = { authenticated: true, user: { id: 'A' } };
      let meditationChooserOpen = true, meditationSetup, meditationSession, meditationEvidenceHandle;
      let meditationLogFinished, meditationPendingLog, meditationLocalLogSaved, meditationLastActiveElapsedMs;
      ${source}
      ({start: startGuidedMeditation, invalidate(action) {
        if (action === 'switch') { practiceSyncGeneration++; syncSession = { authenticated: true, user: { id: 'B' } }; }
        if (action !== 'current') { meditationSession = null; meditationEvidenceHandle = null; }
      }});
    `, {
      Date, createMeditationSession, meditationDurationSeconds,
      audio: { setMeditationTrack: () => new Promise<boolean>(resolve => { finishAudio = resolve; }), hasNativeMeditation: () => false },
      localeStore: { current: 'vi', t: { practice: { meditationTitle: 'Thiền', meditationMusicUnavailable: 'Music unavailable' } } },
      meditationMotion: { disable() {} }, startPracticeEvidence: () => ({ id: 'evidence-A' }),
      writeToolUrl() {}, saveGuidedSettings() {}, suspendScriptureEvidence() {}, cleanupPracticeResources() {},
      showPracticeFeedback: feedback, refreshAudioState() {}, closeGuidedMeditation() {},
      wakeLock: { request: wake }, startMeditationTickers: tick,
    }) as { start(setup: { motionEnabled: boolean; durationMinutes: number; musicTrack: string }): Promise<void>; invalidate(action: string): void };
    const pending = harness.start({ motionEnabled: false, durationMinutes: 15, musicTrack: '/assets/audio/nhac-thien-01.m4a' });
    harness.invalidate(action);
    finishAudio(false);
    await pending;
    expect(feedback).toHaveBeenCalledTimes(action === 'current' ? 1 : 0);
    expect(wake).toHaveBeenCalledTimes(action === 'current' ? 1 : 0);
    expect(tick).toHaveBeenCalledTimes(action === 'current' ? 1 : 0);
  });
  it.each([899_900, 600_000])('records only one finish when ending at %ims reaches the deadline', (elapsed) => {
    const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node)
      && ['applyMeditationTransition', 'endGuidedMeditation'].includes(node.name?.text ?? ''));
    const source = ts.transpileModule(nodes.map(node => node.getText(ast)).join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const finish = vi.fn();
    const initial = { ...createMeditationSession(900, 0, 0, true), phase: 'active', activeElapsedMs: elapsed, lastObservedAtMs: elapsed };
    runInNewContext(`let meditationSession = initial; let meditationLastActiveElapsedMs = initial.activeElapsedMs;
      ${source}\nendGuidedMeditation();`, {
      initial, cancelMeditationSession, Date: { now: () => elapsed === 899_900 ? 900_000 : 600_100 },
      audio: { hasNativeMeditation: () => false, pauseMeditation() {}, playMeditationCompletion() {} },
      meditationSetup: { woodenFishEnabled: false }, localeStore: { t: { practice: {} } },
      finishMeditationEvidence: finish, refreshAudioState() {}, stopMeditationTickers() {},
      wakeLock: { release: async () => {} },
    });
    expect(finish).toHaveBeenCalledOnce();
  });
  it('does not infer unconfirmed native playing time when cancellation races foreground refresh', () => {
    const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === 'endGuidedMeditation');
    const source = ts.transpileModule(node!.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const initial = { ...createMeditationSession(900, 0, 0, true), activeElapsedMs: 1_000, lastObservedAtMs: 1_000 };
    const result = runInNewContext(`let meditationSession = initial;
      function applyMeditationTransition(t) { meditationSession = t.state; }
      ${source}\nendGuidedMeditation(); meditationSession;`, {
      initial, audio: { hasNativeMeditation: () => true, pauseMeditation() {} },
      Date: { now: () => 900_000 }, cancelMeditationSession, stopMeditationTickers() {},
      finishMeditationEvidence() {}, refreshAudioState() {}, wakeLock: { release: async () => {} },
    }) as MeditationSessionState;
    expect(result.activeElapsedMs).toBe(1_000);
    expect(result.phase).toBe('cancelled');
  });
  it('records completion once even if repeated native/visibility updates arrive', () => {
    const apply = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'applyMeditationTransition');
    const source = ts.transpileModule(apply!.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const finish = vi.fn();
    const transition = { state: { ...createMeditationSession(900, 0), phase: 'completed', activeElapsedMs: 900_000 }, cues: [] };
    runInNewContext(`let meditationSession = { phase: 'active' }; let meditationLastActiveElapsedMs = 0;
      ${source}\napplyMeditationTransition(transition); applyMeditationTransition(transition);`, {
      transition, audio: { pauseMeditation() {} }, meditationSetup: { woodenFishEnabled: false },
      finishMeditationEvidence: finish, refreshAudioState() {}, stopMeditationTickers() {},
      wakeLock: { release: async () => {} },
    });
    expect(finish).toHaveBeenCalledOnce();
  });
  it('keeps bounded scheduling for a full 15-minute session, including past minute ten', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const harness = createHarness();
    harness.start();
    vi.advanceTimersByTime(10 * 60_000);
    expect(harness.frames.size).toBeLessThanOrEqual(1);
    expect(harness.getSession().phase).toBe('active');
    expect(harness.getSession().activeElapsedMs).toBe(570_000);
    vi.advanceTimersByTime(330_000);
    expect(harness.getSession().phase).toBe('completed');
    expect(harness.completed).toHaveBeenCalledTimes(1);
    expect(harness.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarting and stopping leave no orphaned scheduler or late ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const harness = createHarness();
    harness.start();
    vi.advanceTimersByTime(1_000);
    harness.start();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1_000);
    harness.stop();
    const elapsed = harness.getSession().preparationElapsedMs;
    expect(harness.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(harness.getSession().preparationElapsedMs).toBe(elapsed);
  });
});
