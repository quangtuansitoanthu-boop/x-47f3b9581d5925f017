import { describe, expect, it } from 'vitest';

import { offlinePdfResolverPath } from '../../src/lib/pwa/service-worker-policy';
import { loadSvelteKitServiceWorker, responseForPath } from './shared/service-worker-harness';

describe('SvelteKit service worker cache policy', () => {
  it('installs the shell without fetching books/videos and retains a visited full public chapter offline', async () => {
    const chapter = '/offline-data/chapters/a-book.json';
    const video = '/videos/a-video.mp4';
    const requests: string[] = [];
    let offline = false;
    const runtime = await loadSvelteKitServiceWorker({
      manifest: { build: ['/_app/immutable/app.js'], files: ['/manifest.json', chapter, video], version: 'small-shell' },
      fetchImpl: async request => {
        const pathname = new URL(request.url).pathname;
        requests.push(pathname);
        if (offline) throw new Error('offline');
        return responseForPath(pathname);
      },
    });
    await runtime.runLifecycle('install');
    expect(requests).not.toContain(chapter); expect(requests).not.toContain(video);
    const online = await runtime.dispatchFetch(chapter);
    const content = await online!.text();
    expect(runtime.cachesApi.has('quangtu-sveltekit-small-shell', chapter)).toBe(true);
    offline = true;
    expect(await (await runtime.dispatchFetch(chapter))!.text()).toBe(content);
    expect(await runtime.dispatchFetch(video)).toBeNull();
  });

  it('returns a partial static response without storing incomplete content as a complete offline file', async () => {
    const chapter = '/offline-data/chapters/ranged.json';
    const runtime = await loadSvelteKitServiceWorker({
      manifest: { files: [chapter], version: 'partial-static' },
      fetchImpl: async () => new Response('partial', { status: 206, headers: { 'Content-Range': 'bytes 0-6/100' } }),
    });
    expect((await runtime.dispatchFetch(chapter))?.status).toBe(206);
    expect(runtime.cachesApi.has('quangtu-sveltekit-partial-static', chapter)).toBe(false);
  });

  it.each([
    ['bytes=2-5', 206, '2345', 'bytes 2-5/10'],
    ['bytes=7-', 206, '789', 'bytes 7-9/10'],
    ['bytes=-3', 206, '789', 'bytes 7-9/10'],
    ['bytes=-20', 206, '0123456789', 'bytes 0-9/10'],
    ['bytes=-0', 416, '', 'bytes */10'],
    ['bytes=10-', 416, '', 'bytes */10'],
  ] as const)('serves %s consistently from cached audio and authorized offline PDFs', async (range, status, body, contentRange) => {
    let offline = false;
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async (request) => {
        if (offline) throw new Error('offline');
        return responseForPath(new URL(request.url).pathname, { body: '0123456789' });
      },
      resolveOfflinePdf: async () => new Response('0123456789'),
    });
    const audioPath = '/assets/audio/tieng-mo.mp3';
    await runtime.dispatchFetch(audioPath);
    await runtime.dispatchMessage({
      type: 'OFFLINE_PDF_PRINCIPAL', generation: 1, principalId: 'user-a',
    });
    offline = true;

    for (const pathname of [audioPath, offlinePdfResolverPath('user-a:article-one')]) {
      const response = await runtime.dispatchFetch(pathname, { headers: { Range: range } });
      expect(response?.status).toBe(status);
      expect(response?.headers.get('content-range')).toBe(contentRange);
      expect(await response?.text()).toBe(body);
    }
  });

  it('keeps API/auth/oauth requests network-only by declining to intercept them', async () => {
    const runtime = await loadSvelteKitServiceWorker();

    for (const pathname of ['/api/health', '/auth/callback', '/oauth/start']) {
      const response = await runtime.dispatchFetch(pathname, {
        headers: { accept: 'application/json' },
      });
      expect(response).toBeNull();
    }
  });

  it('resolves only the explicit IndexedDB PDF route and preserves API network-only policy', async () => {
    const requestedKeys: Array<{ key: string; principalId: string }> = [];
    const runtime = await loadSvelteKitServiceWorker({
      resolveOfflinePdf: async (key, principalId) => {
        requestedKeys.push({ key, principalId });
        return new Response('0123456789', {
          headers: {
            'cache-control': 'private, no-store',
            'content-type': 'application/pdf',
            'x-offline-pdf': '1',
          },
        });
      },
    });
    const key = 'user-a:article/one';
    await runtime.dispatchMessage({
      type: 'OFFLINE_PDF_PRINCIPAL', generation: 1, principalId: 'user-a',
    });
    const response = await runtime.dispatchFetch(offlinePdfResolverPath(key), {
      headers: { range: 'bytes=2-5' },
    });

    expect(requestedKeys).toEqual([{ key, principalId: 'user-a' }]);
    expect(response?.status).toBe(206);
    expect(await response?.text()).toBe('2345');
    expect(response?.headers.get('x-offline-pdf')).toBe('1');
    expect(await runtime.dispatchFetch('/api/articles/private.pdf')).toBeNull();

    await expect(runtime.dispatchMessage({
      type: 'OFFLINE_PDF_RESOLVE', requestId: 'request-1', key,
    })).resolves.toEqual([{
      type: 'OFFLINE_PDF_RESOLVER',
      requestId: 'request-1',
      url: offlinePdfResolverPath(key),
    }]);

    await runtime.dispatchMessage({
      type: 'OFFLINE_PDF_PRINCIPAL', generation: 2, principalId: 'user-b',
    });
    expect((await runtime.dispatchFetch(offlinePdfResolverPath(key)))?.status).toBe(404);
    expect(await runtime.dispatchMessage({
      type: 'OFFLINE_PDF_RESOLVE', requestId: 'stale-a', key,
    })).toEqual([]);

    const bKey = 'user-b:article/one';
    expect((await runtime.dispatchFetch(offlinePdfResolverPath(bKey)))?.status).toBe(200);
    expect(requestedKeys).toContainEqual({ key: bKey, principalId: 'user-b' });
  });

  it('caches immutable assets and public shells but never replaces them with private or opaque responses', async () => {
    let offline = false;
    const fetchLog: string[] = [];
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        fetchLog.push(pathname);
        if (pathname === '/huong-dan') {
          if (request.credentials === 'omit') {
            return responseForPath(pathname, { body: 'public-shell:/huong-dan' });
          }
          if (offline) throw new Error(`offline:${pathname}`);
          return responseForPath(pathname, {
            body: 'private-navigation:/huong-dan',
            headers: {
              'cache-control': 'private, no-store',
              'set-cookie': 'session=secret',
            },
          });
        }
        if (pathname === '/_app/immutable/chunks/opaque.js') {
          const response = responseForPath(pathname);
          Object.defineProperty(response, 'type', {
            configurable: true,
            value: 'opaque',
          });
          return response;
        }
        return responseForPath(pathname);
      },
      manifest: {
        build: ['/_app/immutable/chunks/app.js'],
        files: ['/manifest.json'],
        prerendered: ['/'],
        version: '2026-07-31',
      },
    });

    await runtime.runLifecycle('install');

    const asset = await runtime.dispatchFetch('/_app/immutable/chunks/app.js');
    expect(await asset?.text()).toBe('network:/_app/immutable/chunks/app.js');
    expect(runtime.cachesApi.has('quangtu-sveltekit-2026-07-31', '/_app/immutable/chunks/app.js')).toBe(true);

    const doc = await runtime.dispatchFetch('/huong-dan', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    expect(await doc?.text()).toBe('private-navigation:/huong-dan');
    expect(runtime.cachesApi.has('quangtu-sveltekit-2026-07-31', '/huong-dan')).toBe(true);

    const opaque = await runtime.dispatchFetch('/_app/immutable/chunks/opaque.js');
    expect(opaque?.type).toBe('opaque');
    expect(runtime.cachesApi.has('quangtu-sveltekit-2026-07-31', '/_app/immutable/chunks/opaque.js')).toBe(false);

    offline = true;
    const cachedDocument = await runtime.dispatchFetch('/huong-dan', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    expect(await cachedDocument?.text()).toBe('public-shell:/huong-dan');
    expect(fetchLog).toEqual(expect.arrayContaining([
      '/_app/immutable/chunks/app.js',
      '/huong-dan',
      '/_app/immutable/chunks/opaque.js',
    ]));
  });

  it('runtime-caches successful same-origin practice MP3 files but never private audio responses', async () => {
    let offline = false;
    const fetchLog: string[] = [];
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        fetchLog.push(pathname);
        if (offline) throw new Error(`offline:${pathname}`);
        if (pathname === '/assets/audio/private.mp3') {
          return responseForPath(pathname, {
            headers: { 'cache-control': 'private, no-store', 'content-type': 'audio/mpeg' },
          });
        }
        return responseForPath(pathname, { headers: { 'content-type': 'audio/mpeg' } });
      },
    });

    await runtime.runLifecycle('install');
    const first = await runtime.dispatchFetch('/assets/audio/nhac-thien-01.mp3');
    expect(await first?.text()).toBe('network:/assets/audio/nhac-thien-01.mp3');
    expect(runtime.cachesApi.has(
      'quangtu-sveltekit-2026-07-31',
      '/assets/audio/nhac-thien-01.mp3',
    )).toBe(true);

    const privateAudio = await runtime.dispatchFetch('/assets/audio/private.mp3');
    expect(await privateAudio?.text()).toBe('network:/assets/audio/private.mp3');
    expect(runtime.cachesApi.has(
      'quangtu-sveltekit-2026-07-31',
      '/assets/audio/private.mp3',
    )).toBe(false);

    offline = true;
    const cached = await runtime.dispatchFetch('/assets/audio/nhac-thien-01.mp3');
    expect(await cached?.text()).toBe('network:/assets/audio/nhac-thien-01.mp3');
    expect(fetchLog.filter((pathname) => pathname === '/assets/audio/nhac-thien-01.mp3')).toHaveLength(1);
  });

  it('serves the bundled dedication-card font from precache with no network', async () => {
    let offline = false;
    const fontPath = '/assets/fonts/be-vietnam-pro-regular.ttf';
    const fetchLog: string[] = [];
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        fetchLog.push(pathname);
        if (offline) throw new Error(`offline:${pathname}`);
        return responseForPath(pathname, { headers: { 'content-type': 'font/ttf' } });
      },
      manifest: {
        build: [],
        files: [fontPath],
        prerendered: [],
        version: '2026-09-04-font',
      },
    });

    await runtime.runLifecycle('install');
    offline = true;
    const response = await runtime.dispatchFetch(fontPath);

    expect(await response?.text()).toBe(`network:${fontPath}`);
    expect(fetchLog.filter((pathname) => pathname === fontPath)).toHaveLength(1);
  });

  it('promotes a successful practice-audio range request to a complete offline cache entry', async () => {
    let offline = false;
    const fetchRanges: Array<string | null> = [];
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (!pathname.startsWith('/assets/audio/')) return responseForPath(pathname);
        if (offline) throw new Error(`offline:${pathname}`);
        const range = request.headers.get('range');
        fetchRanges.push(range);
        return responseForPath(pathname, {
          headers: { 'content-type': 'audio/mpeg' },
          status: range ? 206 : 200,
        });
      },
    });

    await runtime.runLifecycle('install');
    const first = await runtime.dispatchFetch('/assets/audio/tieng-mo.mp3', {
      headers: { Range: 'bytes=0-6' },
    });
    expect(first?.status).toBe(206);
    expect(fetchRanges).toEqual(['bytes=0-6', null]);
    expect(runtime.cachesApi.has(
      'quangtu-sveltekit-2026-07-31',
      '/assets/audio/tieng-mo.mp3',
    )).toBe(true);

    offline = true;
    const cachedRange = await runtime.dispatchFetch('/assets/audio/tieng-mo.mp3', {
      headers: { Range: 'bytes=0-6' },
    });
    expect(cachedRange?.status).toBe(206);
    expect(await cachedRange?.text()).toBe('network');
  });
});
