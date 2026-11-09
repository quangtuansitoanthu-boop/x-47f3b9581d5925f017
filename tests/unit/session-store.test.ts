import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithSessionRefresh, getBrowserSession, requireBrowserCsrf } from '$lib/browser/session-csrf';
import { isNativeApp } from '$lib/browser/native-platform';
import { selectTalkCatalogPrincipal } from '$lib/browser/talk-catalog-cache';
vi.mock('$lib/browser/native-platform', async importOriginal => ({
  ...await importOriginal<typeof import('$lib/browser/native-platform')>(),
  isNativeApp: vi.fn(() => false),
}));
import {
  applyBrowserSession,
  createSessionStore,
  saveLocalSession,
  registerBrowserSessionStore,
  type SessionStore,
} from '$lib/stores/session.svelte';

const authenticatedSession = {
  authenticated: true as const,
  user: {
    id: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    avatarUrl: '',
    role: 'admin' as const,
  },
  csrfToken: 'csrf-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

let unregister: (() => void) | null = null;

afterEach(() => {
  vi.mocked(isNativeApp).mockReturnValue(false);
  unregister?.();
  unregister = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function register(store: SessionStore): void {
  Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
  unregister = registerBrowserSessionStore(store);
}

describe('browser session store', () => {
  it.each(['verified-web-guest', 'cached-native-admin', 'unresolved-native-guest'] as const)(
    'only a verified initial identity purges the previous private catalog: %s', async scenario => {
      vi.mocked(isNativeApp).mockReturnValue(scenario !== 'verified-web-guest');
      const rows = [{ id: 'public', visibility: 'public' }, { id: 'private', visibility: 'private' }];
      const storage = new Map<string, string>([
        ['quangtu_cached_talk_catalog_v1', JSON.stringify(rows)],
        ['quangtu_talk_catalog_meta_v1', JSON.stringify({ albumCount: 2, privateOwnerId: 'previous-admin', privateOwnerRole: 'admin' })],
      ]);
      if (scenario === 'cached-native-admin') storage.set('tutam_native_session', JSON.stringify(authenticatedSession));
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      });
      vi.stubGlobal('navigator', { onLine: true });
      selectTalkCatalogPrincipal('previous-admin', 'admin', false);
      const fetcher = vi.fn(async () => new Response('', { status: 503 }));
      vi.stubGlobal('fetch', fetcher);
      const guest = { authenticated: false, user: null, csrfToken: null, expiresAt: null };
      const store = createSessionStore(guest, scenario === 'verified-web-guest');
      register(store);
      const expected = scenario === 'verified-web-guest' ? [rows[0]] : rows;
      expect(JSON.parse(storage.get('quangtu_cached_talk_catalog_v1')!)).toEqual(expected);
      expect(fetcher).not.toHaveBeenCalled();
      if (scenario === 'verified-web-guest') {
        expect(JSON.parse(storage.get('quangtu_talk_catalog_meta_v1')!)).toMatchObject({ albumCount: 1, privateOwnerId: null, privateOwnerRole: null });
      } else {
        await store.refresh();
        store.deactivate();
        store.activate();
        expect(JSON.parse(storage.get('quangtu_cached_talk_catalog_v1')!)).toEqual(rows);
        expect(fetcher).toHaveBeenCalledOnce();
      }
    },
  );

  it('marks remembered native identity as cached and a failed refresh never presents it as verified', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...authenticatedSession, csrfToken: undefined }) });
    vi.stubGlobal('navigator', { onLine: true });
    const fetcher = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    expect(store.verification).toBe('cached');
    await store.refresh();
    expect(store.value.user?.id).toBe('admin');
    expect(store.verification).toBe('cached');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('uses a verified server guest without reviving a remembered native principal or fetching', () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...authenticatedSession, csrfToken: undefined }) });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const guest = { authenticated: false, user: null, csrfToken: null, expiresAt: null };
    const store = createSessionStore(guest, true);
    expect(store.value).toEqual(guest);
    expect(store.initialResolutionComplete).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not inherit another remembered account profile into a verified server principal', () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'tutam_native_session'
        ? JSON.stringify({ ...authenticatedSession, csrfToken: undefined, user: { ...authenticatedSession.user, avatarUrl: 'https://example.test/old-avatar.png' } })
        : null,
    });
    const next = { ...authenticatedSession, user: { ...authenticatedSession.user, id: 'server-account-B', displayName: 'Account B', email: 'b@example.test', role: 'user' as const } };
    const store = createSessionStore(next, true);
    expect(store.value).toEqual(next);
    expect(store.value.user?.avatarUrl).toBe('');
    expect(store.initialResolutionComplete).toBe(true);
  });

  it('exposes completion of the existing initial identity request without starting another request', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    expect(store.initialResolutionComplete).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    const resolving = store.refresh();
    expect(store.initialResolutionComplete).toBe(false);
    finish(Response.json(authenticatedSession));
    await resolving;
    expect(store.initialResolutionComplete).toBe(true);
    expect(store.value.user?.id).toBe('admin');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('releases initial guest queries when the existing session request cannot reach the server', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('localStorage', { getItem: () => null });
    const fetcher = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetcher);
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    await store.refresh();
    expect(store.initialResolutionComplete).toBe(true);
    expect(store.value.authenticated).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('applies native login reactively and announces the new principal', () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    register(store);
    const changed = vi.fn();
    window.addEventListener('quangtu:session-changed', changed);
    expect(applyBrowserSession(authenticatedSession)).toBe(true);
    expect(store.value).toMatchObject({ authenticated: true, user: { id: 'admin', role: 'admin' }, csrfToken: 'csrf-token' });
    expect(setItem).toHaveBeenCalledWith('tutam_native_session', expect.any(String));
    const persisted = setItem.mock.calls.find(call => call[0] === 'tutam_native_session')?.[1];
    expect(JSON.parse(persisted)).toEqual({
      authenticated: true, user: authenticatedSession.user, expiresAt: authenticatedSession.expiresAt,
    });
    expect(changed).toHaveBeenCalledOnce();
  });
  it('does not let an earlier session refresh overwrite a newer native login or its persisted cache', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    const store = createSessionStore(authenticatedSession);
    register(store);
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const refreshing = store.refresh();
    const next = { ...authenticatedSession, user: { ...authenticatedSession.user, id: 'new-native-account', role: 'user' as const } };
    applyBrowserSession(next);
    finish(Response.json(authenticatedSession));
    await refreshing;
    expect(store.value.user?.id).toBe('new-native-account');
    expect(JSON.parse(storage.get('tutam_native_session')!).user.id).toBe('new-native-account');
  });
  it('does not restore a remembered account into a cold web shell', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(authenticatedSession), removeItem });
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    expect(store.value.authenticated).toBe(false);
    expect(store.value.csrfToken).toBeNull();
    expect(removeItem).toHaveBeenCalledWith('tutam_native_session');
  });

  it('keeps web credentials in memory instead of persisting a native session cache', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem, removeItem: vi.fn() });
    saveLocalSession(authenticatedSession);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('still restores native account data for offline reading', () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(authenticatedSession) });
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    expect(store.value.user?.id).toBe('admin');
    expect(store.value.user?.role).toBe('admin');
    expect(store.value.expiresAt).toBe(authenticatedSession.expiresAt);
    expect(store.value.csrfToken).toBeNull();
  });

  it('removes a legacy persisted native CSRF while retaining the remembered account and expiry', () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    const storage = new Map([['tutam_native_session', JSON.stringify(authenticatedSession)]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    expect(store.value).toEqual({ ...authenticatedSession, csrfToken: null });
    expect(JSON.parse(storage.get('tutam_native_session')!)).toEqual({
      authenticated: true, user: authenticatedSession.user, expiresAt: authenticatedSession.expiresAt,
    });
  });

  it('shares the existing cold native refresh with a CSRF-requiring action and keeps the verified token in memory only', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    const storage = new Map([['tutam_native_session', JSON.stringify(authenticatedSession)]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal('navigator', { onLine: true });
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    register(store);
    expect(store.value.csrfToken).toBeNull();
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const refreshing = store.refresh();
    const actionToken = requireBrowserCsrf();
    finish(Response.json({ ...authenticatedSession, csrfToken: 'fresh-memory-only-csrf' }));
    await refreshing;
    await expect(actionToken).resolves.toBe('fresh-memory-only-csrf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.value.csrfToken).toBe('fresh-memory-only-csrf');
    expect(JSON.parse(storage.get('tutam_native_session')!)).not.toHaveProperty('csrfToken');
    expect(storage.get('tutam_native_session')).not.toContain('fresh-memory-only-csrf');
  });

  it('keeps a cold native remembered account without resurrecting legacy CSRF after a transient session failure', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    const storage = new Map([['tutam_native_session', JSON.stringify(authenticatedSession)]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal('navigator', { onLine: true });
    const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    const fetchMock = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await store.refresh();
    expect(store.value).toEqual({ ...authenticatedSession, csrfToken: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.get('tutam_native_session')!)).not.toHaveProperty('csrfToken');
  });

  it('uses a newly verified in-memory CSRF instead of issuing another refresh from an earlier tokenless snapshot', async () => {
    const store = createSessionStore({ ...authenticatedSession, csrfToken: null });
    register(store);
    const fetchMock = vi.fn().mockRejectedValue(new Error('Unnecessary refresh'));
    vi.stubGlobal('fetch', fetchMock);
    const actionToken = requireBrowserCsrf();
    store.set(authenticatedSession);
    await expect(actionToken).resolves.toBe(authenticatedSession.csrfToken);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['vi', 'Vui lòng thử lại'],
    ['en', 'Please try again'],
  ])('keeps the remembered member and offers retry in %s when an explicit action cannot refresh CSRF', async (locale, message) => {
    const store = createSessionStore({ ...authenticatedSession, csrfToken: null });
    register(store);
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'tutam_locale' ? locale : null });
    const fetchMock = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requireBrowserCsrf()).rejects.toThrow(message);
    expect(store.value.authenticated).toBe(true);
    expect(store.value.user?.id).toBe(authenticatedSession.user.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the login-required result when a CSRF refresh authoritatively rejects the session', async () => {
    const store = createSessionStore({ ...authenticatedSession, csrfToken: null });
    register(store);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(requireBrowserCsrf()).rejects.toThrow('Vui lòng đăng nhập lại');
    expect(store.value.authenticated).toBe(false);
  });

  it('migrates only the public avatar and uses it after the web server confirms the same account', () => {
    const avatarUrl = 'https://images.example.test/avatar.png';
    const storage = new Map([['tutam_native_session', JSON.stringify({
      ...authenticatedSession, user: { ...authenticatedSession.user, avatarUrl },
    })]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const guest = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
    expect(guest.value.authenticated).toBe(false);
    expect(storage.has('tutam_native_session')).toBe(false);
    const verified = createSessionStore(authenticatedSession);
    expect(verified.value.user?.avatarUrl).toBe(avatarUrl);
    expect([...storage.values()]).toEqual([avatarUrl]);
    const other = createSessionStore({ ...authenticatedSession, user: { ...authenticatedSession.user, id: 'another-account' } });
    expect(other.value.user?.avatarUrl).toBe('');
  });

  it('keeps the Google avatar when the same account refreshes with a blank photo', async () => {
    const avatarUrl = 'https://lh3.googleusercontent.com/test-photo';
    const store = createSessionStore({ ...authenticatedSession, user: { ...authenticatedSession.user, avatarUrl } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(authenticatedSession), {
      headers: { 'content-type': 'application/json' },
    })));
    await store.refresh();
    expect(store.value.user?.avatarUrl).toBe(avatarUrl);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('replaces the avatar when Google supplies a new photo', () => {
    const store = createSessionStore({ ...authenticatedSession, user: { ...authenticatedSession.user, avatarUrl: 'old-photo' } });
    store.set({ ...authenticatedSession, user: { ...authenticatedSession.user, avatarUrl: 'new-photo' } });
    expect(store.value.user?.avatarUrl).toBe('new-photo');
  });

  it('never carries an avatar into a different account or a guest session', () => {
    const store = createSessionStore({ ...authenticatedSession, user: { ...authenticatedSession.user, avatarUrl: 'private-photo' } });
    store.set({ ...authenticatedSession, user: { ...authenticatedSession.user, id: 'another-user' } });
    expect(store.value.user?.avatarUrl).toBe('');
    store.clear();
    expect(store.value.user).toBeNull();
  });

  it('accepts a Google picture alias when avatarUrl is empty', () => {
    const store = createSessionStore({ ...authenticatedSession, user: { ...authenticatedSession.user, picture: 'google-photo' } } as typeof authenticatedSession);
    expect(store.value.user?.avatarUrl).toBe('google-photo');
  });

  it('reads the URL from a legacy Facebook picture object', () => {
    const avatarUrl = 'https://platform-lookaside.fbsbx.com/test-avatar';
    const store = createSessionStore({ ...authenticatedSession,
      user: { ...authenticatedSession.user, picture: { data: { url: avatarUrl } } },
    } as typeof authenticatedSession);
    expect(store.value.user?.avatarUrl).toBe(avatarUrl);
  });

  it('skips blank or malformed picture aliases before a valid provider photo', () => {
    const avatarUrl = 'https://lh3.googleusercontent.com/test-avatar';
    const store = createSessionStore({ ...authenticatedSession,
      user: { ...authenticatedSession.user, avatarUrl: '  ', picture: { data: {} }, imageUrl: avatarUrl },
    } as typeof authenticatedSession);
    expect(store.value.user?.avatarUrl).toBe(avatarUrl);
  });

  it('reuses the hydrated session without requesting /api/session', async () => {
    const store = createSessionStore(authenticatedSession);
    register(store);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBrowserSession()).resolves.toEqual(authenticatedSession);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes the in-memory session after a protected request returns 401', async () => {
    const store = createSessionStore(authenticatedSession);
    register(store);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithSessionRefresh('/api/protected');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/protected', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/session', expect.objectContaining({ cache: 'no-store' }));
    expect(store.value.authenticated).toBe(false);
  });
});

for (const native of [false, true]) {
  it.each([
    () => new Response('unavailable', { status: 503 }),
    () => new Response('<html>challenge</html>', { status: 403, headers: { 'content-type': 'text/html' } }),
    () => Response.json({ ok: true }),
    () => new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }),
  ])('keeps the existing account after a transient session response (native='+native+')', async (response) => {
    vi.mocked(isNativeApp).mockReturnValue(native);
    const storage = new Map([['tutam_native_session', JSON.stringify(authenticatedSession)]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    vi.stubGlobal('navigator', { onLine: true });
    const store = createSessionStore(authenticatedSession);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    await store.refresh();
    expect(store.value).toMatchObject({ authenticated: true, user: { id: 'admin' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    if (native) expect(storage.has('tutam_native_session')).toBe(true);
    else expect(storage.has('tutam_native_session')).toBe(false);
  });
  it.each([401, 200])('clears a revoked account after authoritative session response '+native+'/%s', async (status) => {
    vi.mocked(isNativeApp).mockReturnValue(native);
    const storage = new Map([['tutam_native_session', JSON.stringify(authenticatedSession)]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    vi.stubGlobal('navigator', { onLine: true });
    const store = createSessionStore(authenticatedSession);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ authenticated: false }, { status })));
    await store.refresh();
    expect(store.value.authenticated).toBe(false);
    expect(storage.has('tutam_native_session')).toBe(false);
  });
}
