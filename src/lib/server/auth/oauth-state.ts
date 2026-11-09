import type { CloudflareEnvLike } from '../cloudflare-context';
import { fromBase64Url, toBase64Url } from '../crypto';
import { hmacSha256, randomToken, sha256 } from './crypto';
import { constantTimeEqual } from '../http/security';
import { requiredSecret, readSingleCookie } from './sessions';
import { resolveAuthCookiePolicy } from './auth-cookie-policy';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SECURE_TRANSACTION_COOKIE_PREFIX = '__Host-quangtu_oauth_tx_';
const LOOPBACK_TRANSACTION_COOKIE_PREFIX = 'quangtu_oauth_tx_';

export type OAuthProvider = 'google' | 'facebook';
export type OAuthPurpose = 'login' | 'link' | 'connector';

export interface NativeFacebookState {
  phase: 'authorize' | 'handoff';
  challenge: string;
  userId?: string;
  identityId?: string;
}

export interface OAuthStateBinding {
  provider?: OAuthProvider;
  purpose?: OAuthPurpose;
  actorUserId?: string | null;
  actorSessionId?: string | null;
  requiredCapability?: string | null;
  redirectUri?: string | null;
  resourceGeneration?: number;
  nativeFacebook?: NativeFacebookState;
}

export interface LoadedOAuthState {
  stateHash: string;
  verifier: string;
  nonce: string;
  returnPath: string;
  provider: OAuthProvider;
  purpose: OAuthPurpose;
  actorUserId: string | null;
  actorSessionHash: string | null;
  requiredCapability: string | null;
  redirectUri: string | null;
  resourceGeneration: number;
  nativeFacebook?: NativeFacebookState;
}

export async function createOAuthState(
  env: CloudflareEnvLike,
  returnPath = '/',
  binding: OAuthStateBinding = {},
): Promise<{
  state: string;
  verifier: string;
  nonce: string;
  challenge: string;
  transactionCookie: string;
}> {
  const state = randomToken(32);
  const verifier = randomToken(48);
  const nonce = randomToken(24);
  const now = Date.now();
  const provider = binding.provider ?? 'google';
  const purpose = binding.purpose ?? 'login';
  const actorSessionHash = binding.actorSessionId ? await sha256(binding.actorSessionId) : null;
  await env.DB.prepare(`
    INSERT INTO oauth_states
      (state_hash, code_verifier_ciphertext, return_path, created_at, expires_at, consumed_at,
        provider, purpose, actor_user_id, actor_session_hash, required_capability, resource_generation)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
  `).bind(
    await sha256(state),
    await encryptState(env, { verifier, nonce, redirectUri: binding.redirectUri || null,
      ...(binding.nativeFacebook ? { nativeFacebook: binding.nativeFacebook } : {}) }),
    safeReturnPath(returnPath),
    new Date(now).toISOString(),
    new Date(now + (binding.nativeFacebook?.phase === 'handoff' ? 60 : 600) * 1000).toISOString(),
    provider,
    purpose,
    binding.actorUserId || null,
    actorSessionHash,
    binding.requiredCapability || null,
    Number.isSafeInteger(binding.resourceGeneration) ? binding.resourceGeneration : 0,
  ).run();
  const signature = await transactionSignature(env, provider, purpose, state, nonce);
  return {
    state,
    verifier,
    nonce,
    challenge: await sha256(verifier),
    transactionCookie: serializeTransactionCookie(env, state, `${state}.${signature}`),
  };
}

export async function consumeOAuthState(env: CloudflareEnvLike, state: string): Promise<LoadedOAuthState | null> {
  const row = await loadOAuthState(env, state);
  if (!row) return null;
  const changed = await env.DB.prepare(`
    UPDATE oauth_states SET consumed_at = ?
    WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(new Date().toISOString(), row.stateHash, new Date().toISOString()).run();
  if (changed.meta?.changes !== 1) return null;
  return row;
}

export async function loadOAuthState(env: CloudflareEnvLike, state: string): Promise<LoadedOAuthState | null> {
  const hash = await sha256(state);
  const row = await env.DB.prepare(`
    SELECT state_hash, code_verifier_ciphertext, return_path, provider, purpose,
      actor_user_id, actor_session_hash, required_capability, resource_generation
    FROM oauth_states
    WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(hash, new Date().toISOString()).first<Record<string, unknown>>();
  if (!row) return null;
  const secrets = await decryptState(env, String(row.code_verifier_ciphertext));
  return {
    stateHash: String(row.state_hash),
    ...secrets,
    returnPath: safeReturnPath(String(row.return_path || '/')),
    provider: row.provider === 'facebook' ? 'facebook' : 'google',
    purpose: row.purpose === 'link' || row.purpose === 'connector' ? row.purpose : 'login',
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorSessionHash: row.actor_session_hash ? String(row.actor_session_hash) : null,
    requiredCapability: row.required_capability ? String(row.required_capability) : null,
    resourceGeneration: Number(row.resource_generation || 0),
  };
}

export async function verifyOAuthTransactionCookie(
  request: Request,
  env: CloudflareEnvLike,
  state: string,
  nonce: string,
  provider: OAuthProvider = 'google',
  purpose: OAuthPurpose = 'login',
): Promise<boolean> {
  const policy = transactionCookiePolicy(env, state);
  const cookieValue = readSingleCookie(request.headers.get('cookie'), policy.name);
  if (!cookieValue) return false;
  const [cookieState, signature] = cookieValue.split('.');
  if (!cookieState || !signature || cookieState !== state) return false;
  const expected = await transactionSignature(env, provider, purpose, state, nonce);
  return constantTimeEqual(signature, expected);
}

export function clearOAuthTransactionCookie(env: CloudflareEnvLike, state = ''): string {
  return serializeTransactionCookie(env, state, '', 0);
}

async function encryptState(
  env: CloudflareEnvLike,
  value: { verifier: string; nonce: string; redirectUri: string | null; nativeFacebook?: NativeFacebookState },
): Promise<string> {
  const key = await stateKey(env, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptState(
  env: CloudflareEnvLike,
  value: string,
): Promise<{ verifier: string; nonce: string; redirectUri: string | null; nativeFacebook?: NativeFacebookState }> {
  const [iv, ciphertext] = String(value).split('.');
  const key = await stateKey(env, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    key,
    fromBase64Url(ciphertext),
  );
  const parsed = JSON.parse(decoder.decode(plaintext)) as { verifier: string; nonce: string; redirectUri?: string | null; nativeFacebook?: NativeFacebookState };
  return { verifier: parsed.verifier, nonce: parsed.nonce, redirectUri: parsed.redirectUri || null,
    ...(parsed.nativeFacebook ? { nativeFacebook: parsed.nativeFacebook } : {}) };
}

async function stateKey(env: CloudflareEnvLike, usages: KeyUsage[]): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(requiredSecret(env, 'OAUTH_STATE_SECRET')),
  );
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usages);
}

function safeReturnPath(value: string): string {
  const path = typeof value === 'string' ? value : '/';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

function serializeTransactionCookie(env: CloudflareEnvLike, state: string, value: string, maxAge = 10 * 60): string {
  const policy = transactionCookiePolicy(env, state);
  const secure = policy.secure ? '; Secure' : '';
  return `${policy.name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly${secure}; SameSite=Lax`;
}

function transactionCookiePolicy(env: CloudflareEnvLike, state: string) {
  const suffix = state.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 18) || 'cleared';
  return resolveAuthCookiePolicy(
    env,
    `${SECURE_TRANSACTION_COOKIE_PREFIX}${suffix}`,
    `${LOOPBACK_TRANSACTION_COOKIE_PREFIX}${suffix}`,
  );
}

function transactionSignature(
  env: CloudflareEnvLike,
  provider: OAuthProvider,
  purpose: OAuthPurpose,
  state: string,
  nonce: string,
): Promise<string> {
  return hmacSha256(
    requiredSecret(env, 'OAUTH_STATE_SECRET'),
    `oauth-tx:${provider}:${purpose}:${state}:${nonce}`,
  );
}
