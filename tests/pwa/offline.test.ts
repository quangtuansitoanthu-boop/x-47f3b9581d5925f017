import { describe, expect, it } from 'vitest';

import { loadSvelteKitServiceWorker, responseForPath } from './shared/service-worker-harness';

describe('SvelteKit service worker offline fallback', () => {
  it('marks only a fallback HTML shell and drops obsolete encoded-body headers', async () => {
    let offline = false;
    const html = '<!doctype html><html lang="vi"><head></head><body><script>const data={sessionVerified:true};</script></body></html>';
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async request => {
        if (offline) throw new Error('offline');
        return responseForPath(new URL(request.url).pathname, { body: html, headers: {
          'content-type': 'text/html; charset=utf-8', 'content-length': String(html.length),
          'content-encoding': 'gzip', etag: '"online-shell"',
        } });
      },
    });
    await runtime.runLifecycle('install');
    offline = true;
    const response = await runtime.dispatchFetch('/phap-thoai', { mode: 'navigate', headers: { accept: 'text/html' } });
    expect(await response?.text()).toContain('<html data-offline-shell="1" lang="vi">');
    expect(response?.headers.get('content-type')).toBe('text/html; charset=utf-8');
    for (const name of ['content-length', 'content-encoding', 'etag']) expect(response?.headers.has(name)).toBe(false);
    offline = false;
    const fresh = await runtime.dispatchFetch('/phap-thoai', { mode: 'navigate', headers: { accept: 'text/html' } });
    expect(await fresh?.text()).toBe(html);
    expect(fresh?.headers.get('etag')).toBe('"online-shell"');
  });

  it('serves the cached document route after a successful online visit', async () => {
    let offline = false;
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (offline) throw new Error(`offline:${pathname}`);
        return responseForPath(pathname);
      },
    });

    await runtime.runLifecycle('install');
    const first = await runtime.dispatchFetch('/phap-thoai', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    expect(await first?.text()).toBe('network:/phap-thoai');

    offline = true;
    const second = await runtime.dispatchFetch('/phap-thoai', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    expect(await second?.text()).toBe('network:/phap-thoai');
  });

  it('falls back to the cached root shell when a not-yet-cached route opens offline', async () => {
    const runtime = await loadSvelteKitServiceWorker({
      fetchImpl: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/bai-viet/gieo-nhan-lanh') throw new Error(`offline:${pathname}`);
        return responseForPath(pathname);
      },
    });

    await runtime.runLifecycle('install');
    const response = await runtime.dispatchFetch('/bai-viet/gieo-nhan-lanh', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    expect(await response?.text()).toBe('network:/');
  });
});
