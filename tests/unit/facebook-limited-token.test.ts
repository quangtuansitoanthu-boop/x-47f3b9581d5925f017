import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { verifyFacebookLimitedToken } from '../../src/lib/server/auth/native-token-verification';

const nonce = 'a'.repeat(64);
const now = Math.floor(Date.now() / 1000);
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
let nonceHash: string;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'meta-key', alg: 'RS256', use: 'sig' } as JsonWebKey;
  nonceHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))).toString('hex');
});
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [jwk] }))));
afterEach(() => vi.unstubAllGlobals());
const env = { FACEBOOK_APP_ID: '2174388996483129' };
async function token(overrides: Record<string, unknown> = {}, header: Record<string, unknown> = {}, valid = true) {
  const input = `${encode({ alg: 'RS256', kid: 'meta-key', ...header })}.${encode({
    iss: 'https://www.facebook.com', aud: env.FACEBOOK_APP_ID, sub: 'fb-user', nonce: nonceHash,
    iat: now, exp: now + 600, name: 'Verified name', email: 'member@example.test', ...overrides,
  })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input));
  return `${input}.${valid ? Buffer.from(signature).toString('base64url') : 'Zm9yZ2Vk'}`;
}
it('verifies iOS JWT signatures and nonce against the fixed Meta endpoint without D1 or Graph token calls', async () => {
  expect(await verifyFacebookLimitedToken(env, await token(), nonce)).toMatchObject({ id: 'fb-user', name: 'Verified name', email: 'member@example.test' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('https://www.facebook.com/.well-known/oauth/openid/jwks/', expect.objectContaining({ redirect: 'manual' }));
});
it.each([
  { aud: 'another-app' }, { iss: 'https://attacker.test' }, { exp: now - 1 }, { iat: now + 1000 },
  { nonce: 'b'.repeat(64) }, { sub: '' }, { nbf: now + 1000 },
])('rejects invalid claims before provider requests: %j', async claims => {
  await expect(verifyFacebookLimitedToken(env, await token(claims), nonce)).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects missing nonce, forged signatures, wrong algorithms and unknown keys', async () => {
  await expect(verifyFacebookLimitedToken(env, await token(), '')).rejects.toMatchObject({ status: 401 });
  await expect(verifyFacebookLimitedToken(env, await token({}, {}, false), nonce)).rejects.toMatchObject({ status: 401 });
  await expect(verifyFacebookLimitedToken(env, await token({}, { alg: 'none' }), nonce)).rejects.toMatchObject({ status: 401 });
  await expect(verifyFacebookLimitedToken(env, await token({}, { kid: 'unknown' }), nonce)).rejects.toMatchObject({ status: 401 });
});
it('ignores attacker-controlled JWK URLs and rejects redirects and oversized provider responses', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://attacker.test' } }));
  await expect(verifyFacebookLimitedToken(env, await token({}, { jku: 'https://attacker.test' }), nonce)).rejects.toMatchObject({ status: 503 });
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.mocked(fetch).mockResolvedValue(new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }));
  await expect(verifyFacebookLimitedToken(env, await token(), nonce)).rejects.toMatchObject({ status: 503 });
});
