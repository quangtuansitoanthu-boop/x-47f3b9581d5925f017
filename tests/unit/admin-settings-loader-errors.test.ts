import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { load } from '../../src/routes/admin/settings/+page';
import type { FacebookAdminData } from '../../src/lib/server/services/facebook-integration';

const system = { analyticsAvailable: true, mediaConfigured: false, presenceEnabled: true };
const facebook: FacebookAdminData = {
  configured: false,
  enabled: false,
  graphVersion: 'v23.0',
  settings: { sourceUrl: '', publishPolicy: 'review', updatedAt: '' },
  connection: null,
  imports: [],
  importsPage: { nextOffset: null, offset: 0 },
};
const endpoints = ['/api/admin/dashboard', '/api/admin/facebook'];
const parent = async () => ({ session: { authenticated: true, user: { id: 'admin-one', role: 'admin' } } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const success = (url: string) => json(url.endsWith('/dashboard') ? { system } : facebook);

describe('admin settings load error boundary', () => {
  for (const endpoint of endpoints) {
    it.each([401, 403])(`preserves authorization status %s from ${endpoint}`, async status => {
      const fetch = vi.fn(async (url: string) => url === endpoint ? json({}, status) : success(url));
      await expect(load({ fetch, parent } as never)).rejects.toSatisfy(cause => isHttpError(cause, status));
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each(['network', 'http', 'html', 'json'])(`surfaces %s failure from ${endpoint} instead of fabricating settings`, async failure => {
      const fetch = vi.fn(async (url: string) => {
        if (url !== endpoint) return success(url);
        if (failure === 'network') throw new TypeError('network unavailable');
        if (failure === 'http') return json({}, 500);
        if (failure === 'html') return new Response('<html>SPA fallback</html>', { headers: { 'content-type': 'text/html' } });
        return new Response('{', { headers: { 'content-type': 'application/json' } });
      });
      await expect(load({ fetch, parent } as never)).rejects.toSatisfy(cause => isHttpError(cause, 503));
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  }

  it('preserves live DTOs, principal scope and the existing two-request budget', async () => {
    const fetch = vi.fn(async (url: string) => success(url));
    await expect(load({ fetch, parent } as never)).resolves.toEqual({ system, facebook, ownerId: 'admin-one' });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const endpoint of endpoints) expect(fetch).toHaveBeenCalledWith(endpoint, {
      headers: { accept: 'application/json' }, credentials: 'include',
    });
  });
});
