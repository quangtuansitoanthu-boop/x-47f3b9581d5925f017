import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNetworkOnlyRequest } from '../../src/lib/pwa/service-worker-policy';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('root session hydration by build target', () => {
  it('uses the trusted web session without exposing internal credentials', async () => {
    vi.stubEnv('VITE_CAPACITOR_BUILD', '');
    const { load } = await import('../../src/routes/+layout.server');
    const setHeaders = vi.fn();
    const result = await load!({ setHeaders, locals: { session: {
      id: 'private-id', rawToken: 'private-token', appUserId: 'internal',
      userId: 'u1', email: 'u@example.com', displayName: 'User', avatarUrl: null,
      role: 'user', csrfToken: 'csrf', expiresAt: '2027-01-01', identityId: null, authProvider: null,
    } } } as Parameters<NonNullable<typeof load>>[0]);
    expect(result).toMatchObject({ sessionVerified: true, session: {
      authenticated: true, user: { id: 'u1' }, csrfToken: 'csrf',
    } });
    expect(JSON.stringify(result)).not.toMatch(/private-token|private-id|appUserId|identityId/);
    expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
  });

  it('verifies a web guest and keeps web SSR enabled', async () => {
    vi.stubEnv('VITE_CAPACITOR_BUILD', '');
    const { load } = await import('../../src/routes/+layout.server');
    const setHeaders = vi.fn();
    expect(await load!({ setHeaders, locals: { session: null } } as Parameters<NonNullable<typeof load>>[0]))
      .toMatchObject({ sessionVerified: true, session: { authenticated: false, user: null } });
    const headers = setHeaders.mock.calls[0][0];
    expect(headers['cache-control']).toBe('no-cache');
    expect(isNetworkOnlyRequest(new URL('https://quangtu.vn/huong-dan'), new Response('', { headers }))).toBe(false);
    expect((await import('../../src/routes/+layout')).ssr).toBe(true);
  });

  it('omits the native server load so an offline SPA needs no root __data.json', async () => {
    vi.stubEnv('VITE_CAPACITOR_BUILD', '1');
    expect((await import('../../src/routes/+layout.server')).load).toBeUndefined();
    expect((await import('../../src/routes/+layout')).ssr).toBe(false);
  });
});
