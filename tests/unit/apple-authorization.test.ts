import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { revokeStoredAppleAuthorization, storeAppleAuthorization } from '$lib/server/auth/apple-authorization';

const verify = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/auth/native-token-verification', () => ({ verifyAppleNativeToken: verify }));
let signingKey: string;
beforeAll(async () => {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  signingKey = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', key.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
});
beforeEach(() => { vi.clearAllMocks(); verify.mockResolvedValue({ sub: 'apple-a' }); });
afterEach(() => vi.unstubAllGlobals());

function setup() {
  let row: any = null;
  let revisionMismatch = false;
  const sql: string[] = [];
  const db = {
    prepare(query: string) {
      sql.push(query);
      let values: unknown[];
      const statement = {
        bind(...bound: unknown[]) { values = bound; return statement; },
        first: async () => row,
        run: async () => {
          if (/INSERT INTO apple_account_tokens/u.test(query)) {
            row = { owner_id: values[0], provider_subject: values[1], encrypted_refresh_token: values[2], key_version: values[3], revision: values[4], revoked_at: null };
          } else if (/UPDATE apple_account_tokens/u.test(query)) {
            if (revisionMismatch) return { meta: { changes: 0 } };
            row.revoked_at = values[0];
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  const env = {
    DB: db, APPLE_CLIENT_ID: 'vn.quangtu.tutam', APPLE_TEAM_ID: 'TESTTEAM', APPLE_KEY_ID: 'TESTKEY',
    APPLE_PRIVATE_KEY: signingKey, APPLE_TOKEN_ENCRYPTION_KEY: 'test-only-encryption-material-at-least-32-characters',
  } as any;
  const fetcher = vi.fn(async (input: string, init: RequestInit) => {
    expect(init.redirect).toBe('error');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('client_id')).toBe('vn.quangtu.tutam');
    expect(body.get('client_secret')?.split('.')).toHaveLength(3);
    if (input.endsWith('/token')) return Response.json({ refresh_token: 'private-refresh-token', id_token: 'signed-exchange-token' });
    expect(body.get('token')).toBe('private-refresh-token');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', fetcher);
  return { env, sql, fetcher, row: () => row, mismatch: () => { revisionMismatch = true; } };
}

it('encrypts the refresh token and skips repeat revocation after a confirmed durable marker', async () => {
  const state = setup();
  await storeAppleAuthorization(state.env, 'owner-a', 'apple-a', 'code-a');
  expect(verify).toHaveBeenCalledWith(state.env, 'signed-exchange-token');
  expect(state.row().encrypted_refresh_token).not.toContain('private-refresh-token');
  expect(await revokeStoredAppleAuthorization(state.env, 'owner-a', 'apple-a')).toBe(true);
  expect(await revokeStoredAppleAuthorization(state.env, 'owner-a', 'apple-a')).toBe(true);
  expect(state.fetcher).toHaveBeenCalledTimes(2);
});

it('rejects an exchanged token for another Apple owner before storing it', async () => {
  const state = setup();
  verify.mockResolvedValue({ sub: 'apple-b' });
  await expect(storeAppleAuthorization(state.env, 'owner-a', 'apple-a', 'code-a')).rejects.toThrow();
  expect(state.row()).toBeNull();
});

it('does not mark a concurrently replaced token revoked', async () => {
  const state = setup();
  await storeAppleAuthorization(state.env, 'owner-a', 'apple-a', 'code-a');
  state.mismatch();
  await expect(revokeStoredAppleAuthorization(state.env, 'owner-a', 'apple-a')).rejects.toThrow();
  expect(state.row().revoked_at).toBeNull();
});

it('keeps the retained token unrevoked when Apple fails', async () => {
  const state = setup();
  await storeAppleAuthorization(state.env, 'owner-a', 'apple-a', 'code-a');
  state.fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(revokeStoredAppleAuthorization(state.env, 'owner-a', 'apple-a')).rejects.toThrow();
  expect(state.row().revoked_at).toBeNull();
});
