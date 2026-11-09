import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryArticle } from '$lib/components/library/article';
import { downloadAllNewBooks, downloadBookOffline, DOWNLOADED_BOOKS_STORAGE_KEY, readDownloadedBooks } from '$lib/browser/offline-books-sync';

vi.mock('$lib/browser/native-api', () => ({
  resolveApiUrl: (path: string) => path,
  isHtmlResponse: (response: Response) => (response.headers.get('content-type') ?? '').includes('text/html'),
}));
vi.mock('$lib/data/offline-bundled-articles.json', () => ({ default: [] }));

const book: LibraryArticle = {
  id: 'new-book', title: 'Sách thử', summary: '', content: '', category: 'KHÁC', tags: [],
  author: '', imageUrl: '', featured: false, publishedAt: '', hasTableOfContents: true,
  volumeCount: 2, status: 'Hoàn thành', pdfUrl: '', updatedAt: '2026-11-08',
};
const chapter = (order: number, content = '') => ({ id: `chapter-${order}`, bai_viet_id: book.id, so_thu_tu: order, noi_dung: content });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const indexPath = `/api/articles/${book.id}/chapters?order=so_thu_tu.asc&limit=5000`;
const detailPath = (order: number) => `/api/articles/${book.id}/chapters?so_thu_tu=eq.${order}&limit=5000`;
const cacheKey = (path: string) => `https://tutam-cache.local${path}`;
let cached: Map<string, Response>;
let values: Map<string, string>;
let put: ReturnType<typeof vi.fn>;
let fetcher: ReturnType<typeof vi.fn>;
let dispatchEvent: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cached = new Map(); values = new Map();
  put = vi.fn(async (key: string, response: Response) => { cached.set(key, response.clone()); });
  fetcher = vi.fn(async () => json([chapter(0, 'Nội dung một'), chapter(1, 'Nội dung hai')]));
  dispatchEvent = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('caches', { open: vi.fn(async () => ({ put })) });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  vi.stubGlobal('window', { dispatchEvent });
  vi.stubGlobal('CustomEvent', class { constructor(public type: string, public options: unknown) {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('legacy offline book completion', () => {
  it.each(['android', 'ios'])('rejects web-only book downloads before network or cache access on %s', async platform => {
    vi.stubEnv('VITE_CONTENT_PLATFORM', platform);
    await expect(downloadBookOffline({ ...book, id: 'tt_tro_ve_tu_xu_tuyet' })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it('keeps the one-request path when every chapter already contains text', async () => {
    await expect(downloadBookOffline(book)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readDownloadedBooks()[book.id]?.chapterCount).toBe(2);
  });

  it('keeps a standalone article with body text downloadable without chapters', async () => {
    fetcher.mockResolvedValue(json([]));
    await expect(downloadBookOffline({ ...book, hasTableOfContents: false, volumeCount: 0, content: 'Nội dung bài viết' })).resolves.toBe(true);
    expect(readDownloadedBooks()[book.id]?.chapterCount).toBe(0);
  });

  it.each(['missing', 'blocked', 'quota'] as const)('does not report completion when cache storage is %s', async (failure) => {
    if (failure === 'missing') vi.stubGlobal('caches', undefined);
    if (failure === 'blocked') vi.stubGlobal('caches', { open: vi.fn(async () => { throw new Error('cache_blocked'); }) });
    if (failure === 'quota') put.mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    await expect(downloadBookOffline(book)).rejects.toThrow();
    expect(readDownloadedBooks()[book.id]).toBeUndefined();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it.each(['network', 'status', 'html', 'empty', 'wrong-chapter'] as const)('refuses a missing chapter with %s response', async (failure) => {
    fetcher.mockImplementation(async (path: string) => {
      if (path === indexPath) return json([chapter(0)]);
      if (failure === 'network') throw new TypeError('Offline');
      if (failure === 'status') return new Response('Unavailable', { status: 503 });
      if (failure === 'html') return new Response('<html>Fallback</html>', { headers: { 'content-type': 'text/html' } });
      return json([chapter(failure === 'wrong-chapter' ? 1 : 0, failure === 'empty' ? '  ' : 'Nội dung')]);
    });
    await expect(downloadBookOffline(book)).rejects.toThrow();
    expect(readDownloadedBooks()[book.id]).toBeUndefined();
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([{ chapters: [] }, { chapters: [null] }, { chapters: [42] }])('refuses empty or malformed chapter list %j', async ({ chapters }) => {
    fetcher.mockResolvedValue(json(chapters));
    await expect(downloadBookOffline(book)).rejects.toThrow();
    expect(readDownloadedBooks()[book.id]).toBeUndefined();
  });

  it('preserves previous complete index and receipt plus downloaded chapter caches after a later failure', async () => {
    const previous = { id: book.id, title: 'Bản cũ', downloadedAt: 1, chapterCount: 2 };
    values.set(DOWNLOADED_BOOKS_STORAGE_KEY, JSON.stringify({ [book.id]: previous }));
    cached.set(cacheKey(indexPath), json([chapter(0, 'Bản cũ một'), chapter(1, 'Bản cũ hai')]));
    fetcher.mockImplementation(async (path: string) => path === indexPath ? json([chapter(0), chapter(1)])
      : path === detailPath(0) ? json([chapter(0, 'Bản mới một')]) : new Response('Unavailable', { status: 503 }));

    await expect(downloadBookOffline(book)).rejects.toThrow();
    expect(readDownloadedBooks()[book.id]).toEqual(previous);
    expect(await cached.get(cacheKey(indexPath))!.clone().json()).toEqual([chapter(0, 'Bản cũ một'), chapter(1, 'Bản cũ hai')]);
    expect(await cached.get(cacheKey(detailPath(0)))!.clone().json()).toEqual([chapter(0, 'Bản mới một')]);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('commits a full chapter list only after all missing content is available and can retry a failed download', async () => {
    fetcher.mockImplementation(async (path: string) => path === indexPath ? json([chapter(0, 'Nội dung một'), chapter(1)]) : json([chapter(1, 'Nội dung hai')]));
    put.mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
    await expect(downloadBookOffline(book)).rejects.toThrow();
    expect(readDownloadedBooks()[book.id]).toBeUndefined();
    await expect(downloadBookOffline(book)).resolves.toBe(true);
    expect(readDownloadedBooks()[book.id]).toEqual(expect.objectContaining({ id: book.id, chapterCount: 2 }));
    expect(await cached.get(cacheKey(indexPath))!.clone().json()).toEqual([chapter(0, 'Nội dung một'), chapter(1, 'Nội dung hai')]);
    expect(cached.has(cacheKey(`/api/articles/${book.id}`))).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it('does not count failed book downloads as completed in a batch', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    put.mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    expect(await downloadAllNewBooks([book])).toBe(0);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it('does not report success when writing the completion receipt fails', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); } });
    await expect(downloadBookOffline(book)).rejects.toThrow();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
