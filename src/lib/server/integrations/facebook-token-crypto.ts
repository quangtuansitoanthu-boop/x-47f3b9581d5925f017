import type { CloudflareEnvLike } from '../cloudflare-context';
import { fromBase64Url, toBase64Url } from '../crypto';
import { requiredSecret } from '../auth/sessions';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface EncryptedFacebookToken {
  ciphertext: string;
  keyVersion: string;
}

export async function encryptFacebookToken(
  env: CloudflareEnvLike,
  token: string,
  connectionId: string,
  facebookUserId: string,
): Promise<EncryptedFacebookToken> {
  if (!token) throw new Error('facebook-token-empty');
  const keyVersion = normalizeKeyVersion(env.FACEBOOK_TOKEN_KEY_VERSION || 'v1');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await tokenKey(requiredSecret(env, 'FACEBOOK_TOKEN_ENCRYPTION_KEY'), ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: aad(connectionId, facebookUserId, keyVersion) },
    key,
    encoder.encode(token),
  );
  return {
    ciphertext: `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`,
    keyVersion,
  };
}

export async function decryptFacebookToken(
  env: CloudflareEnvLike,
  ciphertext: string,
  keyVersion: string,
  connectionId: string,
  facebookUserId: string,
): Promise<string> {
  const version = normalizeKeyVersion(keyVersion);
  const currentVersion = normalizeKeyVersion(env.FACEBOOK_TOKEN_KEY_VERSION || 'v1');
  const previousVersion = env.FACEBOOK_TOKEN_PREVIOUS_KEY_VERSION
    ? normalizeKeyVersion(env.FACEBOOK_TOKEN_PREVIOUS_KEY_VERSION)
    : null;
  const secret = version === currentVersion
    ? requiredSecret(env, 'FACEBOOK_TOKEN_ENCRYPTION_KEY')
    : version === previousVersion && env.FACEBOOK_TOKEN_ENCRYPTION_KEY_PREVIOUS
      ? env.FACEBOOK_TOKEN_ENCRYPTION_KEY_PREVIOUS
      : null;
  if (!secret) throw new Error('facebook-token-key-unavailable');
  const [iv, value] = String(ciphertext).split('.');
  if (!iv || !value) throw new Error('facebook-token-invalid');
  const key = await tokenKey(secret, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(iv),
      additionalData: aad(connectionId, facebookUserId, version),
    },
    key,
    fromBase64Url(value),
  );
  return decoder.decode(plaintext);
}

function aad(connectionId: string, facebookUserId: string, version: string): ArrayBuffer {
  return encoder.encode(`facebook-token:${connectionId}:${facebookUserId}:${version}`).buffer as ArrayBuffer;
}

async function tokenKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const material = encoder.encode(secret);
  if (material.byteLength < 32) throw new Error('facebook-token-key-too-short');
  const raw = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usages);
}

function normalizeKeyVersion(value: string): string {
  const normalized = String(value).trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/u.test(normalized)) throw new Error('facebook-token-key-version-invalid');
  return normalized;
}
