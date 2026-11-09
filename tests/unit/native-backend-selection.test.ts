import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: vi.fn(() => ({ authenticated: false })) }));
import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
import { initUrlFallback, refreshRemoteOrigin } from '../../src/lib/browser/url-fallback';
import { beginNativeAuthMutation } from '../../src/lib/browser/native-auth-transaction';

it('keeps the cookie host fixed while native authentication is in flight', async () => {
  storage.set('quangtu_active_url', 'https://quangtu.vn');
  const release = beginNativeAuthMutation()!;
  try {
    await initUrlFallback();
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
  } finally { release(); }
});

it('ignores a pre-login host probe even when it returns after the auth transaction completes', async () => {
  storage.set('quangtu_active_url', 'https://quangtu.vn');
  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = initUrlFallback();
  const release = beginNativeAuthMutation()!; release();
  finish(new Response('down', { status: 503 }));
  await pending;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
});

const primary = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
let storage: Map<string, string>;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.mocked(getBrowserSessionSnapshot).mockReturnValue({ authenticated: false, user: null, csrfToken: null, expiresAt: null });
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  vi.stubGlobal('navigator', { onLine: true });
  fetcher = vi.fn(async () => Response.json({ ok: true, service: 'quangtu-worker', database: 'sealed' }));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe('native backend selection', () => {
  it('revalidates and migrates a recently saved Vercel redirect to the direct canonical backend', async () => {
    storage.set('quangtu_active_url', 'https://quangtu.vercel.app');
    storage.set('quangtu_origin_verified_at', String(Date.now()));
    await initUrlFallback();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://quangtu.vn/api/health');
    expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
  });
  it('does not choose a host whose health check redirects to another backend', async () => {
    const redirected = Response.json({ ok: true, service: 'quangtu-worker', database: 'sealed' });
    Object.defineProperty(redirected, 'redirected', { value: true });
    fetcher.mockResolvedValueOnce(redirected);
    await initUrlFallback();
    expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('never selects the Vercel redirect as a fallback when both direct backends are unavailable', async () => {
    fetcher.mockRejectedValue(new Error('unreachable'));
    await initUrlFallback();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(storage.has('quangtu_active_url')).toBe(false);
  });
  it('keeps the working saved API host so login cookies survive restart', async () => {
    storage.set('quangtu_active_url', 'https://quangtu.vn');
    await initUrlFallback();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://quangtu.vn/api/health');
    expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
  });
  it.each([
    () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }),
    () => Response.json({ ok: true, service: 'other-service', database: 'sealed' }),
    () => Response.json({ ok: true, service: 'quangtu-worker', database: 'unsealed' }),
    () => new Response('not JSON', { headers: { 'content-type': 'application/json' } }),
  ])('does not save a host that lacks a working app backend', async (badResponse) => {
    fetcher.mockImplementationOnce(async () => badResponse());
    await initUrlFallback();
    expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('fails over when the saved backend is down', async () => {
    storage.set('quangtu_active_url', 'https://quangtu.vn');
    fetcher.mockRejectedValueOnce(new Error('unreachable'));
    await initUrlFallback();
    expect(storage.get('quangtu_active_url')).toBe(primary);
  });
  it('leaves the saved backend unchanged while offline', async () => {
    storage.set('quangtu_active_url', 'https://quangtu.vn');
    vi.stubGlobal('navigator', { onLine: false });
    await initUrlFallback();
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
  });
});

it.each([initUrlFallback, refreshRemoteOrigin])('does not move a signed-in account to another host cookie jar', async (select) => {
  storage.set('quangtu_active_url', 'https://quangtu.vn');
  vi.mocked(getBrowserSessionSnapshot).mockReturnValue({ authenticated: true, user: { id: 'member', email: 'member@example.test', displayName: 'Member', avatarUrl: '', role: 'user' }, csrfToken: 'csrf', expiresAt: new Date(Date.now()+86400000).toISOString() });
  fetcher.mockRejectedValueOnce(new Error('temporary outage'));
  await select();
  expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['initUrlFallback', 'refreshRemoteOrigin'] as const)('%s drops a guest probe completed after login', async (name) => {
  vi.resetModules();
  const select = (await import('../../src/lib/browser/url-fallback'))[name];
  storage.set('quangtu_active_url', 'https://quangtu.vn');
  let finish!: (response: Response) => void;
  if (name === 'initUrlFallback') fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
  fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  const pending = select();
  const expectedProbes = name === 'initUrlFallback' ? 2 : 1;
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(expectedProbes));
  vi.mocked(getBrowserSessionSnapshot).mockReturnValue({ authenticated: true, user: { id: 'member', email: 'member@example.test', displayName: 'Member', avatarUrl: '', role: 'user' }, csrfToken: 'csrf', expiresAt: null });
  finish(Response.json({ ok: true, service: 'quangtu-worker', database: 'sealed' }));
  await pending;
  expect(storage.get('quangtu_active_url')).toBe('https://quangtu.vn');
  expect(storage.has('quangtu_origin_verified_at')).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(expectedProbes);
});

it.each(['initUrlFallback', 'refreshRemoteOrigin'] as const)('%s ignores a probe after another selection changed the saved host', async (name) => {
  vi.resetModules();
  const select = (await import('../../src/lib/browser/url-fallback'))[name];
  storage.set('quangtu_active_url', 'https://quangtu.vn');
  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  const pending = select();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  storage.set('quangtu_active_url', primary);
  storage.set('quangtu_origin_verified_at', 'newer-selection');
  finish(new Response(null, { status: 503 }));
  await pending;
  expect(storage.get('quangtu_active_url')).toBe(primary);
  expect(storage.get('quangtu_origin_verified_at')).toBe('newer-selection');
  expect(fetcher).toHaveBeenCalledOnce();
});
