import { describe, expect, it } from 'vitest';

import { loadSvelteKitServiceWorker, responseForPath } from './shared/service-worker-harness';

describe('SvelteKit service worker upgrade lifecycle', () => {
  it('precache install is atomic and keeps the current controller when a shell asset fails', async () => {
    const runtime = await loadSvelteKitServiceWorker({
      existingCaches: ['quangtu-sveltekit-older'],
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/manifest.json') {
          return responseForPath(pathname, { status: 503 });
        }
        return responseForPath(pathname);
      },
    });

    await expect(runtime.runLifecycle('install')).rejects.toThrow('precache-failed:/manifest.json');
    expect(runtime.state()).toEqual({
      claimed: false,
      deletedCaches: [],
      skipped: false,
    });
  });

  it('rejects an anonymous shell response that is not safe to cache', async () => {
    const runtime = await loadSvelteKitServiceWorker({
      existingCaches: ['quangtu-sveltekit-older'],
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/huong-dan' && request.credentials === 'omit') {
          return responseForPath(pathname, {
            headers: { 'cache-control': 'private, no-store' },
          });
        }
        return responseForPath(pathname);
      },
    });

    await expect(runtime.runLifecycle('install'))
      .rejects.toThrow('offline-document-precache-failed:/huong-dan');
    expect(runtime.state()).toEqual({
      claimed: false,
      deletedCaches: [],
      skipped: false,
    });
  });

  it('waits for user approval before activation and deletes only prior SvelteKit-owned caches', async () => {
    const runtime = await loadSvelteKitServiceWorker({
      clientUrls: ['/huong-dan'],
      existingCaches: ['quangtu-sveltekit-2026-07-30', 'tutam-cache-v37', 'third-party-cache'],
    });

    await runtime.runLifecycle('install');
    expect(runtime.state().skipped).toBe(false);
    await runtime.dispatchMessage({ type: 'SKIP_WAITING' });
    await runtime.runLifecycle('activate');

    expect(runtime.state()).toEqual({
      claimed: true,
      deletedCaches: ['quangtu-sveltekit-2026-07-30'],
      skipped: true,
    });
    expect(runtime.cachesApi.names()).toEqual(expect.arrayContaining([
      'quangtu-sveltekit-2026-07-31',
      'third-party-cache',
      'tutam-cache-v37',
    ]));
    expect(runtime.cachesApi.has('quangtu-sveltekit-2026-07-31', '/huong-dan')).toBe(true);
  });

  it('keeps a public document fallback through an offline user-approved upgrade', async () => {
    let offline = false;
    const runtime = await loadSvelteKitServiceWorker({
      existingCaches: ['quangtu-sveltekit-older'],
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (offline) throw new Error(`offline:${pathname}`);
        return responseForPath(pathname);
      },
    });

    await runtime.runLifecycle('install');
    expect(runtime.state().skipped).toBe(false);

    offline = true;
    await runtime.dispatchMessage({ type: 'SKIP_WAITING' });
    await runtime.runLifecycle('activate');

    const cachedRoute = await runtime.dispatchFetch('/huong-dan', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const nestedRoute = await runtime.dispatchFetch('/bai-viet/gieo-nhan-lanh', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });

    expect(await cachedRoute?.text()).toBe('network:/huong-dan');
    expect(await nestedRoute?.text()).toBe('network:/');
    expect(runtime.state()).toEqual({
      claimed: true,
      deletedCaches: ['quangtu-sveltekit-older'],
      skipped: true,
    });
  });
});
