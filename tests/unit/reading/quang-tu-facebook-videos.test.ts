import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../../src/lib/data/quang-tu-facebook-videos.json';
import {
  isQuangTuFacebookBook,
  getQuangTuVideoCount,
  getQuangTuVideoTotalBytes,
  cachedQuangTuVideoCount,
  cachedQuangTuVideoBytes,
  isSingleVideoCached,
  downloadSingleVideo,
  downloadAllQuangTuVideos,
  deleteSingleVideo,
  clearAllQuangTuVideos,
  readVideoBlobUrl,
  withQuangTuVideoSources
} from '../../../src/lib/browser/quang-tu-facebook-videos';

afterEach(() => vi.unstubAllGlobals());

function setupCacheFixture() {
  const store = new Map<string, Response>();
  vi.stubGlobal('location', { origin: 'https://localhost' });
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn((blob: Blob) => `blob:https://localhost/${Math.random()}`),
      configurable: true,
      writable: true
    });
  } else {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:https://localhost/${Math.random()}`);
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true
    });
  } else {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  }
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (key: string | Request) => store.get(typeof key === 'string' ? key : key.url)?.clone() ?? null,
      put: async (key: string, response: Response) => {
        store.set(key, response);
      },
      delete: async (key: string) => store.delete(key),
      keys: async () => [...store.keys()].map((url) => new Request(url))
    }),
    delete: async (cacheName: string) => {
      store.clear();
      return true;
    }
  });
  return store;
}

describe('quang-tu-facebook-videos cache and offline manager', () => {
  it('correctly identifies the book and meta properties', () => {
    expect(isQuangTuFacebookBook('tuyen-tap-phap-facebook-quang-tu')).toBe(true);
    expect(isQuangTuFacebookBook('book_tuyen-tap-phap-facebook-quang-tu')).toBe(true);
    expect(isQuangTuFacebookBook('su-menh-do-vong')).toBe(false);
    expect(getQuangTuVideoCount()).toBe(20);
    expect(getQuangTuVideoTotalBytes()).toBeGreaterThan(70_000_000);
    expect(getQuangTuVideoTotalBytes()).toBe(manifest.videos.reduce((sum, video) => sum + video.remoteBytes, 0));
  });

  it('downloads single video, verifies bytes and caches it', async () => {
    const store = setupCacheFixture();
    const video = manifest.videos[0];
    const mockData = new Uint8Array(video.bytes);
    const fetcher = vi.fn(async () => new Response(mockData, {
      status: 200,
      headers: { 'content-type': 'video/mp4', 'content-length': String(mockData.byteLength) }
    }));
    vi.stubGlobal('fetch', fetcher);

    expect(await isSingleVideoCached(video.filename)).toBe(false);

    let progressCalled = false;
    await downloadSingleVideo(video.filename, new AbortController().signal, (pct) => {
      progressCalled = true;
      expect(pct).toBeGreaterThanOrEqual(0);
    });

    expect(progressCalled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await isSingleVideoCached(video.filename)).toBe(true);
    expect(await cachedQuangTuVideoCount()).toBe(1);
    expect(await cachedQuangTuVideoBytes()).toBe(video.bytes);

    const blobUrl = await readVideoBlobUrl(video.filename);
    expect(blobUrl).toMatch(/^blob:/u);

    // Delete single video
    await deleteSingleVideo(video.filename);
    expect(await isSingleVideoCached(video.filename)).toBe(false);
    expect(await cachedQuangTuVideoCount()).toBe(0);
  });

  it('downloads all videos and allows clearing all', async () => {
    const store = setupCacheFixture();
    const fetcher = vi.fn(async (url: string) => {
      const filename = url.split('/').pop()!;
      const item = manifest.videos.find((v) => v.filename === filename);
      const bytes = item ? item.bytes : 1000;
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(bytes) }
      });
    });
    vi.stubGlobal('fetch', fetcher);

    let completedCounter = 0;
    await downloadAllQuangTuVideos(new AbortController().signal, (completed, total) => {
      completedCounter = completed;
      expect(total).toBe(20);
    });

    expect(completedCounter).toBe(20);
    expect(await cachedQuangTuVideoCount()).toBe(20);

    // Clear all
    await clearAllQuangTuVideos();
    expect(await cachedQuangTuVideoCount()).toBe(0);
  });

  it('downloads the complete CDN version when its size differs from the bundled compressed video', async () => {
    setupCacheFixture();
    const video = manifest.videos[0];
    const remoteBytes = video.bytes + 4000;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(remoteBytes), {
      headers: { 'content-type': 'video/mp4', 'content-length': String(remoteBytes) }
    })));

    await downloadSingleVideo(video.filename, new AbortController().signal);

    expect(await isSingleVideoCached(video.filename)).toBe(true);
    expect(await cachedQuangTuVideoBytes()).toBe(remoteBytes);
    await downloadSingleVideo(video.filename, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache a truncated CDN response even when it matches the bundled size', async () => {
    const store = setupCacheFixture();
    const video = manifest.videos[0];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(video.bytes), {
      headers: { 'content-type': 'video/mp4', 'content-length': String(video.bytes + 1) }
    })));

    await expect(downloadSingleVideo(video.filename, new AbortController().signal))
      .rejects.toThrow('video-integrity-failed');
    expect(store.size).toBe(0);
  });

  it.each([
    { status: 206, type: 'video/mp4', body: 'partial video' },
    { status: 200, type: 'text/html', body: '<html>Fallback page</html>' },
  ])('does not cache a $status $type response as a complete video', async ({ status, type, body }) => {
    const store = setupCacheFixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status, headers: { 'content-type': type, 'content-length': String(body.length) }
    })));
    await expect(downloadSingleVideo(manifest.videos[0].filename, new AbortController().signal))
      .rejects.toThrow('video-integrity-failed');
    expect(store.size).toBe(0);
  });

  it('replaces local/cdn video sources with blob urls when cached', () => {
    const sampleHtml = `
      <div class="reader-video-wrapper">
        <video controls poster="https://media.quangtu.vn/posters/fb-poster-1590804654-1.webp">
          <source src="/videos/fb-video-1590804654-1.mp4" type="video/mp4">
        </video>
      </div>
    `;
    const cachedUrls = new Map([['fb-video-1590804654-1.mp4', 'blob:https://localhost/mock-video-1']]);
    const transformed = withQuangTuVideoSources(sampleHtml, cachedUrls);
    expect(transformed).toContain('src="blob:https://localhost/mock-video-1"');
  });

  it('falls back to CDN URL when not cached on native/web', () => {
    const sampleHtml = `
      <div class="reader-video-wrapper">
        <video controls poster="https://media.quangtu.vn/posters/fb-poster-1590804654-1.webp">
          <source src="/videos/fb-video-1590804654-1.mp4" type="video/mp4">
        </video>
      </div>
    `;
    const cachedUrls = new Map<string, string>();
    const transformed = withQuangTuVideoSources(sampleHtml, cachedUrls);
    expect(transformed).toContain('src="https://media.quangtu.vn/videos/fb-video-1590804654-1.mp4"');
  });
});
