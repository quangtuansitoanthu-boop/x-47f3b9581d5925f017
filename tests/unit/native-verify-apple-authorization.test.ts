import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), store: vi.fn(), session: vi.fn() }));
vi.mock('$lib/server/auth/native-token-verification', async original => ({
  ...await original<object>(), verifyAppleNativeToken: mocks.verify,
}));
vi.mock('$lib/server/auth/apple-authorization', () => ({ storeAppleAuthorization: mocks.store }));
vi.mock('$lib/server/auth/sessions', async original => ({ ...await original<object>(), createSession: mocks.session }));
import { POST } from '../../src/routes/api/auth/native-verify/+server';
import { NativeAuthError } from '$lib/server/auth/native-token-verification';

const order: string[] = [];
const first = vi.fn();
const statement = { bind: vi.fn(), first };
const env = {
  DB: { prepare: vi.fn(), batch: vi.fn() },
  AUTH_RATE_LIMITER: { limit: vi.fn() }, RATE_LIMIT_SALT: 'test-only',
};

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  statement.bind.mockReturnValue(statement);
  env.DB.prepare.mockReturnValue(statement);
  env.DB.batch.mockResolvedValue([]);
  first.mockImplementation(async () => { order.push('account'); return { status: 'active', role: 'user' }; });
  env.AUTH_RATE_LIMITER.limit.mockResolvedValue({ success: true });
  mocks.verify.mockImplementation(async () => { order.push('verify'); return { sub: 'verified-apple-subject' }; });
  mocks.store.mockImplementation(async () => { order.push('store'); });
  mocks.session.mockImplementation(async () => {
    order.push('session');
    return { cookie: 'session=test; HttpOnly', csrfToken: 'csrf', expiresAt: '2026-12-01T00:00:00Z' };
  });
});
afterEach(() => vi.restoreAllMocks());

function send(extra: Record<string, unknown> = {}) {
  return POST({ request: new Request('https://example.test/api/auth/native-verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'apple', token: 'private-id-token', ...extra }),
  }), locals: { env, migrationSealed: true } } as any);
}

it('stores authorization for the verified subject and persisted account before issuing the session', async () => {
  const response = await send({ authorizationCode: 'private-code', user: { sub: 'forged-subject', userId: 'forged-owner' } });
  expect(response.status).toBe(200);
  expect(order).toEqual(['verify', 'account', 'store', 'session']);
  const principal = mocks.session.mock.calls[0][1];
  expect(mocks.store).toHaveBeenCalledExactlyOnceWith(env, principal.userId, 'verified-apple-subject', 'private-code');
  expect(principal.userId).toMatch(/^apple-/u);
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(await response.text()).not.toMatch(/private-code|private-id-token|forged-owner/u);
});

it('preserves login for installed SDK versions without an authorization code', async () => {
  const response = await send();
  expect(response.status).toBe(200);
  expect(mocks.store).not.toHaveBeenCalled();
  expect(mocks.session).toHaveBeenCalledTimes(1);
});

it.each([null, false, 123, {}, [], '', '   ', 'a'.repeat(4097)])('rejects malformed authorization code before provider verification or SQL: %j', async authorizationCode => {
  expect((await send({ authorizationCode })).status).toBe(400);
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(env.DB.prepare).not.toHaveBeenCalled();
  expect(env.DB.batch).not.toHaveBeenCalled();
  expect(mocks.store).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});

it('accepts the 4096-character boundary', async () => {
  const authorizationCode = 'a'.repeat(4096);
  expect((await send({ authorizationCode })).status).toBe(200);
  expect(mocks.store.mock.calls[0][3]).toBe(authorizationCode);
});

it('does not exchange or persist authorization for a rejected Apple token', async () => {
  mocks.verify.mockRejectedValueOnce(new NativeAuthError(401));
  expect((await send({ authorizationCode: 'private-code' })).status).toBe(401);
  expect(env.DB.prepare).not.toHaveBeenCalled();
  expect(env.DB.batch).not.toHaveBeenCalled();
  expect(mocks.store).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});

it.each([null, { status: 'disabled', role: 'user' }])('does not store authorization or issue a session for an inactive account: %j', async account => {
  first.mockResolvedValueOnce(account);
  expect((await send({ authorizationCode: 'private-code' })).status).toBe(403);
  expect(mocks.store).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});

it('fails closed without session, cookie, or provider secrets when authorization storage fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.store.mockRejectedValueOnce(new Error('private-code private-id-token private-refresh-token'));
  const response = await send({ authorizationCode: 'private-code' });
  expect(response.status).toBe(503);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.session).not.toHaveBeenCalled();
  expect(await response.text()).not.toMatch(/private-code|private-id-token|private-refresh-token/u);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-code|private-id-token|private-refresh-token/u);
  expect(JSON.stringify(log.mock.calls)).toContain('apple_authorization');
});
