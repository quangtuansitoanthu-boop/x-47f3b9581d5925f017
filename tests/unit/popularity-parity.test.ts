import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchAlbumPlays, createAlbumPlayReporter } from '../../src/lib/browser/album-plays';
import { flushPendingArticleViews, queuePendingView, readPendingViews, recordArticleView } from '../../src/lib/browser/article-views-outbox';
import { fetchNativeJsonMutation } from '../../src/lib/browser/native-api';
import { fetchWithSessionRefresh, getBrowserSession } from '../../src/lib/browser/session-csrf';
import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '../../src/lib/stores/session.svelte';

const viewEvents = new EventTarget();

vi.mock('../../src/lib/browser/native-api', () => ({
  fetchNativeJsonMutation: vi.fn(), isHtmlResponse: () => false,
}));
vi.mock('../../src/lib/browser/session-csrf', () => ({
  fetchWithSessionRefresh: vi.fn(),
  getBrowserSession: vi.fn(async () => ({ authenticated: false, csrfToken: null })),
  hasUsableBrowserCsrf: (token: unknown) => typeof token === 'string' && token.length > 0 && token !== 'mobile-session-token',
}));
vi.mock('../../src/lib/stores/session.svelte', () => ({
  getBrowserSessionSnapshot: vi.fn(), SESSION_CHANGE_EVENT: 'quangtu:session-changed',
}));
beforeEach(() => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(viewEvents.dispatchEvent.bind(viewEvents)),
    addEventListener: vi.fn(viewEvents.addEventListener.bind(viewEvents)),
    removeEventListener: vi.fn(viewEvents.removeEventListener.bind(viewEvents)),
  });
  vi.mocked(getBrowserSessionSnapshot).mockReturnValue({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(null);
});

it('retains authenticated views without a live nonce and wakes once when the same session becomes authoritative', async () => {
  const profile = { authenticated: true, user: { id: 'reader-view', email: 'reader@example.test', displayName: 'Reader', avatarUrl: '', role: 'user' as const }, csrfToken: null, expiresAt: '2099-01-01T00:00:00Z' };
  vi.mocked(getBrowserSessionSnapshot).mockReturnValue(profile);
  vi.mocked(getBrowserSession).mockResolvedValue(profile);
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(Response.json({ so_luot: 77 }));

  expect(await recordArticleView('pending-authoritative-view')).toBeNull();
  const queued = readPendingViews();
  expect(queued.map(item => item.articleId)).toEqual(['pending-authoritative-view']);
  expect(await flushPendingArticleViews()).toBe(0);
  expect(readPendingViews()).toEqual(queued);
  expect(fetchNativeJsonMutation).not.toHaveBeenCalled();
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
  expect(getBrowserSession).not.toHaveBeenCalled();

  vi.mocked(getBrowserSessionSnapshot).mockReturnValue({ ...profile, csrfToken: 'live-reader-nonce' });
  viewEvents.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  await vi.waitFor(() => expect(readPendingViews()).toEqual([]));
  expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(1);
  expect(fetchNativeJsonMutation).toHaveBeenCalledWith('/api/articles/pending-authoritative-view/views', expect.objectContaining({ headers: { 'x-csrf-token': 'live-reader-nonce' } }));
  viewEvents.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  await Promise.resolve();
  expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(1);
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

it('reuses native totals for three days without requesting a newer aggregate', async () => {
  localStorage.setItem('quangtu_album_plays_cache', JSON.stringify([{ albumId: 'live', playCount: 2 }]));
  localStorage.setItem('quangtu_album_plays_last_sync_time', String(Date.now()));
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(new Response(JSON.stringify([{ albumId: 'live', playCount: 37 }])));
  expect(await fetchAlbumPlays()).toEqual([{ albumId: 'live', playCount: 2 }]);
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
});

it('keeps server totals when the offline cache cannot be written', async () => {
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(new Response(JSON.stringify([{ albumId: 'live-quota', playCount: 674 }])));
  expect(await fetchAlbumPlays()).toEqual([{ albumId: 'live-quota', playCount: 674 }]);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('retains web totals after a network failure instead of replacing them with zero', async () => {
  localStorage.setItem('quangtu_album_plays_cache', JSON.stringify([{ albumId: 'cached-network', playCount: 663 }]));
  vi.mocked(fetchWithSessionRefresh).mockRejectedValue(new TypeError('Network failed'));
  expect(await fetchAlbumPlays()).toEqual([{ albumId: 'cached-network', playCount: 663 }]);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('counts actual native playback once through the existing native mutation transport', async () => {
  vi.mocked(fetchNativeJsonMutation).mockImplementation(async () => new Response(JSON.stringify({ albumId: 'native', playCount: 9 })));
  const reporter = createAlbumPlayReporter();
  reporter.select('native', '/track.mp3');
  await Promise.all([reporter.playing(), reporter.playing()]);
  await reporter.playing();
  expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(1);
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
  reporter.ended();
  await reporter.playing();
  expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(2);
});

it('does not send or retain offline album plays for later replay', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const reporter = createAlbumPlayReporter();
  reporter.select('offline', '/download.mp3');
  await reporter.playing();
  vi.stubGlobal('navigator', { onLine: true });
  await reporter.playing();
  expect(fetchNativeJsonMutation).not.toHaveBeenCalled();
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
});

it('records a native book view with Origin-safe transport and keeps session deduplication', async () => {
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(new Response(JSON.stringify({ so_luot: 42 })));
  expect(await recordArticleView('book-native')).toBe(42);
  expect(await recordArticleView('book-native')).toBeNull();
  expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(1);
  expect(fetchNativeJsonMutation).toHaveBeenCalledWith('/api/articles/book-native/views', expect.objectContaining({ method: 'POST' }));
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
});

it('retains the last server total offline without a GET', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  localStorage.setItem('quangtu_album_plays_cache', JSON.stringify([{ albumId: 'offline-total', playCount: 63 }]));
  expect(await fetchAlbumPlays()).toContainEqual({ albumId: 'offline-total', playCount: 63 });
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
});

it('keeps web book views on the existing session transport', async () => {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => false });
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(new Response(JSON.stringify({ so_luot: 72 })));
  expect(await recordArticleView('book-web')).toBe(72);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
});

it('records a book view when session storage reads are blocked', async () => {
  vi.stubGlobal('sessionStorage', { getItem: () => { throw new DOMException('Blocked', 'SecurityError'); } });
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(Response.json({ so_luot: 43 }));

  expect(await recordArticleView('book-blocked-session')).toBe(43);
  expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(1);
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
  expect(readPendingViews()).toEqual([]);
});

it('queues an offline book view when session storage reads are blocked', async () => {
  vi.stubGlobal('sessionStorage', { getItem: () => { throw new DOMException('Blocked', 'SecurityError'); } });
  vi.stubGlobal('navigator', { onLine: false });

  expect(await recordArticleView('offline-blocked-session')).toBeNull();
  expect(readPendingViews().map(view => view.articleId)).toEqual(['offline-blocked-session']);
  expect(fetchNativeJsonMutation).not.toHaveBeenCalled();
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
});

it('preserves views queued while an earlier flush awaits its acknowledgement', async () => {
  let acknowledge!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { acknowledge = resolve; });
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(null);
  vi.mocked(fetchWithSessionRefresh).mockReturnValueOnce(response);
  queuePendingView('queued-first');
  const flushing = flushPendingArticleViews();
  await vi.waitFor(() => expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1));
  queuePendingView('queued-during-flush');
  acknowledge(Response.json({ so_luot: 1 }));
  expect(await flushing).toBe(1);
  expect(readPendingViews().map(view => view.articleId)).toEqual(['queued-during-flush']);
  vi.mocked(fetchWithSessionRefresh).mockResolvedValueOnce(Response.json({ so_luot: 2 }));
  expect(await flushPendingArticleViews()).toBe(1);
  expect(readPendingViews()).toEqual([]);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(2);
});

it('stops after the first failed view while preserving acknowledged and newly queued views', async () => {
  let acknowledge!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { acknowledge = resolve; });
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(null);
  vi.mocked(fetchWithSessionRefresh).mockResolvedValueOnce(Response.json({ so_luot: 1 }))
    .mockReturnValueOnce(response)
    .mockResolvedValue(new Response('', { status: 503 }));
  queuePendingView('acknowledged');
  queuePendingView('failed');
  queuePendingView('not-attempted');
  const flushing = flushPendingArticleViews();
  await vi.waitFor(() => expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(2));
  queuePendingView('new');
  acknowledge(new Response('', { status: 503 }));
  expect(await flushing).toBe(1);
  expect(readPendingViews().map(view => view.articleId)).toEqual(['not-attempted', 'new', 'failed']);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(2);
});

it('makes only one failed request for a full pending-view queue and keeps every entry', async () => {
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(null);
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(new Response('', { status: 503 }));
  for (let index = 0; index < 500; index++) queuePendingView(`offline-book-${index}`);
  const pending = readPendingViews();

  expect(await flushPendingArticleViews()).toBe(0);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
  expect(readPendingViews()).toEqual([...pending.slice(1), pending[0]]);
});

it('lets a later valid article flush next time without dropping a permanently failing view', async () => {
  vi.mocked(fetchNativeJsonMutation).mockResolvedValue(null);
  vi.mocked(fetchWithSessionRefresh).mockResolvedValueOnce(new Response('', { status: 500 }));
  queuePendingView('deleted-article');
  queuePendingView('valid-article');
  const deleted = readPendingViews()[0];

  expect(await flushPendingArticleViews()).toBe(0);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
  expect(readPendingViews().map(view => view.articleId)).toEqual(['valid-article', 'deleted-article']);

  vi.mocked(fetchWithSessionRefresh).mockResolvedValueOnce(Response.json({ so_luot: 7 }))
    .mockResolvedValueOnce(new Response('', { status: 500 }));
  expect(await flushPendingArticleViews()).toBe(1);
  expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(3);
  expect(fetchWithSessionRefresh).toHaveBeenNthCalledWith(2, '/api/articles/valid-article/views', expect.anything());
  expect(readPendingViews()).toEqual([deleted]);
});

it('does not retry an uncertain native play on another transport and reuses its UUID', async () => {
  vi.mocked(fetchNativeJsonMutation).mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ albumId: 'retry-native', playCount: 5 })));
  const reporter = createAlbumPlayReporter();
  reporter.select('retry-native', '/retry.mp3');
  await reporter.playing();
  await reporter.playing();
  expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(2);
  expect(fetchNativeJsonMutation).toHaveBeenNthCalledWith(2,
    ...vi.mocked(fetchNativeJsonMutation).mock.calls[0]);
  const payload = JSON.parse(String(vi.mocked(fetchNativeJsonMutation).mock.calls[0][1].body));
  expect(payload.playbackId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
});
