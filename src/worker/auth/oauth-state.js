import { fromBase64Url, randomToken, sha256, toBase64Url } from './crypto.js';
import { requiredSecret } from './sessions.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function createOAuthState(env, returnPath = '/') {
  const state = randomToken(32);
  const verifier = randomToken(48);
  const nonce = randomToken(24);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO oauth_states
      (state_hash, code_verifier_ciphertext, return_path, created_at, expires_at, consumed_at)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).bind(
    await sha256(state),
    await encryptState(env, { verifier, nonce }),
    safeReturnPath(returnPath),
    new Date(now).toISOString(),
    new Date(now + 10 * 60 * 1000).toISOString(),
  ).run();
  return {
    state,
    verifier,
    nonce,
    challenge: await sha256(verifier),
  };
}

export async function consumeOAuthState(env, state) {
  const hash = await sha256(state);
  const row = await env.DB.prepare(`
    SELECT state_hash, code_verifier_ciphertext, return_path
    FROM oauth_states
    WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(hash, new Date().toISOString()).first();
  if (!row) return null;
  const changed = await env.DB.prepare(`
    UPDATE oauth_states SET consumed_at = ?
    WHERE state_hash = ? AND consumed_at IS NULL
  `).bind(new Date().toISOString(), hash).run();
  if (changed.meta?.changes !== 1) return null;
  const secrets = await decryptState(env, row.code_verifier_ciphertext);
  return { ...secrets, returnPath: safeReturnPath(row.return_path) };
}

async function encryptState(env, value) {
  const key = await stateKey(env, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptState(env, value) {
  const [iv, ciphertext] = String(value).split('.');
  const key = await stateKey(env, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    key,
    fromBase64Url(ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}

async function stateKey(env, usages) {
  const raw = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(requiredSecret(env, 'OAUTH_STATE_SECRET')),
  );
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usages);
}

function safeReturnPath(value) {
  const path = typeof value === 'string' ? value : '/';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}
