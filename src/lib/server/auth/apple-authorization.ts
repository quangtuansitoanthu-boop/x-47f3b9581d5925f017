import type { CloudflareEnvLike } from '../cloudflare-context';
import { fromBase64Url, toBase64Url } from './crypto';
import { requiredSecret } from './sessions';
import { verifyAppleNativeToken } from './native-token-verification';

interface TokenRow {
  provider_subject: string;
  encrypted_refresh_token: string;
  key_version: string;
  revision: string;
  revoked_at: string | null;
}

/** Authorization codes and refresh tokens never leave this server owner. */
export async function storeAppleAuthorization(env: CloudflareEnvLike, ownerId: string, subject: string, code: string): Promise<void> {
  if (!code || code.length > 4096) throw new Error('apple-code-invalid');
  // Validate storage configuration before consuming Apple's one-time code.
  const version = keyVersion(env.APPLE_TOKEN_KEY_VERSION || 'v1');
  const key = await encryptionKey(requiredSecret(env, 'APPLE_TOKEN_ENCRYPTION_KEY'), ['encrypt']);
  const response = await appleRequest(env, 'token', { code, grant_type: 'authorization_code' });
  const data = await readTokenResponse(response);
  const claims = await verifyAppleNativeToken(env, data.id_token);
  if (claims.sub !== subject) throw new Error('apple-exchange-identity-mismatch');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(ownerId, subject, version) }, key, new TextEncoder().encode(data.refresh_token));
  const ciphertext = `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
  await env.DB.prepare(`INSERT INTO apple_account_tokens
    (owner_id, provider_subject, encrypted_refresh_token, key_version, revision, revoked_at)
    VALUES (?, ?, ?, ?, ?, NULL)
    ON CONFLICT(owner_id, provider_subject) DO UPDATE SET
      encrypted_refresh_token = excluded.encrypted_refresh_token, key_version = excluded.key_version,
      revision = excluded.revision, revoked_at = NULL`)
    .bind(ownerId, subject, ciphertext, version, crypto.randomUUID()).run();
}

/** False requests reauthentication for an older account with no retained grant. */
export async function revokeStoredAppleAuthorization(env: CloudflareEnvLike, ownerId: string, subject: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT provider_subject, encrypted_refresh_token, key_version, revision, revoked_at
    FROM apple_account_tokens WHERE owner_id = ? AND provider_subject = ?`).bind(ownerId, subject).first<TokenRow>();
  if (!row) return false;
  if (row.provider_subject !== subject) throw new Error('apple-token-identity-mismatch');
  if (row.revoked_at) return true;
  const version = keyVersion(row.key_version);
  const secret = version === keyVersion(env.APPLE_TOKEN_KEY_VERSION || 'v1')
    ? requiredSecret(env, 'APPLE_TOKEN_ENCRYPTION_KEY')
    : version === env.APPLE_TOKEN_PREVIOUS_KEY_VERSION
      ? requiredSecret(env, 'APPLE_TOKEN_ENCRYPTION_KEY_PREVIOUS') : null;
  if (!secret) throw new Error('apple-token-key-unavailable');
  const parts = row.encrypted_refresh_token.split('.');
  if (parts.length !== 2 || !parts.every(Boolean)) throw new Error('apple-token-invalid');
  const key = await encryptionKey(secret, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(parts[0]), additionalData: aad(ownerId, subject, version) }, key, fromBase64Url(parts[1]));
  await appleRequest(env, 'revoke', { token: new TextDecoder().decode(plaintext), token_type_hint: 'refresh_token' });
  // A new login may replace the grant while Apple is responding. Never mark it revoked.
  const result = await env.DB.prepare(`UPDATE apple_account_tokens SET revoked_at = ?
    WHERE owner_id = ? AND provider_subject = ? AND revision = ? AND revoked_at IS NULL`)
    .bind(new Date().toISOString(), ownerId, subject, row.revision).run();
  if (Number(result.meta?.changes ?? 0) !== 1) throw new Error('apple-token-changed');
  return true;
}

async function appleRequest(env: CloudflareEnvLike, endpoint: 'token' | 'revoke', fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams({ client_id: env.APPLE_CLIENT_ID || 'vn.quangtu.tutam', client_secret: await clientSecret(env), ...fields });
  const response = await fetch(`https://appleid.apple.com/auth/${endpoint}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: body.toString(),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error('apple-authorization-unavailable'); }
  if (endpoint === 'revoke') await response.body?.cancel();
  return response;
}

async function clientSecret(env: CloudflareEnvLike): Promise<string> {
  const encode = (value: object) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'ES256', kid: requiredSecret(env, 'APPLE_KEY_ID') })}.${encode({
    iss: requiredSecret(env, 'APPLE_TEAM_ID'), iat: now, exp: now + 300,
    aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID || 'vn.quangtu.tutam',
  })}`;
  const pem = requiredSecret(env, 'APPLE_PRIVATE_KEY').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/gu, '');
  const bytes = Uint8Array.from(atob(pem), character => character.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${toBase64Url(new Uint8Array(signature))}`;
}

async function readTokenResponse(response: Response): Promise<{ id_token: string; refresh_token: string }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('apple-token-response-invalid');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 32_768) { await reader.cancel(); throw new Error('apple-token-response-too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof data?.id_token !== 'string' || !data.id_token || typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 8192) throw new Error('apple-token-response-invalid');
  return data;
}

async function encryptionKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const material = new TextEncoder().encode(secret);
  if (material.byteLength < 32) throw new Error('apple-token-key-too-short');
  const raw = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usages);
}
function keyVersion(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/u.test(value)) throw new Error('apple-key-version-invalid');
  return value;
}
function aad(owner: string, subject: string, version: string): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(['apple-token', owner, subject, version])).buffer as ArrayBuffer;
}
