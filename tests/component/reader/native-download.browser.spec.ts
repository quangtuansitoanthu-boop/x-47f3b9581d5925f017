import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import DownloadGate from '../../../src/lib/components/reader/DownloadGate.svelte';
import EnglishPackDownload from '../../../src/lib/components/layout/EnglishPackDownload.svelte';
import ReaderVideoDownload from '../../../src/lib/components/reader/ReaderVideoDownload.svelte';
import { createLocaleStore, type LocaleStore } from '../../../src/lib/stores/locale.svelte';

const englishMocks = vi.hoisted(() => ({ locale: null as LocaleStore | null, download: vi.fn() }));
vi.mock('$lib/browser/english-pack', () => ({ downloadEnglishPack: englishMocks.download }));
vi.mock('$lib/stores/locale.svelte', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/lib/stores/locale.svelte')>();
  return { ...actual, getLocaleContext: () => englishMocks.locale ?? actual.getLocaleContext() };
});

const mocks = vi.hoisted(() => ({ native: true, request: vi.fn(), web: vi.fn(), refresh: vi.fn() }));
const videoMocks = vi.hoisted(() => ({ download: vi.fn(), cached: vi.fn(), ready: vi.fn(), notify: vi.fn() }));
vi.mock('$lib/browser/quang-tu-facebook-videos', () => ({
  isSingleVideoCached: videoMocks.cached,
  downloadSingleVideo: videoMocks.download,
  deleteSingleVideo: vi.fn(),
  readVideoBlobUrl: vi.fn(),
  revokeVideoBlobUrl: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native }, CapacitorHttp: { request: mocks.request },
}));
vi.mock('$lib/browser/session-csrf', () => ({
  getBrowserSession: async () => ({ authenticated: true, csrfToken: 'test-csrf' }),
  fetchWithSessionRefresh: mocks.web,
}));
vi.mock('$lib/stores/session.svelte', () => ({ refreshBrowserSession: mocks.refresh }));
let component: ReturnType<typeof DownloadGate> | undefined;
let englishComponent: ReturnType<typeof EnglishPackDownload> | undefined;
let videoComponent: ReturnType<typeof ReaderVideoDownload> | undefined;
beforeEach(() => {
  videoMocks.download.mockReset();
  videoMocks.cached.mockReset().mockResolvedValue(false);
  videoMocks.ready.mockReset();
  videoMocks.notify.mockReset();
  mocks.native = true;
  mocks.refresh.mockReset().mockResolvedValue({ authenticated: false });
  mocks.request.mockReset().mockResolvedValue({ status: 200, data: { allowed: true }, headers: { 'content-type': 'application/json' } });
  mocks.web.mockReset().mockResolvedValue(Response.json({ error: { code: 'invalid_origin' } }, { status: 403 }));
  localStorage.setItem('quangtu_active_url', 'https://quangtu.vn');
  vi.stubGlobal('Capacitor', { isNativePlatform: () => mocks.native });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(async () => {
  if (videoComponent) await unmount(videoComponent);
  videoComponent = undefined;
  if (englishComponent) await unmount(englishComponent);
  englishComponent = undefined;
  englishMocks.locale = null;
  englishMocks.download.mockReset();
  if (component) await unmount(component);
  component = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem('quangtu_active_url');
  document.body.replaceChildren();
});

function mountVideoDownload() {
  videoComponent = mount(ReaderVideoDownload, { target: document.body, props: {
    filename: 'fb-video-1590804654-1.mp4', bytes: 86446561,
    onNotify: videoMocks.notify, onUrlReady: videoMocks.ready,
  } });
  flushSync();
}

it('reports video download failure and keeps the retry action available', async () => {
  videoMocks.download.mockRejectedValue(new Error('video-integrity-failed'));
  mountVideoDownload();
  (document.querySelector('.btn-download') as HTMLButtonElement).click();
  await vi.waitFor(() => { flushSync(); expect(videoMocks.notify).toHaveBeenCalledOnce(); });
  expect(videoMocks.notify).toHaveBeenCalledWith(expect.stringContaining('Tải video chưa hoàn tất'));
  expect(document.querySelector('.btn-download')).not.toBeNull();
});

it('keeps a new video transfer active when an older canceled transfer rejects late', async () => {
  let rejectFirst: (error: unknown) => void = () => {};
  let firstSignal: AbortSignal | undefined;
  videoMocks.download.mockImplementationOnce((_filename: string, signal: AbortSignal) => {
    firstSignal = signal;
    return new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
  }).mockImplementationOnce(() => new Promise<void>(() => {}));
  mountVideoDownload();
  (document.querySelector('.btn-download') as HTMLButtonElement).click(); flushSync();
  (document.querySelector('.btn-cancel') as HTMLButtonElement).click(); flushSync();
  expect(firstSignal?.aborted).toBe(true);
  (document.querySelector('.btn-download') as HTMLButtonElement).click(); flushSync();
  rejectFirst(new DOMException('Aborted', 'AbortError'));
  await tick(); flushSync();
  expect(videoMocks.download).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.btn-cancel')).not.toBeNull();
  expect(videoMocks.notify).not.toHaveBeenCalled();
});

it('aborts video download on unmount without reporting an error or publishing late cache state', async () => {
  let finishDownload: () => void = () => {};
  let signal: AbortSignal | undefined;
  videoMocks.download.mockImplementation((_filename: string, downloadSignal: AbortSignal) => {
    signal = downloadSignal;
    return new Promise<void>(resolve => { finishDownload = resolve; });
  });
  mountVideoDownload();
  await tick();
  (document.querySelector('.btn-download') as HTMLButtonElement).click(); flushSync();
  await unmount(videoComponent!);
  videoComponent = undefined;
  const readyCalls = videoMocks.ready.mock.calls.length;
  expect(signal?.aborted).toBe(true);
  finishDownload(); await tick();
  expect(videoMocks.ready).toHaveBeenCalledTimes(readyCalls);
  expect(videoMocks.notify).not.toHaveBeenCalled();
});

it('keeps English download recoverable when returning before a delayed locale abort settles', async () => {
  localStorage.removeItem('tutam_locale');
  const locale = createLocaleStore('en');
  locale.setLocale('en');
  expect(locale.current).toBe('en');
  englishMocks.locale = locale;
  let firstSignal: AbortSignal | undefined;
  let rejectAborted: () => void = () => {};
  let finishResume: () => void = () => {};
  englishMocks.download.mockImplementationOnce((_progress: unknown, signal: AbortSignal) => {
    firstSignal = signal;
    return new Promise<void>((_resolve, reject) => {
      rejectAborted = () => reject(new DOMException('Transfer aborted', 'AbortError'));
    });
  }).mockImplementationOnce(() => new Promise<void>(resolve => { finishResume = resolve; }));
  englishComponent = mount(EnglishPackDownload, { target: document.body });
  flushSync();
  await vi.waitFor(() => { flushSync(); expect(englishMocks.download).toHaveBeenCalledTimes(1); });
  locale.setLocale('vi'); flushSync();
  expect(firstSignal?.aborted).toBe(true);
  locale.setLocale('en'); flushSync();
  // Returning must not overlap the first unsettled transfer.
  expect(englishMocks.download).toHaveBeenCalledTimes(1);
  rejectAborted();
  await tick();
  await vi.waitFor(() => {
    flushSync();
    expect(document.querySelector('.english-download')).not.toBeNull();
    expect(document.body.textContent).toMatch(/Downloading English books|Retry/);
  });
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry');
  if (retry) { retry.click(); flushSync(); }
  await vi.waitFor(() => expect(englishMocks.download).toHaveBeenCalledTimes(2));
  finishResume();
  await vi.waitFor(() => { flushSync(); expect(document.querySelector('.english-download')).toBeNull(); });
  expect(englishMocks.download).toHaveBeenCalledTimes(2);
  localStorage.removeItem('tutam_locale');
});

it('passes the reader download gate on native with one Origin/CSRF-preserving request', async () => {
  component = mount(DownloadGate, { target: document.body, props: {
    authenticated: true, url: 'https://example.invalid/book.pdf', fileName: 'book.pdf', label: 'Download',
  } });
  flushSync();
  (document.querySelector('.download-gate') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    url: 'https://quangtu.vn/api/downloads/access', method: 'POST', data: {},
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'test-csrf' }),
  }));
  expect(mocks.web).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it('keeps the existing web download transport', async () => {
  mocks.native = false;
  mocks.web.mockResolvedValue(Response.json({ allowed: true }));
  component = mount(DownloadGate, { target: document.body, props: {
    authenticated: true, url: 'https://example.invalid/book.pdf', fileName: 'book.pdf', label: 'Download',
  } });
  flushSync();
  (document.querySelector('.download-gate') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
  expect(mocks.web).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('refreshes an expired native session without replaying authorization or starting a file', async () => {
  mocks.request.mockResolvedValue({ status: 401, data: {}, headers: {} });
  component = mount(DownloadGate, { target: document.body, props: {
    authenticated: true, url: 'https://example.invalid/book.pdf', fileName: 'book.pdf', label: 'Download',
  } });
  flushSync();
  (document.querySelector('.download-gate') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('Phiên đăng nhập'));
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.web).not.toHaveBeenCalled();
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
