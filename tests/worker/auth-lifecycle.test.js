import { beforeAll, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import ledgerSchema from '../../migrations/0003-migration-and-media-operation-schema.sql?raw';
import { createOAuthState, consumeOAuthState } from '../../src/worker/auth/oauth-state.js';
import {
  createGoogleIdentitySession,
  resolveOrCreateGoogleIdentity,
} from '../../src/worker/auth/google-oauth.js';
import { createSession, loadSession, revokeSession } from '../../src/worker/auth/sessions.js';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0003-migration-and-media-operation-schema.sql', queries: splitMigration(ledgerSchema) },
  ]);
  await env.DB.prepare(`
    INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
    VALUES ('user-auth-test', 'auth@example.test', 'Auth Test', 'user', ?, ?)
  `).bind(new Date().toISOString(), new Date().toISOString()).run();
});

describe('authentication lifecycle', () => {
  it('creates, loads, and revokes an opaque session', async () => {
    const workerEnv = { ...env, SESSION_SECRET: 'test-session-secret-with-enough-entropy' };
    const created = await createSession(workerEnv, { userId: 'user-auth-test' });
    expect(created.cookie).toMatch(
      /^__Host-quangtu_session=.+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/u,
    );
    expect(created.cookie).not.toContain('auth@example.test');

    const cookie = created.cookie.split(';', 1)[0];
    const loaded = await loadSession(new Request('https://quangtu.vn/api/auth/session', {
      headers: { Cookie: cookie },
    }), workerEnv);
    expect(loaded).toMatchObject({
      userId: 'user-auth-test',
      appUserId: 'user-auth-test',
      role: 'user',
      csrfToken: created.csrfToken,
    });

    await revokeSession(workerEnv, loaded);
    await expect(loadSession(new Request('https://quangtu.vn/api/auth/session', {
      headers: { Cookie: cookie },
    }), workerEnv)).resolves.toBeNull();
  });

  it('consumes an encrypted OAuth PKCE state exactly once and clamps return paths', async () => {
    const workerEnv = { ...env, OAUTH_STATE_SECRET: 'test-oauth-state-secret-with-enough-entropy' };
    const created = await createOAuthState(workerEnv, '//evil.example/steal');
    expect(created.state).toBeTruthy();
    expect(created.verifier).toBeTruthy();
    expect(created.nonce).toBeTruthy();
    expect(created.challenge).toBeTruthy();

    const consumed = await consumeOAuthState(workerEnv, created.state);
    expect(consumed).toMatchObject({
      verifier: created.verifier,
      nonce: created.nonce,
      returnPath: '/',
    });
    await expect(consumeOAuthState(workerEnv, created.state)).resolves.toBeNull();
  });

  it('provisions a new verified Google identity exactly once across concurrent callbacks', async () => {
    const claims = {
      iss: 'https://accounts.google.com',
      sub: 'new-google-subject',
      email: 'new-google-user@example.test',
      email_verified: true,
      name: 'New Google User',
      picture: 'https://example.test/avatar.png',
    };
    const now = '2026-07-31T00:00:00.000Z';
    const [first, second] = await Promise.all([
      resolveOrCreateGoogleIdentity(env, claims, now),
      resolveOrCreateGoogleIdentity(env, claims, now),
    ]);

    expect(first).toEqual(second);
    expect(first.role).toBe('user');
    const user = await env.DB.prepare(
      'SELECT email, display_name, avatar_url, role FROM app_users WHERE id = ?',
    ).bind(first.user_id).first();
    expect(user).toEqual({
      email: 'new-google-user@example.test',
      display_name: 'New Google User',
      avatar_url: 'https://example.test/avatar.png',
      role: 'user',
    });
    const identityCount = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM auth_identities
      WHERE issuer = ? AND provider = 'google' AND provider_subject = ?
    `).bind(claims.iss, claims.sub).first();
    expect(identityCount.count).toBe(1);
    const userCount = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM app_users WHERE id = ?',
    ).bind(first.user_id).first();
    expect(userCount.count).toBe(1);
  });

  it('does not auto-link a new Google subject to an existing user by email', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    await env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
      VALUES ('existing-same-email', 'shared@example.test', 'Existing User', 'admin', ?, ?)
    `).bind(now, now).run();
    const identity = await resolveOrCreateGoogleIdentity(env, {
      iss: 'https://accounts.google.com',
      sub: 'different-google-subject',
      email: 'shared@example.test',
      email_verified: true,
      name: 'Different Google User',
    }, now);

    expect(identity).toMatchObject({ role: 'user' });
    expect(identity.user_id).not.toBe('existing-same-email');
    const provisioned = await env.DB.prepare(
      'SELECT email, display_name, role FROM app_users WHERE id = ?',
    ).bind(identity.user_id).first();
    expect(provisioned).toEqual({
      email: null,
      display_name: 'Different Google User',
      role: 'user',
    });
    await expect(env.DB.prepare(
      'SELECT role FROM app_users WHERE id = ?',
    ).bind('existing-same-email').first()).resolves.toEqual({ role: 'admin' });
  });

  it('reuses an imported Google subject without changing its role or profile', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    await env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
      VALUES ('imported-google-user', 'imported@example.test', 'Imported User', 'ctv', ?, ?)
    `).bind(now, now).run();
    await env.DB.prepare(`
      INSERT INTO auth_identities
        (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
      VALUES ('imported-google-identity', 'imported-google-user',
        'https://accounts.google.com', 'google', 'imported-google-subject', ?, ?)
    `).bind(now, now).run();

    const identity = await resolveOrCreateGoogleIdentity(env, {
      iss: 'https://accounts.google.com',
      sub: 'imported-google-subject',
      email: 'changed@example.test',
      email_verified: true,
      name: 'Changed Name',
    }, '2026-07-31T01:00:00.000Z');

    expect(identity).toEqual({ user_id: 'imported-google-user', role: 'ctv' });
    await expect(env.DB.prepare(
      'SELECT email, display_name, role FROM app_users WHERE id = ?',
    ).bind('imported-google-user').first()).resolves.toEqual({
      email: 'imported@example.test',
      display_name: 'Imported User',
      role: 'ctv',
    });
  });

  it('normalizes the alternate valid Google issuer before matching an imported identity', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    await env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
      VALUES ('issuer-alias-user', 'issuer-alias@example.test', 'Issuer Alias', 'admin', ?, ?)
    `).bind(now, now).run();
    await env.DB.prepare(`
      INSERT INTO auth_identities
        (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
      VALUES ('issuer-alias-identity', 'issuer-alias-user',
        'https://accounts.google.com', 'google', 'issuer-alias-subject', ?, ?)
    `).bind(now, now).run();

    const identity = await resolveOrCreateGoogleIdentity(env, {
      iss: 'accounts.google.com',
      sub: 'issuer-alias-subject',
      email: 'issuer-alias@example.test',
      email_verified: true,
    }, now);

    expect(identity).toEqual({ user_id: 'issuer-alias-user', role: 'admin' });
    const counts = await env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS identities
      FROM auth_identities
      WHERE provider = 'google' AND provider_subject = 'issuer-alias-subject'
    `).first();
    expect(counts).toEqual({ users: 1, identities: 1 });
  });

  it('allows concurrent distinct subjects sharing an email without linking or failing', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    const baseClaims = {
      iss: 'https://accounts.google.com',
      email: 'concurrent-shared@example.test',
      email_verified: true,
      name: 'Concurrent User',
    };
    const [first, second] = await Promise.all([
      resolveOrCreateGoogleIdentity(env, { ...baseClaims, sub: 'concurrent-subject-a' }, now),
      resolveOrCreateGoogleIdentity(env, { ...baseClaims, sub: 'concurrent-subject-b' }, now),
    ]);

    expect(first.user_id).not.toBe(second.user_id);
    const users = await env.DB.prepare(`
      SELECT id, email, role
      FROM app_users
      WHERE id IN (?, ?)
      ORDER BY id
    `).bind(first.user_id, second.user_id).all();
    expect(users.results).toHaveLength(2);
    expect(users.results.every((user) => user.role === 'user')).toBe(true);
    expect(users.results.filter((user) => user.email === baseClaims.email)).toHaveLength(1);
    expect(users.results.filter((user) => user.email === null)).toHaveLength(1);
  });

  it('does not move identity timestamps backwards when callbacks finish out of order', async () => {
    const claims = {
      iss: 'https://accounts.google.com',
      sub: 'timestamp-subject',
      email: 'timestamp@example.test',
      email_verified: true,
    };
    await resolveOrCreateGoogleIdentity(env, claims, '2026-07-31T02:00:00.000Z');
    await resolveOrCreateGoogleIdentity(env, claims, '2026-07-31T01:00:00.000Z');

    const identity = await env.DB.prepare(`
      SELECT last_sign_in_at, updated_at
      FROM auth_identities
      WHERE provider = 'google' AND provider_subject = ?
    `).bind(claims.sub).first();
    expect(identity).toEqual({
      last_sign_in_at: '2026-07-31T02:00:00.000Z',
      updated_at: '2026-07-31T02:00:00.000Z',
    });
  });

  it('creates a loadable session after a verified Google identity is provisioned', async () => {
    const workerEnv = { ...env, SESSION_SECRET: 'test-session-secret-with-enough-entropy' };
    const result = await createGoogleIdentitySession(workerEnv, {
      iss: 'https://accounts.google.com',
      sub: 'session-google-subject',
      email: 'session-google@example.test',
      email_verified: true,
      name: 'Session Google User',
    }, '/tu-tap.html');
    const cookie = result.session.cookie.split(';', 1)[0];
    const loaded = await loadSession(new Request('https://quangtu.vn/api/auth/session', {
      headers: { Cookie: cookie },
    }), workerEnv);

    expect(result.returnPath).toBe('/tu-tap.html');
    expect(loaded).toMatchObject({
      appUserId: expect.stringMatching(/^google-/u),
      email: 'session-google@example.test',
      displayName: 'Session Google User',
      role: 'user',
    });
  });
});

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}
