import { beforeAll, beforeEach, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import receipts from '../../migrations/0045-notification-read-state.sql?raw';
import { createNotificationReadStateService } from '../../src/lib/server/services/notification-read-state.ts';
import { createNotificationReadStateRepository } from '../../src/lib/server/repositories/notification-read-state-repository.ts';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';
import { getNotificationState, saveNotificationState } from '../../src/lib/server/services/notification-state.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, receipts].map((sql, index) => ({
    name: `read-state-${index}.sql`, queries: sql.replace(/^\s*--.*$/gmu, '').split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`),
  })));
});
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM notification_read_receipts').run();
  await env.DB.prepare('DELETE FROM notification_state').run();
  await env.DB.prepare('DELETE FROM app_users').run();
  await env.DB.prepare("INSERT INTO app_users(id,display_name) VALUES('owner','Owner'),('other','Other')").run();
});
const service = (owner = 'owner', database = env.DB) => createNotificationReadStateService({ env: { ...env, DB: database }, principal: { appUserId: owner }, requestId: 'receipts' });
const session = { appUserId: 'owner', userId: 'owner', role: 'user', csrfToken: 'csrf' };
const dispatch = (method, headers = {}, principal = session, body = { ids: ['notice-1'] }, overrides = {}) => handleApiRequest({
  request: new Request(`https://app.test/api/notifications/read-state${method === 'GET' ? '?ids=notice-1' : ''}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  }), locals: { env: { ...env, APP_ORIGIN: 'https://app.test', ...overrides }, session: principal, migrationSealed: true, requestId: 'receipts' },
});

it('shares reads across devices of the same account without exposing another account', async () => {
  await service().write({ ids: ['notice-1', 'notice-2'] });
  expect(await service().read('notice-1,notice-2,notice-new')).toEqual({ readIds: ['notice-1', 'notice-2'] });
  expect(await service('other').read('notice-1,notice-2')).toEqual({ readIds: [] });
  expect((await env.DB.prepare('SELECT * FROM notification_read_receipts').all()).results.every(row => !('content' in row))).toBe(true);
});
it('unions concurrent device reads and makes repeated offline retries idempotent', async () => {
  await Promise.all([service().write({ ids: ['notice-1', 'notice-2'] }), service().write({ ids: ['notice-2', 'notice-3'] })]);
  const original = (await env.DB.prepare('SELECT * FROM notification_read_receipts ORDER BY notification_id').all()).results;
  await service().write({ ids: ['notice-1', 'notice-2', 'notice-3'] });
  expect((await env.DB.prepare('SELECT * FROM notification_read_receipts ORDER BY notification_id').all()).results).toEqual(original);
  expect(original).toHaveLength(3);
});
it.each([null, {}, { ids: ['bad id'] }, { ids: ['x'.repeat(129)] }, { ids: Array(101).fill('notice') }, { ids: [1] }])('rejects malformed writes before SQL: %j', async input => {
  const prepare = () => { throw new Error('unexpected SQL'); };
  await expect(service('owner', { prepare }).write(input)).rejects.toMatchObject({ status: 400 });
});
it('rejects missing/oversized queries and performs no business SQL for an empty batch', async () => {
  const prepare = () => { throw new Error('unexpected SQL'); };
  const guarded = service('owner', { prepare });
  await expect(guarded.read(null)).rejects.toMatchObject({ status: 400 });
  await expect(guarded.read('x'.repeat(6001))).rejects.toMatchObject({ status: 400 });
  expect(await guarded.read('')).toEqual({ readIds: [] });
  expect(await guarded.write({ ids: [] })).toEqual({ readIds: [] });
});
it('uses one indexed bounded SELECT and one INSERT for a batch, with account-deletion cascade', async () => {
  const queries = [];
  const repository = createNotificationReadStateRepository({ DB: { prepare(sql) { queries.push(sql); return env.DB.prepare(sql); } } });
  const ids = Array.from({ length: 100 }, (_, index) => `notice-${index}`);
  await repository.write('owner', ids, '2026-11-09T08:00:00Z');
  expect(await repository.read('owner', ids)).toHaveLength(100);
  expect(queries).toHaveLength(2);
  const plan = (await env.DB.prepare(`EXPLAIN QUERY PLAN ${queries[1]}`).bind('owner', JSON.stringify(ids), 'owner', JSON.stringify(ids)).all()).results.map(row => row.detail).join('\n');
  expect(plan).toMatch(/SEARCH notification_read_receipts USING PRIMARY KEY/u);
  await env.DB.prepare("DELETE FROM app_users WHERE id='owner'").run();
  expect(await service().read(ids.join(','))).toEqual({ readIds: [] });
});

it('bridges existing web read IDs and collapsed-date state without a global backfill or overwriting concurrent receipts', async () => {
  const context = { env, principal: session, requestId: 'legacy' };
  await saveNotificationState(context, session, { collapsedDate: '2026-11-09', readIds: ['legacy-1'] });
  expect(await service().read('legacy-1,new-1')).toEqual({ readIds: ['legacy-1'] });
  await service().write({ ids: ['new-1'] });
  expect(await getNotificationState(context, session)).toMatchObject({ collapsedDate: '2026-11-09', readIds: expect.arrayContaining(['legacy-1', 'new-1']) });
  await saveNotificationState(context, session, { readIds: ['legacy-2'] });
  expect((await service().read('legacy-1,legacy-2,new-1')).readIds).toEqual(['legacy-1', 'legacy-2', 'new-1']);
});
it('guards authentication, CSRF, origin and rate admission before writes; responses stay no-store', async () => {
  expect((await dispatch('GET', {}, null)).status).toBe(401);
  expect((await dispatch('POST')).status).toBe(403);
  expect((await dispatch('POST', { Origin: 'https://evil.test', 'X-CSRF-Token': 'csrf' })).status).toBe(403);
  const headers = { Origin: 'https://app.test', 'X-CSRF-Token': 'csrf' };
  expect((await dispatch('POST', headers, session, undefined, { COMMENT_RATE_LIMITER: { limit: async () => ({ success: false }) } })).status).toBe(429);
  expect((await env.DB.prepare('SELECT * FROM notification_read_receipts').all()).results).toEqual([]);
  const written = await dispatch('POST', headers); expect(written.status).toBe(200); expect(written.headers.get('Cache-Control')).toBe('no-store');
  const read = await dispatch('GET'); expect(read.status).toBe(200); expect(read.headers.get('Cache-Control')).toBe('no-store');
  expect(await read.json()).toEqual({ readIds: ['notice-1'] });
});
