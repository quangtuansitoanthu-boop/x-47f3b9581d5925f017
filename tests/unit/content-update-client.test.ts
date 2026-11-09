import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentUpdateItem } from '../../src/lib/contracts/content-updates';
import bundledArticles from '../../src/lib/data/offline-bundled-articles.json';
import bundledTalks from '../../src/lib/data/offline-talks.json';
import { contentVersion } from '../../src/lib/domain/content-update-model';

const mocks = vi.hoisted(() => ({ saved: vi.fn(), save: vi.fn(), image: vi.fn(), book: vi.fn() }));
vi.mock('../../src/lib/browser/offline-content-packages', () => ({ savedContentItems: mocks.saved, saveContentPackage: mocks.save }));
vi.mock('../../src/lib/browser/session-cover', () => ({ saveCoverOffline: mocks.image, offlineImageRemoteSource: (source: string) => source }));
vi.mock('../../src/lib/browser/offline-books-sync', () => ({ rememberCompletedBook: mocks.book }));
import { checkContentUpdates, downloadContentUpdates, ContentUpdateUnavailableError } from '../../src/lib/browser/content-update-client';

const item = (id: string, group: ContentUpdateItem['group'] = 'book'): ContentUpdateItem => ({
  kind: group === 'talk' ? 'talk' : 'article', group, mode: group === 'pdf' || group === 'talk' ? 'shell' : 'full',
  version: 'a'.repeat(64), row: { id, tieu_de: id, has_muc_luc: group === 'book' ? 1 : 0 },
});
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
beforeEach(() => { vi.clearAllMocks(); mocks.saved.mockResolvedValue([]); mocks.save.mockResolvedValue(undefined); });

describe('manual update confirmation and download boundaries', () => {
  it('checks and saves update shells with an iOS 15 signal lacking throwIfAborted', async () => {
    const signal = new AbortController().signal;
    Object.defineProperty(signal, 'throwIfAborted', { value: undefined });
    const talk = item('ios15-talk', 'talk');
    const fetcher = vi.fn(async () => json({ items: [talk], articlesNext: null, talksNext: null }));
    const plan = await checkContentUpdates(signal, fetcher);
    expect(plan.items).toEqual([talk]);
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(downloadContentUpdates(plan, signal, vi.fn(), fetcher)).resolves.toEqual({ completed: 1, failed: [] });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects an already cancelled legacy signal before fetching or saving', async () => {
    const controller = new AbortController();
    Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
    Object.defineProperty(controller.signal, 'reason', { value: undefined });
    controller.abort();
    const fetcher = vi.fn();
    await expect(checkContentUpdates(controller.signal, fetcher)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not offer an album update when the same web metadata is already bundled', async () => {
    const row = bundledTalks[0];
    const album = { ...item(row.id, 'talk'), row, version: await contentVersion(row, 'talk') };
    const fetcher = vi.fn(async () => json({ items: [album], articlesNext: null, talksNext: null }));
    expect((await checkContentUpdates(new AbortController().signal, fetcher)).items).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not ask to download an unchanged ritual already bundled with the app', async () => {
    const bundled = bundledArticles.find(row => row.id === 'tt_1781274943336')!;
    const ritual = { ...item(bundled.id, 'ritual'), row: { ...bundled, anh_url: '' } };
    const fetcher = vi.fn(async () => json({ items: [ritual], articlesNext: null, talksNext: null }));
    const result = await checkContentUpdates(new AbortController().signal, fetcher);
    expect(result.items).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('offers a newer web revision of a bundled ritual but never downloads it before consent', async () => {
    const bundled = bundledArticles.find(row => row.id === 'tt_1781274943336')!;
    const ritual = { ...item(bundled.id, 'ritual'), row: { ...bundled, anh_url: '', updated_at: '2099-01-01T00:00:00Z' } };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => json(String(input).includes('action=estimate')
      ? [{ id: bundled.id, bytes: 100, chapters: 1, illustrated: false }]
      : { items: [ritual], articlesNext: null, talksNext: null }));
    const result = await checkContentUpdates(new AbortController().signal, fetcher);
    expect(result.items).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('action=article'))).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('checks all metadata and sizes, but never downloads full packages before confirmation', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'https://test');
      return json(url.searchParams.get('action') === 'estimate'
        ? [{ id: 'fresh-book', bytes: 2000000, chapters: 4, illustrated: false }]
        : { items: [item('fresh-book'), item('fresh-pdf', 'pdf'), item('fresh-talk', 'talk')], articlesNext: null, talksNext: null });
    });
    const result = await checkContentUpdates(new AbortController().signal, fetcher as typeof fetch);
    expect(result.items).toHaveLength(3);
    expect(result.bytes).toBeGreaterThan(2000000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('action=article'))).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it('does not re-download versions already fully saved on the device', async () => {
    mocks.saved.mockResolvedValue([item('saved')]);
    const fetcher = vi.fn(async () => json({ items: [item('saved')], articlesNext: null, talksNext: null }));
    expect((await checkContentUpdates(new AbortController().signal, fetcher as typeof fetch)).items).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('finishes both catalogs across pages without re-reading a finished catalog', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ items: [], articlesNext: 'cursor-a', talksNext: null }))
      .mockResolvedValueOnce(json({ items: [item('fresh-pdf', 'pdf')], articlesNext: null, talksNext: null }));
    const result = await checkContentUpdates(new AbortController().signal, fetcher);
    expect(result.items).toHaveLength(1);
    expect(String(fetcher.mock.calls[1][0])).toContain('talksDone=1');
    expect(String(fetcher.mock.calls[1][0])).toContain('articlesAfter=cursor-a');
  });

  it('downloads PDF and talk shells without fetching PDF or audio binaries', async () => {
    const pdf = item('pdf', 'pdf'); pdf.row.pdf_url = 'https://test/large.pdf';
    const talk = item('talk', 'talk'); talk.row.tracks = [{ title: 'Audio', url: 'https://test/large.mp3' }];
    const fetcher = vi.fn();
    const result = await downloadContentUpdates({ items: [pdf, talk], sizes: [], bytes: 400, unknownImages: 0 }, new AbortController().signal, vi.fn(), fetcher);
    expect(result).toEqual({ completed: 2, failed: [] });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.book).not.toHaveBeenCalled();
  });

  it('assembles every chapter page before publishing a complete book', async () => {
    const book = item('book');
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ article: { ...book.row, noi_dung: '' }, chapters: [{ id: 'c0', so_thu_tu: 0, noi_dung: 'A' }], next: 0 }))
      .mockResolvedValueOnce(json({ article: { ...book.row, noi_dung: '' }, chapters: [{ id: 'c1', so_thu_tu: 1, noi_dung: 'B' }], next: null }));
    const result = await downloadContentUpdates({ items: [book], sizes: [{ id: 'book', bytes: 2, chapters: 2, illustrated: false }], bytes: 200, unknownImages: 0 }, new AbortController().signal, vi.fn(), fetcher);
    expect(result).toEqual({ completed: 1, failed: [] });
    expect(mocks.save.mock.calls[0][2]).toHaveLength(2);
    expect(mocks.book).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[1][0])).toContain('after=0');
  });

  it('keeps the old package if any chapter is missing or fails', async () => {
    const book = item('book');
    const fetcher = vi.fn(async () => json({ article: book.row, chapters: [{ id: 'c0', noi_dung: '' }], next: null }));
    const result = await downloadContentUpdates({ items: [book], sizes: [{ id: 'book', bytes: 500, chapters: 2, illustrated: false }], bytes: 500, unknownImages: 0 }, new AbortController().signal, vi.fn(), fetcher);
    expect(result).toEqual({ completed: 0, failed: ['book'] });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.book).not.toHaveBeenCalled();
  });

  it('rejects old-server HTML and aborted checks instead of claiming the catalog is current', async () => {
    const missingApi = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404, headers: { 'content-type': 'application/json' } }));
    await expect(checkContentUpdates(new AbortController().signal, missingApi)).rejects.toBeInstanceOf(ContentUpdateUnavailableError);
    expect(missingApi).toHaveBeenCalledOnce();
    await expect(checkContentUpdates(new AbortController().signal, vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })))) .rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn();
    await expect(checkContentUpdates(controller.signal, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
