import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../../src/lib/data/mission-book-images.json';
import { downloadMissionImages, cachedMissionImageCount, readMissionImageUrls, revokeMissionImageUrls } from '../../../src/lib/browser/mission-book-images';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const stored = new Map(manifest.images.slice(1).map(image => ['https://localhost' + image.path, new Response('cached')]));
  vi.stubGlobal('location', { origin: 'https://localhost' });
  vi.stubGlobal('caches', { open: async () => ({
    match: async (key: string) => stored.get(key)?.clone(),
    put: async (key: string, response: Response) => { stored.set(key, response); },
    keys: async () => [...stored.keys()].map(url => new Request(url)),
  }) });
  return stored;
}
describe('public illustration download cache', () => {
  it('downloads only missing images, validates bytes, and reopens fully offline', async () => {
    fixture();
    const image = manifest.images[0];
    const fetcher = vi.fn(async () => new Response(readFileSync('.' + image.path)));
    vi.stubGlobal('fetch', fetcher);
    const progress = vi.fn();
    await downloadMissionImages(new AbortController().signal, progress);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toBeDefined();
    expect(progress).toHaveBeenLastCalledWith(manifest.images.length);
    expect(await cachedMissionImageCount()).toBe(manifest.images.length);
    fetcher.mockClear();
    await downloadMissionImages(new AbortController().signal, progress);
    expect(fetcher).not.toHaveBeenCalled();
    const urls = await readMissionImageUrls([image.path]);
    expect(urls.get(image.path)).toMatch(/^blob:/u);
    revokeMissionImageUrls(urls);
  });
  it('does not cache HTML or corrupt responses and preserves completed images', async () => {
    const stored = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not an image</html>')));
    await expect(downloadMissionImages(new AbortController().signal, vi.fn())).rejects.toThrow('image-integrity-failed');
    expect(stored.size).toBe(manifest.images.length - 1);
  });
  it('never fetches after cancellation', async () => {
    fixture();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(); controller.abort();
    await expect(downloadMissionImages(controller.signal, vi.fn())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
