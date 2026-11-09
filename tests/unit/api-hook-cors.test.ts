import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), sealed: vi.fn() }));
vi.mock('../../src/lib/server/auth/sessions', () => ({ loadSession: mocks.session }));
vi.mock('../../src/lib/server/http/runtime', () => ({ migrationIsSealed: mocks.sealed }));
import { handle } from '../../src/hooks.server';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.sealed.mockResolvedValue(true);
});

function event(path: string, method: string, origin: string) {
  return { request: new Request(`https://quangtu.vn${path}`, { method, headers: { origin } }),
    platform: { env: {} }, locals: {} } as never;
}

it.each(['/api/auth/native-verify', '/api/app/stats', '/api/articles'])('answers native preflight for %s before route resolution or database guards', async path => {
  const resolve = vi.fn(async () => new Response(null, { status: 405 }));
  const response = await handle({ event: event(path, 'OPTIONS', 'capacitor://localhost'), resolve });
  expect(response.status).toBe(204);
  expect(response.headers.get('x-request-id')).toBeTruthy();
  expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  expect(response.headers.get('access-control-allow-headers')).toContain('X-CSRF-Token');
  expect(resolve).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.sealed).not.toHaveBeenCalled();
});

it.each([200, 400, 401, 403, 503])('preserves native POST response status %i, cookie and body while applying the existing CORS policy', async status => {
  const resolve = vi.fn(async () => new Response(JSON.stringify({ status }), {
    status, headers: { 'set-cookie': 'session=test; HttpOnly; Secure', 'cache-control': 'no-store' },
  }));
  const response = await handle({ event: event('/api/auth/native-verify', 'POST', 'https://localhost'), resolve });
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ status });
  expect(response.headers.get('set-cookie')).toBe('session=test; HttpOnly; Secure');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe('https://localhost');
  expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(mocks.sealed).toHaveBeenCalledTimes(1);
  expect(mocks.session).toHaveBeenCalledTimes(1);
});

it('applies CORS to the specific public stats route without adding session work', async () => {
  const response = await handle({ event: event('/api/app/stats', 'GET', 'capacitor://localhost'),
    resolve: async () => Response.json({ total: 1 }) });
  expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
  expect(await response.json()).toEqual({ total: 1 });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.sealed).toHaveBeenCalledTimes(1);
});

it.each(['https://untrusted.example', 'null'])('does not grant credentialed API response access to untrusted origin %s', async origin => {
  const response = await handle({ event: event('/api/auth/native-verify', 'POST', origin),
    resolve: async () => new Response('denied', { status: 403 }) });
  expect(response.status).toBe(403);
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
  expect(response.headers.has('access-control-allow-credentials')).toBe(false);
});

it('does not intercept OPTIONS or add native CORS outside API routes', async () => {
  const resolve = vi.fn(async () => new Response(null, { status: 405 }));
  const response = await handle({ event: event('/login', 'OPTIONS', 'capacitor://localhost'), resolve });
  expect(response.status).toBe(405);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
});
