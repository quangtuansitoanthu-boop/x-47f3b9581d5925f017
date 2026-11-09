import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import settingsSchema from '../../migrations/0042-personal-settings.sql?raw';
import { createPersonalSettingsService } from '../../src/lib/server/services/personal-settings.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [applicationSchema, authSchema, settingsSchema].map((sql, index) => ({ name: `personal-settings-fixture-${index}`,
    queries: sql.trim().split(/;\s*\n\s*\n/gu).map(statement => statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`),
  })));
});
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM practice_personal_settings').run(); await env.DB.prepare('DELETE FROM app_users').run();
  for (const owner of ['a', 'b']) await env.DB.prepare(`INSERT INTO app_users (id, display_name, role, created_at, updated_at) VALUES (?, ?, 'user', '2026-11-07', '2026-11-07')`).bind(owner, owner).run();
});
const snapshot = { routines: [], nickname: 'Diệu Âm' };
function service(owner = 'a') { return createPersonalSettingsService({ env, principal: { appUserId: owner } }, { now: () => new Date('2026-11-07T12:00:00Z') }); }

describe('personal settings on local D1', () => {
  it('saves by CAS with one statement and idempotently returns a lost first receipt', async () => {
    const api = service(); expect((await api.read()).revision).toBe(0);
    const saved = await api.write({ snapshot, revision: 0 }); expect(saved).toMatchObject({ revision: 1, snapshot });
    expect(await api.write({ snapshot, revision: 0 })).toEqual(saved);
    expect((await api.read()).revision).toBe(1);
  });
  it('rejects stale writes, absent-row nonzero revision and only one competing snapshot wins', async () => {
    await expect(service().write({ snapshot, revision: 5 })).rejects.toMatchObject({ status: 409 });
    const attempts = await Promise.allSettled([service().write({ snapshot, revision: 0 }), service().write({ snapshot: { ...snapshot, nickname: 'other' }, revision: 0 })]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
  });
  it('isolates owners and cascades when the account is deleted', async () => {
    await service().write({ snapshot, revision: 0 }); expect((await service('b').read()).snapshot.nickname).toBe('');
    await env.DB.prepare('DELETE FROM app_users WHERE id = ?').bind('a').run();
    expect(await env.DB.prepare('SELECT owner_id FROM practice_personal_settings WHERE owner_id = ?').bind('a').first()).toBeNull();
  });
  it('rejects anonymous clients, owner injection and private reflections before SQL writes', async () => {
    await expect(createPersonalSettingsService({ env, principal: null }).read()).rejects.toMatchObject({ status: 401 });
    await expect(service().write({ snapshot, revision: 0, ownerId: 'b' })).rejects.toMatchObject({ status: 400 });
    await expect(service().write({ snapshot: { ...snapshot, reflections: ['private'] }, revision: 0 })).rejects.toMatchObject({ status: 400 });
    expect(await env.DB.prepare('SELECT owner_id FROM practice_personal_settings').all()).toMatchObject({ results: [] });
  });
});
