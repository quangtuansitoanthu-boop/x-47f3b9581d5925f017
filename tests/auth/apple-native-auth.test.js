import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import members from '../../migrations/0026-member-status.sql?raw';
import activity from '../../migrations/0017-user-activity-foundations.sql?raw';
import facebook from '../../migrations/0019-facebook-auth-import.sql?raw';
import { POST } from '../../src/routes/api/auth/native-verify/+server.ts';
import { loadSession } from '../../src/lib/server/auth/sessions.ts';

const verified = vi.hoisted(() => ({ claims: {} }));
vi.mock('../../src/lib/server/auth/native-token-verification.ts', async original => ({
  ...await original(), verifyAppleNativeToken: vi.fn(async () => ({ ...verified.claims })),
}));

beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, members, activity, facebook].map((sql, index) => ({
    name: 'apple-auth-' + index + '.sql',
    queries: sql.trim().split(/;\s*\n\s*\n/gu).map(statement => statement.trim().endsWith(';') ? statement.trim() : statement.trim() + ';'),
  })));
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await env.DB.prepare('DELETE FROM auth_sessions').run();
  await env.DB.prepare('DELETE FROM auth_identities').run();
  await env.DB.prepare('DELETE FROM app_users').run();
  verified.claims = { sub: 'apple-member', email: 'member@example.test', email_verified: true };
});

function workerEnv() {
  return { ...env, APP_ORIGIN: 'https://quangtu.vn', SESSION_SECRET: 'test-apple-session-secret',
    RATE_LIMIT_SALT: 'test-apple-rate-salt', AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
}

function signIn(user = { givenName: 'An', familyName: 'Nguyễn' }, runtime = workerEnv()) {
  return POST({ request: new Request('https://quangtu.vn/api/auth/native-verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'apple', token: 'verified-test-token', user }),
  }), locals: { env: runtime, migrationSealed: true } });
}

it('creates a separate Apple principal when a Google administrator already owns the verified email', async () => {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_users(id,email,display_name,role) VALUES ('google-existing','MEMBER@example.test','Existing Google','admin')"),
    env.DB.prepare("INSERT INTO auth_identities(id,user_id,issuer,provider,provider_subject) VALUES ('google-identity','google-existing','https://accounts.google.com','google','google-subject')"),
  ]);
  const oldAccount = await env.DB.prepare("SELECT * FROM app_users WHERE id='google-existing'").first();
  const oldIdentity = await env.DB.prepare("SELECT * FROM auth_identities WHERE id='google-identity'").first();
  const response = await signIn();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.userId).not.toBe('google-existing');
  expect(result.user).toMatchObject({ role: 'user', email: 'member@example.test' });
  expect(await env.DB.prepare('SELECT email,role FROM app_users WHERE id=?').bind(result.userId).first())
    .toEqual({ email: null, role: 'user' });
  expect(await env.DB.prepare("SELECT * FROM app_users WHERE id='google-existing'").first()).toEqual(oldAccount);
  expect(await env.DB.prepare("SELECT * FROM auth_identities WHERE id='google-identity'").first()).toEqual(oldIdentity);
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toContain('HttpOnly');
  expect(await loadSession(new Request('https://quangtu.vn/api/session', { headers: { cookie: cookie.split(';')[0] } }), workerEnv()))
    .toMatchObject({ userId: result.userId, role: 'user' });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

it('stores an available verified email and preserves the principal/profile on subsequent Apple sign-in', async () => {
  const first = await signIn();
  expect(first.status).toBe(200);
  const initial = await first.json();
  expect(await env.DB.prepare('SELECT email FROM app_users WHERE id=?').bind(initial.userId).first())
    .toEqual({ email: 'member@example.test' });
  verified.claims = { sub: 'apple-member' };
  const repeated = await signIn({});
  expect(repeated.status).toBe(200);
  const result = await repeated.json();
  expect(result.userId).toBe(initial.userId);
  expect(result.user).toEqual(initial.user);
  expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM app_users').first()).toEqual({ total: 1 });
  expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM auth_identities WHERE provider='apple'").first()).toEqual({ total: 1 });
});

it('keeps an existing Apple email when a later credential supplies a different email', async () => {
  const first = await signIn();
  const initial = await first.json();
  verified.claims.email = 'changed@example.test';
  const result = await (await signIn({ givenName: 'Changed' })).json();
  expect(result.user).toEqual(initial.user);
});

it('rejects a suspended Apple principal without issuing another session', async () => {
  const first = await signIn();
  const { userId } = await first.json();
  await env.DB.prepare("UPDATE app_users SET status='suspended' WHERE id=?").bind(userId).run();
  const rejected = await signIn();
  expect(rejected.status).toBe(403);
  expect(rejected.headers.get('set-cookie')).toBeNull();
  expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM auth_sessions').first()).toEqual({ total: 1 });
});

it.each([undefined, false])('allows a missing or unverified email without trusting the client profile (verified=%s)', async emailVerified => {
  verified.claims = { sub: 'apple-member', email: 'unverified@example.test', email_verified: emailVerified };
  const response = await signIn({ email: 'client@example.test' });
  expect(response.status).toBe(200);
  expect((await response.json()).user.email).toBe('');
  expect(await env.DB.prepare('SELECT email FROM app_users').first()).toEqual({ email: null });
});

it.each([true, false])('bounds provisioning to one batch and adds an email statement only for verified email (%s)', async withEmail => {
  if (!withEmail) verified.claims = { sub: 'apple-member' };
  const queries = [], batches = [];
  const runtime = workerEnv();
  runtime.DB = {
    prepare(sql) { queries.push(sql); return env.DB.prepare(sql); },
    batch(statements) { batches.push(statements.length); return env.DB.batch(statements); },
  };
  expect((await signIn({}, runtime)).status).toBe(200);
  expect(batches).toEqual([withEmail ? 3 : 2]);
  expect(queries).toHaveLength(withEmail ? 5 : 4);
  expect(queries.filter(sql => /UPDATE OR IGNORE app_users/u.test(sql))).toHaveLength(withEmail ? 1 : 0);
});
