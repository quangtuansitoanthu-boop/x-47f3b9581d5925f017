import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPracticeEvidenceController } from '$lib/browser/practice-evidence-controller';
import {
  createPracticeSessionOutbox,
  type PracticeSessionClientSession,
} from '$lib/browser/practice-session-outbox';
import {
  advancePracticeContentGeneration,
  practiceContentIdentity,
  publishCurrentPracticeContent,
  runPracticePrincipalPull,
  settleActivePracticeProducers,
} from '$lib/browser/practice-principal-lifecycle';

function createStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('active practice principal lifecycle', () => {
  it('settles every automatic producer in A before the outbox selects B', () => {
    const storage = createStorage();
    const fetcher = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    const outbox = createPracticeSessionOutbox(fetcher, storage);
    const sessionA: PracticeSessionClientSession = {
      authenticated: true,
      csrfToken: 'csrf-a',
      user: { id: 'user-a' },
    };
    outbox.setSession(sessionA);
    let nextId = 0;
    const evidence = createPracticeEvidenceController(outbox, {
      createId: () => String(++nextId),
      now: () => new Date('2026-09-04T08:00:00.000Z'),
    });
    const handles = {
      scripture: evidence.start({ activityType: 'scripture' }),
      model: evidence.start({ activityType: 'model_chant' }),
      meditation: evidence.start({ activityType: 'meditation' }),
      rosary: evidence.start({ activityType: 'rosary' }),
    };
    const calls: string[] = [];

    settleActivePracticeProducers({
      saveReaderPosition: () => calls.push('save'),
      finishScriptureEvidence: () => {
        calls.push('scripture');
        evidence.finish(handles.scripture, { activeSeconds: 1 });
      },
      stopModelChant: () => {
        calls.push('model');
        evidence.finish(handles.model, { playedSeconds: 1 });
      },
      closeGuidedMeditation: () => {
        calls.push('meditation');
        evidence.finish(handles.meditation, { activeSeconds: 1 });
      },
      finishRosaryEvidence: () => {
        calls.push('rosary');
        evidence.finish(handles.rosary, { acceptedCount: 1 });
      },
      cleanupResources: () => calls.push('cleanup'),
    });
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-b', user: { id: 'user-b' } });

    expect(calls).toEqual(['save', 'scripture', 'model', 'meditation', 'rosary', 'cleanup']);
    expect(outbox.pending('user-a').map((operation) => operation.kind))
      .toEqual(['start', 'start', 'start', 'start', 'complete', 'complete', 'complete', 'complete']);
    expect(outbox.pending('user-b')).toEqual([]);
  });

  it('drops a deferred A cloud pull without mutating B storage or interim UI', async () => {
    let resolvePull!: (logs: string[]) => void;
    const pull = new Promise<string[]>((resolve) => { resolvePull = resolve; });
    let principal = 'user-a';
    const storage = { 'user-a': ['local-a'], 'user-b': ['local-b'] };
    let visibleLogs = storage['user-b'];
    const apply = vi.fn((cloudLogs: string[]) => {
      storage['user-a'] = [...storage['user-a'], ...cloudLogs];
      visibleLogs = storage['user-a'];
    });

    const result = runPracticePrincipalPull({
      pull: () => pull,
      isCurrent: () => principal === 'user-a',
      apply,
    });
    principal = 'user-b';
    resolvePull(['cloud-a']);

    await expect(result).resolves.toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(storage).toEqual({ 'user-a': ['local-a'], 'user-b': ['local-b'] });
    expect(visibleLogs).toEqual(['local-b']);
  });

  it('continues fail-closed settlement and allows B selection when A completion is at capacity', () => {
    const calls: string[] = [];
    const errors: string[] = [];
    let selectedPrincipal = 'user-a';

    expect(() => settleActivePracticeProducers({
      saveReaderPosition: () => calls.push('save'),
      finishScriptureEvidence: () => {
        calls.push('scripture');
        throw new Error('practice_outbox_capacity_exceeded');
      },
      stopModelChant: () => calls.push('model'),
      closeGuidedMeditation: () => calls.push('meditation'),
      finishRosaryEvidence: () => calls.push('rosary'),
      cleanupResources: () => calls.push('cleanup'),
      onError: (cause, step) => errors.push(`${step}:${cause instanceof Error ? cause.message : 'unknown'}`),
    })).not.toThrow();
    selectedPrincipal = 'user-b';

    expect(selectedPrincipal).toBe('user-b');
    expect(calls).toEqual(['save', 'scripture', 'model', 'meditation', 'rosary', 'cleanup']);
    expect(errors).toEqual(['finishScriptureEvidence:practice_outbox_capacity_exceeded']);
  });

  it('invalidates unpublished content on same-principal role downgrade and drops deferred deletes', async () => {
    const admin = { authenticated: true, user: { id: 'user-a', role: 'admin' } };
    const member = { authenticated: true, user: { id: 'user-a', role: 'user' } };
    expect(practiceContentIdentity(admin)).not.toBe(practiceContentIdentity(member));

    let generation = 1;
    const capturedGeneration = generation;
    let resolveDelete!: () => void;
    const response = new Promise<void>((resolve) => { resolveDelete = resolve; });
    let currentArticle = 'unpublished-a';
    let notice = '';
    let invalidations = 0;
    const pending = response.then(() => publishCurrentPracticeContent(
      () => capturedGeneration === generation,
      () => {
        notice = 'Đã xóa unpublished-a';
        invalidations += 1;
      },
    ));

    generation += 1;
    currentArticle = '';
    resolveDelete();

    await expect(pending).resolves.toBe(false);
    expect(currentArticle).toBe('');
    expect(notice).toBe('');
    expect(invalidations).toBe(0);
  });

  it('keeps deferred work alive across same-principal credential refreshes', async () => {
    const previous = { authenticated: true, user: { id: 'user-a', role: 'admin' } };
    const refreshed = { authenticated: true, user: { id: 'user-a', role: 'admin' } };
    let generation = 7;
    const capturedGeneration = generation;
    let resolveWork!: () => void;
    const response = new Promise<void>((resolve) => { resolveWork = resolve; });
    const publish = vi.fn();
    const pending = response.then(() => publishCurrentPracticeContent(
      () => capturedGeneration === generation,
      publish,
    ));

    generation = advancePracticeContentGeneration(generation, previous, refreshed);
    resolveWork();

    await expect(pending).resolves.toBe(true);
    expect(generation).toBe(7);
    expect(publish).toHaveBeenCalledOnce();
    expect(advancePracticeContentGeneration(generation, refreshed, {
      authenticated: true,
      user: { id: 'user-a', role: 'user' },
    })).toBe(8);
  });

  it('settles the route producers before selecting the next principal and invalidates teardown continuations', () => {
    const page = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
    const settlement = page.slice(
      page.indexOf('function settlePracticeBeforePrincipalSwitch'),
      page.indexOf('function readGuidedSettings'),
    );
    for (const callback of [
      'saveReaderPosition',
      'finishScriptureEvidence',
      'stopModelChant',
      'closeGuidedMeditation',
      'finishRosaryEvidence',
      'cleanupResources',
    ]) expect(settlement).toContain(callback);

    const applySession = page.slice(
      page.indexOf('const applySession = () =>'),
      page.indexOf('applySession();'),
    );
    expect(applySession.indexOf('settlePracticeBeforePrincipalSwitch();'))
      .toBeLessThan(applySession.indexOf('syncSession = nextSession;'));
    expect(applySession).toContain('finally {');
    expect(applySession.indexOf('syncSession = nextSession;'))
      .toBeLessThan(applySession.indexOf('sessionOutbox?.setSession(syncSession);'));
    expect(applySession).toContain('previousContentIdentity !== nextContentIdentity');
    expect(applySession).toContain('advancePracticeContentGeneration');

    const teardown = page.slice(page.indexOf('return () => {'), page.indexOf('</script>'));
    expect(teardown).toContain('practiceSyncGeneration += 1;');
  });
});
