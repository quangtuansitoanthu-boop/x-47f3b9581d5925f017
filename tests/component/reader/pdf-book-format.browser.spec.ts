import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './pdf-book-format-harness.svelte';
const io = vi.hoisted(() => ({ preserved: vi.fn(), fetch: vi.fn(), progress: vi.fn(), enqueue: vi.fn(), schedule: vi.fn() }));
vi.mock('$lib/browser/pdf-book-transition', () => ({ hasPreservedOfflinePdf: io.preserved }));
vi.mock('$lib/components/reader/PdfCanvasReader.svelte', async () => ({ default: (await import('./pdf-book-format-placeholder.svelte')).default }));
vi.mock('$lib/components/reader/ReaderToolbar.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/comments/CommentsPanel.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/MostViewedArticles.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/ReadingAnnotations.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: async () => null }));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: io.fetch, getBrowserSession: async () => ({ authenticated: false }) }));
vi.mock('$lib/browser/reading-activity-client', () => ({
 createReadingActivityClient: () => ({ setSession() {}, flush: async () => {}, cachedProgress: () => [], cachedAnnotations: () => [], getProgress: io.progress, enqueueProgress: io.enqueue }),
 createThrottledReadingProgressWriter: () => ({ schedule: io.schedule, flush() {}, cancel() {} }), isReadingActivityCapacityError: () => false,
}));
let component: ReturnType<typeof Harness> | undefined;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(() => { window.history.replaceState({}, '', '/'); Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) }); vi.clearAllMocks(); localStorage.clear(); io.preserved.mockResolvedValue(true); io.progress.mockResolvedValue(null); io.fetch.mockImplementation(async (url: string) => Response.json(url.includes('/chapters') ? [{ id: 'c1', so_thu_tu: 0, tieu_de: 'First', noi_dung: 'FIRST' }, { id: 'c2', so_thu_tu: 1, tieu_de: 'Second', noi_dung: 'SECOND' }] : { count: 1 })); Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 }))); });
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('opens the retained current-owner document without a chapter or text-progress fetch', async () => {
 component = mount(Harness, { target: document.body }); await settle(); await settle();
 expect(document.querySelector('[data-legacy-pdf]')).not.toBeNull(); expect(io.fetch.mock.calls.filter(([url]) => url.includes('/chapters'))).toHaveLength(0); expect(io.progress).not.toHaveBeenCalled();
});
it('switches to text after acknowledged cleanup and reuses the existing reader owner', async () => {
 component = mount(Harness, { target: document.body }); await settle(); io.preserved.mockResolvedValue(false);
 window.dispatchEvent(new CustomEvent('quangtu:offline-pdf-changed', { detail: { documentId: 'converted-book' } })); await settle(); await settle();
 expect(document.querySelector('[data-legacy-pdf]')).toBeNull(); expect(io.fetch.mock.calls.filter(([url]) => url.includes('/chapters'))).toHaveLength(1);
});
it('does not interpret saved PDF page progress as the chapter index or revision of a regular book', async () => {
 io.preserved.mockResolvedValue(false);
 component = mount(Harness, { target: document.body, props: { initialProgress: { contentId: 'converted-book', contentKind: 'pdf', percent: 80, revision: 99, position: { page: 80, scrollTop: 1234 } } as never } }); await settle(); await settle();
 expect(document.querySelector('[data-legacy-pdf]')).toBeNull(); expect(document.querySelector('.toc')).not.toBeNull(); expect(document.body.textContent).not.toContain('SECOND'); document.querySelector<HTMLButtonElement>('.toc-item')!.click(); await settle(); expect(io.schedule).toHaveBeenCalledWith(expect.objectContaining({ contentKind: 'book', baseRevision: 0 })); expect(io.schedule).not.toHaveBeenCalledWith(expect.objectContaining({ baseRevision: 99 }));
});

it('ignores a late retained-PDF lookup after switching account', async () => {
 let resolve!: (value: boolean) => void;
 io.preserved.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; })).mockResolvedValue(false);
 component = mount(Harness, { target: document.body }); await settle();
 window.dispatchEvent(new CustomEvent('quangtu:session-changed', { detail: { authenticated: true, user: { id: 'b' } } })); await settle(); await settle();
 resolve(true); await settle();
 expect(io.preserved).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'converted-book' }), 'b');
 expect(document.querySelector('[data-legacy-pdf]')).toBeNull(); expect(document.querySelector('.toc')).not.toBeNull();
});
