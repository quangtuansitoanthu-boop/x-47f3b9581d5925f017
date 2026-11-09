import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ google: vi.fn(), facebook: vi.fn(), session: vi.fn() }));
vi.mock('$lib/server/auth/google-oauth', async (original) => ({ ...await original<object>(), resolveOrCreateGoogleIdentity: mocks.google }));
vi.mock('$lib/server/auth/facebook-oauth', async (original) => ({ ...await original<object>(), resolveOrCreateFacebookIdentity: mocks.facebook }));
vi.mock('$lib/server/auth/sessions', async (original) => ({ ...await original<object>(), createSession: mocks.session }));
import { POST } from '../../src/routes/api/auth/native-verify/+server';
import { OAuthError } from '../../src/lib/server/auth/google-oauth';

let keyPair: CryptoKeyPair;
let jwk: JsonWebKey;
const now = Math.floor(Date.now() / 1000);
const env = {
  GOOGLE_NATIVE_CLIENT_IDS: undefined as string | undefined,
  GOOGLE_CLIENT_ID: 'our-google-client', APPLE_CLIENT_ID: 'vn.quangtu.tutam', FACEBOOK_APP_ID: 'our-facebook-app',
  FACEBOOK_APP_SECRET: 'secret', FACEBOOK_GRAPH_API_VERSION: 'v26.0', RATE_LIMIT_SALT: 'test-salt',
  DB: { batch: vi.fn(), prepare: vi.fn() }, AUTH_RATE_LIMITER: { limit: vi.fn() },
};
const baseClaims = () => ({ iss: 'https://appleid.apple.com', sub: 'apple-subject', aud: 'vn.quangtu.tutam', iat: now, exp: now + 300, email: 'verified@example.test', email_verified: true });
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function appleToken(claims: Record<string, unknown>, alg = 'RS256', validSignature = true) {
  const input = `${encode({ alg, kid: 'audit-key' })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(input));
  return `${input}.${validSignature ? Buffer.from(signature).toString('base64url') : 'Zm9yZ2Vk'}`;
}
const googleClaims = () => ({ iss: 'https://accounts.google.com', sub: 'google-subject', aud: 'our-google-client', exp: String(now + 300), iat: String(now), email: 'verified@example.test', email_verified: 'true', name: 'Member' });
let googlePayload: Record<string, unknown>;
let facebookDebug: Record<string, unknown>;
let facebookProfile: Record<string, unknown>;
let fetcher: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = { ...await crypto.subtle.exportKey('jwk', keyPair.publicKey), kid: 'audit-key', alg: 'RS256', use: 'sig' } as JsonWebKey;
});
beforeEach(() => {
  vi.clearAllMocks();
  env.GOOGLE_NATIVE_CLIENT_IDS = undefined;
  googlePayload = googleClaims();
  facebookDebug = { app_id: 'our-facebook-app', user_id: 'fb-subject', is_valid: true, expires_at: now + 300, data_access_expires_at: now + 300 };
  facebookProfile = { id: 'fb-subject', name: 'Member' };
  env.DB.batch.mockResolvedValue([]);
  const statement = { bind: vi.fn(), first: vi.fn(async () => ({ role: 'user', status: 'active' })) };
  statement.bind.mockReturnValue(statement);
  env.DB.prepare.mockReturnValue(statement);
  env.AUTH_RATE_LIMITER.limit.mockResolvedValue({ success: true });
  mocks.google.mockResolvedValue({ user_id: 'google-user', identity_id: 'google-identity', role: 'user' });
  mocks.facebook.mockResolvedValue({ user_id: 'facebook-user', identity_id: 'facebook-identity', role: 'user' });
  mocks.session.mockResolvedValue({ cookie: 'session=test; HttpOnly', csrfToken: 'real-csrf', expiresAt: '2026-12-01T00:00:00Z' });
  fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://appleid.apple.com/auth/keys')) return Response.json({ keys: [jwk] });
    if (url === 'https://www.facebook.com/.well-known/oauth/openid/jwks/') return Response.json({ keys: [jwk] });
    if (url.includes('tokeninfo')) return Response.json(googlePayload);
    if (url.includes('debug_token')) return Response.json({ data: facebookDebug });
    if (url.includes('/me?')) return Response.json(facebookProfile);
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());
async function send(provider: unknown, token: unknown, user?: unknown, extra: Record<string, unknown> = {}) {
  return POST({ request: new Request('https://quangtu.vn/api/auth/native-verify', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '127.0.0.1' }, body: JSON.stringify({ provider, token, user, ...extra }) }), locals: { env, migrationSealed: true } } as any);
}
describe('native identity verification', () => {
  it('verifies Limited Login using the existing Facebook identity owner and persisted role', async () => {
    const nonce = 'a'.repeat(64);
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))).toString('hex');
    const token = await appleToken({ iss: 'https://www.facebook.com', aud: env.FACEBOOK_APP_ID, sub: 'fb-subject', iat: now, exp: now + 300, nonce: hash, name: 'Verified', email: 'verified@example.test' });
    const response = await send('facebook', token, { email: 'admin@attacker.test', role: 'admin' }, { tokenType: 'limited', nonce });
    expect(response.status).toBe(200);
    expect(mocks.facebook).toHaveBeenCalledTimes(1);
    expect(mocks.facebook.mock.calls[0][1]).toMatchObject({ id: 'fb-subject', email: 'verified@example.test' });
    expect(mocks.session.mock.calls[0][1]).toEqual({ userId: 'facebook-user', identityId: 'facebook-identity', authProvider: 'facebook' });
    expect(await response.json()).toMatchObject({ user: { role: 'user' }, session: { csrfToken: 'real-csrf' } });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(env.DB.prepare).toHaveBeenCalledTimes(1);
  });
  it.each([{ tokenType: 'limited' }, { tokenType: 'unknown' }, { tokenType: 'limited', nonce: 'wrong' }])('rejects invalid Limited Login before any identity/session SQL: %j', async extra => {
    const response = await send('facebook', 'invalid.jwt.signature', undefined, extra);
    expect([400, 401]).toContain(response.status);
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(env.DB.batch).not.toHaveBeenCalled();
    expect(mocks.facebook).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts the configured Android audience alongside a different web OAuth client', async () => {
    env.GOOGLE_NATIVE_CLIENT_IDS = ' android-server-client , ios-server-client ';
    googlePayload.aud = 'android-server-client';
    const response = await send('google', 'google-token');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ userId: 'google-user', session: { csrfToken: 'real-csrf' } });
  });
  it('rejects a signed Google token for an unconfigured app even when native clients are configured', async () => {
    env.GOOGLE_NATIVE_CLIENT_IDS = 'android-server-client';
    googlePayload.aud = 'attacker-client';
    const response = await send('google', 'google-token', { audience: 'attacker-client' });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'google_audience_mismatch' });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([
    [{ is_valid: false }, 'facebook_token_invalid'],
    [{ expires_at: now - 1 }, 'facebook_token_expired'],
    [{ data_access_expires_at: now - 1 }, 'facebook_token_expired'],
    [{ app_id: 'other-app' }, 'facebook_app_mismatch'],
  ])('returns a safe diagnostic for Facebook rejection %j', async (overrides, code) => {
    facebookDebug = { ...facebookDebug, ...overrides };
    const response = await send('facebook', 'private-fb-token');
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toMatchObject({ code });
    expect(JSON.stringify(payload)).not.toContain('private-fb-token');
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('treats Facebook Graph code 190 as an expired login rather than a server outage', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ error: { code: 190, message: 'private provider diagnostic' } }, { status: 400 }));
    const response = await send('facebook', 'private-fb-token');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'facebook_token_invalid' });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('reports required account linking without merging identities or creating a session', async () => {
    mocks.facebook.mockRejectedValueOnce(new OAuthError('link_required', 'Hãy đăng nhập rồi liên kết Facebook.', 409));
    const response = await send('facebook', 'fb-token');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'link_required' });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('logs only the bounded failing verification stage without exposing provider errors', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fetcher.mockRejectedValueOnce(new TypeError('private provider URL and token'));
      expect((await send('google', 'google-token')).status).toBe(503);
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('"stage":"provider_verify"'));
      expect(JSON.stringify(logger.mock.calls)).not.toContain('private provider URL');
      expect(JSON.stringify(logger.mock.calls)).not.toContain('google-token');
    } finally { logger.mockRestore(); }
  });
  it.each([
    ['signature', {}, 'RS256', false], ['algorithm', {}, 'none', true],
    ['issuer', { iss: 'https://attacker.test' }, 'RS256', true], ['audience', { aud: 'other-app' }, 'RS256', true],
    ['expiration', { exp: now - 30 }, 'RS256', true], ['missing expiration', { exp: null }, 'RS256', true],
    ['subject type', { sub: { id: 'forged' } }, 'RS256', true], ['future issue time', { iat: now + 3600 }, 'RS256', true],
  ])('rejects invalid Apple %s before writing identities or sessions', async (_case, overrides, alg, signed) => {
    const token = await appleToken({ ...baseClaims(), ...overrides as object }, alg as string, signed as boolean);
    expect((await send('apple', token)).status).toBe(401);
    expect(env.DB.batch).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('accepts a signed Apple token and keeps the existing deterministic identity', async () => {
    const response = await send('apple', await appleToken(baseClaims()));
    expect(response.status).toBe(200);
    expect(mocks.session.mock.calls[0][1]).toEqual(expect.objectContaining({ userId: expect.stringMatching(/^apple-/), identityId: expect.stringMatching(/^apple-identity-/) }));
    expect(await response.json()).toMatchObject({ session: { csrfToken: 'real-csrf', expiresAt: '2026-12-01T00:00:00Z' } });
  });
  it.each([{ aud: 'other-app' }, { iss: 'https://attacker.test' }, { exp: String(now - 30) }, { exp: 'NaN' }, { sub: null }])('rejects Google claims %j', async (overrides) => {
    googlePayload = { ...googleClaims(), ...overrides };
    expect((await send('google', 'google-token')).status).toBe(401);
    expect(mocks.google).not.toHaveBeenCalled();
  });
  it('normalizes the verified Google email flag and returns the real CSRF', async () => {
    const response = await send('google', 'google-token');
    expect(response.status).toBe(200);
    expect(mocks.google.mock.calls[0][1]).toMatchObject({ email_verified: true });
    expect(await response.json()).toMatchObject({ session: { csrfToken: 'real-csrf' } });
  });
  it.each([{ app_id: 'other-app' }, { is_valid: false }, { user_id: 'another-user' }, { expires_at: now - 1 }])('rejects Facebook token debug %j', async (overrides) => {
    facebookDebug = { ...facebookDebug, ...overrides };
    expect((await send('facebook', 'fb-token')).status).toBe(401);
    expect(mocks.facebook).not.toHaveBeenCalled();
  });
  it('never trusts a client supplied Facebook email and returns real CSRF', async () => {
    const response = await send('facebook', 'fb-token', { email: 'admin@example.test', name: 'Member' });
    expect(response.status).toBe(200);
    expect(mocks.facebook.mock.calls[0][1]).toMatchObject({ email: null });
    expect(await response.json()).toMatchObject({ session: { csrfToken: 'real-csrf' } });
  });
  it.each([['apple', 123], [[], 'token'], ['google', { token: 'fake' }]])('rejects malformed provider/token values', async (provider, token) => {
    expect((await send(provider, token)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('limits repeated native sign-in before contacting identity providers', async () => {
    env.AUTH_RATE_LIMITER.limit.mockResolvedValue({ success: false });
    expect((await send('google', 'token')).status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not expose provider exceptions to clients', async () => {
    fetcher.mockRejectedValue(new Error('sensitive-provider-configuration'));
    const response = await send('google', 'token');
    expect(await response.text()).not.toContain('sensitive-provider-configuration');
  });
  it('does not create a new session for a suspended account', async () => {
    const statement = { bind: vi.fn(), first: vi.fn(async () => ({ role: 'user', status: 'suspended' })) };
    statement.bind.mockReturnValue(statement);
    env.DB.prepare.mockReturnValue(statement);
    expect((await send('google', 'token')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
