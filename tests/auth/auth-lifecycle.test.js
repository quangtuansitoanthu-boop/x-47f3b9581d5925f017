import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import ledgerSchema from '../../migrations/0003-migration-and-media-operation-schema.sql?raw';
import hardeningSchema from '../../migrations/0009-backward-compatible-sync-and-media-hardening.sql?raw';
import authRetentionIndexes from '../../migrations/0012-auth-retention-indexes.sql?raw';
import userActivitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import facebookAuthSchema from '../../migrations/0019-facebook-auth-import.sql?raw';
import facebookScanContinuationSchema from '../../migrations/0021-facebook-import-scan-continuation.sql?raw';
import { resolveAuthCookiePolicy } from '../../src/lib/server/auth/auth-cookie-policy.ts';
import { beginGoogleAuthorization, completeGoogleAuthorization, resolveOrCreateGoogleIdentity } from '../../src/lib/server/auth/google-oauth.ts';
import {
  clearOAuthTransactionCookie,
  createOAuthState,
  consumeOAuthState,
  loadOAuthState,
  verifyOAuthTransactionCookie,
} from '../../src/lib/server/auth/oauth-state.ts';
import { purgeExpiredAuthRecords } from '../../src/lib/server/auth/auth-retention.ts';
import {
  adapterSessionShape,
  clearSessionCookie,
  createSession,
  loadSession,
  publicSession,
  revokeSession,
} from '../../src/lib/server/auth/sessions.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0003-migration-and-media-operation-schema.sql', queries: splitMigration(ledgerSchema) },
    { name: '0009-backward-compatible-sync-and-media-hardening.sql', queries: splitMigration(hardeningSchema) },
    { name: '0012-auth-retention-indexes.sql', queries: splitMigration(authRetentionIndexes) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(userActivitySchema) },
    { name: '0019-facebook-auth-import.sql', queries: splitMigration(facebookAuthSchema) },
    { name: '0021-facebook-import-scan-continuation.sql', queries: splitMigration(facebookScanContinuationSchema) },
  ]);
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM oauth_start_rate_limits').run();
  await env.DB.prepare('DELETE FROM oauth_states').run();
  await env.DB.prepare('DELETE FROM auth_sessions').run();
  await env.DB.prepare('DELETE FROM auth_identities').run();
  await env.DB.prepare('DELETE FROM app_users').run();
});

describe('phase 3 auth lifecycle', () => {
  it('creates, loads, and revokes an opaque session', async () => {
    const workerEnv = authEnv();
    await env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, avatar_url, role, created_at, updated_at)
      VALUES ('user-auth-test', 'auth@example.test', 'Auth Test',
        'https://example.test/auth-avatar.png', 'user', ?, ?)
    `).bind(now(), now()).run();

    const created = await createSession(workerEnv, { userId: 'user-auth-test' });
    expect(created.cookie).toMatch(
      /^__Host-quangtu_session=.+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/u,
    );
    const cookie = created.cookie.split(';', 1)[0];
    const loaded = await loadSession(new Request('https://quangtu.vn/api/auth/session', {
      headers: { Cookie: cookie },
    }), workerEnv);
    expect(loaded).toMatchObject({
      userId: 'user-auth-test',
      appUserId: 'user-auth-test',
      role: 'user',
      avatarUrl: 'https://example.test/auth-avatar.png',
      csrfToken: created.csrfToken,
    });
    expect(publicSession(loaded).user).toMatchObject({
      email: 'auth@example.test',
      avatarUrl: 'https://example.test/auth-avatar.png',
    });
    expect(adapterSessionShape(loaded).session?.user).toMatchObject({
      user_metadata: {
        full_name: 'Auth Test',
        avatar_url: 'https://example.test/auth-avatar.png',
      },
    });

    await revokeSession(workerEnv, loaded);
    await expect(loadSession(new Request('https://quangtu.vn/api/auth/session', {
      headers: { Cookie: cookie },
    }), workerEnv)).resolves.toBeNull();
  });

  it('consumes oauth state exactly once and verifies the initiating-browser transaction cookie', async () => {
    const created = await createOAuthState(authEnv(), '/phap-thoai#now');
    expect(created.transactionCookie).toMatch(
      /^__Host-quangtu_oauth_tx_[A-Za-z0-9_-]+=.+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/u,
    );
    const request = new Request('https://quangtu.vn/api/auth/google/callback', {
      headers: { Cookie: created.transactionCookie.split(';', 1)[0] },
    });
    expect(await verifyOAuthTransactionCookie(request, authEnv(), created.state, created.nonce)).toBe(true);
    const consumed = await consumeOAuthState(authEnv(), created.state);
    expect(consumed).toMatchObject({
      verifier: created.verifier,
      nonce: created.nonce,
      returnPath: '/phap-thoai#now',
    });
    await expect(consumeOAuthState(authEnv(), created.state)).resolves.toBeNull();
  });

  it('uses non-secure host-only cookies only for an HTTP loopback origin', async () => {
    const loopbackEnv = { ...authEnv(), APP_ORIGIN: 'http://127.0.0.1:4173' };
    expect(resolveAuthCookiePolicy(loopbackEnv, '__Host-secure', 'loopback')).toEqual({
      name: 'loopback',
      secure: false,
    });
    expect(resolveAuthCookiePolicy(
      { ...authEnv(), APP_ORIGIN: 'http://localhost:8787' },
      '__Host-secure',
      'loopback',
    )).toEqual({ name: 'loopback', secure: false });
    expect(resolveAuthCookiePolicy(
      { ...authEnv(), APP_ORIGIN: 'http://example.test' },
      '__Host-secure',
      'loopback',
    )).toEqual({ name: '__Host-secure', secure: true });
    const started = await beginGoogleAuthorization(
      new Request('http://127.0.0.1:4173/api/auth/google?returnTo=/tu-tap'),
      loopbackEnv,
    );
    expect(started.transactionCookie).toMatch(
      /^quangtu_oauth_tx_[A-Za-z0-9_-]+=.+; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax$/u,
    );
    expect(started.transactionCookie).not.toContain('Secure');
    const state = String(new URL(started.url).searchParams.get('state'));
    const loadedState = await loadOAuthState(loopbackEnv, state);
    expect(loadedState).not.toBeNull();
    expect(await verifyOAuthTransactionCookie(
      new Request(`http://127.0.0.1:4173/api/auth/google/callback?state=${encodeURIComponent(state)}&code=abc`, {
        headers: { Cookie: started.transactionCookie.split(';', 1)[0] },
      }),
      loopbackEnv,
      state,
      String(loadedState?.nonce),
    )).toBe(true);
    await expect(consumeOAuthState(loopbackEnv, state)).resolves.not.toBeNull();
    expect(clearOAuthTransactionCookie(loopbackEnv, state)).toBe(
      `quangtu_oauth_tx_${state.slice(0, 18)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    );

    await env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
      VALUES ('loopback-user', 'loopback@example.test', 'Loopback User', 'user', ?, ?)
    `).bind(now(), now()).run();
    const session = await createSession(loopbackEnv, { userId: 'loopback-user' });
    expect(session.cookie).toMatch(
      /^quangtu_session=.+; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax$/u,
    );
    expect(session.cookie).not.toContain('Secure');
    await expect(loadSession(new Request('http://127.0.0.1:4173/api/auth/session', {
      headers: { Cookie: session.cookie.split(';', 1)[0] },
    }), loopbackEnv)).resolves.toMatchObject({ userId: 'loopback-user' });
    expect(clearSessionCookie(loopbackEnv)).toBe(
      'quangtu_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );
  });

  it('purges expired oauth states and dead sessions in bounded batches', async () => {
    const workerEnv = authEnv();
    const stale = '2026-08-05T00:00:00.000Z';
    const fresh = '2026-08-07T00:00:00.000Z';
    const oldConsumed = '2026-08-05T12:00:00.000Z';
    const oldRevoked = '2026-08-05T12:00:00.000Z';
    await env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, created_at, updated_at)
      VALUES ('retention-user', 'Retention', 'user', ?, ?)
    `).bind(stale, stale).run();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO oauth_start_rate_limits VALUES (?, ?, ?)').bind('expired-bucket', 30, stale),
      env.DB.prepare(`INSERT INTO oauth_states (state_hash, code_verifier_ciphertext, return_path, created_at, expires_at, consumed_at) VALUES (?, 'ciphertext', '/', ?, ?, NULL)`).bind('oauth-expired-1', stale, stale),
      env.DB.prepare(`INSERT INTO oauth_states (state_hash, code_verifier_ciphertext, return_path, created_at, expires_at, consumed_at) VALUES (?, 'ciphertext', '/', ?, ?, NULL)`).bind('oauth-expired-2', stale, stale),
      env.DB.prepare(`INSERT INTO oauth_states (state_hash, code_verifier_ciphertext, return_path, created_at, expires_at, consumed_at) VALUES (?, 'ciphertext', '/', ?, ?, ?)`).bind('oauth-consumed-1', stale, fresh, oldConsumed),
      env.DB.prepare(`INSERT INTO oauth_states (state_hash, code_verifier_ciphertext, return_path, created_at, expires_at, consumed_at) VALUES (?, 'ciphertext', '/', ?, ?, ?)`).bind('oauth-consumed-2', stale, fresh, oldConsumed),
      env.DB.prepare(`INSERT INTO oauth_states (state_hash, code_verifier_ciphertext, return_path, created_at, expires_at, consumed_at) VALUES (?, 'ciphertext', '/', ?, ?, NULL)`).bind('oauth-fresh', fresh, fresh),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at, revoked_at)
        VALUES (?, 'retention-user', ?, ?, ?, ?, NULL)
      `).bind('session-expired-1', 'token-1', 'csrf-1', stale, stale),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at, revoked_at)
        VALUES (?, 'retention-user', ?, ?, ?, ?, NULL)
      `).bind('session-expired-2', 'token-2', 'csrf-2', stale, stale),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at, revoked_at)
        VALUES (?, 'retention-user', ?, ?, ?, ?, ?)
      `).bind('session-revoked-1', 'token-3', 'csrf-3', fresh, fresh, oldRevoked),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at, revoked_at)
        VALUES (?, 'retention-user', ?, ?, ?, ?, ?)
      `).bind('session-revoked-2', 'token-4', 'csrf-4', fresh, fresh, oldRevoked),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at, revoked_at)
        VALUES (?, 'retention-user', ?, ?, ?, ?, NULL)
      `).bind('session-fresh', 'token-fresh', 'csrf-fresh', fresh, fresh),
    ]);

    const firstPass = await purgeExpiredAuthRecords(workerEnv, new Date('2026-08-06T00:00:00.000Z'), {
      batchSize: 1,
      maxBatches: 1,
    });
    expect(firstPass.hasMore).toBe(true);
    expect(firstPass.rateLimitBucketsPurged).toBe(1);
    expect(firstPass.oauthStatesPurged).toBeGreaterThan(0);
    expect(firstPass.sessionsPurged).toBeGreaterThan(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM oauth_states').first()).toMatchObject({ count: 3 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM auth_sessions').first()).toMatchObject({ count: 3 });

    const secondPass = await purgeExpiredAuthRecords(workerEnv, new Date('2026-08-06T00:00:00.000Z'), {
      batchSize: 1,
      maxBatches: 1,
    });
    expect(secondPass.hasMore).toBe(false);
    expect(secondPass.rateLimitBucketsPurged).toBe(0);
    expect(await env.DB.prepare("SELECT state_hash FROM oauth_states WHERE state_hash = 'oauth-fresh'").first()).not.toBeNull();
    expect(await env.DB.prepare("SELECT id FROM auth_sessions WHERE id = 'session-fresh'").first()).not.toBeNull();
  });

  it('installs the partial indexes used by auth retention cleanup', async () => {
    const sessionIndexes = await env.DB.prepare("PRAGMA index_list('auth_sessions')").all();
    const oauthIndexes = await env.DB.prepare("PRAGMA index_list('oauth_states')").all();
    expect(sessionIndexes.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'idx_auth_sessions_revoked_at' }),
    ]));
    expect(oauthIndexes.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'idx_oauth_states_consumed_at' }),
    ]));
    const rateLimitIndexes = await env.DB.prepare("PRAGMA index_list('oauth_start_rate_limits')").all();
    expect(rateLimitIndexes.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'idx_oauth_start_rate_limits_expires_at' }),
    ]));
  });

  it('rejects attacker-controlled callback completion without the transaction cookie', async () => {
    const started = await beginGoogleAuthorization(
      new Request('https://quangtu.vn/api/auth/google?returnTo=/tu-tap'),
      authEnv(),
    );
    const state = new URL(started.url).searchParams.get('state');
    await expect(completeGoogleAuthorization(
      new Request(`https://quangtu.vn/api/auth/google/callback?state=${encodeURIComponent(String(state))}&code=abc`),
      authEnv(),
    )).rejects.toMatchObject({ code: 'oauth_transaction' });
  });

  it('binds the Google redirect URI at start and reuses it for the code exchange', async () => {
    const startEnv = { ...authEnv(), APP_ORIGIN: 'https://login-start.example' };
    const callbackEnv = { ...authEnv(), APP_ORIGIN: 'https://callback-runtime.example' };
    const started = await beginGoogleAuthorization(
      new Request('https://request-origin.example/api/auth/google?returnTo=/tu-tap'),
      startEnv,
    );
    const authorizationUrl = new URL(started.url);
    const state = String(authorizationUrl.searchParams.get('state'));
    const redirectUri = 'https://login-start.example/api/auth/google/callback';
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(redirectUri);
    await expect(loadOAuthState(startEnv, state)).resolves.toMatchObject({
      provider: 'google',
      purpose: 'login',
      redirectUri,
    });

    const fetchImpl = vi.fn(async () => new Response(null, { status: 400 }));
    await expect(completeGoogleAuthorization(
      new Request(`https://callback-runtime.example/api/auth/google/callback?state=${encodeURIComponent(state)}&code=abc`, {
        headers: { Cookie: started.transactionCookie.split(';', 1)[0] },
      }),
      callbackEnv,
      { fetchImpl },
    )).rejects.toMatchObject({ code: 'oauth_exchange' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const tokenRequest = fetchImpl.mock.calls[0][1];
    expect(new URLSearchParams(String(tokenRequest?.body)).get('redirect_uri')).toBe(redirectUri);
  });

  it.each([
    ['another provider', { provider: 'facebook', purpose: 'login', redirectUri: 'https://quangtu.vn/api/auth/google/callback' }],
    ['another purpose', { provider: 'google', purpose: 'connector', redirectUri: 'https://quangtu.vn/api/auth/google/callback' }],
    ['a missing redirect URI', { provider: 'google', purpose: 'login' }],
  ])('rejects a Google callback bound to %s', async (_label, binding) => {
    const created = await createOAuthState(authEnv(), '/', binding);
    const fetchImpl = vi.fn();
    await expect(completeGoogleAuthorization(
      new Request(`https://quangtu.vn/api/auth/google/callback?state=${encodeURIComponent(created.state)}&code=abc`, {
        headers: { Cookie: created.transactionCookie.split(';', 1)[0] },
      }),
      authEnv(),
      { fetchImpl },
    )).rejects.toMatchObject({ code: 'oauth_state' });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(loadOAuthState(authEnv(), created.state)).resolves.not.toBeNull();
  });

  it('keeps oauth state consumable after a wrong transaction cookie is rejected', async () => {
    const started = await beginGoogleAuthorization(
      new Request('https://quangtu.vn/api/auth/google?returnTo=/tu-tap'),
      authEnv(),
    );
    const state = String(new URL(started.url).searchParams.get('state'));
    await expect(completeGoogleAuthorization(
      new Request(`https://quangtu.vn/api/auth/google/callback?state=${encodeURIComponent(state)}&code=abc`, {
        headers: { Cookie: '__Host-quangtu_oauth_tx=wrong.signature' },
      }),
      authEnv(),
    )).rejects.toMatchObject({ code: 'oauth_transaction' });

    const nonceHolder = await consumeOAuthState(authEnv(), state);
    expect(nonceHolder).toMatchObject({ returnPath: '/tu-tap' });
    const legitRequest = new Request(`https://quangtu.vn/api/auth/google/callback?state=${encodeURIComponent(state)}&code=abc`, {
      headers: { Cookie: started.transactionCookie.split(';', 1)[0] },
    });
    expect(await verifyOAuthTransactionCookie(legitRequest, authEnv(), state, String(nonceHolder?.nonce))).toBe(true);
  });

  it('rejects invalid returnTo variants before starting oauth', async () => {
    await expect(beginGoogleAuthorization(
      new Request('https://quangtu.vn/api/auth/google?returnTo=%2F%2Fevil.example'),
      authEnv(),
    )).rejects.toMatchObject({ code: 'invalid_return_to' });
    await expect(beginGoogleAuthorization(
      new Request('https://quangtu.vn/api/auth/google?returnTo=/%5Cevil'),
      authEnv(),
    )).rejects.toMatchObject({ code: 'invalid_return_to' });
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
    const timestamp = '2026-07-31T00:00:00.000Z';
    const [first, second] = await Promise.all([
      resolveOrCreateGoogleIdentity(authEnv(), claims, timestamp),
      resolveOrCreateGoogleIdentity(authEnv(), claims, timestamp),
    ]);
    expect(first).toEqual(second);
    expect(first.role).toBe('user');
  });
});

function authEnv() {
  return {
    ...env,
    APP_ORIGIN: 'https://quangtu.vn',
    SESSION_SECRET: 'test-session-secret-with-enough-entropy',
    OAUTH_STATE_SECRET: 'test-oauth-state-secret-with-enough-entropy',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    RATE_LIMIT_SALT: 'rate-limit-salt',
  };
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}

function now() {
  return new Date().toISOString();
}
