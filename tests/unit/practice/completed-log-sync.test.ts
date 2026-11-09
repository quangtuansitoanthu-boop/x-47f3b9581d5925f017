import { afterEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeRestoredToolLogs, COMPLETED_LOG_OUTBOX_KEY, createCompletedLogSync, startCompletedPracticeLogSync } from '../../../src/lib/browser/practice-log-outbox';
import { PRACTICE_LOG_CHANGED_EVENT } from '../../../src/lib/domain/practice/completed-logs';
import { createPrincipalStorage } from '../../../src/lib/browser/principal-storage';
import { LEGACY_LOCAL_STORAGE_KEYS } from '../../../src/lib/browser/storage-contract';
import { normalizeCompletedLogs, restoreCompletedToolLog } from '../../../src/lib/domain/practice/completed-logs';
import { DELETED_PRACTICE_LOGS_KEY, getPracticeStorage } from '../../../src/lib/browser/practice-storage';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } };
}
const now = () => new Date('2026-10-28T00:00:00.000Z');
const session = (id = 'a') => ({ authenticated: true, csrfToken: `csrf-${id}`, user: { id } });
const log = (id: number, type = 'Lễ Phật', created = '2026-10-28T00:00:01.000Z') => ({
  id, type, count: 108, created, date: '2026-10-28', note: 'Công phu',
});

describe('completed practice log sync', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('adds zero requests on mount, batches only new missing producers and preserves old logs', async () => {
    const storage = memoryStorage();
    const scoped = createPrincipalStorage(storage, 'a');
    const fetcher = vi.fn(async () => Response.json({ recorded: 3 }));
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1, 'Lễ Phật', '2026-10-27T00:00:00.000Z')]));
    const sync = createCompletedLogSync(fetcher, storage, { now });
    sync.setSession(session());
    await sync.flush();
    expect(fetcher).not.toHaveBeenCalled();
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([
      log(1, 'Lễ Phật', '2026-10-27T00:00:00.000Z'), log(2), log(3, 'Chép kinh'),
      log(4, 'Chép danh hiệu'), log(5, 'Niệm danh hiệu'), { ...log(6), campaignId: 'manual-choice' },
      { ...log(7), created: undefined },
    ]));
    await Promise.all([sync.flush(), sync.flush(), sync.flush()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/practice/completed-logs');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf-a' });
    expect(JSON.parse(String(init.body)).logs.map((item: { type: string }) => item.type).sort())
      .toEqual(['Chép danh hiệu', 'Chép kinh', 'Lễ Phật']);
    await sync.flush();
    const reloaded = createCompletedLogSync(fetcher, storage, { now });
    reloaded.setSession(session());
    await reloaded.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(scoped.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs)!)).toHaveLength(7);
  });

  it('retains failed work and retries the identical receipt without losing local progress', async () => {
    const storage = memoryStorage();
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const sync = createCompletedLogSync(fetcher, storage, { now }); sync.setSession(session());
    const scoped = createPrincipalStorage(storage, 'a');
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1)]));
    await expect(sync.flush()).rejects.toThrow();
    fetcher.mockImplementation(async () => Response.json({ recorded: 1 }));
    await sync.flush();
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe(calls[1][0]);
    expect(calls[0][1].body).toBe(calls[1][1].body);
    expect(calls[0][1].headers).toEqual(calls[1][1].headers);
    expect(JSON.parse(scoped.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs)!)).toHaveLength(1);
  });

  it('does not retry a deleted local completion after an offline failure, including after reload', async () => {
    const storage = memoryStorage();
    const scoped = createPrincipalStorage(storage, 'a');
    const practice = getPracticeStorage(scoped);
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const sync = createCompletedLogSync(fetcher, storage, { now });
    sync.setSession(session());
    practice.saveLog(log(1) as ReturnType<typeof import('../../../src/lib/domain/practice/logs').createPracticeLog>);
    await expect(sync.flush()).rejects.toThrow();
    practice.deleteLog(1);
    const reloaded = createCompletedLogSync(fetcher, storage, { now });
    reloaded.setSession(session());
    await expect(reloaded.flush()).resolves.toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(practice.getLogs()).toEqual([]);
    expect(JSON.parse(scoped.getItem(COMPLETED_LOG_OUTBOX_KEY)!).pending).toEqual([]);
  });

  it('removes only tombstoned retry items while preserving another account and live pending work', async () => {
    const storage = memoryStorage();
    const scoped = createPrincipalStorage(storage, 'a');
    const practice = getPracticeStorage(scoped);
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const sync = createCompletedLogSync(fetcher, storage, { now });
    sync.setSession(session());
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1), log(2)]));
    await expect(sync.flush()).rejects.toThrow();
    practice.deleteLog(1);
    // A stale local snapshot must not re-queue the explicitly deleted receipt.
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1), log(2)]));
    fetcher.mockImplementation(async () => Response.json({ recorded: 1 }));
    await expect(sync.flush()).resolves.toBe(1);
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(JSON.parse(String(calls[1][1].body)).logs.map((entry: { localLogId: number }) => entry.localLogId)).toEqual([2]);
    sync.setSession(session('b'));
    createPrincipalStorage(storage, 'b').setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1)]));
    await expect(sync.flush()).resolves.toBe(1);
    expect(JSON.parse(String(calls[2][1].body)).logs[0].localLogId).toBe(1);
  });

  it('keeps the accepted receipt when a completion is deleted during its in-flight request', async () => {
    const storage = memoryStorage();
    const scoped = createPrincipalStorage(storage, 'a');
    const practice = getPracticeStorage(scoped);
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    const sync = createCompletedLogSync(fetcher, storage, { now });
    sync.setSession(session());
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1)]));
    const pending = sync.flush();
    practice.deleteLog(1);
    release(Response.json({ recorded: 1 }));
    await expect(pending).resolves.toBe(1);
    await sync.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(scoped.getItem(COMPLETED_LOG_OUTBOX_KEY)!).acknowledged).toContain('log:1');
    expect(practice.getLogs()).toEqual([]);
  });

  it.each([null, '{invalid'])('preserves pending work missing from a local snapshot when deletion markers are %s', async markers => {
    const storage = memoryStorage();
    const scoped = createPrincipalStorage(storage, 'a');
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const sync = createCompletedLogSync(fetcher, storage, { now });
    sync.setSession(session());
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1)]));
    await expect(sync.flush()).rejects.toThrow();
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, '[]');
    if (markers !== null) scoped.setItem(DELETED_PRACTICE_LOGS_KEY, markers);
    fetcher.mockImplementation(async () => Response.json({ recorded: 1 }));
    await expect(sync.flush()).resolves.toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not send a later batch deleted while the first batch is in flight', async () => {
    const storage = memoryStorage();
    const scoped = createPrincipalStorage(storage, 'a');
    const practice = getPracticeStorage(scoped);
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    const sync = createCompletedLogSync(fetcher, storage, { now });
    sync.setSession(session());
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify(Array.from({ length: 21 }, (_, i) => log(i + 1))));
    const pending = sync.flush();
    const sent = JSON.parse(String((fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body));
    const sentIds = new Set(sent.logs.map((entry: { localLogId: number }) => entry.localLogId));
    const unsentId = Array.from({ length: 21 }, (_, i) => i + 1).find(id => !sentIds.has(id))!;
    practice.deleteLog(unsentId);
    release(Response.json({ recorded: 20 }));
    await expect(pending).resolves.toBe(20);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(scoped.getItem(COMPLETED_LOG_OUTBOX_KEY)!).pending).toEqual([]);
  });

  it('does not send anonymous logs or carry them into a different account', async () => {
    const storage = memoryStorage(); const fetcher = vi.fn(async () => Response.json({}));
    const sync = createCompletedLogSync(fetcher, storage, { now });
    sync.setSession({ authenticated: false, csrfToken: null, user: null });
    createPrincipalStorage(storage, null).setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1)]));
    await sync.flush(); sync.setSession(session('b')); await sync.flush();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses at most one POST per twenty completions, regardless of campaign count', async () => {
    const storage = memoryStorage(); const fetcher = vi.fn(async () => Response.json({}));
    const sync = createCompletedLogSync(fetcher, storage, { now }); sync.setSession(session());
    createPrincipalStorage(storage, 'a').setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify(Array.from({ length: 41 }, (_, i) => log(i + 1))));
    await sync.flush(); expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('keeps a hung previous account from acknowledging or blocking the next account', async () => {
    const storage = memoryStorage(); let release!: (response: Response) => void;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => init?.headers && Reflect.get(init.headers, 'x-csrf-token') === 'csrf-a'
      ? new Promise<Response>(resolve => { release = resolve; }) : Promise.resolve(Response.json({})));
    const sync = createCompletedLogSync(fetcher, storage, { now }); sync.setSession(session());
    createPrincipalStorage(storage, 'a').setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1)]));
    const previous = sync.flush();
    sync.setSession(session('b'));
    createPrincipalStorage(storage, 'b').setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(2)]));
    await expect(sync.flush()).resolves.toBe(1);
    release(Response.json({})); await expect(previous).resolves.toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported producers, invalid counts, duplicate receipts and future clocks', () => {
    const valid = { logId: 'log:1', localLogId: 1, type: 'Lễ Phật', count: 1, completedAt: now().toISOString(), note: '' };
    for (const change of [{ type: 'Niệm danh hiệu' }, { count: 0 }, { count: 1.5 }, { count: 1_000_001 }, { completedAt: '2026-10-28T00:00:06.000Z' }]) {
      expect(() => normalizeCompletedLogs({ logs: [{ ...valid, ...change }] }, now())).toThrow();
    }
    expect(() => normalizeCompletedLogs({ logs: [valid, valid] }, now())).toThrow();
    expect(() => normalizeCompletedLogs({ logs: Array.from({ length: 21 }, (_, i) => ({ ...valid, logId: String(i) })) }, now())).toThrow();
  });

  it('does not contribute restored server logs again on a second device', async () => {
    const storage = memoryStorage(); const fetcher = vi.fn(async () => Response.json({}));
    const sync = createCompletedLogSync(fetcher, storage, { now }); sync.setSession(session());
    const scoped = createPrincipalStorage(storage, 'a');
    const restored = log(1) as ReturnType<typeof import('../../../src/lib/domain/practice/logs').createPracticeLog>;
    acknowledgeRestoredToolLogs(scoped, [restored]);
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([restored]));
    await sync.flush(); expect(fetcher).not.toHaveBeenCalled();
  });

  it('restores tool identity and original log IDs while leaving old session DTOs unchanged', () => {
    expect(restoreCompletedToolLog({ status: 'completed', verificationResult: 'accepted',
      sourceKind: 'manual_log', sourceId: 'completed-tool:Chép danh hiệu', acceptedCount: 108,
      completedAt: '2026-10-28T00:00:01.000Z',
      evidenceSummary: { origin: 'completed_tool', localLogId: 123, type: 'Chép danh hiệu', note: 'A Di Đà' },
    })).toMatchObject({ id: 123, type: 'Chép danh hiệu', count: 108, note: 'A Di Đà' });
    expect(restoreCompletedToolLog({ status: 'completed', verificationResult: 'accepted', sourceKind: 'guided_rosary' })).toBeNull();
  });

  it('cleans up root listeners and ignores unrelated storage changes', async () => {
    const storage = memoryStorage(); const fetcher = vi.fn(async () => Response.json({}));
    const windowTarget = new EventTarget(); const documentTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
    const stop = startCompletedPracticeLogSync(fetcher, storage, () => session(), vi.fn(), vi.fn());
    const scoped = createPrincipalStorage(storage, 'a');
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1, 'Lễ Phật', new Date().toISOString())]));
    windowTarget.dispatchEvent(Object.assign(new Event('storage'), { key: 'unrelated-theme' }));
    await Promise.resolve(); expect(fetcher).not.toHaveBeenCalled();
    windowTarget.dispatchEvent(new Event(PRACTICE_LOG_CHANGED_EVENT));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    stop();
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(2, 'Lễ Phật', new Date().toISOString())]));
    windowTarget.dispatchEvent(new Event(PRACTICE_LOG_CHANGED_EVENT));
    windowTarget.dispatchEvent(new Event('online'));
    await Promise.resolve(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts an old-account write on hidden logout before acknowledging local work', async () => {
    const storage = memoryStorage();
    let release: (response: Response) => void = () => {};
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(resolve => { release = resolve; });
    });
    const windowTarget = new EventTarget();
    const documentTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
    let selected: ReturnType<typeof session> | { authenticated: false; csrfToken: null; user: null } = session();
    const onApplied = vi.fn();
    const stop = startCompletedPracticeLogSync(fetcher, storage, () => selected, onApplied, vi.fn());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const scoped = createPrincipalStorage(storage, 'a');
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([log(1, 'Lễ Phật', new Date().toISOString())]));
    windowTarget.dispatchEvent(new Event(PRACTICE_LOG_CHANGED_EVENT));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    documentTarget.visibilityState = 'hidden';
    selected = { authenticated: false, csrfToken: null, user: null };
    windowTarget.dispatchEvent(new Event('quangtu:session-changed'));
    try {
      expect(signal?.aborted).toBe(true);
      release(Response.json({ recorded: 1 }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(onApplied).not.toHaveBeenCalled();
      expect(JSON.parse(scoped.getItem(COMPLETED_LOG_OUTBOX_KEY)!).pending).toHaveLength(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      release(Response.json({ recorded: 1 }));
      stop();
    }
  });
});
