import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContentRow } from '$lib/contracts/content-updates';
const io = vi.hoisted(() => ({ metadata: vi.fn(), retire: vi.fn(), index: vi.fn(), active: vi.fn(), native: vi.fn() }));
vi.mock('$lib/browser/offline-pdf-database', () => ({ listOfflinePdfMetadata: io.metadata, getOfflinePdf: vi.fn(), retireOfflinePdf: io.retire, normalizePdfPrincipal: (p: string | null) => p || 'anonymous', offlinePdfRecordKey: (p: string, id: string) => `${p}:${id}` }));
vi.mock('$lib/browser/offline-content-index', () => ({ readIndexedContentItem: io.index }));
vi.mock('$lib/browser/pdf-offline-downloads', () => ({ isOfflinePdfDownloadActive: io.active }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: io.native }));
import { retireBundledPdfBooks } from '$lib/browser/pdf-book-transition';
const record = { key: 'a:book', ownerId: 'a', documentId: 'book', title: 'Book', sourceUrl: '/source.pdf', sourceVersion: 'v1', checksum: 'a'.repeat(64), sizeBytes: 4, contentType: 'application/pdf', savedAt: 1, lastAccessedAt: 1, recordVersion: 1, status: 'complete' };
const row: ContentRow = { id: 'book', tieu_de: 'Book', has_muc_luc: 1, so_tap: 2, pdf_url: '/source.pdf', updated_at: '2026-11-09', trang_thai: 'Hoàn thành', danh_muc: 'SÁCH KHUYẾN THIỆN' };
const hash = (row: unknown, chapters: unknown) => ({ book: { content: createHash('sha256').update(JSON.stringify([row, chapters])).digest('hex') } });
const chapters = [{ id: '1', noi_dung: 'A' }, { id: '2', noi_dung: 'B' }];
beforeEach(() => { vi.clearAllMocks(); io.metadata.mockResolvedValue([record]); io.retire.mockResolvedValue(true); io.index.mockResolvedValue(null); io.active.mockReturnValue(false); io.native.mockReturnValue(true); });
afterEach(() => vi.unstubAllGlobals());
it('upgraded app retires current bundled book with local files only; no catalog or full refetch', async () => {
 const fetcher = vi.fn(async (url: RequestInfo | URL) => { expect(String(url)).toBe('/offline-data/chapters/book.json'); return Response.json(chapters); });
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row], hash(row, chapters))).toEqual({ removed: ['Book'], retained: [] });
 expect(fetcher).toHaveBeenCalledOnce(); expect(io.retire).toHaveBeenCalledOnce();
});
it('fresh user does no file probing, notifications or deletion', async () => {
 io.metadata.mockResolvedValue([]); const fetcher = vi.fn();
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row], hash(row, chapters))).toEqual({ removed: [], retained: [] });
 expect(fetcher).not.toHaveBeenCalled(); expect(io.retire).not.toHaveBeenCalled();
});
it('excludes comics, unfinished and online-only content', async () => {
 const fetcher = vi.fn();
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [
  { ...row, has_muc_luc: 0, so_tap: 0 }, { ...row, trang_thai: 'Đang cập nhật' }, { ...row, tac_gia: 'Nguyên Phong', tieu_de: 'Muôn Kiếp Nhân Sinh Tập 1' }
 ])).toEqual({ removed: [], retained: [] }); expect(io.retire).not.toHaveBeenCalled();
});
it('keeps old download when the new bundled chapter file is missing or incomplete', async () => {
 for (const response of [new Response('missing', { status: 404 }), Response.json(chapters.slice(0, 1))]) {
  const fetcher = vi.fn(async () => response);
  expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row], hash(row, chapters))).toEqual({ removed: [], retained: ['Book'] });
 } expect(io.retire).not.toHaveBeenCalled();
});
it('does not delete when account changes or app cleanup is cancelled during the file read', async () => {
 let current = true; const fetcher = vi.fn(async () => { current = false; return Response.json(chapters); });
 await expect(retireBundledPdfBooks({ principalId: 'a', isCurrent: () => current }, new AbortController().signal, fetcher, [row], hash(row, chapters))).rejects.toMatchObject({ name: 'AbortError' });
 expect(io.retire).not.toHaveBeenCalled();
});
it('keeps a PDF when a required bundled illustration cannot be verified', async () => {
 const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('chapters') ? Response.json([{ ...chapters[0], noi_dung: '<img src="/assets/illustration.png">' }, chapters[1]]) : new Response('missing', { status: 404 }));
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row], hash(row, chapters))).toEqual({ removed: [], retained: ['Book'] }); expect(io.retire).not.toHaveBeenCalled();
});

it('keeps the old copy if bundled text was changed despite same metadata and chapter count', async () => {
 const fetcher = vi.fn(async () => Response.json([{ ...chapters[0], noi_dung: 'TAMPERED' }, chapters[1]]));
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row], hash(row, chapters))).toEqual({ removed: [], retained: ['Book'] });
 expect(io.retire).not.toHaveBeenCalled();
});

it('verifies original bundled image bytes against the existing per-book asset hashes before deletion', async () => {
 const image = new Uint8Array([1, 2, 3]);
 const source = '/assets/book-content/converted/abc.png';
 const illustrated = [{ ...chapters[0], noi_dung: `<img src="${source}">` }, chapters[1]];
 const proof = { book: { ...hash(row, illustrated).book, images: [{ path: source, bytes: image.length, sha256: createHash('sha256').update(image).digest('hex') }] } };
 for (const valid of [false, true]) {
  io.retire.mockClear();
  const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('chapters') ? Response.json(illustrated) : new Response(valid ? image : new Uint8Array([9, 9, 9]), { headers: { 'content-type': 'image/png' } }));
  expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row], proof)).toEqual(valid ? { removed: ['Book'], retained: [] } : { removed: [], retained: ['Book'] });
  expect(io.retire).toHaveBeenCalledTimes(valid ? 1 : 0);
 }
});

it.each(['tt_1781529439696', 'tt_1781529470187', 'tt_1781529533555', 'tt_tro_ve_tu_xu_tuyet'])('does not auto-retire installer-excluded book %s even if a stale metadata row remains', async id => {
 const excluded = { ...row, id, tieu_de: 'Translated title', so_tap: 2 };
 io.metadata.mockResolvedValue([{ ...record, key: 'a:' + id, documentId: id }]);
 const fetcher = vi.fn();
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [excluded])).toEqual({ removed: [], retained: [] });
 expect(fetcher).not.toHaveBeenCalled(); expect(io.retire).not.toHaveBeenCalled();
});

it.each(['tt_1783263563410_ndzd5', 'tt_1783263572853_lgppi', 'tt_1783263581251_8yazr'])('retains the excluded comic %s without probing or deleting its PDF', async id => {
 const comic = { ...row, id, has_muc_luc: 0, so_tap: 0, tieu_de: 'TRUYỆN TRANH KINH ĐỊA TẠNG' };
 io.metadata.mockResolvedValue([{ ...record, key: 'a:' + id, documentId: id }]); const fetcher = vi.fn();
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [comic])).toEqual({ removed: [], retained: [] });
 expect(io.retire).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it('keeps truthful earlier deletion results if verification fails for a later bundled book', async () => {
 const second = { ...row, id: 'book2', tieu_de: 'Second', pdf_url: '/source2.pdf' };
 io.metadata.mockResolvedValue([record, { ...record, key: 'a:book2', documentId: 'book2', sourceUrl: '/source2.pdf' }]);
 const originalCrypto = globalThis.crypto; let calls = 0;
 vi.stubGlobal('crypto', { subtle: { digest: (...args: Parameters<SubtleCrypto['digest']>) => { if (++calls === 3) return Promise.reject(new Error('crypto unavailable')); return originalCrypto.subtle.digest(...args); } } });
 const fetcher = vi.fn(async () => Response.json(chapters));
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row, second], { ...hash(row, chapters), book2: hash(second, chapters).book })).toEqual({ removed: ['Book'], retained: ['Second'] });
 expect(io.retire).toHaveBeenCalledTimes(1);
});

it('uses verified native bundle images even if an older runtime cache copy is corrupt', async () => {
 const image = new Uint8Array([1, 2, 3]); const source = '/assets/book-content/converted/abc.png';
 const illustrated = [{ ...chapters[0], noi_dung: `<img src="${source}">` }, chapters[1]];
 const proof = { book: { ...hash(row, illustrated).book, images: [{ path: source, bytes: image.length, sha256: createHash('sha256').update(image).digest('hex') }] } };
 vi.stubGlobal('caches', { open: async () => ({ match: async () => new Response(new Uint8Array([9, 9, 9]), { headers: { 'content-type': 'image/png' } }) }) });
 const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('chapters') ? Response.json(illustrated) : new Response(image, { headers: { 'content-type': 'image/png' } }));
 expect(await retireBundledPdfBooks({ principalId: 'a', isCurrent: () => true }, new AbortController().signal, fetcher, [row], proof)).toEqual({ removed: ['Book'], retained: [] });
});
