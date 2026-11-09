import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import userActivitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import facebookSchema from '../../migrations/0019-facebook-auth-import.sql?raw';
import facebookScanContinuationSchema from '../../migrations/0021-facebook-import-scan-continuation.sql?raw';
import {
  beginFacebookAuthorization,
  completeFacebookAuthorization,
  linkFacebookIdentity,
  resolveOrCreateFacebookIdentity,
} from '../../src/lib/server/auth/facebook-oauth.ts';
import { createOAuthState, loadOAuthState, verifyOAuthTransactionCookie } from '../../src/lib/server/auth/oauth-state.ts';
import { hmacSha256 } from '../../src/lib/server/auth/crypto.ts';
import { sha256 } from '../../src/lib/server/auth/crypto.ts';
import { redeemFacebookHandoff } from '../../src/lib/server/auth/facebook-browser-handoff.ts';
import { toBase64Url } from '../../src/lib/server/crypto.ts';
import { createFacebookRepository } from '../../src/lib/server/repositories/facebook-repository.ts';
import { decryptFacebookToken, encryptFacebookToken } from '../../src/lib/server/integrations/facebook-token-crypto.ts';
import { verifySignedRequest } from '../../src/lib/server/services/facebook-integration.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(userActivitySchema) },
    { name: '0019-facebook-auth-import.sql', queries: splitMigration(facebookSchema) },
    { name: '0021-facebook-import-scan-continuation.sql', queries: splitMigration(facebookScanContinuationSchema) },
  ]);
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM facebook_deletion_requests').run();
  await env.DB.prepare('DELETE FROM facebook_post_imports').run();
  await env.DB.prepare('DELETE FROM facebook_connections').run();
  await env.DB.prepare('DELETE FROM oauth_states').run();
  await env.DB.prepare('DELETE FROM auth_sessions').run();
  await env.DB.prepare('DELETE FROM auth_identities').run();
  await env.DB.prepare('DELETE FROM app_users').run();
});

describe('Facebook OAuth and token boundaries', () => {
  it('consumes an authenticated native consent denial once without creating a session and permits a fresh login', async () => {
    const workerEnv = facebookEnv();
    const started = await beginFacebookAuthorization(new Request('https://quangtu.vn/api/auth/facebook/native'), workerEnv, 'login', null, await sha256('a'.repeat(64)));
    const state = new URL(started.url).searchParams.get('state');
    const request = new Request(`https://quangtu.vn/api/auth/facebook/callback?state=${state}&error=access_denied`, { headers: { Cookie: started.transactionCookie.split(';', 1)[0] } });
    let sql = 0;
    const measured = { ...workerEnv, DB: { prepare(query) { sql++; return workerEnv.DB.prepare(query); } } };
    const fetchImpl = vi.fn();
    const completed = await completeFacebookAuthorization(request, measured, null, { fetchImpl });
    expect(sql).toBe(3); // State read, consume's state read, atomic consume. No identity/session SQL.
    expect(completed).toMatchObject({ outcome: 'cancelled', sessionCookie: null, nativeCallbackUrl: 'vn.quangtu.tutam://auth/facebook?error=cancelled' });
    expect(completed.transactionCookie).toContain('Max-Age=0');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await loadOAuthState(workerEnv, state)).toBeNull();
    await expect(completeFacebookAuthorization(request, workerEnv, null, { fetchImpl })).rejects.toMatchObject({ code: 'oauth_cancelled' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first()).toMatchObject({ n: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM app_users').first()).toMatchObject({ n: 0 });
    const retry = await beginFacebookAuthorization(new Request('https://quangtu.vn/api/auth/facebook/native'), workerEnv, 'login', null, await sha256('b'.repeat(64)));
    const retryState = new URL(retry.url).searchParams.get('state');
    const success = await completeFacebookAuthorization(new Request(`https://quangtu.vn/api/auth/facebook/callback?state=${retryState}&code=fresh-code`, { headers: { Cookie: retry.transactionCookie.split(';', 1)[0] } }), workerEnv, null, { fetchImpl: graphFetch({ scopes: ['public_profile', 'email'] }) });
    expect(success.nativeCallbackUrl).toMatch(/\?code=[A-Za-z0-9_-]{43}$/u);
  });
  it.each(['missing-cookie', 'wrong-cookie', 'expired', 'web', 'wrong-provider', 'handoff', 'provider-failure'])('does not redirect a native denial with invalid or unrelated binding: %s', async reason => {
    const workerEnv = facebookEnv();
    const start = await createOAuthState(workerEnv, '/', { provider: reason === 'wrong-provider' ? 'google' : 'facebook', purpose: 'login',
      ...(reason === 'web' ? {} : { nativeFacebook: { phase: reason === 'handoff' ? 'handoff' : 'authorize', challenge: await sha256('a'.repeat(64)) } }) });
    let cookie = start.transactionCookie.split(';', 1)[0];
    if (reason === 'missing-cookie') cookie = '';
    if (reason === 'wrong-cookie') cookie = (await createOAuthState(workerEnv, '/', { provider: 'facebook' })).transactionCookie.split(';', 1)[0];
    if (reason === 'expired') await env.DB.prepare("UPDATE oauth_states SET expires_at = '2000-01-01' WHERE state_hash = ?").bind(await sha256(start.state)).run();
    const fetchImpl = vi.fn();
    await expect(completeFacebookAuthorization(new Request(`https://quangtu.vn/api/auth/facebook/callback?state=${start.state}&error=${reason === 'provider-failure' ? 'server_error' : 'access_denied'}`, { headers: { Cookie: cookie } }), workerEnv, null, { fetchImpl })).rejects.toMatchObject({ code: 'oauth_cancelled' });
    expect(fetchImpl).not.toHaveBeenCalled();
    if (reason !== 'expired') expect(await loadOAuthState(workerEnv, start.state)).not.toBeNull();
  });
  it('only acknowledges one of two concurrent native consent-denial callbacks', async () => {
    const workerEnv = facebookEnv();
    const start = await createOAuthState(workerEnv, '/', { provider: 'facebook', nativeFacebook: { phase: 'authorize', challenge: await sha256('a'.repeat(64)) } });
    const request = new Request(`https://quangtu.vn/api/auth/facebook/callback?state=${start.state}&error=access_denied`, { headers: { Cookie: start.transactionCookie.split(';', 1)[0] } });
    const results = await Promise.allSettled([completeFacebookAuthorization(request, workerEnv, null), completeFacebookAuthorization(request, workerEnv, null)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  });
  it('hands iOS a verifier-bound single-use code, never a browser session or Facebook token', async () => {
    const workerEnv = facebookEnv();
    const verifier = 'a'.repeat(64);
    const started = await beginFacebookAuthorization(new Request('https://quangtu.vn/api/auth/facebook/native'),
      workerEnv, 'login', null, await sha256(verifier));
    expect(new URL(started.url).searchParams.get('scope')).toBe('public_profile,email');
    const state = new URL(started.url).searchParams.get('state');
    const completed = await completeFacebookAuthorization(new Request(
      `https://quangtu.vn/api/auth/facebook/callback?state=${state}&code=provider-code`,
      { headers: { Cookie: started.transactionCookie.split(';', 1)[0] } }), workerEnv, null,
      { fetchImpl: graphFetch({ scopes: ['public_profile', 'email'] }) });
    expect(completed.sessionCookie).toBeNull();
    expect(completed.nativeCallbackUrl).toMatch(/^vn\.quangtu\.tutam:\/\/auth\/facebook\?code=[A-Za-z0-9_-]{43}$/u);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first()).toMatchObject({ n: 0 });
    const code = new URL(completed.nativeCallbackUrl).searchParams.get('code');
    await expect(redeemFacebookHandoff(workerEnv, code, 'b'.repeat(64))).rejects.toMatchObject({ code: 'facebook_handoff_invalid' });
    let redeemSql = 0;
    const measured = { ...workerEnv, DB: { prepare(sql) { redeemSql++; return workerEnv.DB.prepare(sql); } } };
    const success = await redeemFacebookHandoff(measured, code, verifier);
    expect(redeemSql).toBe(5); // 2 state reads, atomic consume, active-account join, session insert.
    expect(success.payload).toMatchObject({ success: true, user: { role: 'user' } });
    expect(success.cookie).toContain('HttpOnly');
    await expect(redeemFacebookHandoff(workerEnv, code, verifier)).rejects.toMatchObject({ code: 'facebook_handoff_invalid' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first()).toMatchObject({ n: 1 });
  });

  it('rejects authorization states used as handoff codes and expired or revoked-account handoffs', async () => {
    const workerEnv = facebookEnv();
    const verifier = 'a'.repeat(64);
    const start = await createOAuthState(workerEnv, '/', { provider: 'facebook', nativeFacebook: { phase: 'authorize', challenge: await sha256(verifier) } });
    await expect(redeemFacebookHandoff(workerEnv, start.state, verifier)).rejects.toMatchObject({ status: 401 });
    const identity = await resolveOrCreateFacebookIdentity(workerEnv, { id: 'fb-owner', name: 'Owner', email: null, pictureUrl: null });
    for (const reason of ['expired', 'suspended']) {
      const handoff = await createOAuthState(workerEnv, '/', { provider: 'facebook', nativeFacebook: {
        phase: 'handoff', challenge: await sha256(verifier), userId: identity.user_id, identityId: identity.identity_id } });
      if (reason === 'expired') await env.DB.prepare("UPDATE oauth_states SET expires_at = '2000-01-01' WHERE state_hash = ?").bind(await sha256(handoff.state)).run();
      else await env.DB.prepare("UPDATE app_users SET status = 'suspended' WHERE id = ?").bind(identity.user_id).run();
      await expect(redeemFacebookHandoff(workerEnv, handoff.state, verifier)).rejects.toMatchObject({ status: 401 });
    }
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first()).toMatchObject({ n: 0 });
  });
  it('keeps concurrent provider/purpose transactions in independent cookies and binds the actor session', async () => {
    const workerEnv = facebookEnv();
    const first = await createOAuthState(workerEnv, '/admin/settings', {
      provider: 'facebook', purpose: 'connector', actorUserId: 'admin-1', actorSessionId: 'session-a',
      requiredCapability: 'admin:dashboard', redirectUri: 'https://quangtu.vn/api/auth/facebook/callback', resourceGeneration: 3,
    });
    const second = await createOAuthState(workerEnv, '/', { provider: 'facebook', purpose: 'login' });
    expect(first.transactionCookie.split('=', 1)[0]).not.toBe(second.transactionCookie.split('=', 1)[0]);
    const state = new URLSearchParams(first.url || '').get('state') || first.state;
    const loaded = await loadOAuthState(workerEnv, state);
    expect(loaded).toMatchObject({
      provider: 'facebook', purpose: 'connector', actorUserId: 'admin-1',
      requiredCapability: 'admin:dashboard', resourceGeneration: 3,
    });
    expect(await verifyOAuthTransactionCookie(
      new Request(`https://quangtu.vn/callback?state=${state}`, { headers: { Cookie: first.transactionCookie.split(';', 1)[0] } }),
      workerEnv, state, loaded.nonce, 'facebook', 'connector',
    )).toBe(true);
    expect(await verifyOAuthTransactionCookie(
      new Request(`https://quangtu.vn/callback?state=${state}`, { headers: { Cookie: second.transactionCookie.split(';', 1)[0] } }),
      workerEnv, state, loaded.nonce, 'facebook', 'connector',
    )).toBe(false);
  });

  it('round-trips AES-GCM tokens and rejects ciphertext swapping or unavailable key versions', async () => {
    const workerEnv = facebookEnv();
    const encrypted = await encryptFacebookToken(workerEnv, 'secret-user-token', 'connection-a', 'fb-user-a');
    expect(encrypted.ciphertext).not.toContain('secret-user-token');
    await expect(decryptFacebookToken(
      workerEnv, encrypted.ciphertext, encrypted.keyVersion, 'connection-a', 'fb-user-a',
    )).resolves.toBe('secret-user-token');
    await expect(decryptFacebookToken(
      workerEnv, encrypted.ciphertext, encrypted.keyVersion, 'connection-b', 'fb-user-a',
    )).rejects.toBeTruthy();
    await expect(decryptFacebookToken(
      { ...workerEnv, FACEBOOK_TOKEN_KEY_VERSION: 'v2' }, encrypted.ciphertext, 'v1', 'connection-a', 'fb-user-a',
    )).rejects.toThrow('facebook-token-key-unavailable');
  });

  it('does not auto-link by email but permits an explicit authenticated link with conflict protection', async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
      VALUES ('google-owner', 'owner@example.test', 'Owner', 'admin', ?, ?)
    `).bind(now, now).run();
    const profile = { id: 'fb-owner', name: 'Facebook Owner', email: 'owner@example.test', pictureUrl: null };
    await expect(resolveOrCreateFacebookIdentity(facebookEnv(), profile)).rejects.toMatchObject({ code: 'link_required', status: 409 });
    await expect(linkFacebookIdentity(facebookEnv(), 'google-owner', profile)).resolves.toMatchObject({ user_id: 'google-owner' });
    await env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, created_at, updated_at)
      VALUES ('other-owner', 'Other', 'user', ?, ?)
    `).bind(now, now).run();
    await expect(linkFacebookIdentity(facebookEnv(), 'other-owner', profile)).rejects.toMatchObject({ code: 'facebook_identity_conflict' });
  });

  it('logs in with an app-scoped /me id when email is absent and records session provenance', async () => {
    const workerEnv = facebookEnv();
    const started = await beginFacebookAuthorization(
      new Request('https://quangtu.vn/api/auth/facebook?returnTo=/tu-tap'), workerEnv, 'login', null,
    );
    const state = new URL(started.url).searchParams.get('state');
    const fetchImpl = graphFetch({ scopes: ['public_profile'] });
    const completed = await completeFacebookAuthorization(new Request(
      `https://quangtu.vn/api/auth/facebook/callback?state=${encodeURIComponent(state)}&code=code-a`,
      { headers: { Cookie: started.transactionCookie.split(';', 1)[0] } },
    ), workerEnv, null, { fetchImpl, now: new Date('2026-09-04T00:00:00.000Z') });
    expect(completed.outcome).toBe('authenticated');
    const session = await env.DB.prepare('SELECT auth_provider, identity_id FROM auth_sessions').first();
    expect(session).toMatchObject({ auth_provider: 'facebook' });
    const user = await env.DB.prepare("SELECT email FROM app_users WHERE id LIKE 'facebook-%'").first();
    expect(user.email).toBeNull();
    await expect(completeFacebookAuthorization(new Request(
      `https://quangtu.vn/api/auth/facebook/callback?state=${encodeURIComponent(state)}&code=code-a`,
      { headers: { Cookie: started.transactionCookie.split(';', 1)[0] } },
    ), workerEnv, null, { fetchImpl })).rejects.toMatchObject({ code: 'oauth_state' });
  });

  it('keeps login available when connector consent omits user_posts and stores no token', async () => {
    const workerEnv = facebookEnv();
    const actor = await adminSession();
    const started = await beginFacebookAuthorization(
      new Request('https://quangtu.vn/api/integrations/facebook/connect/start?returnTo=/admin/settings'),
      workerEnv, 'connector', actor,
    );
    const state = new URL(started.url).searchParams.get('state');
    const completed = await completeFacebookAuthorization(new Request(
      `https://quangtu.vn/api/auth/facebook/callback?state=${encodeURIComponent(state)}&code=code-b`,
      { headers: { Cookie: started.transactionCookie.split(';', 1)[0] } },
    ), workerEnv, actor, { fetchImpl: graphFetch({ scopes: ['public_profile', 'email'] }) });
    expect(completed.outcome).toBe('permission_missing');
    const connection = await createFacebookRepository(workerEnv).getConnectionForUser(actor.userId);
    expect(connection).toMatchObject({ status: 'permission_missing', token_ciphertext: null });
  });

  it('rejects a token issued to another Meta app before creating an identity', async () => {
    const workerEnv = facebookEnv();
    const started = await beginFacebookAuthorization(
      new Request('https://quangtu.vn/api/auth/facebook'), workerEnv, 'login', null,
    );
    const state = new URL(started.url).searchParams.get('state');

    await expect(completeFacebookAuthorization(new Request(
      `https://quangtu.vn/api/auth/facebook/callback?state=${encodeURIComponent(state)}&code=wrong-app`,
      { headers: { Cookie: started.transactionCookie.split(';', 1)[0] } },
    ), workerEnv, null, { fetchImpl: graphFetch({ scopes: ['public_profile'], appId: 'another-app' }) }))
      .rejects.toMatchObject({ code: 'facebook_token_invalid' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM app_users').first()).toMatchObject({ count: 0 });
  });

  it('does not persist a connector token without a finite expiry', async () => {
    const workerEnv = facebookEnv();
    const actor = await adminSession();
    const started = await beginFacebookAuthorization(
      new Request('https://quangtu.vn/api/integrations/facebook/connect/start'), workerEnv, 'connector', actor,
    );
    const state = new URL(started.url).searchParams.get('state');

    await expect(completeFacebookAuthorization(new Request(
      `https://quangtu.vn/api/auth/facebook/callback?state=${encodeURIComponent(state)}&code=no-expiry`,
      { headers: { Cookie: started.transactionCookie.split(';', 1)[0] } },
    ), workerEnv, actor, {
      fetchImpl: graphFetch({ scopes: ['public_profile', 'user_posts'], expiresAt: null, expiresIn: null }),
    })).rejects.toMatchObject({ code: 'facebook_token_expiry_missing' });
    expect(await createFacebookRepository(workerEnv).getConnectionForUser(actor.userId)).toBeNull();
  });

  it('verifies Meta signed requests and rejects mutations with a bad signature', async () => {
    const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'fb-owner' })));
    const signature = await hmacSha256(facebookEnv().FACEBOOK_APP_SECRET, payload);
    await expect(verifySignedRequest(facebookEnv(), `${signature}.${payload}`)).resolves.toMatchObject({ user_id: 'fb-owner' });
    await expect(verifySignedRequest(facebookEnv(), `invalid.${payload}`)).rejects.toMatchObject({ code: 'facebook_signed_request_invalid' });
    const wrongAlgorithm = toBase64Url(new TextEncoder().encode(JSON.stringify({ algorithm: 'none', user_id: 'fb-owner' })));
    const wrongAlgorithmSignature = await hmacSha256(facebookEnv().FACEBOOK_APP_SECRET, wrongAlgorithm);
    await expect(verifySignedRequest(facebookEnv(), `${wrongAlgorithmSignature}.${wrongAlgorithm}`))
      .rejects.toMatchObject({ code: 'facebook_signed_request_invalid' });
  });
});

async function adminSession() {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
    VALUES ('admin-facebook', 'admin@example.test', 'Admin', 'admin', ?, ?)
  `).bind(now, now).run();
  return {
    id: 'admin-session', userId: 'admin-facebook', appUserId: 'admin-facebook',
    email: 'admin@example.test', displayName: 'Admin', avatarUrl: null, role: 'admin',
    expiresAt: '2026-12-01T00:00:00.000Z', csrfToken: 'csrf', rawToken: 'raw',
    identityId: null, authProvider: 'google',
  };
}

function graphFetch({ scopes, appId = 'facebook-app-id', expiresAt = 1_800_000_000, expiresIn = 5_184_000 }) {
  return vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/oauth/access_token')) {
      return Response.json({ access_token: 'facebook-user-token', expires_in: expiresIn });
    }
    if (url.pathname.endsWith('/debug_token')) {
      return Response.json({ data: {
        app_id: appId, is_valid: true, user_id: 'fb-owner', scopes,
        expires_at: expiresAt, data_access_expires_at: expiresAt,
      } });
    }
    if (url.pathname.endsWith('/me')) {
      return Response.json({ id: 'fb-owner', name: 'Facebook Owner', picture: { data: {} } });
    }
    throw new Error(`unexpected graph request: ${url.pathname}`);
  });
}

function facebookEnv() {
  return {
    ...env,
    APP_ORIGIN: 'https://quangtu.vn',
    SESSION_SECRET: 'session-secret-with-enough-entropy',
    OAUTH_STATE_SECRET: 'oauth-state-secret-with-enough-entropy',
    RATE_LIMIT_SALT: 'rate-limit-salt',
    FACEBOOK_APP_ID: 'facebook-app-id',
    FACEBOOK_APP_SECRET: 'facebook-app-secret',
    FACEBOOK_TOKEN_ENCRYPTION_KEY: 'facebook-token-encryption-key-with-enough-entropy',
    FACEBOOK_TOKEN_KEY_VERSION: 'v1',
    FACEBOOK_GRAPH_API_VERSION: 'v26.0',
    FACEBOOK_IMPORT_ENABLED: 'true',
  };
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}
