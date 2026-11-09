import { afterEach, expect, it, vi } from 'vitest';
vi.mock('$lib/browser/offline-pdf-resolver', () => ({ announceOfflinePdfPrincipal: vi.fn() }));
const platform = vi.hoisted(() => ({ native: true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => platform.native }));
import { createSessionStore, registerBrowserSessionStore, refreshBrowserSession } from '../../src/lib/stores/session.svelte';
import { beginNativeAuthMutation } from '$lib/browser/native-auth-transaction';

afterEach(() => { platform.native = true; vi.useRealTimers(); vi.unstubAllGlobals(); });

it('recovers a discarded startup session read after the native sign-in is cancelled without a local commit', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const account = { ...transactionSession(), csrfToken: 'fresh-csrf', expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(async () => Response.json(account))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const store = createSessionStore({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
  const unregister = registerBrowserSessionStore(store);
  const pending = store.refresh();
  const release = beginNativeAuthMutation()!;
  try {
    release();
    finish(Response.json({ authenticated: false, user: null })); await pending;
    await vi.waitFor(() => expect(store.value.csrfToken).toBe('fresh-csrf'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { release(); unregister(); }
});

it('performs the deferred post-auth read even when a pre-auth GET is still pending', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  let finishOld!: (response: Response) => void;
  const fetcher = vi.fn(async () => Response.json({ authenticated: false, user: null }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const account = { ...transactionSession(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  const store = createSessionStore(account);
  const unregister = registerBrowserSessionStore(store);
  const pending = store.refresh();
  const release = beginNativeAuthMutation()!;
  try {
    await refreshBrowserSession(); release();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(store.value.authenticated).toBe(false);
    finishOld(Response.json(account)); await pending;
    expect(store.value.authenticated).toBe(false);
  } finally { finishOld(Response.json(account)); release(); unregister(); await pending; }
});

it.each(['unchanged', 'replaced', 'unmounted'])('defers and deduplicates a requested 401 session refresh until native auth settles (%s)', async outcome => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const fetcher = vi.fn(async () => Response.json({ authenticated: false, user: null }));
  vi.stubGlobal('fetch', fetcher);
  const account = { ...transactionSession(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  const store = createSessionStore(account);
  const unregister = registerBrowserSessionStore(store);
  const release = beginNativeAuthMutation()!;
  try {
    await Promise.all([refreshBrowserSession(), refreshBrowserSession()]);
    expect(fetcher).not.toHaveBeenCalled();
    if (outcome === 'replaced') store.set({ ...account, user: { ...account.user, id: 'replacement' } });
    if (outcome === 'unmounted') unregister();
    release();
    if (outcome === 'unchanged') {
      await vi.waitFor(() => expect(store.value.authenticated).toBe(false));
      expect(fetcher).toHaveBeenCalledTimes(1);
    } else {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(fetcher).not.toHaveBeenCalled();
      expect(store.value.user?.id).toBe(outcome === 'replaced' ? 'replacement' : account.user.id);
    }
  } finally { release(); unregister(); }
});

it.each([1000, 2_147_005_000])('refreshes an online session at its future expiry after %i ms', async (delay) => {
  vi.useFakeTimers();
  const account = { authenticated: true, user: { id: 'online-user', email: 'member@example.test', displayName: 'Member', avatarUrl: '', role: 'user' as const }, csrfToken: 'current-csrf', expiresAt: new Date(Date.now() + delay).toISOString() };
  const refreshed = { ...account, csrfToken: 'refreshed-csrf', expiresAt: new Date(Date.now() + delay + 3_600_000).toISOString() };
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const fetcher = vi.fn(async () => Response.json(refreshed));
  vi.stubGlobal('fetch', fetcher);
  const store = createSessionStore(account);
  store.activate();
  try {
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.value.expiresAt).toBe(refreshed.expiresAt);
    expect(vi.getTimerCount()).toBe(1);
  } finally { store.deactivate(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('deduplicates a refresh at expiry and ignores its result after changing account', async () => {
  vi.useFakeTimers();
  const account = { authenticated: true, user: { id: 'first-user', email: 'first@example.test', displayName: 'First', avatarUrl: '', role: 'user' as const }, csrfToken: 'first-csrf', expiresAt: new Date(Date.now() + 1000).toISOString() };
  const next = { ...account, user: { ...account.user, id: 'next-user' }, csrfToken: 'next-csrf', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  let resolveResponse!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const store = createSessionStore(account);
  store.activate();
  try {
    const pending = store.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    store.set(next);
    resolveResponse(Response.json(account));
    await pending;
    expect(store.value.user?.id).toBe('next-user');
    expect(store.value.csrfToken === next.csrfToken).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  } finally { store.deactivate(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds retries when an offline native session has already expired', async () => {
  vi.useFakeTimers();
  const expired = { authenticated: true, user: { id: 'offline-user', email: 'member@example.test', displayName: 'Member', avatarUrl: '', role: 'user' as const }, csrfToken: 'cached-csrf', expiresAt: new Date(Date.now() - 1000).toISOString() };
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(expired), setItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const store = createSessionStore(expired);
  store.activate();
  try {
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.value.user?.id).toBe('offline-user');
    expect(vi.getTimerCount()).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { store.deactivate(); }
  expect(vi.getTimerCount()).toBe(0);
});

function transactionSession() {
  return { authenticated: true, user: { id: 'transaction-user', email: 'member@example.test', displayName: 'Member', avatarUrl: '', role: 'user' as const },
    csrfToken: 'transaction-csrf', expiresAt: new Date(Date.now() + 1000).toISOString() };
}

it('suppresses native session refresh during an auth mutation and permits refresh after release', async () => {
  const account = transactionSession();
  const refreshed = { ...account, csrfToken: 'after-mutation-csrf' };
  const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { onLine: true });
  const fetcher = vi.fn(async () => Response.json(refreshed));
  vi.stubGlobal('fetch', fetcher);
  const store = createSessionStore(account);
  const release = beginNativeAuthMutation();
  expect(release).not.toBeNull();
  try {
    expect(await store.refresh()).toMatchObject({ csrfToken: account.csrfToken });
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  } finally { release?.(); }
  expect(await store.refresh()).toMatchObject({ csrfToken: refreshed.csrfToken });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['guest', 'unauthorized', 'account'])('ignores a pre-mutation %s refresh receipt even after lock release without modifying persisted session', async kind => {
  const account = transactionSession();
  const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { onLine: true });
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const store = createSessionStore(account);
  const pending = store.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const release = beginNativeAuthMutation();
  expect(release).not.toBeNull();
  release?.();
  finish(kind === 'unauthorized' ? new Response(null, { status: 401 })
    : Response.json(kind === 'guest' ? { authenticated: false, user: null }
      : { ...account, user: { ...account.user, id: 'stale-account' }, csrfToken: 'stale-csrf' }));
  await pending;
  expect(store.value).toMatchObject({ user: { id: account.user.id }, csrfToken: account.csrfToken });
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(Response.json({ ...account, csrfToken: 'fresh-csrf' }));
  expect(await store.refresh()).toMatchObject({ csrfToken: 'fresh-csrf' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('keeps a bounded expiry retry when an auth mutation suppresses the expiry refresh', async () => {
  vi.useFakeTimers();
  const account = transactionSession();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const fetcher = vi.fn(async () => Response.json({ ...account, csrfToken: 'fresh-csrf', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
  vi.stubGlobal('fetch', fetcher);
  const store = createSessionStore(account);
  store.activate();
  const release = beginNativeAuthMutation();
  expect(release).not.toBeNull();
  try {
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    release?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.value.csrfToken).toBe('fresh-csrf');
  } finally { release?.(); store.deactivate(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves web session refresh behavior while a native mutation is held', async () => {
  const account = transactionSession();
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  const fetcher = vi.fn(async () => Response.json({ ...account, csrfToken: 'web-csrf' }));
  vi.stubGlobal('fetch', fetcher);
  const release = beginNativeAuthMutation();
  expect(release).not.toBeNull();
  platform.native = false;
  try {
    const store = createSessionStore(account);
    expect(await store.refresh()).toMatchObject({ csrfToken: 'web-csrf' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { release?.(); }
});
