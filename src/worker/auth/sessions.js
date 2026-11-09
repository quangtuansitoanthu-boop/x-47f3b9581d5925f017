import { constantTimeEqual } from '../http/security.js';
import { hmacSha256, randomToken, sha256 } from './crypto.js';

const SESSION_COOKIE = '__Host-quangtu_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export async function loadSession(request, env) {
  const token = readSingleCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.user_id, s.csrf_token_hash,
      s.expires_at, u.email, u.display_name, u.role
    FROM auth_sessions s
    INNER JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
  `).bind(tokenHash, new Date().toISOString()).first();
  if (!row) return null;
  const csrfToken = await hmacSha256(requiredSecret(env, 'SESSION_SECRET'), `csrf:${token}`);
  if (!constantTimeEqual(await sha256(csrfToken), row.csrf_token_hash)) return null;
  let userDisplayName = row.display_name ? String(row.display_name).trim() : '';
  if (!userDisplayName || userDisplayName.includes('@')) {
    const rowEmail = row.email ? String(row.email).toLowerCase().trim() : '';
    if (rowEmail === 'tutap.phatphap26@gmail.com' || rowEmail.includes('quangtu')) {
      userDisplayName = 'Quang Từ';
    } else if (rowEmail === 'chienqan@gmail.com') {
      userDisplayName = 'Chiến An';
    } else if (rowEmail.includes('@')) {
      userDisplayName = rowEmail.split('@')[0].replace(/[._-]+/g, ' ')
        .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    } else {
      userDisplayName = 'Phật tử';
    }
  }

  return {
    id: row.session_id,
    userId: row.user_id,
    appUserId: row.user_id,
    email: row.email || null,
    displayName: userDisplayName,
    role: normalizeRole(row.role),
    expiresAt: row.expires_at,
    csrfToken,
    rawToken: token,
  };
}

export async function createSession(env, principal) {
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const now = Date.now();
  const expiresAt = new Date(now + MAX_AGE_SECONDS * 1000).toISOString();
  const sessionId = crypto.randomUUID();
  const csrfToken = await hmacSha256(requiredSecret(env, 'SESSION_SECRET'), `csrf:${rawToken}`);
  await env.DB.prepare(`
    INSERT INTO auth_sessions
      (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    sessionId,
    principal.userId,
    tokenHash,
    await sha256(csrfToken),
    new Date(now).toISOString(),
    expiresAt,
  ).run();
  return {
    cookie: serializeSessionCookie(rawToken, MAX_AGE_SECONDS),
    csrfToken,
    expiresAt,
  };
}

export async function revokeSession(env, session) {
  if (!session) return;
  await env.DB.prepare(
    'UPDATE auth_sessions SET revoked_at = ? WHERE id = ?',
  ).bind(new Date().toISOString(), session.id).run();
}

export function clearSessionCookie() {
  return serializeSessionCookie('', 0);
}

export function publicSession(session) {
  if (!session) return { authenticated: false };
  return {
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
    },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  };
}

export function readSingleCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const matches = cookieHeader.split(';').map((part) => part.trim()).filter((part) =>
    part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const raw = matches[0].slice(name.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function serializeSessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function normalizeRole(role) {
  return ['user', 'ctv', 'admin'].includes(role) ? role : 'user';
}

export function requiredSecret(env, name) {
  const value = env[name];
  if (!value || typeof value !== 'string') throw new Error(`Missing Worker secret: ${name}`);
  return value;
}

export function verifyCsrfCandidate(candidate, expected) {
  return constantTimeEqual(candidate || '', expected || '');
}
