import type { CloudflareEnvLike } from '../cloudflare-context';
import { hmacSha256, randomToken, sha256 } from './crypto';
import { constantTimeEqual } from '../http/security';
import type { InternalSession, PageSessionDTO } from './types';
import { resolveAuthCookiePolicy } from './auth-cookie-policy';

const SECURE_SESSION_COOKIE = '__Host-quangtu_session';
const LOOPBACK_SESSION_COOKIE = 'quangtu_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export async function loadSession(request: Request, env: CloudflareEnvLike): Promise<InternalSession | null> {
  const policy = sessionCookiePolicy(env);
  const token = readSingleCookie(request.headers.get('cookie'), policy.name);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.user_id, s.identity_id, s.auth_provider, s.csrf_token_hash,
      s.expires_at, u.email, u.display_name, u.avatar_url, u.role
    FROM auth_sessions s
    INNER JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'
  `).bind(tokenHash, new Date().toISOString()).first<Record<string, unknown>>();
  if (!row) return null;
  const csrfToken = await hmacSha256(requiredSecret(env, 'SESSION_SECRET'), `csrf:${token}`);
  if (!constantTimeEqual(await sha256(csrfToken), String(row.csrf_token_hash || ''))) return null;
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
    id: String(row.session_id),
    userId: String(row.user_id),
    appUserId: String(row.user_id),
    email: row.email ? String(row.email) : null,
    displayName: userDisplayName,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    role: normalizeRole(row.role),
    expiresAt: String(row.expires_at),
    csrfToken,
    rawToken: token,
    identityId: row.identity_id ? String(row.identity_id) : null,
    authProvider: row.auth_provider === 'google' || row.auth_provider === 'facebook' ? row.auth_provider : null,
  };
}

export async function createSession(
  env: CloudflareEnvLike,
  principal: { userId: string; identityId?: string | null; authProvider?: 'google' | 'facebook' | null },
): Promise<{ cookie: string; csrfToken: string; expiresAt: string }> {
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const now = Date.now();
  const expiresAt = new Date(now + MAX_AGE_SECONDS * 1000).toISOString();
  const sessionId = crypto.randomUUID();
  const csrfToken = await hmacSha256(requiredSecret(env, 'SESSION_SECRET'), `csrf:${rawToken}`);
  await env.DB.prepare(`
    INSERT INTO auth_sessions
      (id, user_id, identity_id, auth_provider, token_hash, csrf_token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sessionId,
    principal.userId,
    principal.identityId || null,
    principal.authProvider || null,
    tokenHash,
    await sha256(csrfToken),
    new Date(now).toISOString(),
    expiresAt,
  ).run();
  return {
    cookie: serializeSessionCookie(env, rawToken, MAX_AGE_SECONDS),
    csrfToken,
    expiresAt,
  };
}

export async function revokeSession(env: CloudflareEnvLike, session: InternalSession | null): Promise<void> {
  if (!session) return;
  await env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), session.id).run();
}

export async function revokeProviderSessions(
  env: CloudflareEnvLike,
  provider: 'google' | 'facebook',
  identityId: string,
  now = new Date().toISOString(),
): Promise<number> {
  const result = await env.DB.prepare(`
    UPDATE auth_sessions SET revoked_at = ?
    WHERE auth_provider = ? AND identity_id = ? AND revoked_at IS NULL
  `).bind(now, provider, identityId).run();
  return Number(result.meta?.changes || 0);
}

export function clearSessionCookie(env: CloudflareEnvLike): string {
  return serializeSessionCookie(env, '', 0);
}

export function publicSession(session: InternalSession | null): PageSessionDTO {
  if (!session) {
    return {
      authenticated: false,
      user: null,
      csrfToken: null,
      expiresAt: null,
    };
  }
  return {
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email || '',
      displayName: session.displayName,
      avatarUrl: session.avatarUrl || '',
      role: session.role,
    },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  };
}

export function adapterSessionShape(session: InternalSession | null): { session: Record<string, unknown> | null } {
  if (!session) return { session: null };
  return {
    session: {
      userId: session.userId,
      id: session.userId,
      email: session.email,
      fullName: session.displayName,
      avatarUrl: session.avatarUrl,
      username: session.displayName,
      role: session.role,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      user: {
        id: session.userId,
        email: session.email,
        user_metadata: {
          full_name: session.displayName,
          avatar_url: session.avatarUrl,
        },
      },
    },
  };
}

export function readSingleCookie(cookieHeader: string | null, name: string): string | null {
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

export function requiredSecret(env: CloudflareEnvLike, name: keyof CloudflareEnvLike | string): string {
  const value = (env as unknown as Record<string, unknown>)[String(name)];
  if (!value || typeof value !== 'string') throw new Error(`Missing Worker secret: ${String(name)}`);
  return value;
}

function serializeSessionCookie(env: CloudflareEnvLike, value: string, maxAge: number): string {
  const policy = sessionCookiePolicy(env);
  const secure = policy.secure ? '; Secure' : '';
  return `${policy.name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly${secure}; SameSite=Lax`;
}

function sessionCookiePolicy(env: CloudflareEnvLike) {
  return resolveAuthCookiePolicy(env, SECURE_SESSION_COOKIE, LOOPBACK_SESSION_COOKIE);
}

function normalizeRole(role: unknown): 'user' | 'ctv' | 'admin' {
  return role === 'ctv' || role === 'admin' ? role : 'user';
}
