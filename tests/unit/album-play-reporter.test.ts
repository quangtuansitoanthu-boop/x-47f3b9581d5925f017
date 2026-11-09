import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAlbumPlayReporter, fetchAlbumPlays } from '../../src/lib/browser/album-plays';
import { fetchWithSessionRefresh, getBrowserSession } from '../../src/lib/browser/session-csrf';

const sessionState = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('../../src/lib/browser/session-csrf', () => ({
  fetchWithSessionRefresh: vi.fn(), getBrowserSession: vi.fn(),
  hasUsableBrowserCsrf: (token: unknown) => typeof token === 'string' && token.length > 0 && token !== 'mobile-session-token',
}));
vi.mock('../../src/lib/stores/session.svelte', () => ({
  SESSION_CHANGE_EVENT: 'quangtu:session-changed',
  getBrowserSessionSnapshot: sessionState.snapshot,
}));
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('window', new EventTarget());
  vi.mocked(getBrowserSession).mockResolvedValue({ authenticated: false, user: null, csrfToken: null });
  sessionState.snapshot.mockReturnValue({ authenticated: false, user: null, csrfToken: null });
  vi.mocked(fetchWithSessionRefresh).mockImplementation(async () => new Response(JSON.stringify({ albumId: 'a', playCount: 1 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const payloads = () => vi.mocked(fetchWithSessionRefresh).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
const member = (csrfToken: string | null, id = 'member') => ({
  authenticated: true, csrfToken, expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id, email: 'member@example.test', displayName: 'Member', avatarUrl: '', role: 'user' as const },
});
const sessionChanged = () => window.dispatchEvent(new CustomEvent('quangtu:session-changed', { detail: sessionState.snapshot() }));

describe('track play reporting', () => {
  it.each([null, '', 'mobile-session-token'])('waits for verified credentials instead of posting authenticated play with %s', async csrfToken => {
    vi.mocked(getBrowserSession).mockResolvedValue(member(csrfToken));
    sessionState.snapshot.mockReturnValue(member(csrfToken));
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
    expect(getBrowserSession).toHaveBeenCalledTimes(1);

    sessionState.snapshot.mockReturnValue(member('verified-nonce'));
    sessionChanged();
    await vi.waitFor(() => expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1));
    expect(new Headers(vi.mocked(fetchWithSessionRefresh).mock.calls[0][1]?.headers).get('x-csrf-token')).toBe('verified-nonce');
    expect(payloads()[0]).toMatchObject({ trackUrl: '/one.mp3' });
    sessionChanged();
    await reporter.playing();
    expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
    reporter.reset();
  });

  it('uses a nonce verified while the original session read was pending without another session read', async () => {
    let resolve!: (session: Awaited<ReturnType<typeof getBrowserSession>>) => void;
    vi.mocked(getBrowserSession).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    const pending = reporter.playing();
    sessionState.snapshot.mockReturnValue(member('already-verified-nonce'));
    sessionChanged();
    resolve(member(null));
    await pending;
    expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
    expect(new Headers(vi.mocked(fetchWithSessionRefresh).mock.calls[0][1]?.headers).get('x-csrf-token')).toBe('already-verified-nonce');
    expect(getBrowserSession).toHaveBeenCalledTimes(1);
    reporter.reset();
  });

  it('does not revive the deferred track after the selected source changes', async () => {
    vi.mocked(getBrowserSession).mockResolvedValue(member(null));
    sessionState.snapshot.mockReturnValue(member(null));
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    reporter.select('a', '/two.mp3');
    sessionState.snapshot.mockReturnValue(member('verified-nonce'));
    sessionChanged();
    await Promise.resolve();
    expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
    await reporter.playing();
    expect(payloads()).toHaveLength(1);
    expect(payloads()[0].trackUrl).toBe('/two.mp3');
    reporter.reset();
  });

  it('drops a deferred authenticated play when the verified principal changes', async () => {
    vi.mocked(getBrowserSession).mockResolvedValue(member(null));
    sessionState.snapshot.mockReturnValue(member(null));
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    sessionState.snapshot.mockReturnValue(member('other-nonce', 'other-member'));
    sessionChanged();
    await Promise.resolve();
    await reporter.playing();
    expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
    reporter.reset();
  });

  it('does not convert a pending authenticated cycle into a public play before the session event arrives', async () => {
    vi.mocked(getBrowserSession).mockResolvedValue(member(null));
    sessionState.snapshot.mockReturnValue(member(null));
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    vi.mocked(getBrowserSession).mockResolvedValue({ authenticated: false, user: null, csrfToken: null });
    await reporter.playing();
    expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
    reporter.reset();
  });

  it.each(['reset', 'ended'] as const)('removes deferred session wakeups on %s', async action => {
    vi.mocked(getBrowserSession).mockResolvedValue(member(null));
    sessionState.snapshot.mockReturnValue(member(null));
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    expect(add).toHaveBeenCalledTimes(1);
    reporter[action]();
    expect(remove).toHaveBeenCalledTimes(1);
    sessionState.snapshot.mockReturnValue(member('verified-nonce'));
    sessionChanged();
    await Promise.resolve();
    expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
    reporter.reset();
  });

  it('keeps the acknowledged count in the cached catalog without another GET', async () => {
    localStorage.setItem('quangtu_album_plays_cache', JSON.stringify([{ albumId: 'cached-ack', playCount: 3 }]));
    localStorage.setItem('quangtu_album_plays_last_sync_time', String(Date.now()));
    vi.mocked(fetchWithSessionRefresh).mockResolvedValueOnce(new Response(JSON.stringify({ albumId: 'cached-ack', playCount: 4 })));
    const reporter = createAlbumPlayReporter();
    reporter.select('cached-ack', '/one.mp3');
    await reporter.playing();
    expect(JSON.parse(localStorage.getItem('quangtu_album_plays_cache')!)).toContainEqual({ albumId: 'cached-ack', playCount: 4 });
    expect(fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not let an older aggregate response overwrite a newer play acknowledgement', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetchWithSessionRefresh).mockImplementation(async path => path === '/api/album-plays'
      ? new Promise(r => resolve = r)
      : new Response(JSON.stringify({ albumId: 'pending-ack', playCount: 2 })));
    const totals = fetchAlbumPlays();
    const reporter = createAlbumPlayReporter();
    reporter.select('pending-ack', '/one.mp3');
    await reporter.playing();
    resolve(new Response(JSON.stringify([{ albumId: 'pending-ack', playCount: 1 }])));
    expect(await totals).toContainEqual({ albumId: 'pending-ack', playCount: 2 });
  });
  it('counts different tracks immediately and replays only after ended', async () => {
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    expect(fetchWithSessionRefresh).not.toHaveBeenCalled();
    await Promise.all([reporter.playing(), reporter.playing()]);
    await reporter.playing();
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    expect(payloads()).toHaveLength(1);
    reporter.select('a', '/two.mp3');
    await reporter.playing();
    expect(payloads()).toHaveLength(2);
    reporter.ended();
    expect(payloads()).toHaveLength(2);
    await reporter.playing();
    expect(payloads()).toHaveLength(3);
    expect(payloads().map((p) => p.trackUrl)).toEqual(['/one.mp3', '/two.mp3', '/two.mp3']);
    expect(new Set(payloads().map((p) => p.playbackId)).size).toBe(3);
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    expect(payloads()).toHaveLength(3);
  });
  it('retries uncertain network results with the same event ID without throwing', async () => {
    vi.mocked(fetchWithSessionRefresh).mockRejectedValueOnce(new Error('offline'));
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    await expect(reporter.playing()).resolves.toBeUndefined();
    await reporter.playing();
    expect(payloads()).toHaveLength(2);
    expect(payloads()[0]).toEqual(payloads()[1]);
  });
  it('lets replay start while the previous play request is pending', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetchWithSessionRefresh).mockImplementationOnce(() => new Promise((r) => resolve = r));
    const reporter = createAlbumPlayReporter();
    reporter.select('a', '/one.mp3');
    const first = reporter.playing();
    await vi.waitFor(() => expect(payloads()).toHaveLength(1));
    reporter.ended();
    await reporter.playing();
    expect(payloads()).toHaveLength(2);
    expect(payloads()[0].playbackId).not.toBe(payloads()[1].playbackId);
    resolve(new Response('{}'));
    await first;
    await reporter.playing();
    expect(payloads()).toHaveLength(2);
  });
  it('resets cycles for a different account and sends nothing without selection', async () => {
    const reporter = createAlbumPlayReporter();
    await reporter.playing();
    expect(payloads()).toHaveLength(0);
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    reporter.reset();
    await reporter.playing();
    expect(payloads()).toHaveLength(1);
    reporter.select('a', '/one.mp3');
    await reporter.playing();
    expect(payloads()).toHaveLength(2);
    expect(payloads()[0].playbackId).not.toBe(payloads()[1].playbackId);
  });
});
