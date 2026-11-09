import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAlbumPlayReporter, fetchAlbumPlays } from '$lib/browser/album-plays';
import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
import { resolveOfflineBundledResponse } from '$lib/browser/offline-bundled-resolver';

vi.mock('$lib/browser/session-csrf', () => ({
  fetchWithSessionRefresh: vi.fn(),
  getBrowserSession: vi.fn(async () => ({ authenticated: false, csrfToken: null })),
}));
vi.mock('$lib/browser/native-api', () => ({
  fetchNativeJsonMutation: vi.fn(async () => null),
  isHtmlResponse: (response: Response) => response.headers.get('content-type')?.includes('text/html') ?? false,
}));

const cacheKey = 'quangtu_album_plays_cache';
const syncKey = 'quangtu_album_plays_last_sync_time';
const threeDays = 72 * 60 * 60 * 1000;
const stored = [{ albumId: 'cache-policy', playCount: 42 }];
const updated = [{ albumId: 'cache-policy', playCount: 108 }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T03:00:00Z'));
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(Response.json(updated));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function seed(age = 0) {
  localStorage.setItem(cacheKey, JSON.stringify(stored));
  localStorage.setItem(syncKey, String(Date.now() - age));
}

it('uses the persisted snapshot through repeated reads until exactly 72 hours', async () => {
  seed();
  expect(await fetchAlbumPlays()).toEqual(stored);
  vi.setSystemTime(Date.now() + threeDays - 1);
  expect(await fetchAlbumPlays()).toEqual(stored);
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
  vi.setSystemTime(Date.now() + 1);
  expect(await fetchAlbumPlays()).toEqual(updated);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(syncKey)).toBe(String(Date.now()));
  expect(await fetchAlbumPlays()).toEqual(updated);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('fetches immediately on first install and accepts an empty server snapshot', async () => {
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(Response.json([]));
  expect(await fetchAlbumPlays()).toEqual([]);
  expect(await fetchAlbumPlays()).toEqual([]);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('refreshes a legacy snapshot without a timestamp', async () => {
  localStorage.setItem(cacheKey, JSON.stringify(stored));
  expect(await fetchAlbumPlays()).toEqual(updated);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('still reads server totals when local storage cannot be accessed', async () => {
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  expect(await fetchAlbumPlays()).toEqual(updated);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it.each(['invalid', JSON.stringify([{ albumId: 'cache-policy', playCount: -2 }])])('repairs malformed cache without treating it as fresh: %s', async raw => {
  seed();
  localStorage.setItem(cacheKey, raw);
  expect(await fetchAlbumPlays()).toEqual(updated);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('refreshes after the device clock moves behind its saved timestamp', async () => {
  seed(-1);
  expect(await fetchAlbumPlays()).toEqual(updated);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('retains expired totals offline without refreshing or extending their age', async () => {
  seed(threeDays);
  const stamp = localStorage.getItem(syncKey);
  vi.stubGlobal('navigator', { onLine: false });
  expect(await fetchAlbumPlays()).toEqual(stored);
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
  expect(localStorage.getItem(syncKey)).toBe(stamp);
});

it.each([
  () => Response.json({ error: 'unavailable' }, { status: 503 }),
  () => Response.json([{ albumId: 'cache-policy', playCount: '999' }]),
  () => Response.json([{ albumId: '', playCount: 99 }]),
  () => Response.json([{ albumId: 'cache-policy', playCount: 1.5 }]),
  () => new Response('<html>offline</html>', { headers: { 'content-type': 'text/html' } }),
  () => new Response('broken-json'),
])('keeps the old snapshot and timestamp when the refresh is not valid (%#)', async response => {
  seed(threeDays);
  const stamp = localStorage.getItem(syncKey);
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(response());
  expect(await fetchAlbumPlays()).toEqual(stored);
  expect(localStorage.getItem(cacheKey)).toBe(JSON.stringify(stored));
  expect(localStorage.getItem(syncKey)).toBe(stamp);
});

it('does not mark an offline transport fallback as a successful server refresh', async () => {
  seed(threeDays);
  const stamp = localStorage.getItem(syncKey);
  const fallback = await resolveOfflineBundledResponse('/api/album-plays');
  expect(fallback?.headers.get('x-quangtu-offline')).toBe('1');
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(fallback!);
  expect(await fetchAlbumPlays()).toEqual(stored);
  expect(localStorage.getItem(syncKey)).toBe(stamp);
});

it('keeps the old snapshot after network failure and permits a later successful refresh', async () => {
  seed(threeDays);
  const stamp = localStorage.getItem(syncKey);
  vi.mocked(fetchWithSessionRefresh).mockRejectedValueOnce(new TypeError('network'));
  expect(await fetchAlbumPlays()).toEqual(stored);
  expect(localStorage.getItem(syncKey)).toBe(stamp);
  expect(await fetchAlbumPlays()).toEqual(updated);
});

it('never persists a refresh cancelled after the response arrived', async () => {
  seed(threeDays);
  const controller = new AbortController();
  vi.mocked(fetchWithSessionRefresh).mockImplementationOnce(async () => {
    controller.abort();
    return Response.json(updated);
  });
  expect(await fetchAlbumPlays(controller.signal)).toEqual(stored);
  expect(localStorage.getItem(cacheKey)).toBe(JSON.stringify(stored));
});

it('does not extend the snapshot lifetime when an actual play is acknowledged', async () => {
  seed(threeDays - 1);
  const stamp = localStorage.getItem(syncKey);
  vi.mocked(fetchWithSessionRefresh).mockResolvedValueOnce(Response.json({ albumId: 'cache-policy', playCount: 43 }));
  const reporter = createAlbumPlayReporter();
  reporter.select('cache-policy', '/track.mp3');
  await reporter.playing();
  expect(localStorage.getItem(syncKey)).toBe(stamp);
  expect(await fetchAlbumPlays()).toContainEqual({ albumId: 'cache-policy', playCount: 43 });
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});
