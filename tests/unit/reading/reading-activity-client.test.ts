import { describe, expect, it, vi } from 'vitest';
import {
  createReadingActivityClient,
  createThrottledReadingProgressWriter,
  isReadingActivityCapacityError,
} from '../../../src/lib/browser/reading-activity-client';
import { createPrincipalStorage } from '../../../src/lib/browser/principal-storage';
import {
  applyAggregateSyncSnapshot,
  LEGACY_LOCAL_STORAGE_KEYS,
} from '../../../src/lib/browser/storage-contract';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class FailableMemoryStorage extends MemoryStorage {
  failWrites = false;

  override setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('Storage unavailable', 'QuotaExceededError');
    super.setItem(key, value);
  }
}

const session = (id: string) => ({ authenticated: true, csrfToken: `csrf-${id}`, user: { id } });
const progress = (percent = 20) => ({
  baseRevision: 0,
  clientUpdatedAt: '2026-09-04T12:00:00.000Z',
  contentId: 'book-a',
  contentKind: 'pdf' as const,
  contentVersion: 'v1',
  epoch: 1,
  percent,
  position: { page: 2 },
  total: 10,
});

describe('reading activity client', () => {
  it('keeps synced history outside a full recent page without returning more than the requested limit', async () => {
    const storage = new MemoryStorage();
    const recent = Array.from({ length: 50 }, (_, index) => ({
      ...progress(50), contentId: `recent-${index}`, revision: 2, deviceId: 'remote', deviceSequence: index + 1,
      serverUpdatedAt: new Date(Date.UTC(2026, 9, 28, 0, 50 - index)).toISOString(),
    }));
    const older = { ...recent[0], contentId: 'older-history', percent: 75, serverUpdatedAt: '2026-10-01T00:00:00Z' };
    createPrincipalStorage(storage, 'user-a').setItem('quangtu_reading_progress_v1', JSON.stringify([...recent, older]));
    const fetcher = vi.fn(async () => Response.json({ progress: recent }));
    const client = createReadingActivityClient(fetcher as typeof fetch, storage);
    client.setSession(session('user-a'));
    expect(await client.listProgress(50)).toHaveLength(50);
    expect(client.cachedProgress()).toContainEqual(older);
    expect(fetcher).toHaveBeenCalledOnce();
    await client.listProgress(50);
    expect(client.cachedProgress()).toHaveLength(51);
    fetcher.mockResolvedValueOnce(Response.json({ progress: [] }));
    expect(await client.listProgress(50)).toEqual([]);
    expect(client.cachedProgress()).toEqual([]);
  });
  it('prefers recent server rows and never retains an older pending deletion outside the page', async () => {
    const storage = new MemoryStorage();
    const first = { ...progress(20), contentId: 'first', revision: 2, deviceId: 'remote', deviceSequence: 1, serverUpdatedAt: '2026-10-28T00:00:00Z' };
    const second = { ...first, contentId: 'second', serverUpdatedAt: '2026-10-27T00:00:00Z' };
    const older = { ...first, contentId: 'older-delete', serverUpdatedAt: '2026-10-01T00:00:00Z' };
    createPrincipalStorage(storage, 'user-a').setItem('quangtu_reading_progress_v1', JSON.stringify([first, second, older]));
    const client = createReadingActivityClient(async () => Response.json({ progress: [{ ...first, percent: 80 }, second] }), storage);
    client.setSession(session('user-a'));
    client.enqueueProgressDelete({ contentKind: 'pdf', contentId: older.contentId, baseRevision: 2, epoch: 1 });
    expect(await client.listProgress(2)).toHaveLength(2);
    expect(client.cachedProgress()).toContainEqual(expect.objectContaining({ contentId: 'first', percent: 80 }));
    expect(client.cachedProgress().some(row => row.contentId === older.contentId)).toBe(false);
  });
  it.each([2, 32])('drains %i simultaneous flushes without replaying the same progress write', async count => {
    let release!: () => void;
    const responseReady = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      await responseReady;
      return Response.json({ progress: {
        ...JSON.parse(String(init?.body)), revision: 1, serverUpdatedAt: '2026-09-05T06:00:00Z',
      } });
    });
    const client = createReadingActivityClient(fetcher, new MemoryStorage());
    client.setSession(session('user-a'));
    client.enqueueProgress(progress());
    const sending = Array.from({ length: count }, () => client.flush());
    release();
    await Promise.all(sending);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.pending()).toEqual([]);
    expect(client.cachedProgress()).toMatchObject([{ percent: 20, revision: 1 }]);
  });

  it('drains a new content item queued while another flush is sending', async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      const input = JSON.parse(String(init?.body));
      if (input.contentId === 'book-a') await ready;
      return Response.json({ progress: { ...input, revision: 1, serverUpdatedAt: '2026-09-05T06:00:00Z' } });
    });
    const client = createReadingActivityClient(fetcher, new MemoryStorage());
    client.setSession(session('user-a'));
    client.enqueueProgress(progress());
    const first = client.flush();
    client.enqueueProgress({ ...progress(), contentId: 'book-b' });
    const second = client.flush();
    release();
    await Promise.all([first, second]);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).contentId)).toEqual(['book-a', 'book-b']);
    expect(client.pending()).toEqual([]);
    expect(client.cachedProgress()).toHaveLength(2);
  });

  it('releases the drain after failure and lets an explicitly requested flush retry the unchanged payload', async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    let firstRequest = true;
    const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      if (firstRequest) {
        firstRequest = false;
        await ready;
        return new Response('Unavailable', { status: 503 });
      }
      return Response.json({ progress: {
        ...JSON.parse(String(init?.body)), revision: 1, serverUpdatedAt: '2026-09-05T06:00:00Z',
      } });
    });
    const client = createReadingActivityClient(fetcher, new MemoryStorage());
    client.setSession(session('user-a'));
    client.enqueueProgress(progress());
    const failed = client.flush().catch((cause: Error) => cause.message);
    const retry = client.flush();
    release();
    expect(await failed).toBe('reading_activity_503');
    expect(await retry).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1]?.body).toBe(fetcher.mock.calls[0][1]?.body);
    expect(client.pending()).toEqual([]);
  });

  it('never blocks a new principal behind the previous principal drain or replays an old waiter', async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      if (new Headers(init?.headers).get('x-csrf-token') === 'csrf-user-a') await ready;
      return Response.json({ progress: {
        ...JSON.parse(String(init?.body)), revision: 1, serverUpdatedAt: '2026-09-05T06:00:00Z',
      } });
    });
    const client = createReadingActivityClient(fetcher, new MemoryStorage());
    client.setSession(session('user-a'));
    client.enqueueProgress(progress(20));
    const oldSending = client.flush();
    const oldWaiting = client.flush();
    client.setSession(session('user-b'));
    client.enqueueProgress(progress(80));
    expect(await client.flush()).toBe(1);
    release();
    expect(await oldSending).toBe(0);
    expect(await oldWaiting).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.pending()).toEqual([]);
    expect(client.pending('user-a')).toHaveLength(1);
    expect(client.cachedProgress()).toMatchObject([{ percent: 80 }]);
  });

  it.each(['progress', 'annotation'] as const)('does not erase a newly acknowledged %s with an older missing detail response', async (kind) => {
    let release!: (response: Response) => void;
    const stale = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return stale;
      const input = JSON.parse(String(init.body));
      return Response.json({ [kind]: kind === 'progress'
        ? { ...input, revision: 1, serverUpdatedAt: '2026-09-05T06:00:00Z' }
        : { ...input, createdAt: '2026-09-05T06:00:00Z', updatedAt: '2026-09-05T06:00:00Z' } });
    });
    const client = createReadingActivityClient(fetcher, new MemoryStorage());
    client.setSession(session('user-a'));
    const load = kind === 'progress' ? client.getProgress('pdf', 'book-a') : client.getAnnotation('quote-new');
    if (kind === 'progress') client.enqueueProgress(progress());
    else client.enqueueAnnotationCreate(annotationDraft('quote-new'));
    await client.flush();
    release(new Response(null, { status: 404 }));
    expect(await load).not.toBeNull();
    expect(kind === 'progress' ? client.cachedProgress() : client.cachedAnnotations()).toHaveLength(1);
  });

  it.each(['progress', 'annotation'] as const)('acknowledges an already-applied %s delete after a lost response', async (kind) => {
    const tombstone = {
      contentKind: 'pdf', contentId: 'book-a', revision: 2, epoch: 1,
      serverUpdatedAt: '2026-09-05T06:00:00Z', deletedAt: '2026-09-05T06:00:00Z',
    };
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(kind === 'progress'
        ? Response.json({ error: { details: { current: null, tombstone } } }, { status: 409 })
        : Response.json({ error: { code: 'annotation_not_found' } }, { status: 404 }));
    const client = createReadingActivityClient(fetcher, new MemoryStorage());
    client.setSession(session('user-a'));
    if (kind === 'progress') client.enqueueProgressDelete({ ...progress(), baseRevision: 1 });
    else client.enqueueAnnotationDelete('quote-delete');
    await expect(client.flush()).rejects.toThrow('connection lost');
    expect(client.pending()).toHaveLength(1);
    await client.flush();
    expect(client.pending()).toEqual([]);
  });

  it.each([
    ['progress', 'detail', false], ['annotation', 'detail', false],
    ['progress', 'detail', true], ['annotation', 'detail', true],
    ['progress', 'list', true], ['annotation', 'list', true],
  ] as const)('does not restore a %s delete from a delayed %s read after acknowledgement=%s', async (kind, shape, acknowledged) => {
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    const storage = new MemoryStorage();
    const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => init?.method === 'DELETE'
      ? Response.json({ deleted: true }) : response);
    const client = createReadingActivityClient(fetcher, storage);
    client.setSession(session('user-a'));
    const load = kind === 'progress'
      ? shape === 'detail' ? client.getProgress('pdf', 'book-a') : client.listProgress()
      : shape === 'detail' ? client.getAnnotation('quote-delete') : client.listAnnotations();
    const deleting = createReadingActivityClient(fetcher, storage);
    deleting.setSession(session('user-a'));
    if (kind === 'progress') deleting.enqueueProgressDelete({ ...progress(), baseRevision: 1 });
    else deleting.enqueueAnnotationDelete('quote-delete');
    if (acknowledged) await deleting.flush();
    const record = kind === 'progress' ? {
      ...progress(), revision: 1, deviceId: 'remote', deviceSequence: 1, serverUpdatedAt: '2026-09-05T06:00:00Z',
    } : { ...annotationDraft('quote-delete'), createdAt: '2026-09-05T06:00:00Z', updatedAt: '2026-09-05T06:00:00Z' };
    release(Response.json({ [kind === 'annotation' && shape === 'list' ? 'annotations' : kind]: shape === 'list' ? [record] : record }));
    expect(await load).toEqual(shape === 'list' ? [] : null);
    expect(client.cachedProgress()).toEqual([]);
    expect(client.cachedAnnotations()).toEqual([]);
  });

  it('does not dispatch a never-sent create removed while an earlier item is saving', async () => {
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async () => response);
    const client = createReadingActivityClient(fetcher, new MemoryStorage());
    client.setSession(session('user-a'));
    client.enqueueProgress(progress());
    client.enqueueAnnotationCreate(annotationDraft('quote-delete'));
    const sending = client.flush();
    client.enqueueAnnotationDelete('quote-delete');
    release(Response.json({}));
    await sending;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.pending()).toEqual([]);
    expect(client.cachedAnnotations()).toEqual([]);
  });

  it('coalesces progress, sequences writes and flushes with CSRF', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage(), {
      createId: () => 'device-a',
    });
    client.setSession(session('user-a'));
    expect(client.enqueueProgress(progress(10)).deviceSequence).toBe(1);
    expect(client.enqueueProgress(progress(30)).deviceSequence).toBe(2);
    expect(client.pending()).toHaveLength(1);
    await expect(client.flush()).resolves.toBe(1);
    expect(fetcher).toHaveBeenCalledWith('/api/reading/progress', expect.objectContaining({
      headers: expect.objectContaining({ 'x-csrf-token': 'csrf-user-a' }),
      method: 'PUT',
    }));
  });

  it('rebases a progress conflict and retains it for a later retry', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      details: { current: { epoch: 2, revision: 7 } },
    }), { status: 409, headers: { 'content-type': 'application/json' } }));
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage(), {
      createId: () => 'device-a',
    });
    client.setSession(session('user-a'));
    client.enqueueProgress(progress());
    await expect(client.flush()).resolves.toBe(0);
    expect(client.pending()[0]).toMatchObject({ payload: { baseRevision: 7, epoch: 2 } });
  });

  it('recreates progress causally after delete and an intentional reopen', async () => {
    const active = {
      ...progress(40), deviceId: 'browser:remote', deviceSequence: 1, revision: 1,
      serverUpdatedAt: '2026-09-04T12:00:01.000Z',
    };
    const tombstone = {
      contentId: 'book-a', contentKind: 'pdf', revision: 2, epoch: 1,
      serverUpdatedAt: '2026-09-04T12:00:02.000Z', deletedAt: '2026-09-04T12:00:02.000Z',
    };
    let deleted = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleted = true;
        return Response.json({ deleted: true, tombstone });
      }
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { baseRevision: number; epoch: number };
        expect(body).toMatchObject({ baseRevision: 2, epoch: 2 });
        deleted = false;
        return Response.json({ progress: {
          ...active, ...body, percent: 5, position: { page: 1 }, revision: 3,
          serverUpdatedAt: '2026-09-04T12:00:03.000Z',
        } });
      }
      return Response.json(deleted ? { progress: null, tombstone } : { progress: active, tombstone: null });
    });
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage(), {
      createId: () => 'device-a',
    });
    client.setSession(session('user-a'));

    await expect(client.getProgress('pdf', 'book-a')).resolves.toMatchObject({ revision: 1, percent: 40 });
    client.enqueueProgressDelete({ baseRevision: 1, contentId: 'book-a', contentKind: 'pdf', epoch: 1 });
    await expect(client.flush()).resolves.toBe(1);
    await expect(client.getProgress('pdf', 'book-a')).resolves.toBeNull();

    const recreated = client.enqueueProgress({ ...progress(5), position: { page: 1 } });
    expect(recreated).toMatchObject({ baseRevision: 2, epoch: 2 });
    await expect(client.flush()).resolves.toBe(1);
    expect(client.cachedProgress()).toEqual([expect.objectContaining({ revision: 3, percent: 5 })]);
  });

  it('clears a second device stale resume when the exact server state is a tombstone', async () => {
    const active = {
      ...progress(60), deviceId: 'browser:device-a', deviceSequence: 3, revision: 4,
      serverUpdatedAt: '2026-09-04T12:00:01.000Z',
    };
    const tombstone = {
      contentId: 'book-a', contentKind: 'pdf', revision: 5, epoch: 2,
      serverUpdatedAt: '2026-09-04T12:00:02.000Z', deletedAt: '2026-09-04T12:00:02.000Z',
    };
    let request = 0;
    const fetcher = vi.fn(async () => {
      request += 1;
      return Response.json(request === 1
        ? { progress: active, tombstone: null }
        : { progress: null, tombstone });
    });
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage());
    client.setSession(session('user-b'));

    await expect(client.getProgress('pdf', 'book-a')).resolves.toMatchObject({ percent: 60 });
    expect(client.cachedProgress()).toHaveLength(1);
    await expect(client.getProgress('pdf', 'book-a')).resolves.toBeNull();
    expect(client.cachedProgress()).toEqual([]);
  });

  it('never copies queues across account switches without explicit adoption', () => {
    const storage = new MemoryStorage();
    const client = createReadingActivityClient(vi.fn() as unknown as typeof fetch, storage, {
      createId: () => 'device-a',
    });
    client.enqueueProgress(progress());
    client.setSession(session('user-a'));
    expect(client.pending()).toHaveLength(0);
    expect(client.adoptAnonymousQueue('user-a')).toBe(4);
    expect(client.pending()).toHaveLength(1);
    expect(client.pending('anonymous')).toHaveLength(0);
    client.setSession(session('user-b'));
    expect(client.pending()).toHaveLength(0);
    client.setSession(session('user-a'));
    expect(client.pending()).toHaveLength(1);
  });

  it('rejects the 1001st offline annotation before changing or truncating durable data', () => {
    const client = createReadingActivityClient(vi.fn() as unknown as typeof fetch, new MemoryStorage());
    const annotation = (index: number) => ({
      anchorStatus: 'active' as const,
      color: 'yellow' as const,
      contentId: `book-${index}`,
      contentKind: 'article' as const,
      contentVersion: 'v1',
      contextAfter: '',
      contextBefore: '',
      id: `quote-${index}`,
      idempotencyKey: `quote-${index}`,
      locator: { startOffset: 0, endOffset: 7 },
      note: '',
      quoteText: `Lời dạy ${index}`,
    });
    for (let index = 0; index < 1_000; index += 1) client.enqueueAnnotationCreate(annotation(index));

    expect(() => client.enqueueAnnotationCreate(annotation(1_000)))
      .toThrow('reading_activity_outbox_capacity_exceeded');
    expect(client.pending()).toHaveLength(1_000);
    expect(client.pending()[0]).toMatchObject({ annotationId: 'quote-0' });
    expect(client.cachedAnnotations()).toHaveLength(1_000);
    expect(client.cachedAnnotations()).not.toContainEqual(expect.objectContaining({ id: 'quote-1000' }));
  }, 15_000);

  it('offers anonymous reading adoption once and records keep-separate without moving data', () => {
    const storage = new MemoryStorage();
    const client = createReadingActivityClient(vi.fn() as unknown as typeof fetch, storage, {
      createId: () => 'device-a',
    });
    client.enqueueProgress(progress());

    expect(client.shouldOfferAnonymousAdoption('user-a')).toBe(true);
    client.keepAnonymousQueueSeparate('user-a');
    expect(client.shouldOfferAnonymousAdoption('user-a')).toBe(false);
    client.setSession(session('user-a'));
    expect(client.pending()).toHaveLength(0);
    expect(client.pending('anonymous')).toHaveLength(1);
  });

  it('keeps the reading adoption choice retryable when durable storage rejects keep-separate', () => {
    const storage = new FailableMemoryStorage();
    const client = createReadingActivityClient(vi.fn() as unknown as typeof fetch, storage, {
      createId: () => 'device-a',
    });
    client.enqueueProgress(progress());

    expect(client.shouldOfferAnonymousAdoption('user-a')).toBe(true);
    storage.failWrites = true;
    expect(() => client.keepAnonymousQueueSeparate('user-a')).toThrow('Storage unavailable');
    storage.failWrites = false;

    expect(client.shouldOfferAnonymousAdoption('user-a')).toBe(true);
    expect(client.pending('anonymous')).toHaveLength(1);
  });

  it('merges an explicit anonymous adoption without overwriting newer account work', () => {
    const storage = new MemoryStorage();
    const client = createReadingActivityClient(vi.fn() as unknown as typeof fetch, storage, {
      createId: () => 'device-a',
    });
    client.enqueueProgress(progress(20));
    createPrincipalStorage(storage, 'anonymous').setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([
      { id: 'anonymous-book', title: 'Sách khách' },
      { id: 'shared-book', title: 'Bản khách' },
    ]));
    client.setSession(session('user-a'));
    client.enqueueProgress(progress(80));
    createPrincipalStorage(storage, 'user-a').setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([
      { id: 'account-book', title: 'Sách tài khoản' },
      { id: 'shared-book', title: 'Bản tài khoản' },
    ]));

    expect(client.shouldOfferAnonymousAdoption('user-a')).toBe(true);
    client.adoptAnonymousQueue('user-a');

    expect(client.shouldOfferAnonymousAdoption('user-a')).toBe(false);
    expect(client.cachedProgress()).toEqual([expect.objectContaining({ percent: 80 })]);
    expect(client.pending()).toEqual([expect.objectContaining({ payload: expect.objectContaining({ percent: 80 }) })]);
    expect(client.pending('anonymous')).toHaveLength(0);
    expect(JSON.parse(createPrincipalStorage(storage, 'user-a').getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'anonymous-book' }),
        expect.objectContaining({ id: 'account-book' }),
        expect.objectContaining({ id: 'shared-book', title: 'Bản tài khoản' }),
      ]));
    expect(createPrincipalStorage(storage, 'anonymous').getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks)).toBeNull();
  });

  it('hydrates cloud bookmarks before adoption so later aggregate sync cannot replace account position', async () => {
    const storage = new MemoryStorage();
    const anonymousBookmark = {
      id: 'shared-book',
      savedAt: 200,
      scrollTop: 900,
      title: 'Vị trí ẩn danh',
    };
    const accountBookmark = {
      id: 'shared-book',
      savedAt: 100,
      scrollTop: 120,
      title: 'Vị trí tài khoản',
    };
    createPrincipalStorage(storage, 'anonymous').setItem(
      LEGACY_LOCAL_STORAGE_KEYS.bookmarks,
      JSON.stringify([anonymousBookmark]),
    );
    let resolveSync!: (response: Response) => void;
    const syncResponse = new Promise<Response>((resolve) => { resolveSync = resolve; });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/api/sync') throw new Error(`unexpected request: ${String(input)}`);
      return syncResponse;
    });
    const client = createReadingActivityClient(fetcher as typeof fetch, storage);
    client.setSession(session('user-a'));

    const preparation = client.prepareAnonymousAdoption('user-a');
    expect(fetcher).toHaveBeenCalledWith('/api/sync', expect.objectContaining({
      headers: { accept: 'application/json' },
    }));
    resolveSync(Response.json({
      bookmarks: [accountBookmark],
      sync_tombstones: { bookmarks: [] },
    }));
    await preparation;
    client.adoptAnonymousQueue('user-a');

    const accountStorage = createPrincipalStorage(storage, 'user-a');
    expect(JSON.parse(accountStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]'))
      .toEqual([accountBookmark]);
    applyAggregateSyncSnapshot(accountStorage, {
      bookmarks: [accountBookmark],
      listenedHistory: [],
      practiceLogs: [],
      ptAlbumPositions: {},
      ptPlayerState: null,
      ptRecentAlbums: [],
    });
    expect(JSON.parse(accountStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]'))
      .toEqual([accountBookmark]);
  });

  it('preserves both queues when explicit adoption would exceed the durable bound', () => {
    const storage = new MemoryStorage();
    const client = createReadingActivityClient(vi.fn() as unknown as typeof fetch, storage, {
      createId: () => 'device-a',
    });
    for (let index = 0; index < 501; index += 1) {
      client.enqueueProgress({ ...progress(20), contentId: `anonymous-${index}` });
    }
    client.setSession(session('user-a'));
    for (let index = 0; index < 500; index += 1) {
      client.enqueueProgress({ ...progress(40), contentId: `account-${index}` });
    }

    let failure: unknown;
    try {
      client.adoptAnonymousQueue('user-a');
    } catch (cause) {
      failure = cause;
    }

    expect(isReadingActivityCapacityError(failure)).toBe(true);
    expect(client.pending('anonymous')).toHaveLength(501);
    expect(client.pending('user-a')).toHaveLength(500);
    expect(client.shouldOfferAnonymousAdoption('user-a')).toBe(true);
  });

  it('lets hydrated remote account progress win over anonymous progress during adoption', async () => {
    const storage = new MemoryStorage();
    const remote = {
      ...progress(80), deviceId: 'browser:remote', deviceSequence: 7, revision: 4,
      serverUpdatedAt: '2026-09-04T12:30:00.000Z',
    };
    const fetcher = vi.fn(async () => Response.json({ progress: [remote] }));
    const client = createReadingActivityClient(fetcher as typeof fetch, storage, { createId: () => 'device-a' });
    client.enqueueProgress(progress(20));
    client.setSession(session('user-a'));

    await expect(client.listProgress(200)).resolves.toEqual([expect.objectContaining({ percent: 80 })]);
    client.adoptAnonymousQueue('user-a');

    expect(client.cachedProgress()).toEqual([expect.objectContaining({ percent: 80, revision: 4 })]);
    expect(client.pending()).toEqual([]);
    expect(client.pending('anonymous')).toEqual([]);
  });

  it('checks exact anonymous identities so account data beyond the first 200 rows wins', async () => {
    const storage = new MemoryStorage();
    const anonymousDraft = { ...progress(20), contentId: 'book-outside-first-page' };
    const remoteConflict = {
      ...anonymousDraft, percent: 80, deviceId: 'browser:remote', deviceSequence: 801, revision: 4,
      serverUpdatedAt: '2026-09-04T12:30:00.000Z',
    };
    const firstPage = Array.from({ length: 200 }, (_, index) => ({
      ...progress(50), contentId: `recent-book-${index}`, deviceId: 'browser:remote',
      deviceSequence: index + 1, revision: 2, serverUpdatedAt: `2026-09-04T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
    }));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/reading/progress/pdf/book-outside-first-page') {
        return Response.json({ progress: remoteConflict });
      }
      if (path.startsWith('/api/reading/progress?')) return Response.json({ progress: firstPage });
      throw new Error(`unexpected request: ${path}`);
    });
    const client = createReadingActivityClient(fetcher as typeof fetch, storage, { createId: () => 'device-a' });
    client.enqueueProgress(anonymousDraft);
    client.setSession(session('user-a'));

    await expect(client.listProgress(200)).resolves.toHaveLength(200);
    await expect(client.prepareAnonymousAdoption('user-a')).resolves.toBeUndefined();
    client.adoptAnonymousQueue('user-a');

    expect(client.cachedProgress()).toContainEqual(expect.objectContaining({
      contentId: 'book-outside-first-page', percent: 80, revision: 4,
    }));
    expect(client.pending()).toEqual([]);
    expect(client.pending('anonymous')).toEqual([]);
  });

  it('does not re-adopt anonymous progress deleted by the account and keeps its causal tombstone', async () => {
    const storage = new MemoryStorage();
    const tombstone = {
      contentId: 'book-a', contentKind: 'pdf', revision: 5, epoch: 2,
      serverUpdatedAt: '2026-09-04T12:00:02.000Z', deletedAt: '2026-09-04T12:00:02.000Z',
    };
    const fetcher = vi.fn(async () => Response.json({ progress: null, tombstone }));
    const client = createReadingActivityClient(fetcher as typeof fetch, storage, { createId: () => 'device-a' });
    client.enqueueProgress(progress(20));
    client.setSession(session('user-a'));

    await client.prepareAnonymousAdoption('user-a');
    client.adoptAnonymousQueue('user-a');

    expect(client.cachedProgress()).toEqual([]);
    expect(client.pending()).toEqual([]);
    expect(client.pending('anonymous')).toEqual([]);
    expect(client.enqueueProgress({ ...progress(5), position: { page: 1 } }))
      .toMatchObject({ baseRevision: 5, epoch: 3 });
  });

  it('does not re-adopt an anonymous annotation deleted by the account', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn(async () => Response.json({
      annotation: null,
      tombstone: {
        id: 'quote-deleted',
        updatedAt: '2026-09-04T12:00:02.000Z',
        deletedAt: '2026-09-04T12:00:02.000Z',
      },
    }));
    const client = createReadingActivityClient(fetcher as typeof fetch, storage, {
      createId: () => 'device-a',
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });
    client.enqueueAnnotationCreate(annotationDraft('quote-deleted'));
    client.setSession(session('user-a'));

    await client.prepareAnonymousAdoption('user-a');
    client.adoptAnonymousQueue('user-a');

    expect(client.cachedAnnotations()).toEqual([]);
    expect(client.pending()).toEqual([]);
    expect(client.pending('anonymous')).toEqual([]);
  });

  it('still adopts an anonymous annotation when the account has never stored that id', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn(async () => Response.json({ annotation: null, tombstone: null }));
    const client = createReadingActivityClient(fetcher as typeof fetch, storage, {
      createId: () => 'device-a',
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });
    client.enqueueAnnotationCreate(annotationDraft('quote-new'));
    client.setSession(session('user-a'));

    await client.prepareAnonymousAdoption('user-a');
    client.adoptAnonymousQueue('user-a');

    expect(client.cachedAnnotations()).toEqual([expect.objectContaining({ id: 'quote-new' })]);
    expect(client.pending()).toEqual([expect.objectContaining({ annotationId: 'quote-new' })]);
    expect(client.pending('anonymous')).toEqual([]);
  });

  it('folds offline annotation edits into create and drops unsent create on delete', () => {
    const client = createReadingActivityClient(vi.fn() as unknown as typeof fetch, new MemoryStorage());
    client.enqueueAnnotationCreate({
      anchorStatus: 'active', color: 'yellow', contentId: 'book-a', contentKind: 'pdf',
      contentVersion: 'v1', contextAfter: '', contextBefore: '', id: 'quote-a',
      idempotencyKey: 'quote-a', locator: { page: 1 }, note: '', quoteText: 'Lời dạy',
    });
    client.enqueueAnnotationUpdate('quote-a', {
      anchorStatus: 'orphaned', baseUpdatedAt: '2026-09-04T12:00:00.000Z', color: 'green',
      contentVersion: 'v2', locator: { page: 2 }, note: 'ghi chú',
    });
    expect(client.pending()[0]).toMatchObject({
      kind: 'annotation-create', payload: { anchorStatus: 'orphaned', color: 'green', note: 'ghi chú' },
    });
    client.enqueueAnnotationDelete('quote-a');
    expect(client.pending()).toHaveLength(0);
  });

  it('throttles frequent progress writes and can flush the latest draft', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const throttled = createThrottledReadingProgressWriter(write, 1_500);
    throttled.schedule(progress(10));
    throttled.schedule(progress(40));
    vi.advanceTimersByTime(1_499);
    expect(write).not.toHaveBeenCalled();
    throttled.flush();
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ percent: 40 }));
    vi.useRealTimers();
  });

  it('keeps a durable principal-scoped read model after successful cloud writes', async () => {
    const fetcher = vi.fn(async () => Response.json({ progress: {
      ...progress(45), deviceId: 'browser:device-a', deviceSequence: 1, revision: 2,
      serverUpdatedAt: '2026-09-04T12:01:00.000Z',
    } }));
    const storage = new MemoryStorage();
    const client = createReadingActivityClient(fetcher as typeof fetch, storage, { createId: () => 'device-a' });
    client.setSession(session('user-a'));
    client.enqueueProgress(progress(45));
    await client.flush();
    expect(client.pending()).toHaveLength(0);
    expect(client.cachedProgress()).toEqual([expect.objectContaining({ contentId: 'book-a', percent: 45, revision: 2 })]);
    client.setSession(session('user-b'));
    expect(client.cachedProgress()).toHaveLength(0);
  });

  it('loads remote annotations without overwriting a pending local edit', async () => {
    const remote = {
      anchorStatus: 'active', color: 'yellow', contentId: 'book-a', contentKind: 'article',
      contentVersion: 'v1', contextAfter: '', contextBefore: '', createdAt: '2026-09-04T10:00:00.000Z',
      id: 'quote-a', locator: { startOffset: 0, endOffset: 7 }, note: '', quoteText: 'Lời dạy',
      updatedAt: '2026-09-04T10:00:00.000Z',
    };
    const fetcher = vi.fn(async () => Response.json({ annotations: [remote] }));
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage());
    client.setSession(session('user-a'));
    expect(await client.listAnnotations()).toEqual([expect.objectContaining({ id: 'quote-a' })]);
    client.enqueueAnnotationUpdate('quote-a', {
      anchorStatus: 'active', baseUpdatedAt: remote.updatedAt, color: 'green', contentVersion: 'v1',
      locator: remote.locator, note: 'ghi chú riêng',
    });
    expect(await client.listAnnotations()).toEqual([expect.objectContaining({ color: 'green', note: 'ghi chú riêng' })]);
  });

  it('loads every annotation page instead of silently truncating My Quotes at 200', async () => {
    const annotation = (index: number) => ({
      anchorStatus: 'active' as const, color: 'yellow' as const, contentId: `book-${index}`, contentKind: 'article' as const,
      contentVersion: 'v1', contextAfter: '', contextBefore: '', createdAt: '2026-09-04T10:00:00.000Z',
      id: `quote-${index}`, locator: { startOffset: 0, endOffset: 7 }, note: '', quoteText: `Lời dạy ${index}`,
      updatedAt: '2026-09-04T10:00:00.000Z',
    });
    const firstPage = Array.from({ length: 200 }, (_, index) => annotation(index));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'https://quangtu.vn');
      return url.searchParams.get('cursor')
        ? Response.json({ annotations: [annotation(200)], nextCursor: null })
        : Response.json({ annotations: firstPage, nextCursor: 'page-2' });
    });
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage());
    client.setSession(session('user-a'));

    await expect(client.listAnnotations({ limit: 200 })).resolves.toHaveLength(201);
    expect(client.cachedAnnotations()).toHaveLength(201);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain('cursor=page-2');
  });

  it('clears a cached annotation when its exact owner state is a tombstone', async () => {
    const remote = {
      anchorStatus: 'active' as const, color: 'yellow' as const, contentId: 'book-a', contentKind: 'pdf' as const,
      contentVersion: 'v1', contextAfter: '', contextBefore: '', createdAt: '2026-09-04T10:00:00.000Z',
      id: 'quote-deleted-remotely', locator: { page: 1 }, note: '', quoteText: 'Lời dạy',
      updatedAt: '2026-09-04T10:00:00.000Z',
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes('?')
      ? Response.json({ annotations: [remote], nextCursor: null })
      : Response.json({
          annotation: null,
          tombstone: {
            id: remote.id,
            updatedAt: '2026-09-04T11:00:00.000Z',
            deletedAt: '2026-09-04T11:00:00.000Z',
          },
        }));
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage());
    client.setSession(session('user-a'));
    await client.listAnnotations();
    expect(client.cachedAnnotations()).toEqual([expect.objectContaining({ id: remote.id })]);

    await expect(client.getAnnotation(remote.id)).resolves.toBeNull();
    expect(client.cachedAnnotations()).toEqual([]);
  });

  it('does not resurrect pending progress or annotation deletes during refresh', async () => {
    const remoteProgress = {
      ...progress(40), deviceId: 'browser:remote', deviceSequence: 3, revision: 4,
      serverUpdatedAt: '2026-09-04T12:02:00.000Z',
    };
    const remoteAnnotation = {
      anchorStatus: 'active', color: 'yellow', contentId: 'book-a', contentKind: 'pdf',
      contentVersion: 'v1', contextAfter: '', contextBefore: '', createdAt: '2026-09-04T10:00:00.000Z',
      id: 'quote-delete', locator: { page: 1 }, note: '', quoteText: 'Lời dạy',
      updatedAt: '2026-09-04T10:00:00.000Z',
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/annotations')
      ? Response.json({ annotations: [remoteAnnotation] })
      : Response.json({ progress: [remoteProgress] }));
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage());
    client.setSession(session('user-a'));
    await client.listProgress();
    client.enqueueProgressDelete({ baseRevision: 4, contentId: 'book-a', contentKind: 'pdf', epoch: 1 });
    expect(await client.listProgress()).toEqual([]);
    await client.listAnnotations();
    client.enqueueAnnotationDelete('quote-delete');
    expect(await client.listAnnotations()).toEqual([]);
  });

  it('folds removal of never-synced progress into its pending create without blocking later flushes', async () => {
    const fetcher = vi.fn(async () => Response.json({}));
    const client = createReadingActivityClient(fetcher as typeof fetch, new MemoryStorage(), {
      createId: () => 'device-a',
    });
    client.enqueueProgress(progress(20));

    client.enqueueProgressDelete({
      baseRevision: 1,
      contentId: 'book-a',
      contentKind: 'pdf',
      epoch: 1,
    });
    client.setSession(session('user-a'));
    client.adoptAnonymousQueue('user-a');

    expect(client.cachedProgress()).toEqual([]);
    expect(client.pending()).toEqual([]);
    await expect(client.flush()).resolves.toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function annotationDraft(id: string) {
  return {
    anchorStatus: 'active' as const,
    color: 'yellow' as const,
    contentId: 'book-a',
    contentKind: 'pdf' as const,
    contentVersion: 'v1',
    contextAfter: '',
    contextBefore: '',
    id,
    idempotencyKey: id,
    locator: { page: 1 },
    note: '',
    quoteText: 'Lời dạy',
  };
}
