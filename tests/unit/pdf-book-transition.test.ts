import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OfflinePdfMetadata, OfflinePdfRecord } from '$lib/browser/offline-pdf-database';
import type { ContentUpdateItem } from '$lib/contracts/content-updates';
const io = vi.hoisted(() => ({ metadata: vi.fn(), readPdf: vi.fn(), retire: vi.fn(), index: vi.fn(), active: vi.fn() }));
vi.mock('$lib/browser/offline-pdf-database', () => ({ listOfflinePdfMetadata: io.metadata, getOfflinePdf: io.readPdf, retireOfflinePdf: io.retire, normalizePdfPrincipal: (p: string | null) => p || 'anonymous', offlinePdfRecordKey: (p: string, id: string) => `${p}:${id}` }));
vi.mock('$lib/browser/offline-content-index', () => ({ readIndexedContentItem: io.index }));
vi.mock('$lib/browser/pdf-offline-downloads', () => ({ isOfflinePdfDownloadActive: io.active }));
import { collectPdfBookTransitions, retirePdfBookTransition, hasPreservedOfflinePdf } from '$lib/browser/pdf-book-transition';
const item: ContentUpdateItem = { kind: 'article', group: 'book', mode: 'full', version: 'a'.repeat(64), row: { id: 'book', tieu_de: 'Book', has_muc_luc: 1, so_tap: 2, pdf_url: '/source.pdf', updated_at: '2026-11-09' } };
const record: OfflinePdfMetadata = { key: 'a:book', ownerId: 'a', documentId: 'book', title: 'Book', sourceUrl: '/source.pdf', sourceVersion: 'etag:v1', checksum: 'a'.repeat(64), sizeBytes: 10, contentType: 'application/pdf', savedAt: 1, lastAccessedAt: 1, recordVersion: 1, status: 'complete' };
const transition = { item, record };
const chapters = [{ id: 'c1', bai_viet_id: 'book', noi_dung: 'FIRST' }, { id: 'c2', bai_viet_id: 'book', noi_dung: 'SECOND' }];
afterEach(() => vi.unstubAllGlobals());
const context = { principalId: 'a', isCurrent: () => true };
beforeEach(() => { vi.clearAllMocks(); io.metadata.mockResolvedValue([record]); io.readPdf.mockResolvedValue({ ...record, blob: new Blob(['a']) } as OfflinePdfRecord); io.retire.mockResolvedValue(true); io.index.mockResolvedValue({ ...item, chapterData: new Blob([JSON.stringify(chapters)]) }); io.active.mockReturnValue(false); });
it('offers only the current owner matching converted book, not comics or foreign files', async () => {
 io.metadata.mockResolvedValue([record, { ...record, key: 'b:book', ownerId: 'b' }]);
 expect(await collectPdfBookTransitions([item, { ...item, group: 'pdf', mode: 'shell' }], context)).toHaveLength(1);
});
it('retires only after authoritative full text readback, without API requests for current content', async () => {
 const fetcher = vi.fn();
 expect(await retirePdfBookTransition(transition, new AbortController().signal, context, fetcher)).toBe('removed');
 expect(io.index).toHaveBeenCalled(); expect(io.retire).toHaveBeenCalledWith(record, expect.any(Function)); expect(fetcher).not.toHaveBeenCalled();
});
it.each(['missing', 'wrong-version', 'truncated', 'duplicate', 'foreign-chapter', 'empty'])('retains PDF on %s text package', async kind => {
 if (kind === 'missing') io.index.mockResolvedValue(null);
 else io.index.mockResolvedValue({ ...item, version: kind === 'wrong-version' ? 'b'.repeat(64) : item.version, chapterData: new Blob([JSON.stringify(kind === 'truncated' ? chapters.slice(0, 1) : kind === 'duplicate' ? [chapters[0], chapters[0]] : kind === 'foreign-chapter' ? [chapters[0], { ...chapters[1], bai_viet_id: 'other' }] : kind === 'empty' ? [chapters[0], { ...chapters[1], noi_dung: '' }] : chapters)]) });
 expect(await retirePdfBookTransition(transition, new AbortController().signal, context, vi.fn())).toBe('retained'); expect(io.retire).not.toHaveBeenCalled();
});
it('does not delete after cancellation or a principal switch during text readback', async () => {
 const c = new AbortController(); c.abort();
 await expect(retirePdfBookTransition(transition, c.signal, context, vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
 let current = true; io.index.mockImplementation(async () => { current = false; return { ...item, chapterData: new Blob([JSON.stringify(chapters)]) }; });
 await expect(retirePdfBookTransition(transition, new AbortController().signal, { principalId: 'a', isCurrent: () => current }, vi.fn())).rejects.toMatchObject({ name: 'AbortError' }); expect(io.retire).not.toHaveBeenCalled();
});
it('keeps a concurrent PDF replacement, an active download, and failed delete for explicit retry', async () => {
 io.retire.mockResolvedValue(false); expect(await retirePdfBookTransition(transition, new AbortController().signal, context)).toBe('retained');
 io.active.mockReturnValue(true); io.retire.mockClear(); expect(await retirePdfBookTransition(transition, new AbortController().signal, context)).toBe('retained'); expect(io.retire).not.toHaveBeenCalled();
 io.active.mockReturnValue(false); io.retire.mockRejectedValue(new Error('blocked')); expect(await retirePdfBookTransition(transition, new AbortController().signal, context)).toBe('retained');
});
it('keeps PDF when required image is not durably available', async () => {
 io.index.mockResolvedValue({ ...item, chapterData: new Blob([JSON.stringify([{ ...chapters[0], noi_dung: '<img src="https://media.quangtu.vn/image.png">' }, chapters[1]])]) });
 expect(await retirePdfBookTransition(transition, new AbortController().signal, context)).toBe('retained'); expect(io.retire).not.toHaveBeenCalled();
});
it('prefers only verified PDF of the same document, source and principal', async () => {
 expect(await hasPreservedOfflinePdf({ id: 'book', pdfUrl: '/source.pdf' }, 'a')).toBe(true);
 io.readPdf.mockResolvedValue({ ...record, ownerId: 'b' }); expect(await hasPreservedOfflinePdf({ id: 'book', pdfUrl: '/source.pdf' }, 'a')).toBe(false);
 io.readPdf.mockResolvedValue({ ...record, sourceUrl: '/changed.pdf' }); expect(await hasPreservedOfflinePdf({ id: 'book', pdfUrl: '/source.pdf' }, 'a')).toBe(false);
});

it('reports a per-book retention when a cached image body becomes unreadable, rather than losing earlier results', async () => {
 io.index.mockResolvedValue({ ...item, chapterData: new Blob([JSON.stringify([{ ...chapters[0], noi_dung: '<img src="https://media.quangtu.vn/image.png">' }, chapters[1]])]) });
 vi.stubGlobal('caches', { open: async () => ({ match: async () => ({ ok: true, headers: new Headers({ 'content-type': 'image/png' }), blob: async () => { throw new Error('evicted'); } }) }) });
 expect(await retirePdfBookTransition(transition, new AbortController().signal, context)).toBe('retained'); expect(io.retire).not.toHaveBeenCalled();
});
