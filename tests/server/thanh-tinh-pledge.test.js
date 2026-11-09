import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import schema from '../../migrations/0032-thanh-tinh-pledges.sql?raw';
import { createThanhTinhService } from '../../src/lib/server/services/thanh-tinh';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [{ name: '0032', queries: schema.split(';').map((sql) => sql.trim()).filter(Boolean) }]);
});
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM thanh_tinh_pledges').run();
  await env.DB.prepare("UPDATE thanh_tinh_community SET value = 1352 WHERE key = 'participants'").run();
});

it('counts concurrent/repeated pledges once and preserves enriched profile fields', async () => {
  const service = createThanhTinhService({ env, principal: null });
  await Promise.all(Array.from({ length: 8 }, () => service.recordPledge({ anonIdHash: 'same-person', displayName: 'Member', email: 'member@example.com', userId: 'user-1' })));
  const stats = await service.recordPledge({ anonIdHash: 'same-person' });
  expect(stats.participantCount).toBe(1353);
  const row = await env.DB.prepare('SELECT * FROM thanh_tinh_pledges').first();
  expect(row).toMatchObject({ display_name: 'Member', email: 'member@example.com', user_id: 'user-1' });
});

it('uses one batch and one stats read per pledge and rolls back failed batches', async () => {
  const batch = vi.fn((statements) => env.DB.batch(statements));
  const prepare = vi.fn((sql) => env.DB.prepare(sql));
  const service = createThanhTinhService({ env: { DB: { prepare, batch } }, principal: null });
  expect((await service.recordPledge({ anonIdHash: 'new-person' })).participantCount).toBe(1353);
  expect(batch).toHaveBeenCalledTimes(1);
  expect(prepare.mock.calls.filter(([sql]) => /SELECT key, value/u.test(sql))).toHaveLength(1);
  const failing = createThanhTinhService({ env: { DB: {
    prepare,
    batch: (statements) => env.DB.batch([...statements, env.DB.prepare('INSERT INTO missing_pledge_table VALUES (1)')]),
  } }, principal: null });
  await failing.recordPledge({ anonIdHash: 'rolled-back-person' });
  expect(await env.DB.prepare("SELECT * FROM thanh_tinh_pledges WHERE anon_id_hash = 'rolled-back-person'").first()).toBeNull();
  expect((await service.getStats()).participantCount).toBe(1353);
});
