import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';

const mocks = vi.hoisted(() => ({ offline: vi.fn() }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: mocks.offline }));
vi.mock('$lib/stores/session.svelte', () => ({
  getBrowserSessionSnapshot: vi.fn(), isSessionExpired: vi.fn(), refreshBrowserSession: vi.fn(),
}));
beforeEach(() => {
  mocks.offline.mockReset();
  mocks.offline.mockImplementation(async () => new Response('[{"id":"cached"}]'));
});
afterEach(() => vi.unstubAllGlobals());

describe('offline fallback cannot acknowledge writes or revive cancelled requests', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('does not replace a failed %s with catalog data', async (method) => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(fetchWithSessionRefresh('/api/articles', { method })).rejects.toThrow('offline');
    expect(mocks.offline).not.toHaveBeenCalled();
  });
  it('preserves an explicit cancellation instead of substituting offline data', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchWithSessionRefresh('/api/articles', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.offline).not.toHaveBeenCalled();
  });
  it('continues to serve safe offline reads', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await fetchWithSessionRefresh('/api/articles');
    expect(await response.json()).toEqual([{ id: 'cached' }]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
