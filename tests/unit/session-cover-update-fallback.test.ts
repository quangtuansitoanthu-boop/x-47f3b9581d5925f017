import { afterEach, expect, it, vi } from 'vitest';

const apiOrigin = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
vi.mock('../../src/lib/browser/native-api', () => ({
  resolvePublicUpdateUrl: (path: string) => `https://quangtu-web.quangtu-ansitoanthu.workers.dev${path}`,
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const source = '/covers/nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni.webp';
const api = `${apiOrigin}/api/media${source}`;
function storage() {
  const saved = new Map<string, Response>();
  const put = vi.fn(async (key: string, response: Response) => { saved.set(key, response.clone()); });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('caches', { open: async () => ({ match: async (key: string) => saved.get(key)?.clone(), put }) });
  return { saved, put };
}
const image = () => new Response('image-bytes', { headers: { 'content-type': 'image/webp' } });

it('saves a ritual cover through the native API when CDN and local cover are missing, then reads it offline', async () => {
  vi.resetModules();
  const { saved } = storage();
  const fetcher = vi.fn(async (url: string) => url === api ? image() : new Response('missing', { status: 404 }));
  vi.stubGlobal('fetch', fetcher);
  const { saveCoverOffline, getSessionCover } = await import('../../src/lib/browser/session-cover');
  await saveCoverOffline(source);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([`https://media.quangtu.vn${source}`, source, api]);
  expect(await saved.get(source)!.clone().text()).toBe('image-bytes');
  vi.stubGlobal('navigator', { onLine: false });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ritual-cover');
  expect(await getSessionCover(source)).toBe('blob:ritual-cover');
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('adds no API request when the CDN cover is available', async () => {
  vi.resetModules(); storage();
  const fetcher = vi.fn(async (_url: string) => image()); vi.stubGlobal('fetch', fetcher);
  const { saveCoverOffline } = await import('../../src/lib/browser/session-cover');
  await saveCoverOffline(source);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe(`https://media.quangtu.vn${source}`);
});

it('keeps a previously saved cover and rejects completion when every source fails', async () => {
  vi.resetModules();
  const { saved, put } = storage(); saved.set(source, image());
  vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
  const { saveCoverOffline } = await import('../../src/lib/browser/session-cover');
  await expect(saveCoverOffline(source)).rejects.toThrow('Cover is unavailable');
  expect(put).not.toHaveBeenCalled();
  expect(await saved.get(source)!.clone().text()).toBe('image-bytes');
});
