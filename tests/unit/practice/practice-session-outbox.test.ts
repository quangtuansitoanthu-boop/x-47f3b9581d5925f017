import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPracticeSessionOutbox, getBrowserPracticeSessionOutbox, PRACTICE_SESSION_OUTBOX_KEY } from '../../../src/lib/browser/practice-session-outbox';
import { principalStorageKey } from '../../../src/lib/browser/principal-storage';
import { practiceSyncStatusText } from '../../../src/lib/i18n/practice-sync-status';
import type { StorageLike } from '../../../src/lib/browser/storage-contract';

class MemoryStorage implements StorageLike {
  #items = new Map<string, string>();
  get length() { return this.#items.size; }
  getItem(key: string) { return this.#items.get(key) ?? null; }
  key(index: number) { return [...this.#items.keys()][index] ?? null; }
  removeItem(key: string) { this.#items.delete(key); }
  setItem(key: string, value: string) { this.#items.set(key, value); }
}

describe('automatic practice session outbox', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('durable storage safety', () => {
    it('keeps startup alive and reports storage failure when the browser storage getter is blocked', async () => {
      const target = Object.defineProperty({}, 'localStorage', {
        get() { throw new DOMException('Storage blocked', 'SecurityError'); },
      });
      vi.stubGlobal('window', target);
      const fetcher = vi.fn();
      const outbox = getBrowserPracticeSessionOutbox(fetcher);
      expect(outbox.getStatus()).toMatchObject({ phase: 'failed', failure: 'storage', pendingOperations: 0 });
      expect(getBrowserPracticeSessionOutbox(fetcher)).toBe(outbox);
      expect(fetcher).not.toHaveBeenCalled();
    });
    const savedOperation = { id: 'start:saved', kind: 'start', clientSessionId: 'saved', payload: start('saved'), queuedAt: '2026-09-04T10:00:00.000Z' };
    it.each([false, true])('shows a storage error even when the pending count cannot be read (English: %s)', (english) => {
      const outbox = createPracticeSessionOutbox(vi.fn(), { getItem() { throw new Error('storage_unavailable'); }, setItem() {} });
      const status = outbox.getStatus();
      expect(status).toMatchObject({ phase: 'failed', failure: 'storage', pendingOperations: 0 });
      const message = practiceSyncStatusText(status, false, english);
      expect(message).toContain(english ? 'Cannot access' : 'Không thể truy cập');
      expect(message).not.toMatch(/\b0\b/u);
      expect(practiceSyncStatusText({ ...status, phase: 'idle', failure: null }, false, english)).toBe('');
    });
    it.each([
      ['malformed JSON', '{broken'],
      ['empty persisted bytes', ''],
      ['non-array JSON', '{"pending":[]}'],
      ['an invalid operation beside valid work', JSON.stringify([savedOperation, null])],
    ])('preserves %s and refuses enqueue or upload instead of treating it as an empty queue', async (_label, raw) => {
      const storage = new MemoryStorage();
      const fetcher = vi.fn();
      const outbox = createPracticeSessionOutbox(fetcher, storage);
      outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
      const key = principalStorageKey('a', PRACTICE_SESSION_OUTBOX_KEY);
      storage.setItem(key, raw);

      expect(() => outbox.enqueueStart(start('new-start'))).toThrow();
      expect(storage.getItem(key)).toBe(raw);
      expect(() => outbox.enqueueCompletion('saved', finish())).toThrow();
      expect(storage.getItem(key)).toBe(raw);
      await expect(outbox.flush()).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage.getItem(key)).toBe(raw);
      expect(() => outbox.getStatus()).not.toThrow();
      expect(outbox.getStatus()).toMatchObject({ phase: 'failed', failure: 'storage' });
    });

    it('preserves valid queued work when one storage read fails and permits an explicit retry after recovery', async () => {
      const storage = new MemoryStorage();
      const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
      const outbox = createPracticeSessionOutbox(fetcher, storage);
      outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
      outbox.enqueueStart(start('saved'));
      const key = principalStorageKey('a', PRACTICE_SESSION_OUTBOX_KEY);
      const original = storage.getItem(key);
      const read = vi.spyOn(storage, 'getItem').mockImplementationOnce(() => { throw new Error('temporary_storage_read_failure'); });
      try {
        expect(() => outbox.enqueueCompletion('saved', finish())).toThrow('temporary_storage_read_failure');
        expect(storage.getItem(key)).toBe(original);
        expect(outbox.getStatus()).toMatchObject({ pendingOperations: 1, phase: 'failed', failure: 'storage', canRetry: true });
        await expect(outbox.flush()).resolves.toBe(1);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(outbox.getStatus()).toMatchObject({ pendingOperations: 0, phase: 'idle', failure: null });
      } finally { read.mockRestore(); }
    });

    it.each(['anonymous', 'a'])('does not clear either source when explicit adoption cannot read the %s queue', (brokenOwner) => {
      const storage = new MemoryStorage();
      const outbox = createPracticeSessionOutbox(vi.fn(), storage);
      outbox.enqueueStart(start('guest'));
      outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
      outbox.enqueueStart(start('account'));
      const guestKey = principalStorageKey('anonymous', PRACTICE_SESSION_OUTBOX_KEY);
      const accountKey = principalStorageKey('a', PRACTICE_SESSION_OUTBOX_KEY);
      storage.setItem(principalStorageKey(brokenOwner, PRACTICE_SESSION_OUTBOX_KEY), '{broken');
      const guest = storage.getItem(guestKey), account = storage.getItem(accountKey);

      expect(() => outbox.adoptAnonymousQueue('a')).toThrow();
      expect(storage.getItem(guestKey)).toBe(guest);
      expect(storage.getItem(accountKey)).toBe(account);
      expect(outbox.getStatus()).toMatchObject({ phase: 'failed', failure: 'storage' });
    });
  });

  it('shares the browser owner and reports rejected operations without dropping or reordering them', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 422 })).mockResolvedValue(Response.json({ ok: true }));
    const outbox = getBrowserPracticeSessionOutbox(fetcher, storage);
    expect(getBrowserPracticeSessionOutbox(fetcher, storage)).toBe(outbox);
    outbox.setSession({ authenticated: true, csrfToken: 'csrf', user: { id: 'a' } });
    const states: string[] = [];
    const stop = outbox.subscribe(status => states.push(status.phase));
    outbox.enqueueStart(start('status-a'));
    outbox.enqueueCompletion('status-a', finish());
    await expect(outbox.flush()).rejects.toThrow('practice_session_422');
    expect(outbox.getStatus()).toMatchObject({ pendingOperations: 2, phase: 'failed', failure: 'rejected', canRetry: false });
    expect(outbox.pending().map(operation => operation.kind)).toEqual(['start', 'complete']);
    await outbox.flush();
    expect(outbox.getStatus()).toMatchObject({ pendingOperations: 0, phase: 'idle', failure: null });
    expect(states).toContain('syncing');
    stop();
  });

  it('retires error status when the principal changes and never exposes another account queue count', async () => {
    const outbox = createPracticeSessionOutbox(vi.fn(async () => new Response('', { status: 503 })), new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'a', user: { id: 'a' } });
    outbox.enqueueStart(start('private-a'));
    await expect(outbox.flush()).rejects.toThrow();
    expect(outbox.getStatus()).toMatchObject({ phase: 'failed', failure: 'retryable', pendingOperations: 1 });
    outbox.setSession({ authenticated: true, csrfToken: 'b', user: { id: 'b' } });
    expect(outbox.getStatus()).toMatchObject({ principalId: 'b', pendingOperations: 0, phase: 'idle', failure: null });
    expect(outbox.pending('a')).toHaveLength(1);
  });

  it('requests authentication for a cached identity without CSRF and retains the queue', async () => {
    const fetcher = vi.fn();
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: null, user: { id: 'a' } });
    outbox.enqueueStart(start('cached-a'));
    expect(outbox.getStatus()).toMatchObject({ pendingOperations: 1, failure: 'authentication', canRetry: false });
    await outbox.flush();
    expect(fetcher).not.toHaveBeenCalled();
    expect(outbox.pending()).toHaveLength(1);
    outbox.setSession({ authenticated: true, csrfToken: 'csrf', user: { id: 'a' } });
    expect(outbox.getStatus()).toMatchObject({ pendingOperations: 1, phase: 'pending', failure: null, canRetry: true });
  });

  it('shares concurrent flushes of the same queue and announces an accepted completion only once', async () => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const accepted = vi.fn(); target.addEventListener('quangtu:practice-session-accepted', accepted);
    let release: (response: Response) => void = () => {};
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
    outbox.enqueueCompletion('session-a', finish());
    const first = outbox.flush();
    const second = outbox.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(Response.json({ session: { clientSessionId: 'session-a', status: 'completed', verificationResult: 'accepted' } }));
    await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
    expect(outbox.pending()).toEqual([]);
    expect(accepted).toHaveBeenCalledOnce();
  });

  it('drains a completion appended during an active start without replaying that start', async () => {
    let release: (response: Response) => void = () => {};
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValue(Response.json({ ok: true }));
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
    outbox.enqueueStart(start('session-a'));
    const first = outbox.flush();
    outbox.enqueueCompletion('session-a', finish());
    const second = outbox.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(Response.json({ created: true }));
    await expect(Promise.all([first, second])).resolves.toEqual([2, 2]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/practice/sessions', '/api/practice/sessions/session-a/complete',
    ]);
    expect(outbox.pending()).toEqual([]);
  });

  it('retires an in-flight queue when its CSRF proof changes and keeps the operation for the new proof', async () => {
    let release: (response: Response) => void = () => {};
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValue(Response.json({ ok: true }));
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-old', user: { id: 'a' } });
    outbox.enqueueStart(start('session-a'));
    const previous = outbox.flush();
    const previousSignal = fetcher.mock.calls[0][1].signal as AbortSignal;
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-new', user: { id: 'a' } });
    expect(previousSignal.aborted).toBe(true);
    const current = outbox.flush();
    release(Response.json({ ok: true }));
    await expect(previous).resolves.toBe(0);
    await expect(current).resolves.toBe(1);
    expect(fetcher.mock.calls[1][1].headers).toMatchObject({ 'x-csrf-token': 'csrf-new' });
    expect(outbox.pending()).toEqual([]);
  });

  it('announces confirmed accepted completions once per drain, never queued or started sessions', async () => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const events: unknown[] = [];
    target.addEventListener('quangtu:practice-session-accepted', event => events.push((event as CustomEvent).detail));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/complete')
      ? Response.json({ completed: true, session: { clientSessionId: String(input).split('/').at(-2), status: 'completed', verificationResult: 'accepted' } })
      : Response.json({ created: true, session: { status: 'active' } }));
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
    outbox.enqueueStart(start('session-a'));
    expect(events).toEqual([]);
    await outbox.flush(); expect(events).toEqual([]);
    outbox.enqueueCompletion('session-a', finish());
    outbox.enqueueCompletion('session-b', finish());
    expect(events).toEqual([]);
    await outbox.flush();
    expect(events).toEqual([{ principalId: 'a', acceptedCount: 2 }]);
    await outbox.flush(); expect(events).toHaveLength(1);
  });

  it('announces the existing server contribution total once for an accepted drain', async () => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const events: unknown[] = [];
    target.addEventListener('quangtu:practice-session-accepted', event => events.push((event as CustomEvent).detail));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => Response.json({
      completed: true, contributionsAdded: String(input).includes('session-a') ? 2 : 0,
      session: { clientSessionId: String(input).split('/').at(-2), status: 'completed', verificationResult: 'accepted' },
    }));
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
    outbox.enqueueCompletion('session-a', finish());
    outbox.enqueueCompletion('session-b', finish());
    await outbox.flush();
    expect(events).toEqual([{ principalId: 'a', acceptedCount: 2, contributionsAdded: 2 }]);
  });

  it('does not announce rejected, unverified, mismatched or malformed successful responses', async () => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const accepted = vi.fn(); target.addEventListener('quangtu:practice-session-accepted', accepted);
    for (const response of [
      { completed: true, session: { clientSessionId: 'session-a', status: 'completed', verificationResult: 'rejected' } },
      { completed: true, session: { clientSessionId: 'session-a', status: 'active', verificationResult: 'accepted' } },
      { completed: true, session: { clientSessionId: 'other-session', status: 'completed', verificationResult: 'accepted' } },
      { completed: true },
    ]) {
      const outbox = createPracticeSessionOutbox(vi.fn(async () => Response.json(response)), new MemoryStorage());
      outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
      outbox.enqueueCompletion('session-a', finish());
      await outbox.flush();
    }
    expect(accepted).not.toHaveBeenCalled();
  });

  it('announces already accepted work when a later operation fails and retains only the failed operation', async () => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const events: unknown[] = [];
    target.addEventListener('quangtu:practice-session-accepted', event => events.push((event as CustomEvent).detail));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes('session-a')
      ? Response.json({ completed: true, session: { clientSessionId: 'session-a', status: 'completed', verificationResult: 'accepted' } })
      : Response.json({}, { status: 503 }));
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
    outbox.enqueueCompletion('session-a', finish()); outbox.enqueueCompletion('session-b', finish());
    await expect(outbox.flush()).rejects.toThrow('practice_session_503');
    expect(events).toEqual([{ principalId: 'a', acceptedCount: 1 }]);
    expect(outbox.pending().map(item => item.clientSessionId)).toEqual(['session-b']);
  });

  it('does not announce or remove an old account completion returned after principal switch', async () => {
    const target = new EventTarget(); vi.stubGlobal('window', target);
    const accepted = vi.fn(); target.addEventListener('quangtu:practice-session-accepted', accepted);
    let release: (response: Response) => void = () => {};
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    const outbox = createPracticeSessionOutbox(fetcher, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'a' } });
    outbox.enqueueCompletion('session-a', finish());
    const pending = outbox.flush();
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-b', user: { id: 'b' } });
    release(Response.json({ completed: true, session: { clientSessionId: 'session-a', status: 'completed', verificationResult: 'accepted' } }));
    await pending;
    expect(accepted).not.toHaveBeenCalled();
    expect(outbox.pending('a')).toHaveLength(1);
  });

  it('replays start before completion once and keeps the CSRF boundary', async () => {
    const requests: Array<{ path: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ path: String(input), init: init ?? {} });
      return Response.json({ ok: true });
    });
    const outbox = createPracticeSessionOutbox(fetcher as typeof fetch, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    outbox.enqueueStart(start('session-a'));
    outbox.enqueueStart(start('session-a'));
    outbox.enqueueCompletion('session-a', finish());

    await expect(outbox.flush()).resolves.toBe(2);
    expect(requests.map((request) => request.path)).toEqual([
      '/api/practice/sessions',
      '/api/practice/sessions/session-a/complete',
    ]);
    expect(requests[0].init.headers).toMatchObject({ 'x-csrf-token': 'csrf-a' });
    expect(outbox.pending()).toEqual([]);
  });

  it('removes an audited offline replay after back-to-back accepted 2xx responses', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/complete')
      ? Response.json({
        completed: true,
        contributionsAdded: 0,
        session: {
          acceptedDurationSeconds: 480,
          evidenceSummary: { receiptMode: 'offline_replay' },
          verificationReason: null,
          verificationResult: 'accepted',
        },
      })
      : Response.json({ created: true }, { status: 201 }));
    const outbox = createPracticeSessionOutbox(fetcher as typeof fetch, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    outbox.enqueueStart(start('offline-session'));
    outbox.enqueueCompletion('offline-session', finish());

    await expect(outbox.flush()).resolves.toBe(2);
    expect(outbox.pending()).toEqual([]);
    await expect(outbox.flush()).resolves.toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retains a failed operation for ordered retry', async () => {
    let attempt = 0;
    const fetcher = vi.fn(async () => {
      attempt += 1;
      return attempt === 1 ? Response.json({}, { status: 503 }) : Response.json({ ok: true });
    });
    const outbox = createPracticeSessionOutbox(fetcher as typeof fetch, new MemoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    outbox.enqueueStart(start('session-a'));

    await expect(outbox.flush()).rejects.toThrow('practice_session_503');
    expect(outbox.pending()).toHaveLength(1);
    await expect(outbox.flush()).resolves.toBe(1);
    expect(outbox.pending()).toEqual([]);
  });

  it('does not remove or copy user A work when the session switches in flight', async () => {
    let releaseA = () => {};
    const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
    let signalA = () => {};
    const startedA = new Promise<void>((resolve) => { signalA = resolve; });
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const csrf = (init?.headers as Record<string, string>)['x-csrf-token'];
      if (csrf === 'csrf-a') {
        signalA();
        await gateA;
      }
      return Response.json({ ok: true });
    });
    const storage = new MemoryStorage();
    const outbox = createPracticeSessionOutbox(fetcher as typeof fetch, storage);
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    outbox.enqueueStart(start('session-a'));
    const flushA = outbox.flush();
    await startedA;

    outbox.setSession({ authenticated: true, csrfToken: 'csrf-b', user: { id: 'user-b' } });
    outbox.enqueueStart(start('session-b'));
    releaseA();
    await flushA;

    expect(outbox.pending('user-a')).toHaveLength(1);
    expect(outbox.pending('user-b')).toHaveLength(1);
    await expect(outbox.flush()).resolves.toBe(1);
    expect(outbox.pending('user-a')).toHaveLength(1);
    expect(outbox.pending('user-b')).toEqual([]);
  });

  it('adopts anonymous work only after an explicit request', () => {
    const storage = new MemoryStorage();
    const outbox = createPracticeSessionOutbox(vi.fn() as unknown as typeof fetch, storage);
    outbox.enqueueStart(start('anonymous-session'));
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    expect(outbox.pending()).toEqual([]);
    expect(outbox.shouldOfferAnonymousAdoption('user-a')).toBe(true);
    expect(outbox.adoptAnonymousQueue('user-a')).toBe(1);
    expect(outbox.pending()).toHaveLength(1);
    expect(outbox.pending('anonymous')).toEqual([]);
    expect(outbox.shouldOfferAnonymousAdoption('user-a')).toBe(false);
    expect(outbox.shouldOfferAnonymousAdoption('user-b')).toBe(false);
  });

  it('merges an explicitly adopted anonymous queue with existing account work', () => {
    const storage = new MemoryStorage();
    const outbox = createPracticeSessionOutbox(vi.fn() as unknown as typeof fetch, storage);
    outbox.enqueueStart(start('anonymous-session'));
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    outbox.enqueueStart(start('account-session'));

    expect(outbox.adoptAnonymousQueue('user-a')).toBe(1);
    expect(outbox.pending('user-a').map((operation) => operation.clientSessionId)).toEqual([
      'anonymous-session',
      'account-session',
    ]);
  });

  it('adopts two near-capacity queues without dropping anonymous or account operations', () => {
    const storage = new MemoryStorage();
    const outbox = createPracticeSessionOutbox(vi.fn() as unknown as typeof fetch, storage);
    for (let index = 0; index < 500; index += 1) {
      outbox.enqueueStart(start(`anonymous-${index}`));
    }
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    for (let index = 0; index < 500; index += 1) {
      outbox.enqueueStart(start(`account-${index}`));
    }

    expect(outbox.adoptAnonymousQueue('user-a')).toBe(500);
    expect(outbox.pending('user-a')).toHaveLength(1_000);
    expect(outbox.pending('user-a').map((operation) => operation.clientSessionId)).toEqual([
      ...Array.from({ length: 500 }, (_, index) => `anonymous-${index}`),
      ...Array.from({ length: 500 }, (_, index) => `account-${index}`),
    ]);
    expect(outbox.pending('anonymous')).toEqual([]);
  });

  it('keeps the account operation when explicit adoption encounters a duplicate id', () => {
    const storage = new MemoryStorage();
    const outbox = createPracticeSessionOutbox(vi.fn() as unknown as typeof fetch, storage);
    outbox.enqueueStart({ ...start('shared'), sourceId: 'anonymous-source' });
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    outbox.enqueueStart({ ...start('shared'), sourceId: 'account-source' });

    expect(outbox.adoptAnonymousQueue('user-a')).toBe(0);
    expect(outbox.pending('user-a')).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ sourceId: 'account-source' }) }),
    ]);
    expect(outbox.pending('anonymous')).toEqual([]);
  });

  it('orders an account-preferred duplicate start before its adopted completion and drains', async () => {
    const storage = new MemoryStorage();
    const requests: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response('{}', { status: 200 });
    });
    const outbox = createPracticeSessionOutbox(fetcher as typeof fetch, storage);
    outbox.enqueueStart({ ...start('shared'), sourceId: 'anonymous-source' });
    outbox.enqueueCompletion('shared', finish());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    outbox.enqueueStart({ ...start('shared'), sourceId: 'account-source' });

    expect(outbox.adoptAnonymousQueue('user-a')).toBe(1);
    expect(outbox.pending('user-a').map((operation) => operation.kind)).toEqual(['start', 'complete']);
    await expect(outbox.flush()).resolves.toBe(2);
    expect(requests).toEqual([
      '/api/practice/sessions',
      '/api/practice/sessions/shared/complete',
    ]);
    expect(outbox.pending('user-a')).toEqual([]);
  });

  it('retains both sources when their explicit merge would exceed the durable bound', () => {
    const storage = new MemoryStorage();
    const outbox = createPracticeSessionOutbox(vi.fn() as unknown as typeof fetch, storage);
    for (let index = 0; index < 501; index += 1) outbox.enqueueStart(start(`anonymous-${index}`));
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    for (let index = 0; index < 500; index += 1) outbox.enqueueStart(start(`account-${index}`));

    expect(() => outbox.adoptAnonymousQueue('user-a')).toThrow('practice_outbox_capacity_exceeded');
    expect(outbox.pending('anonymous')).toHaveLength(501);
    expect(outbox.pending('user-a')).toHaveLength(500);
    expect(outbox.shouldOfferAnonymousAdoption('user-a')).toBe(true);
  });

  it('records an explicit keep-separate decision without moving anonymous work', () => {
    const storage = new MemoryStorage();
    const outbox = createPracticeSessionOutbox(vi.fn() as unknown as typeof fetch, storage);
    outbox.enqueueStart(start('anonymous-session'));

    expect(outbox.shouldOfferAnonymousAdoption('user-a')).toBe(true);
    outbox.keepAnonymousQueueSeparate('user-a');

    expect(outbox.shouldOfferAnonymousAdoption('user-a')).toBe(false);
    expect(outbox.pending('anonymous')).toHaveLength(1);
    expect(outbox.pending('user-a')).toEqual([]);
  });
});

function start(clientSessionId: string) {
  return {
    activityType: 'meditation' as const,
    clientSessionId,
    idempotencyKey: `start-${clientSessionId}`,
    sourceId: null,
    sourceKind: 'guided_meditation',
    startedAt: '2026-09-04T10:00:00.000Z',
    targetCount: null,
    targetDurationSeconds: 600,
  };
}

function finish() {
  return {
    completedAt: '2026-09-04T10:10:00.000Z',
    evidenceSummary: { activeSeconds: 480, clientElapsedSeconds: 600, hiddenSeconds: 120 },
  };
}
