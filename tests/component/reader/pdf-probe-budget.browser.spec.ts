import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './pdf-probe-budget-harness.svelte';

const mocks = vi.hoisted(() => ({ stored: false, getDocument: vi.fn(), probe: vi.fn(), version: vi.fn() }));
vi.mock('$lib/components/comments/CommentsPanel.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/ReaderToolsPanel.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/MostViewedArticles.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/components/reader/PdfAnnotations.svelte', () => ({ default: () => ({}) }));
vi.mock('$lib/browser/pdfjs-loader', () => ({ loadPdfjs: async () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }), getPdfjsWorker: () => undefined }));
vi.mock('$lib/browser/session-csrf', () => ({ getBrowserSession: async () => ({ authenticated: false, user: null }) }));
vi.mock('$lib/browser/pdf-gesture-controller', () => ({ installPdfGestures: () => () => {} }));
vi.mock('$lib/browser/reading-activity-client', () => ({
  createReadingActivityClient: () => ({ setSession() {}, flush: async () => {}, cachedProgress: () => [], getProgress: async () => null }),
  createThrottledReadingProgressWriter: () => ({ schedule() {}, flush() {}, cancel() {} }), isReadingActivityCapacityError: () => false,
}));
vi.mock('$lib/browser/pdf-offline-downloads', () => ({
  probePdfTotalBytes: mocks.probe, probeOfflinePdfSourceVersion: mocks.version,
  readPdfOfflineState: async () => mocks.stored ? { ownerId: 'anonymous', sourceUrl: '/probe.pdf', sourceVersion: 'size:9', sizeBytes: 9,
    blob: { arrayBuffer: async () => new TextEncoder().encode('%PDF-test').buffer } } : null,
  offlinePdfNeedsUpdate: () => false, downloadPdfForOffline: vi.fn(), removePdfOfflineCopy: vi.fn(),
}));

let component: ReturnType<typeof Harness> | undefined;
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  localStorage.clear(); mocks.stored = false;
  mocks.probe.mockReset().mockResolvedValue(1000);
  mocks.version.mockReset().mockResolvedValue(null);
  mocks.getDocument.mockReset().mockImplementation(() => ({ promise: new Promise(() => {}), destroy: async () => {} }));
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('crypto', { subtle: {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected network request'); }));
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); localStorage.clear();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

it('performs one size probe for an uncached PDF across confirmation and online reading', async () => {
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(mocks.probe).toHaveBeenCalledTimes(1));
  const online = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Đọc online'));
  expect(online).toBeDefined(); online!.click(); flushSync();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1));
  expect(mocks.probe).toHaveBeenCalledTimes(1);
});

it('performs no size or version probe when opening a stored PDF while offline', async () => {
  mocks.stored = true;
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1));
  expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array) }));
  expect(mocks.probe).not.toHaveBeenCalled(); expect(mocks.version).not.toHaveBeenCalled();
});

it('aborts a pending document size probe when the reader unmounts', async () => {
  mocks.probe.mockImplementation(() => new Promise(() => {}));
  component = mount(Harness, { target: document.body }); flushSync();
  await vi.waitFor(() => expect(mocks.probe).toHaveBeenCalledTimes(1));
  const signal = mocks.probe.mock.calls[0][2] as AbortSignal;
  expect(signal.aborted).toBe(false);
  await unmount(component); component = undefined;
  expect(signal.aborted).toBe(true);
});
