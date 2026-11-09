import { beforeEach, expect, it, vi } from 'vitest';
import type { ContentUpdateItem } from '$lib/contracts/content-updates';
const io = vi.hoisted(() => ({ saved: vi.fn(), save: vi.fn(), collect: vi.fn(), ready: vi.fn(), retire: vi.fn(), guard: vi.fn() }));
vi.mock('$lib/browser/offline-content-packages', () => ({ savedContentItems: io.saved, saveContentPackage: io.save }));
vi.mock('$lib/browser/session-cover', () => ({ saveCoverOffline: vi.fn(), offlineImageRemoteSource: (s: string) => s }));
vi.mock('$lib/browser/offline-books-sync', () => ({ rememberCompletedBook: vi.fn() }));
vi.mock('$lib/browser/pdf-book-transition', () => ({ collectPdfBookTransitions: io.collect, isPdfBookTextReady: io.ready, retirePdfBookTransition: io.retire, assertPdfTransitionCurrent: io.guard }));
import { checkContentUpdates, downloadContentUpdates } from '$lib/browser/content-update-client';
const item: ContentUpdateItem = { kind: 'article', group: 'book', mode: 'full', version: 'a'.repeat(64), row: { id: 'book', tieu_de: 'Book', so_tap: 1, has_muc_luc: 1, pdf_url: '/source.pdf' } };
const transition = { item, record: { ownerId: 'a', documentId: 'book' } };
const context = { principalId: 'a', isCurrent: () => true };
const size = { id: 'book', bytes: 4, chapters: 1, illustrated: false };
beforeEach(() => { vi.clearAllMocks(); io.saved.mockResolvedValue([{ ...item }]); io.save.mockResolvedValue(undefined); io.collect.mockResolvedValue([transition]); io.ready.mockResolvedValue(true); io.retire.mockResolvedValue('removed'); });
it('retains a cleanup candidate when content already current; no estimate/article refetch', async () => {
 const fetcher = vi.fn(async () => Response.json({ items: [item], articlesNext: null, talksNext: null }));
 const plan = await checkContentUpdates(new AbortController().signal, fetcher, context);
 expect(plan.items).toEqual([]); expect(plan.pdfTransitions).toEqual([transition]); expect(fetcher).toHaveBeenCalledOnce();
 const result = await downloadContentUpdates(plan, new AbortController().signal, vi.fn(), fetcher, context);
 expect(result).toMatchObject({ completed: 0, pdfRemoved: ['Book'], pdfRetained: [] }); expect(fetcher).toHaveBeenCalledOnce(); expect(io.retire).toHaveBeenCalledOnce();
});
it('repairs missing current local text through normal download before retirement', async () => {
 io.ready.mockResolvedValue(false);
 const fetcher = vi.fn(async (url: RequestInfo | URL) => new URL(String(url), 'https://test').searchParams.get('action') === 'estimate' ? Response.json([size]) : Response.json({ items: [item], articlesNext: null, talksNext: null }));
 const plan = await checkContentUpdates(new AbortController().signal, fetcher, context); expect(plan.items).toEqual([item]); expect(plan.sizes).toEqual([size]);
});
it('does not retire after failed commit and reports the previous download kept', async () => {
 io.save.mockRejectedValue(new Error('quota'));
 const fetcher = vi.fn(async () => Response.json({ article: item.row, chapters: [{ id: 'c', noi_dung: 'text' }], next: null }));
 const result = await downloadContentUpdates({ items: [item], sizes: [size], bytes: 4, unknownImages: 0, pdfTransitions: [transition] }, new AbortController().signal, vi.fn(), fetcher, context);
 expect(result).toMatchObject({ completed: 0, failed: ['Book'], pdfRemoved: [], pdfRetained: ['Book'] }); expect(io.retire).not.toHaveBeenCalled();
});
it('reports text committed but cleanup failed truthfully, and aborts stale principal work', async () => {
 io.retire.mockResolvedValue('retained');
 const plan = { items: [], sizes: [], bytes: 0, unknownImages: 0, pdfTransitions: [transition] };
 expect(await downloadContentUpdates(plan, new AbortController().signal, vi.fn(), vi.fn(), context)).toMatchObject({ pdfRemoved: [], pdfRetained: ['Book'] });
 io.guard.mockImplementation(() => { throw new DOMException('changed', 'AbortError'); });
 await expect(downloadContentUpdates(plan, new AbortController().signal, vi.fn(), vi.fn(), context)).rejects.toMatchObject({ name: 'AbortError' });
});
