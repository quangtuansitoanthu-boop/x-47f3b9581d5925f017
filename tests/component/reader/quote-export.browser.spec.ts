import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import QuoteCard from '../../../src/lib/components/reader/QuoteCardModal.svelte';
import QuotePrincipalHarness from './quote-principal-harness.svelte';
import DailyQuote from '../../../src/lib/components/home/DailyDhammapadaCard.svelte';

const { saveImage, sourceCatalog } = vi.hoisted(() => ({ saveImage:vi.fn(), sourceCatalog: vi.fn() }));
vi.mock('$lib/browser/image-export', () => ({ savePngImage:saveImage }));
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: () => ({ destroy() {} }) }));
vi.mock('$lib/browser/content-catalogs', () => ({ fetchHomepageArticles: async () => [] }));
vi.mock('$lib/browser/offline-pdf-library', () => ({ fetchHomepageWithOfflinePdfs: sourceCatalog }));
let component: ReturnType<typeof QuoteCard> | undefined;
let principalHarness: ReturnType<typeof QuotePrincipalHarness> | null = null;
let dailyQuote: ReturnType<typeof DailyQuote> | null = null;
let restoreFonts: (() => void) | null = null;
function mockFontLoading() {
  // JSDOM không triển khai FontFaceSet; chỉ thay API này trong các ca cần canvas thật.
  const original = Object.getOwnPropertyDescriptor(document, 'fonts');
  const load = vi.fn<FontFaceSet['load']>();
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  restoreFonts = () => {
    if (original) Object.defineProperty(document, 'fonts', original);
    else Reflect.deleteProperty(document, 'fonts');
  };
  return load;
}
beforeEach(() => {
  sourceCatalog.mockReset().mockResolvedValue({ articles: [], offline: false });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(async () => { if (dailyQuote) { await unmount(dailyQuote); dailyQuote = null; } if (principalHarness) { await unmount(principalHarness); principalHarness = null; } if (component) { await unmount(component); component = undefined; } restoreFonts?.(); restoreFonts = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); saveImage.mockReset(); localStorage.clear(); document.body.replaceChildren(); });
function open() {
  component = mount(QuoteCard, { target: document.body, props: { open:true, quoteText:'Nam mô Phật', onClose() {} } });
  flushSync();
}
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
it.each([true, false])('focuses only the requested quote whose text anchor still resolves (matches %s)', async matches => {
  const quoteText = matches ? 'Private quote from owner A' : 'A quotation that no longer occurs';
  const record = {
    id: 'requested-quote', contentId: 'principal-test-book', contentKind: 'article', anchorStatus: 'active',
    color: 'yellow', contentVersion: null, locator: { sectionId: 'root', startOffset: 0, endOffset: quoteText.length },
    quoteText, note: '', contextBefore: '', contextAfter: '', createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z',
  };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ annotations: [record], nextCursor: null })));
  principalHarness = mount(QuotePrincipalHarness, { target: document.body, props: { mode: 'inline', targetAnnotationId: record.id } });
  await settle();
  if (matches) {
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-reading-annotation')).toBe(record.id));
    expect(document.activeElement?.textContent).toBe(quoteText);
  } else {
    await vi.waitFor(() => expect(document.querySelector('.annotation-orphan-notice')).not.toBeNull());
    expect(document.querySelector('mark[data-reading-annotation]')).toBeNull();
  }
});
it.each([true, false])('keeps source availability honest when the source catalog is offline (known source %s)', async knownSource => {
  const quoteText = 'A saved offline quotation';
  const record = {
    id: 'offline-source-quote', contentId: 'offline-book', contentKind: 'article',
    anchorStatus: 'active', color: 'yellow', contentVersion: null,
    locator: { sectionId: 'root', startOffset: 0, endOffset: quoteText.length },
    quoteText, note: '', contextBefore: '', contextAfter: '',
    createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z',
  };
  sourceCatalog.mockResolvedValue({ offline: true, articles: knownSource ? [{ id: 'offline-book', title: 'Downloaded source book' }] : [] });
  const fetcher = vi.fn(async () => Response.json({ annotations: [record], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  principalHarness = mount(QuotePrincipalHarness, { target: document.body });
  await vi.waitFor(() => expect(document.querySelector('.quotes-list blockquote')?.textContent).toBe(quoteText));
  if (knownSource) {
    expect(document.querySelector('.quotes-list footer a')?.textContent).toContain('Downloaded source book');
    expect(document.querySelector('.quotes-list footer a')?.getAttribute('href')).toBe('/?article=offline-book&annotation=offline-source-quote');
  } else {
    expect(document.querySelector('.quotes-list footer')?.textContent).toContain('Chưa kiểm tra được thông tin nguồn');
    expect(document.querySelector('.quotes-list footer')?.textContent).not.toContain('Nội dung không còn khả dụng');
  }
  expect(sourceCatalog).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
for (const mode of ['quotes', 'inline'] as const) {
  it.each([null, 'quote-owner-b'])(`clears the ${mode} quote image when the principal changes to %s`, async nextId => {
    const quoteText = 'Private quote from owner A';
    let owner: string | null = 'quote-owner-a';
    const record = {
      id: 'principal-quote-a', contentId: 'principal-test-book', contentKind: 'article',
      anchorStatus: 'active', color: 'yellow', contentVersion: null,
      locator: { sectionId: 'root', startOffset: 0, endOffset: quoteText.length },
      quoteText, note: 'Private note from owner A', contextBefore: '', contextAfter: '',
      createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ annotations: owner === 'quote-owner-a' ? [record] : [], nextCursor: null })));
    principalHarness = mount(QuotePrincipalHarness, { target: document.body, props: { mode } });
    await settle();
    if (mode === 'inline') {
      await vi.waitFor(() => expect(document.querySelector('mark[data-reading-annotation]')).not.toBeNull());
      (document.querySelector('mark[data-reading-annotation]') as HTMLElement).click();
      flushSync();
    }
    await vi.waitFor(() => expect(document.querySelector(mode === 'quotes' ? '.quote-card-btn' : '.card-action-btn')).not.toBeNull());
    (document.querySelector(mode === 'quotes' ? '.quote-card-btn' : '.card-action-btn') as HTMLButtonElement).click();
    await settle();
    expect(document.querySelector('.quote-card-modal')).not.toBeNull();
    principalHarness.changePrincipal('quote-owner-a');
    await settle();
    expect(document.querySelector('.quote-card-modal')).not.toBeNull();
    owner = nextId;
    principalHarness.changePrincipal(nextId);
    await settle();
    expect(document.querySelector('.quote-card-modal')).toBeNull();
  });
}
it.each(['.copy-btn', '.share-btn'])('releases export controls when the canvas returns no PNG: %s', async selector => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null));
  open(); (document.querySelector(selector) as HTMLButtonElement).click(); await settle();
  expect([...document.querySelectorAll<HTMLButtonElement>('.quote-card-actions button')].every(button => !button.disabled)).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toMatch(/không thể|lỗi/iu);
});
it('allows retrying after the user cancels the share sheet', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type:'image/png' })));
  const share = vi.fn(async () => { throw new DOMException('Cancelled', 'AbortError'); });
  vi.stubGlobal('navigator', { canShare:() => true, share });
  open(); (document.querySelector('.share-btn') as HTMLButtonElement).click(); await settle();
  expect(share).toHaveBeenCalledOnce();
  expect([...document.querySelectorAll<HTMLButtonElement>('.quote-card-actions button')].every(button => !button.disabled)).toBe(true);
});
it('does not announce a successful download while the native save is pending or fails', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type:'image/png' })));
  let reject!: (error:Error) => void;
  saveImage.mockImplementation(() => new Promise((_, fail) => { reject=fail; }));
  open(); (document.querySelector('.download-btn') as HTMLButtonElement).click(); await settle();
  expect(document.querySelector('[role="status"]')).toBeNull();
  expect((document.querySelector('.download-btn') as HTMLButtonElement).disabled).toBe(true);
  reject(new Error('disk full')); await settle();
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Không thể tải ảnh');
  expect((document.querySelector('.download-btn') as HTMLButtonElement).disabled).toBe(false);
});

it('renders the original quote in italic, its real source at the right edge, and the app logo before export', async () => {
  mockFontLoading().mockResolvedValue([{ family: 'Bookerly', status: 'loaded' } as FontFace]);
  const textCalls: { text: string; x: number; font: string; align: string }[] = [];
  const drawImage = vi.fn();
  const context = {
    font: '', textAlign: '', textBaseline: '', fillStyle: '',
    drawImage,
    measureText(text: string) { return { width: text.length * 12 }; },
    fillText(text: string, x: number) { textCalls.push({ text, x, font: this.font, align: this.textAlign }); },
  };
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const pendingImages: (() => void)[] = [];
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { pendingImages.push(() => this.onload?.()); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })));
  saveImage.mockResolvedValue(true);
  component = mount(QuoteCard, { target: document.body, props: {
    open: true, quoteText: 'Đoạn văn nguyên bản.', sourceTitle: 'Tên sách đang đọc', onClose() {},
  } });
  await settle();
  (document.querySelector('.download-btn') as HTMLButtonElement).click();
  await settle();
  expect(saveImage).not.toHaveBeenCalled();
  expect(pendingImages).toHaveLength(2);
  pendingImages.forEach(resolve => resolve());
  await settle();
  expect(saveImage).toHaveBeenCalledOnce();
  expect(textCalls).toContainEqual(expect.objectContaining({ text: '“Đoạn văn nguyên bản.”', align: 'left', x: 136, font: expect.stringMatching(/^italic 400 /) }));
  expect(textCalls).toContainEqual(expect.objectContaining({ text: 'Nguồn: Tên sách đang đọc', align: 'right', x: 944 }));
  expect(textCalls).toContainEqual(expect.objectContaining({ text: 'Tu tập' }));
  expect(drawImage.mock.calls.some(call => call[3] === 96 && call[4] === 96)).toBe(true);
  expect((document.querySelector('canvas') as HTMLCanvasElement).width).toBe(1080);
});

it.each(['rejected', 'missing'] as const)('blocks export and allows retry when the approved Bookerly face is %s', async (failure) => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({} as CanvasRenderingContext2D);
  const loadFont = mockFontLoading();
  if (failure === 'rejected') loadFont.mockRejectedValue(new Error('font unavailable'));
  else loadFont.mockResolvedValue([]);
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
  open();
  await settle();
  (document.querySelector('.download-btn') as HTMLButtonElement).click();
  await settle();
  expect(saveImage).not.toHaveBeenCalled();
  expect(toBlob).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Không thể tải ảnh');
  expect((document.querySelector('.download-btn') as HTMLButtonElement).disabled).toBe(false);
  const attempts = loadFont.mock.calls.length;
  (document.querySelector('.download-btn') as HTMLButtonElement).click();
  await settle();
  expect(loadFont.mock.calls.length).toBeGreaterThan(attempts);
  expect(saveImage).not.toHaveBeenCalled();
});


it('opens the home quote image with the displayed verse and source without fetching data', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  dailyQuote = mount(DailyQuote, { target: document.body });
  await settle();
  const verse = document.querySelector('.verse-text')!.textContent!.trim();
  const source = document.querySelector('.source-cite')!.textContent!.trim();
  document.querySelector<HTMLButtonElement>('.create-quote-image')!.click();
  await settle();
  const canvas = document.querySelector('canvas')!;
  expect(canvas.getAttribute('aria-label')).toBe(`${verse} — ${source}`);
  expect(document.querySelectorAll('.quote-theme-pill')).toHaveLength(8);
  expect(fetch).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('.quote-card-close-btn')!.click();
  await settle();
  expect(document.querySelector('.quote-card-modal')).toBeNull();
});

it('blocks exporting the previous background while a newly selected background fails and allows retry', async () => {
  mockFontLoading().mockResolvedValue([{ family:'Bookerly', status:'loaded' } as FontFace]);
  const drawn: string[] = [];
  const context = {
    font:'', textAlign:'', textBaseline:'', fillStyle:'',
    drawImage(image: HTMLImageElement) { drawn.push(image.src); },
    measureText(text:string) { return { width:text.length * 12 }; }, fillText() {},
  };
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const pending: { src:string; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    get src() { return this.path; } private path = '';
    set src(value:string) { this.path=value; pending.push(this); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type:'image/png' })));
  open(); await settle();
  pending.forEach(image => image.onload?.()); await settle();
  document.querySelectorAll<HTMLButtonElement>('.quote-theme-pill')[1].click(); await settle();
  document.querySelector<HTMLButtonElement>('.download-btn')!.click(); await settle();
  expect(saveImage).not.toHaveBeenCalled();
  pending.at(-1)!.onerror?.(); await settle();
  expect(saveImage).not.toHaveBeenCalled();
  expect(drawn.some(src => src.endsWith('lotus-pink.webp'))).toBe(false);
  document.querySelector<HTMLButtonElement>('.download-btn')!.click(); await settle();
  expect(pending.at(-1)!.src).toContain('lotus-pink.webp');
  pending.at(-1)!.onload?.(); await settle();
  expect(saveImage).toHaveBeenCalledOnce();
  expect(drawn.some(src => src.endsWith('lotus-pink.webp'))).toBe(true);
});
