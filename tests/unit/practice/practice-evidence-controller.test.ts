import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPracticeEvidenceController } from '../../../src/lib/browser/practice-evidence-controller';
import { createPracticeSessionOutbox } from '../../../src/lib/browser/practice-session-outbox';

describe('practice evidence controller', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses observed native rosary start while keeping the default clock unchanged', () => {
    const outbox = { enqueueStart: vi.fn(), enqueueCompletion: vi.fn(), flush: vi.fn(async () => 0) };
    const controller = createPracticeEvidenceController(outbox as never, { now: () => new Date('2026-11-08T00:05:00+07:00'), createId: () => 'native' });
    const observed = new Date('2026-11-08T00:00:00+07:00');
    expect(controller.start({ activityType: 'rosary' }, observed)).toMatchObject({ startedAt: observed.toISOString(), startedAtMs: observed.getTime() });
    expect(controller.start({ activityType: 'meditation' }).startedAt).toBe('2026-11-07T17:05:00.000Z');
  });

  it('rejects invalid/future observed starts and observed starts for other tools before queuing', () => {
    const outbox = { enqueueStart: vi.fn(), enqueueCompletion: vi.fn(), flush: vi.fn(async () => 0) };
    const controller = createPracticeEvidenceController(outbox as never, { now: () => new Date('2026-11-07T17:05:00Z') });
    for (const observed of [new Date(NaN), new Date('2026-11-07T17:05:00.001Z')]) {
      expect(() => controller.start({ activityType: 'rosary' }, observed)).toThrow('invalid_observed_practice_start');
    }
    expect(() => controller.start({ activityType: 'meditation' }, new Date('2026-11-07T17:00:00Z'))).toThrow('invalid_observed_practice_start');
    expect(outbox.enqueueStart).not.toHaveBeenCalled();
  });

  it('keeps a late completion in its captured principal queue after root selects another account', async () => {
    const values = new Map<string, string>();
    const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const outbox = createPracticeSessionOutbox(fetcher, storage);
    outbox.setSession({ authenticated: true, csrfToken: 'a', user: { id: 'a' } });
    const controller = createPracticeEvidenceController(outbox);
    const handle = controller.start({ activityType: 'rosary' }, new Date(Date.now() - 1000));
    outbox.setSession({ authenticated: true, csrfToken: 'b', user: { id: 'b' } });
    controller.finish(handle, { acceptedCount: 108 });
    await Promise.resolve(); await Promise.resolve();
    expect(outbox.getStatus()).toMatchObject({ principalId: 'b', pendingOperations: 0 });
    expect(outbox.pending('a').map(operation => operation.kind)).toEqual(['start', 'complete']);
    expect(outbox.pending('b')).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps legacy restored handles without a principal field with the settling controller owner', () => {
    const outbox = { enqueueStart: vi.fn(), enqueueCompletion: vi.fn(), flush: vi.fn(async () => 0), getStatus: () => ({ principalId: 'b' }) };
    const controller = createPracticeEvidenceController(outbox as never, { principalId: () => 'a' });
    const handle = { activityType: 'meditation' as const, clientSessionId: 'legacy-a', startedAt: '2026-11-06T00:00:00Z', startedAtMs: 0, targetCount: null, targetDurationSeconds: 60 };
    controller.finish(handle, { activeSeconds: 60 });
    expect(outbox.enqueueCompletion).toHaveBeenCalledWith('legacy-a', expect.any(Object), 'a');
  });

  it('starts distinct rosary sessions and saves completion without randomUUID on older WebViews', () => {
    const getRandomValues = vi.fn(crypto.getRandomValues.bind(crypto));
    vi.stubGlobal('crypto', { getRandomValues });
    const outbox = { enqueueStart: vi.fn(), enqueueCompletion: vi.fn(), flush: vi.fn(async () => 0) };
    const controller = createPracticeEvidenceController(outbox as never);
    const first = controller.start({ activityType: 'rosary', sourceKind: 'guided_rosary', targetCount: 108 });
    const second = controller.start({ activityType: 'rosary', sourceKind: 'guided_rosary', targetCount: 108 });
    expect(first.clientSessionId).toMatch(/^practice:rosary:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(first.clientSessionId).not.toBe(second.clientSessionId);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(outbox.enqueueStart).toHaveBeenCalledWith(expect.objectContaining({
      clientSessionId: first.clientSessionId, idempotencyKey: first.clientSessionId,
    }));
    expect(controller.finish(first, { acceptedCount: 2, clientElapsedSeconds: 1, minimumIntervalMs: 400 })).toBe(true);
    expect(controller.finish(first, { acceptedCount: 2 })).toBe(false);
    expect(outbox.enqueueCompletion).toHaveBeenCalledExactlyOnceWith(first.clientSessionId, expect.objectContaining({
      evidenceSummary: { acceptedCount: 2, clientElapsedSeconds: 1, minimumIntervalMs: 400 },
    }));
  });
  it('queues one start and one completion for a handle', () => {
    const outbox = {
      enqueueStart: vi.fn(),
      enqueueCompletion: vi.fn(),
      flush: vi.fn(async () => 0),
    };
    let id = 0;
    const controller = createPracticeEvidenceController(outbox as never, {
      createId: () => `session-${++id}`,
      now: () => new Date('2026-09-04T07:00:00.000Z'),
    });
    const handle = controller.start({
      activityType: 'meditation',
      sourceKind: 'guided_meditation',
      targetDurationSeconds: 900,
    });

    expect(outbox.enqueueStart).toHaveBeenCalledOnce();
    expect(outbox.enqueueStart).toHaveBeenCalledWith(expect.objectContaining({
      clientSessionId: 'practice:meditation:session-1',
      idempotencyKey: 'practice:meditation:session-1',
    }));
    expect(controller.finish(handle, { activeSeconds: 900 })).toBe(true);
    expect(controller.finish(handle, { activeSeconds: 900 })).toBe(false);
    expect(outbox.enqueueCompletion).toHaveBeenCalledOnce();
    expect(controller.hasFinished(handle)).toBe(true);
  });

  it('does not mark a completion finished until it is durably queued', () => {
    const outbox = {
      enqueueStart: vi.fn(),
      enqueueCompletion: vi.fn()
        .mockImplementationOnce(() => { throw new Error('practice_outbox_capacity_exceeded'); })
        .mockImplementationOnce(() => undefined),
      flush: vi.fn(async () => 0),
    };
    const controller = createPracticeEvidenceController(outbox as never, {
      createId: () => 'retryable-session',
      now: () => new Date('2026-09-04T07:00:00.000Z'),
    });
    const handle = controller.start({ activityType: 'meditation' });

    expect(() => controller.finish(handle, { activeSeconds: 600 }))
      .toThrow('practice_outbox_capacity_exceeded');
    expect(controller.hasFinished(handle)).toBe(false);
    expect(controller.finish(handle, { activeSeconds: 600 })).toBe(true);
    expect(controller.hasFinished(handle)).toBe(true);
    expect(outbox.enqueueCompletion).toHaveBeenCalledTimes(2);
  });
});
