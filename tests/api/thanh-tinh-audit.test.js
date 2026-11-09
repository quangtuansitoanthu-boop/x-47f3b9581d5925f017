import { expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';

const origin = 'http://localhost:8787';
function call(path, method = 'GET', headers = {}, session = null) {
  return handleApiRequest({ request: new Request(`${origin}${path}`, {
    method, headers: { origin, 'content-type': 'application/json', 'x-csrf-token': 'public', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify({ clientId: 'audit-client-unique', streakDays: 2, resistedDelta: 1 }) } : {}),
  }), locals: { env: { ...env, APP_ORIGIN: origin }, session, migrationSealed: true } });
}

it('serves cacheable community stats and guards writes and the admin participant list', async () => {
  const stats = await call('/api/thanh-tinh/stats');
  expect(stats.status).toBe(200);
  expect(stats.headers.get('cache-control')).toContain('max-age=300');
  expect(await stats.json()).toMatchObject({ participantCount: expect.any(Number), totalDaysClean: expect.any(Number) });
  for (const path of ['/api/thanh-tinh/pledge', '/api/thanh-tinh/sync']) {
    expect((await call(path, 'POST', { origin: 'https://untrusted.example' })).status).toBe(403);
    expect((await call(path, 'GET')).status).toBe(405);
  }
  expect((await call('/api/admin/thanh-tinh/participants')).status).toBe(401);
  expect((await call('/api/admin/thanh-tinh/participants', 'GET', {}, { role: 'user', appUserId: 'qa-member' })).status).toBe(403);
  expect((await call('/api/admin/thanh-tinh/participants', 'GET', {}, { role: 'admin', appUserId: 'qa-admin' })).status).toBe(200);
});
