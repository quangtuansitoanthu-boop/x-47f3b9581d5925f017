import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ fetch: vi.fn(), session: vi.fn() }));
vi.mock('$lib/browser/network-deadline', () => ({ fetchWithDeadline: mock.fetch }));
vi.mock('$lib/browser/url-fallback', () => ({ refreshRemoteOrigin: vi.fn() }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: mock.session, refreshBrowserSession: vi.fn(), isSessionExpired: () => false }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (x: string) => x, isHtmlResponse: () => false }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: async () => null }));
import { fetchWithSessionRefresh } from '../../src/lib/browser/session-csrf';
let release: (response: Response) => void;
let session: object;
it('blocks native admin content writes before network but keeps member status and personal writes', async () => {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  session = { authenticated: true, user: { id: 'A', role: 'admin' } };
  mock.fetch.mockImplementation(async () => Response.json({ ok: true }));
  const denied = await fetchWithSessionRefresh('/api/articles/book', { method: 'PATCH', body: '{}' });
  expect(denied.status).toBe(403);
  expect(mock.fetch).not.toHaveBeenCalled();
  for (const path of ['/api/admin/books/import', '/api/talks/album', '/api/media', '/api/practice/campaigns/campaign']) {
    expect((await fetchWithSessionRefresh(path, { method: 'DELETE' })).status).toBe(403);
  }
  for (const status of ['suspended', 'active']) {
    expect((await fetchWithSessionRefresh('/api/admin/members/member', {
      method: 'PATCH', body: JSON.stringify({ status }),
    })).ok).toBe(true);
  }
  expect((await fetchWithSessionRefresh('/api/admin/members/member', {
    method: 'PATCH', body: JSON.stringify({ status: 'active', role: 'admin' }),
  })).status).toBe(403);
  expect((await fetchWithSessionRefresh('/api/personal-events', { method: 'POST', body: '{}' })).ok).toBe(true);
  expect(mock.fetch).toHaveBeenCalledTimes(3);
  for (const path of ['/api/articles/book/views', '/api/articles/book/comments', '/api/talks/album/plays', '/api/practice/campaigns/campaign/join']) {
    expect((await fetchWithSessionRefresh(path, { method: 'POST', body: '{}' })).ok).toBe(true);
  }
  expect(mock.fetch).toHaveBeenCalledTimes(7);
});
it('keeps web admin authoring and native admin reads', async () => {
  session = { authenticated: true, user: { id: 'A', role: 'admin' } };
  mock.fetch.mockImplementation(async () => Response.json({ ok: true }));
  expect((await fetchWithSessionRefresh('/api/articles/book', { method: 'PATCH', body: '{}' })).ok).toBe(true);
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  expect((await fetchWithSessionRefresh('/api/admin/members')).ok).toBe(true);
  expect(mock.fetch).toHaveBeenCalledTimes(2);
});
beforeEach(() => {
  session = { authenticated: true, user: { id: 'A' }, csrfToken: 'A' };
  mock.session.mockImplementation(() => session);
  mock.fetch.mockReset().mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());
it('shares simultaneous identical API reads and gives each consumer its own response body', async () => {
  const first = fetchWithSessionRefresh('/api/practice/progress');
  const second = fetchWithSessionRefresh('/api/practice/progress');
  expect(mock.fetch).toHaveBeenCalledTimes(1);
  release(Response.json({ value: 42 }));
  expect(await (await first).json()).toEqual({ value: 42 });
  expect(await (await second).json()).toEqual({ value: 42 });
  mock.fetch.mockResolvedValueOnce(Response.json({ value: 43 }));
  expect(await (await fetchWithSessionRefresh('/api/practice/progress')).json()).toEqual({ value: 43 });
  expect(mock.fetch).toHaveBeenCalledTimes(2);
});
it('never shares private reads across session changes', async () => {
  mock.fetch.mockResolvedValue(Response.json({ ok: true }));
  const first = fetchWithSessionRefresh('/api/personal-events');
  session = { authenticated: true, user: { id: 'B' }, csrfToken: 'B' };
  const second = fetchWithSessionRefresh('/api/personal-events');
  await Promise.all([first, second]);
  expect(mock.fetch).toHaveBeenCalledTimes(2);
});
it('does not merge writes, abortable reads or different headers', async () => {
  mock.fetch.mockImplementation(async () => Response.json({ ok: true }));
  await Promise.all([
    fetchWithSessionRefresh('/api/personal-events', { method: 'POST' }),
    fetchWithSessionRefresh('/api/personal-events', { method: 'POST' }),
    fetchWithSessionRefresh('/api/articles', { signal: new AbortController().signal }),
    fetchWithSessionRefresh('/api/articles', { signal: new AbortController().signal }),
    fetchWithSessionRefresh('/api/articles', { headers: { accept: 'application/json' } }),
    fetchWithSessionRefresh('/api/articles', { headers: { accept: 'text/plain' } }),
  ]);
  expect(mock.fetch).toHaveBeenCalledTimes(6);
});
it('drops failures so retry starts a new network request', async () => {
  mock.fetch.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(Response.json({ ok: true }));
  await expect(fetchWithSessionRefresh('/api/personal-events')).rejects.toThrow('network down');
  expect((await fetchWithSessionRefresh('/api/personal-events')).ok).toBe(true);
  expect(mock.fetch).toHaveBeenCalledTimes(2);
});
