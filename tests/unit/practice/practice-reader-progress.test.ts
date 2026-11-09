import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentDocumentScrollDepth,
  createPracticeReaderProgressClient,
  practiceReadingMinimumSeconds,
  restorePracticeWindowScroll,
} from '../../../src/lib/browser/practice-reader-progress';
import { createReadingActivityClient, READING_ACTIVITY_OUTBOX_KEY, READING_PROGRESS_CACHE_KEY, type ReadingProgressRecord } from '../../../src/lib/browser/reading-activity-client';
import { createPrincipalStorage } from '../../../src/lib/browser/principal-storage';
import { normalizeReadingProgressWrite } from '../../../src/lib/domain/reading/activity';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('practice reader progress', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('retires new legacy bookmark writes while preserving historical entries', () => {
    const storage = new MemoryStorage();
    storage.setItem('tutam_bookmarks_v1', JSON.stringify([{ future: true }, { id: 'article-a', scrollTop: 5 }]));
    const fetcher = vi.fn();
    const client = createPracticeReaderProgressClient(fetcher, storage);
    client.save({
      articleId: 'article-a',
      articleTitle: 'Kinh A',
      chapterIndex: 2,
      chapterTitle: 'Phẩm Ba',
      savedAt: new Date('2026-09-04T00:00:00.000Z'),
      scrollTop: 412.4,
    });
    expect(JSON.parse(storage.getItem('tutam_bookmarks_v1') || '[]')).toEqual([
      { future: true }, { id: 'article-a', scrollTop: 5 },
    ]);
    const scoped = createPrincipalStorage(storage, null);
    expect(JSON.parse(scoped.getItem('tutam_bookmarks_v1') || '[]')).toEqual([{ future: true }]);
    expect(JSON.parse(scoped.getItem(READING_PROGRESS_CACHE_KEY) || '[]')).toEqual([
      expect.objectContaining({ contentKind: 'practice', contentId: 'article-a', position: { chapterId: '2', scrollTop: 412 } }),
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('roundtrips chapter/scroll through the typed owner on a second authenticated device', async () => {
    const remote = new Map<string, ReadingProgressRecord>();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (init?.method === 'PUT') {
        expect(url).toBe('/api/reading/progress');
        expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf-a' });
        const input = normalizeReadingProgressWrite(JSON.parse(String(init.body)));
        const progress = { ...input, revision: (remote.get(input.contentId)?.revision ?? 0) + 1, serverUpdatedAt: '2026-09-05T00:00:00.000Z' };
        remote.set(input.contentId, progress);
        return Response.json({ progress });
      }
      expect(String(url)).toBe('/api/reading/progress/practice/article-a');
      return Response.json({ progress: remote.get('article-a') ?? null, tombstone: null });
    };
    const session = { authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } };
    const first = createPracticeReaderProgressClient(fetcher, new MemoryStorage());
    first.setSession(session);
    first.save({ articleId: 'article-a', articleTitle: 'Kinh A', chapterIndex: 2, chapterTitle: 'Phẩm Ba', chapterCount: 4, scrollDepthPercent: 60, scrollTop: 412.4 });
    await expect(first.flush()).resolves.toBe(1);
    const second = createPracticeReaderProgressClient(fetcher, new MemoryStorage());
    second.setSession(session);
    await expect(second.load('article-a')).resolves.toMatchObject({ chapIdx: 2, scrollTop: 412 });
    second.save({ articleId: 'article-a', articleTitle: 'Kinh A', chapterIndex: 1, chapterTitle: 'Phẩm Hai', scrollTop: 85 });
    await second.flush();
    expect(remote.get('article-a')).toMatchObject({ revision: 2, position: { chapterId: '1', scrollTop: 85 } });
    expect(JSON.parse(String(requests.findLast((request) => request.init?.method === 'PUT')?.init?.body))).toMatchObject({ baseRevision: 1, epoch: 1 });
    expect(requests.every((request) => !request.url.includes('/api/sync'))).toBe(true);
  });

  it('reads legacy bookmarks only in the selected namespace, including explicit anonymous adoption', async () => {
    const storage = new MemoryStorage();
    storage.setItem('tutam_bookmarks_v1', '[{"id":"article-a","chapIdx":2,"scrollTop":412}]');
    const fetcher = vi.fn(async () => Response.json({ progress: null, tombstone: null }));
    const client = createPracticeReaderProgressClient(fetcher as typeof fetch, storage);
    await expect(client.load('article-a')).resolves.toMatchObject({ chapIdx: 2, scrollTop: 412 });
    const session = { authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } };
    client.setSession(session);
    await expect(client.load('article-a')).resolves.toBeNull();
    const adoption = createReadingActivityClient(fetcher as typeof fetch, storage);
    adoption.setSession(session);
    adoption.adoptAnonymousQueue('user-a');
    await expect(client.load('article-a')).resolves.toMatchObject({ chapIdx: 2, scrollTop: 412 });
  });

  it('does not restore a historical bookmark after an authoritative typed deletion', async () => {
    const storage = new MemoryStorage();
    const scoped = createPrincipalStorage(storage, 'user-a');
    scoped.setItem('tutam_bookmarks_v1', '[{"id":"article-a","scrollTop":412}]');
    const fetcher = vi.fn(async () => Response.json({ progress: null, tombstone: {
      contentKind: 'practice', contentId: 'article-a', revision: 2, epoch: 1,
      serverUpdatedAt: '2026-09-05T00:00:00.000Z', deletedAt: '2026-09-05T00:00:00.000Z',
    } }));
    const client = createPracticeReaderProgressClient(fetcher as typeof fetch, storage);
    client.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    await expect(client.load('article-a')).resolves.toBeNull();
  });

  it('ignores late progress across A → guest → A and cancels A’s scheduled save before B', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    let release = (_response: Response) => {};
    const gate = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async () => gate);
    const client = createPracticeReaderProgressClient(fetcher as typeof fetch, storage);
    const sessionA = { authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } };
    client.setSession(sessionA);
    const pending = client.load('article-a');
    client.setSession({ authenticated: false, csrfToken: null, user: null });
    client.setSession(sessionA);
    release(Response.json({ progress: { contentKind: 'practice', contentId: 'article-a', revision: 1, epoch: 1, deviceId: 'a-device', deviceSequence: 1, position: { scrollTop: 412 }, percent: 50, total: null, contentVersion: null, clientUpdatedAt: null, serverUpdatedAt: null } }));
    await expect(pending).resolves.toBeNull();
    expect(createPrincipalStorage(storage, 'user-a').getItem(READING_PROGRESS_CACHE_KEY)).toBeNull();
    client.schedule({ articleId: 'article-a', articleTitle: '', chapterIndex: null, chapterTitle: '', scrollTop: 40 });
    client.setSession({ authenticated: true, csrfToken: 'csrf-b', user: { id: 'user-b' } });
    await vi.runAllTimersAsync();
    expect(createPrincipalStorage(storage, 'user-b').getItem(READING_ACTIVITY_OUTBOX_KEY)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('throttles scrolling and retains offline positions for the same owner', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const fetcher = vi.fn(async () => { throw new Error('offline'); });
    const client = createPracticeReaderProgressClient(fetcher as typeof fetch, storage);
    client.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    const input = { articleId: 'article-a', articleTitle: '', chapterIndex: 1, chapterTitle: '', scrollTop: 40 };
    client.schedule(input);
    client.schedule({ ...input, scrollTop: 88 });
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.load('article-a')).resolves.toMatchObject({ chapIdx: 1, scrollTop: 88 });
    expect(JSON.parse(createPrincipalStorage(storage, 'user-a').getItem(READING_ACTIVITY_OUTBOX_KEY) || '[]')).toHaveLength(1);
  });

  it('derives a bounded content-specific reading minimum', () => {
    expect(practiceReadingMinimumSeconds('<p>Nam mô Phật</p>')).toBe(30);
    expect(practiceReadingMinimumSeconds(Array.from({ length: 720 }, () => 'Phật').join(' '))).toBe(240);
  });

  it('restores after layout and measures scroll depth', () => {
    const callbacks: FrameRequestCallback[] = [];
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { innerHeight: 500, scrollX: 0, scrollY: 750, scrollTo });
    vi.stubGlobal('document', { documentElement: { scrollHeight: 1_500 } });
    restorePracticeWindowScroll(321, (callback) => callbacks.push(callback) - 1);
    callbacks.shift()?.(0);
    callbacks.shift()?.(0);
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'instant', left: 0, top: 321 });
    expect(currentDocumentScrollDepth()).toBe(75);
    vi.unstubAllGlobals();
  });
});
