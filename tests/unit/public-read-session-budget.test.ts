import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), sealed: vi.fn() }));
vi.mock('../../src/lib/server/auth/sessions', () => ({ loadSession: mocks.load }));
vi.mock('../../src/lib/server/http/runtime', () => ({ migrationIsSealed: mocks.sealed }));
import { handle } from '../../src/hooks.server';
beforeEach(() => { mocks.load.mockReset().mockResolvedValue(null); mocks.sealed.mockReset().mockResolvedValue(true); });
it.each(['/api/app/stats', '/api/album-plays'])('avoids the session database lookup for explicitly public GET %s', async path => {
  await handle({ event: { request: new Request(`https://quangtu.vn${path}`), platform: { env: {} }, locals: {} } as never,
    resolve: async () => new Response('ok') });
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.sealed).toHaveBeenCalledTimes(1);
});
it.each(['/api/personal-events', '/api/articles', '/api/talks', '/api/practice/progress'])('still checks session for private or role-dependent GET %s', async path => {
  await handle({ event: { request: new Request(`https://quangtu.vn${path}`), platform: { env: {} }, locals: {} } as never,
    resolve: async () => new Response('ok') });
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it.each([undefined, 'public, max-age=60'])('prevents authenticated HTML from becoming an offline public shell (%s)', async cacheControl => {
  mocks.load.mockResolvedValue({ userId: 'test-owner', role: 'user' });
  const response = await handle({
    event: { request: new Request('https://quangtu.vn/'), platform: { env: {} }, locals: {} } as never,
    resolve: async () => new Response('<html></html>', { headers: {
      'content-type': 'text/html', ...(cacheControl ? { 'cache-control': cacheControl } : {}),
    } }),
  });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
