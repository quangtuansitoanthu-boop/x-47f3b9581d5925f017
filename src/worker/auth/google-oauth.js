import { fromBase64Url, sha256 } from './crypto.js';
import { createOAuthState, consumeOAuthState } from './oauth-state.js';
import { createSession, requiredSecret } from './sessions.js';

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

export async function googleAuthorizationUrl(request, env) {
  const url = new URL(request.url);
  const oauth = await createOAuthState(env, url.searchParams.get('returnTo') || '/');
  const redirectUri = `${new URL(env.APP_ORIGIN || request.url).origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: requiredSecret(env, 'GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: oauth.state,
    nonce: oauth.nonce,
    code_challenge: oauth.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function completeGoogleAuthorization(request, env) {
  const url = new URL(request.url);
  const state = await consumeOAuthState(env, url.searchParams.get('state') || '');
  const code = url.searchParams.get('code');
  if (!state || !code) throw new OAuthError('oauth_state', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const redirectUri = `${new URL(env.APP_ORIGIN || request.url).origin}/api/auth/google/callback`;
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: requiredSecret(env, 'GOOGLE_CLIENT_ID'),
      client_secret: requiredSecret(env, 'GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: state.verifier,
    }),
  });
  if (!response.ok) throw new OAuthError('oauth_exchange', 'Không thể hoàn tất đăng nhập Google.');
  const tokens = await response.json();
  const claims = await verifyGoogleIdToken(tokens.id_token, env, state.nonce);
  return createGoogleIdentitySession(env, claims, state.returnPath);
}

export async function createGoogleIdentitySession(env, claims, returnPath = '/') {
  const identity = await resolveOrCreateGoogleIdentity(env, claims);
  const session = await createSession(env, { userId: identity.user_id });
  return { session, returnPath };
}

export async function resolveOrCreateGoogleIdentity(
  env,
  claims,
  now = new Date().toISOString(),
) {
  const googleClaims = { ...claims, iss: canonicalGoogleIssuer(claims.iss) };
  let identity = await findGoogleIdentity(env, googleClaims);
  if (!identity) {
    const digest = await sha256(`${googleClaims.iss}\ngoogle\n${googleClaims.sub}`);
    const userId = `google-${digest}`;
    const emailCandidate = verifiedEmail(googleClaims);
    let resolvedName = googleClaims.name;
    if (!resolvedName || resolvedName.includes('@')) {
      if (emailCandidate === 'tutap.phatphap26@gmail.com' || emailCandidate?.includes('quangtu')) {
        resolvedName = 'Quang Từ';
      }
    }
    const displayName = boundedText(
      resolvedName || emailCandidate,
      200,
    ) || 'Người dùng Google';
    const avatarUrl = boundedText(googleClaims.picture, 2_048);

    await env.DB.batch([
      env.DB.prepare(`
        INSERT OR IGNORE INTO app_users
          (id, email, display_name, avatar_url, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'user', ?, ?)
      `).bind(userId, null, displayName, avatarUrl, now, now),
      env.DB.prepare(`
        INSERT OR IGNORE INTO auth_identities
          (id, user_id, issuer, provider, provider_subject, created_at, updated_at, last_sign_in_at)
        VALUES (?, ?, ?, 'google', ?, ?, ?, ?)
      `).bind(
        `google-identity-${digest}`,
        userId,
        googleClaims.iss,
        googleClaims.sub,
        now,
        now,
        now,
      ),
    ]);
    if (emailCandidate) {
      await env.DB.prepare(`
        UPDATE OR IGNORE app_users
        SET email = ?, updated_at = CASE
          WHEN updated_at IS NULL OR updated_at < ? THEN ?
          ELSE updated_at
        END
        WHERE id = ? AND email IS NULL
      `).bind(emailCandidate, now, now, userId).run();
    }
    identity = await findGoogleIdentity(env, googleClaims);
  }
  if (!identity) {
    throw new OAuthError('identity_provision_failed', 'Không thể tạo tài khoản Google.');
  }

  const updateName = googleClaims.name && !googleClaims.name.includes('@')
    ? googleClaims.name
    : (verifiedEmail(googleClaims) === 'tutap.phatphap26@gmail.com' ? 'Quang Từ' : null);
  const updateAvatar = boundedText(googleClaims.picture, 2_048);
  if (updateName || updateAvatar) {
    // Refresh the Google photo in the existing profile update, without an extra query.
    await env.DB.prepare(`
      UPDATE app_users
      SET display_name = CASE
            WHEN ? IS NOT NULL AND (display_name IS NULL OR display_name LIKE '%@%') THEN ?
            ELSE display_name
          END,
          avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END,
          updated_at = CASE
            WHEN updated_at IS NULL OR updated_at < ? THEN ?
            ELSE updated_at
          END
      WHERE id = ? AND (
        (? IS NOT NULL AND (display_name IS NULL OR display_name LIKE '%@%')) OR
        (? != '' AND COALESCE(avatar_url, '') != ?)
      )
    `).bind(updateName, updateName, updateAvatar, updateAvatar, now, now, identity.user_id,
      updateName, updateAvatar, updateAvatar).run();
  }
  await env.DB.prepare(`
    UPDATE auth_identities
    SET last_sign_in_at = CASE
          WHEN last_sign_in_at IS NULL OR last_sign_in_at < ? THEN ?
          ELSE last_sign_in_at
        END,
        updated_at = CASE
          WHEN updated_at IS NULL OR updated_at < ? THEN ?
          ELSE updated_at
        END
    WHERE issuer IN ('accounts.google.com', 'https://accounts.google.com')
      AND provider = 'google' AND provider_subject = ?
  `).bind(now, now, now, now, googleClaims.sub).run();
  return identity;
}

function findGoogleIdentity(env, claims) {
  return env.DB.prepare(`
    SELECT i.user_id, u.role
    FROM auth_identities i
    JOIN app_users u ON u.id = i.user_id
    WHERE i.issuer IN ('accounts.google.com', 'https://accounts.google.com')
      AND i.provider = 'google' AND i.provider_subject = ?
    ORDER BY CASE WHEN i.issuer = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).bind(claims.sub, claims.iss).first();
}

function verifiedEmail(claims) {
  if (claims.email_verified !== true) return null;
  const email = boundedText(claims.email, 320);
  return email ? email.toLowerCase() : null;
}

function boundedText(value, maxLength) {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, maxLength) || null;
}

function canonicalGoogleIssuer(issuer) {
  if (!GOOGLE_ISSUERS.has(issuer)) {
    throw new OAuthError('invalid_id_token', 'Google ID token không hợp lệ.');
  }
  return 'https://accounts.google.com';
}

export async function verifyGoogleIdToken(token, env, expectedNonce) {
  const [encodedHeader, encodedPayload, encodedSignature] = String(token || '').split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new OAuthError('invalid_id_token', 'Google ID token không hợp lệ.');
  }
  const header = decodePart(encodedHeader);
  const claims = decodePart(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw new OAuthError('invalid_id_token', 'Google ID token không hợp lệ.');
  const jwksResponse = await fetch(GOOGLE_JWKS, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!jwksResponse.ok) throw new OAuthError('jwks_unavailable', 'Không thể xác minh Google ID token.');
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
  if (!jwk) throw new OAuthError('unknown_signing_key', 'Không thể xác minh Google ID token.');
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    fromBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  const now = Math.floor(Date.now() / 1000);
  if (!valid || !GOOGLE_ISSUERS.has(claims.iss) ||
      claims.aud !== requiredSecret(env, 'GOOGLE_CLIENT_ID') ||
      claims.exp < now || claims.iat > now + 60 || claims.nonce !== expectedNonce || !claims.sub) {
    throw new OAuthError('invalid_id_token', 'Google ID token không hợp lệ.');
  }
  return claims;
}

function decodePart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(value)));
  } catch {
    throw new OAuthError('invalid_id_token', 'Google ID token không hợp lệ.');
  }
}

export class OAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
  }
}
