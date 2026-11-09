import { afterEach, expect, it, vi } from 'vitest';
import { normalizeCoverSrc } from '../../src/lib/domain/cover-url';
import { parseAudioArtwork } from '../../src/lib/domain/audio-artwork';
import { parsePositionedImage } from '../../src/lib/domain/positioned-image';
import { JSDOM } from 'jsdom';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('preserves direct external images when their host rejects fetch CORS', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }) });
  const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  vi.stubGlobal('fetch', fetcher);
  const dom = new JSDOM('<img>');
  vi.stubGlobal('Event', dom.window.Event);
  const image = dom.window.document.querySelector('img')!;
  const { sessionCover } = await import('../../src/lib/browser/session-cover');
  const action = sessionCover(image, 'https://images.example.org/no-cors.png');
  try {
    await vi.waitFor(() => expect(image.src).toBe('https://images.example.org/no-cors.png'));
    expect(image.style.visibility).toBe('hidden');
    image.dispatchEvent(new dom.window.Event('load'));
    expect(image.style.visibility).toBe('');
    expect(fetcher).toHaveBeenCalledOnce();
  } finally { action.destroy(); dom.window.close(); }
});

it('loads an external cover from its original URL and reuses it without CDN retries', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }) });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:external-cover');
  const fetcher = vi.fn(async () => new Response('external-image', { headers: { 'content-type': 'image/png' } }));
  vi.stubGlobal('fetch', fetcher);
  const raw = 'https://images.example.org/artwork.png?width=640#pos=top';
  const artwork = parsePositionedImage(normalizeCoverSrc(raw));
  const { getSessionCover } = await import('../../src/lib/browser/session-cover');
  expect(artwork.position).toBe('top');
  expect(await getSessionCover(artwork.src)).toBe('blob:external-cover');
  expect(await getSessionCover(artwork.src)).toBe('blob:external-cover');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith('https://images.example.org/artwork.png?width=640',
    expect.objectContaining({ credentials: 'omit' }));
});

it('hides a pending cover until the image actually loads and hides a failed decode', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine:true });
  vi.stubGlobal('caches', { open:async () => ({match:async () => undefined,put:async () => {}}) });
  let complete!: (response:Response) => void;
  vi.stubGlobal('fetch',vi.fn(() => new Promise(resolve => { complete=resolve; })));
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:pending-cover');
  const dom=new JSDOM('<img>');
  const image=dom.window.document.querySelector('img')!;
  const { sessionCover }=await import('../../src/lib/browser/session-cover');
  const action=sessionCover(image,'/covers/pending.webp');
  try {
    expect(image.style.visibility).toBe('hidden');
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    complete(new Response('image',{headers:{'content-type':'image/webp'}}));
    await vi.waitFor(() => expect(image.src).toBe('blob:pending-cover'));
    expect(image.style.visibility).toBe('hidden');
    image.dispatchEvent(new dom.window.Event('load'));
    expect(image.style.visibility).toBe('');
    image.dispatchEvent(new dom.window.Event('error'));
    expect(image.style.visibility).toBe('hidden');
  } finally {action.destroy();dom.window.close();}
});

it('coalesces concurrent cover requests and reuses the result after route remounts', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
  const put = vi.fn();
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }) });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached-cover');
  const fetcher = vi.fn(async () => new Response('webp-bytes', { headers: { 'content-type': 'image/webp' } }));
  vi.stubGlobal('fetch', fetcher);
  const { getSessionCover } = await import('../../src/lib/browser/session-cover');
  expect(await Promise.all([getSessionCover('/covers/test.webp'), getSessionCover('/covers/test.webp')])).toEqual(['blob:cached-cover', 'blob:cached-cover']);
  expect(await getSessionCover('/covers/test.webp')).toBe('blob:cached-cover');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(put).toHaveBeenCalledOnce();
});

it('releases unused cover URLs without revoking an image still mounted on screen', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }) });
  let nextUrl = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:cover-${++nextUrl}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => new Response('cover', { headers: { 'content-type': 'image/webp' } })));
  const { getSessionCover, sessionCover } = await import('../../src/lib/browser/session-cover');
  const image = { loading: 'eager', src: '', style:{visibility:''}, addEventListener() {}, removeEventListener() {}, removeAttribute() {}, dispatchEvent() {} };
  const action = sessionCover(image as unknown as HTMLImageElement, '/covers/active.webp');
  await vi.waitFor(() => expect(image.src).not.toBe(''));
  const active = image.src;
  await Promise.all(Array.from({ length: 40 }, (_, index) => getSessionCover(`/covers/unused-${index}.webp`)));
  expect(revoke.mock.calls.length).toBeGreaterThanOrEqual(16);
  expect(revoke).not.toHaveBeenCalledWith(active);
  action.destroy();
  expect(revoke).toHaveBeenCalledWith(active);
});

it('shares a single visibility observer and never fetches an off-screen image removed before it appears', async () => {
  vi.resetModules();
  const constructor = vi.fn();
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor() { constructor(); }
    observe = observe;
    unobserve = unobserve;
    disconnect = disconnect;
  });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { sessionCover } = await import('../../src/lib/browser/session-cover');
  const images = Array.from({ length: 20 }, () => ({ loading: 'lazy', src: '', style:{visibility:''}, addEventListener() {}, removeEventListener() {}, removeAttribute() {}, dispatchEvent() {} }));
  const actions = images.map((image, index) => sessionCover(image as unknown as HTMLImageElement, `/covers/lazy-${index}.webp`));
  expect(constructor).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledTimes(20);
  for (const action of actions) action.destroy();
  expect(fetcher).not.toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalledOnce();
});

it('loads a persisted cover in a new offline app session without network', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => new Response('saved', { headers: { 'content-type': 'image/webp' } }) }) });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:offline-cover');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { getSessionCover } = await import('../../src/lib/browser/session-cover');
  expect(await getSessionCover('/covers/offline.webp')).toBe('blob:offline-cover');
  expect(fetcher).not.toHaveBeenCalled();
});

it('shares the album cover with Top 10 for remote and relative artwork URLs', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }) });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shared-top-ten');
  const fetcher = vi.fn(async () => new Response('cover', { headers: { 'content-type': 'image/webp' } }));
  vi.stubGlobal('fetch', fetcher);
  const { getSessionCover } = await import('../../src/lib/browser/session-cover');
  const album = parseAudioArtwork(normalizeCoverSrc('https://media.quangtu.vn/covers/top.webp#pos=35%25%2070%25'));
  const topTen = parsePositionedImage(normalizeCoverSrc('covers/top.webp#pos=35%25%2070%25'));
  expect(topTen).toEqual(album);
  expect(topTen.position).toBe('35% 70%');
  await Promise.all([getSessionCover(album.src), getSessionCover(topTen.src)]);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/covers/top.webp', expect.anything());
});
