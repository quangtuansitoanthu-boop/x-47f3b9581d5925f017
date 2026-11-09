import type { CloudflareEnvLike } from '../cloudflare-context';
import { can } from './rbac';
import { sha256 } from './crypto';
import type { InternalSession } from './types';
import { createSession, requiredSecret } from './sessions';
import {
  clearOAuthTransactionCookie,
  consumeOAuthState,
  createOAuthState,
  loadOAuthState,
  verifyOAuthTransactionCookie,
  type OAuthPurpose,
} from './oauth-state';
import { normalizeReturnTo } from '../http/security';
import { constantTimeEqual } from '../http/security';
import { OAuthError } from './google-oauth';
import {
  debugFacebookToken,
  exchangeFacebookCode,
  exchangeLongLivedFacebookToken,
  facebookAuthorizationUrl,
  getFacebookProfile,
  type FacebookProfile,
} from '../integrations/facebook-graph';
import { encryptFacebookToken } from '../integrations/facebook-token-crypto';
import { createFacebookRepository } from '../repositories/facebook-repository';
import { FACEBOOK_NATIVE_CALLBACK, issueFacebookHandoff, validFacebookChallenge } from './facebook-browser-handoff';

export interface FacebookAuthorizationResult {
  url: string;
  transactionCookie: string;
}

export interface FacebookCompletionResult {
  nativeCallbackUrl?: string;
  returnPath: string;
  sessionCookie: string | null;
  transactionCookie: string;
  outcome: 'authenticated' | 'linked' | 'connected' | 'permission_missing' | 'cancelled';
}

export async function beginFacebookAuthorization(
  request: Request,
  env: CloudflareEnvLike,
  purpose: OAuthPurpose,
  actor: InternalSession | null,
  nativeChallenge?: string,
): Promise<FacebookAuthorizationResult> {
  assertFacebookLoginConfigured(env);
  if (nativeChallenge !== undefined && (purpose !== 'login' || !validFacebookChallenge(nativeChallenge))) {
    throw new OAuthError('facebook_challenge_invalid', 'Phiên đăng nhập không hợp lệ.', 400);
  }
  const returnPath = normalizeReturnTo(new URL(request.url).searchParams.get('returnTo'), env, request.url);
  if (purpose !== 'login') requireActor(actor, purpose);
  const redirectUri = `${new URL(env.APP_ORIGIN || request.url).origin}/api/auth/facebook/callback`;
  const repository = createFacebookRepository(env);
  const connection = actor ? await repository.getConnectionForUser(actor.userId) : null;
  const oauth = await createOAuthState(env, returnPath, {
    provider: 'facebook',
    purpose,
    actorUserId: actor?.userId || null,
    actorSessionId: actor?.id || null,
    requiredCapability: purpose === 'connector' ? 'admin:dashboard' : null,
    redirectUri,
    resourceGeneration: connection?.generation || 0,
    ...(nativeChallenge ? { nativeFacebook: { phase: 'authorize' as const, challenge: nativeChallenge } } : {}),
  });
  return {
    url: facebookAuthorizationUrl(env, {
      redirectUri,
      state: oauth.state,
      scopes: purpose === 'connector' ? ['public_profile', 'email', 'user_posts'] : ['public_profile', 'email'],
    }),
    transactionCookie: oauth.transactionCookie,
  };
}

export async function completeFacebookAuthorization(
  request: Request,
  env: CloudflareEnvLike,
  actor: InternalSession | null,
  dependencies: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<FacebookCompletionResult> {
  const url = new URL(request.url);
  const stateParam = url.searchParams.get('state') || '';
  if (url.searchParams.get('error')) {
    // Chỉ app khởi tạo đúng giao dịch mới nhận callback hủy; web/connector giữ hành vi cũ.
    if (url.searchParams.get('error') === 'access_denied') {
      const state = await loadOAuthState(env, stateParam);
      if (state?.provider === 'facebook' && state.purpose === 'login' && state.nativeFacebook?.phase === 'authorize'
          && await verifyOAuthTransactionCookie(request, env, stateParam, state.nonce, state.provider, state.purpose)) {
        await verifyActorBinding(state, actor);
        if (await consumeOAuthState(env, stateParam)) {
          return { ...completion('/', stateParam, env, 'cancelled', null),
            nativeCallbackUrl: `${FACEBOOK_NATIVE_CALLBACK}?error=cancelled` };
        }
      }
    }
    throw new OAuthError('oauth_cancelled', 'Bạn đã huỷ quyền truy cập Facebook.', 400);
  }
  const code = url.searchParams.get('code');
  const state = await loadOAuthState(env, stateParam);
  if (!state || state.provider !== 'facebook' || !code || state.nativeFacebook?.phase === 'handoff') {
    throw new OAuthError('oauth_state', 'Phiên Facebook không hợp lệ hoặc đã hết hạn.', 400);
  }
  if (!await verifyOAuthTransactionCookie(
    request, env, stateParam, state.nonce, state.provider, state.purpose,
  )) {
    throw new OAuthError('oauth_transaction', 'Phiên Facebook không khớp trình duyệt khởi tạo.', 400);
  }
  await verifyActorBinding(state, actor);
  const consumed = await consumeOAuthState(env, stateParam);
  if (!consumed) throw new OAuthError('oauth_state', 'Phiên Facebook đã được sử dụng.', 400);
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now || new Date();
  const redirectUri = consumed.redirectUri || `${new URL(env.APP_ORIGIN || request.url).origin}/api/auth/facebook/callback`;
  const exchanged = await exchangeFacebookCode(env, code, redirectUri, fetchImpl);
  const debug = await debugFacebookToken(env, exchanged.accessToken, fetchImpl);
  validateDebug(debug, env);
  const profile = await getFacebookProfile(env, exchanged.accessToken, fetchImpl);
  if (profile.id !== debug.userId) throw new OAuthError('facebook_identity_mismatch', 'Định danh Facebook không khớp.', 401);

  if (consumed.purpose === 'login') {
    const identity = await resolveOrCreateFacebookIdentity(env, profile, now.toISOString());
    if (consumed.nativeFacebook?.phase === 'authorize') {
      return { ...completion('/', stateParam, env, 'authenticated', null),
        nativeCallbackUrl: await issueFacebookHandoff(env, consumed.nativeFacebook.challenge, identity) };
    }
    const session = await createSession(env, {
      userId: identity.user_id,
      identityId: identity.identity_id,
      authProvider: 'facebook',
    });
    return completion(consumed.returnPath, stateParam, env, 'authenticated', session.cookie);
  }

  const boundActor = requireActor(actor, consumed.purpose);
  if (consumed.purpose === 'link') {
    await linkFacebookIdentity(env, boundActor.userId, profile, now.toISOString());
    return completion(consumed.returnPath, stateParam, env, 'linked', null);
  }

  const repository = createFacebookRepository(env);
  const settings = await repository.getSettings();
  if (!debug.scopes.includes('user_posts')) {
    await repository.markPermissionMissing({
      actorUserId: boundActor.userId,
      expectedGeneration: consumed.resourceGeneration,
      facebookUserId: profile.id,
      displayName: profile.name,
      sourceUrl: settings.source_url,
      scopes: debug.scopes,
      now: now.toISOString(),
    });
    return completion(consumed.returnPath, stateParam, env, 'permission_missing', null);
  }
  const longLived = await exchangeLongLivedFacebookToken(env, exchanged.accessToken, fetchImpl);
  const longDebug = await debugFacebookToken(env, longLived.accessToken, fetchImpl);
  validateDebug(longDebug, env);
  if (longDebug.userId !== profile.id || !longDebug.scopes.includes('user_posts')) {
    throw new OAuthError('facebook_permission_missing', 'Facebook chưa cấp quyền đọc bài viết.', 403);
  }
  const tokenExpiresAt = epochIso(longDebug.expiresAt, now, longLived.expiresIn);
  if (!tokenExpiresAt) {
    throw new OAuthError('facebook_token_expiry_missing', 'Facebook không cung cấp thời hạn access token.', 502);
  }
  const existing = await repository.getConnectionForUser(boundActor.userId);
  const connectionId = existing?.id || crypto.randomUUID();
  const encrypted = await encryptFacebookToken(env, longLived.accessToken, connectionId, profile.id);
  const saved = await repository.saveConnection({
    actorUserId: boundActor.userId,
    connectionId,
    expectedGeneration: consumed.resourceGeneration,
    facebookUserId: profile.id,
    displayName: profile.name,
    sourceUrl: settings.source_url,
    ciphertext: encrypted.ciphertext,
    keyVersion: encrypted.keyVersion,
    scopes: longDebug.scopes,
    tokenExpiresAt,
    dataAccessExpiresAt: epochIso(longDebug.dataAccessExpiresAt, now, null),
    now: now.toISOString(),
  });
  if (!saved) throw new OAuthError('facebook_connection_changed', 'Kết nối Facebook đã thay đổi; vui lòng kết nối lại.', 409);
  return completion(consumed.returnPath, stateParam, env, 'connected', null);
}

export async function resolveOrCreateFacebookIdentity(
  env: CloudflareEnvLike,
  profile: FacebookProfile,
  now = new Date().toISOString(),
): Promise<{ identity_id: string; user_id: string; role: 'user' | 'ctv' | 'admin' }> {
  const existing = await findFacebookIdentity(env, profile.id);
  if (existing) {
    if (profile.name || profile.pictureUrl) {
      await env.DB.prepare(`
        UPDATE app_users
        SET display_name = CASE WHEN ? != '' THEN ? ELSE display_name END,
            avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END,
            updated_at = ?
        WHERE id = ?
      `).bind(
        profile.name || '',
        profile.name || '',
        profile.pictureUrl || '',
        profile.pictureUrl || '',
        now,
        existing.user_id
      ).run();
    }
    return existing;
  }
  if (profile.email) {
    const collision = await env.DB.prepare('SELECT id FROM app_users WHERE lower(email) = lower(?) LIMIT 1')
      .bind(profile.email).first<{ id: string }>();
    if (collision) throw new OAuthError('link_required', 'Email này đã thuộc tài khoản khác; hãy đăng nhập rồi liên kết Facebook.', 409);
  }
  const digest = await sha256(`https://www.facebook.com\nfacebook\n${profile.id}`);
  const userId = `facebook-${digest}`;
  const identityId = `facebook-identity-${digest}`;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO app_users
        (id, email, display_name, avatar_url, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'user', ?, ?)
    `).bind(userId, profile.email, profile.name, profile.pictureUrl, now, now),
    env.DB.prepare(`
      INSERT OR IGNORE INTO auth_identities
        (id, user_id, issuer, provider, provider_subject, created_at, updated_at, last_sign_in_at)
      VALUES (?, ?, 'https://www.facebook.com', 'facebook', ?, ?, ?, ?)
    `).bind(identityId, userId, profile.id, now, now, now),
  ]);
  const created = await findFacebookIdentity(env, profile.id);
  if (!created) throw new OAuthError('identity_provision_failed', 'Không thể tạo tài khoản Facebook.', 500);
  return created;
}

export async function linkFacebookIdentity(
  env: CloudflareEnvLike,
  actorUserId: string,
  profile: FacebookProfile,
  now = new Date().toISOString(),
): Promise<{ identity_id: string; user_id: string }> {
  const existing = await findFacebookIdentity(env, profile.id);
  if (existing && existing.user_id !== actorUserId) {
    throw new OAuthError('facebook_identity_conflict', 'Facebook này đã liên kết với tài khoản khác.', 409);
  }
  if (existing) return existing;
  const digest = await sha256(`https://www.facebook.com\nfacebook\n${profile.id}`);
  const identityId = `facebook-identity-${digest}`;
  await env.DB.prepare(`
    INSERT INTO auth_identities
      (id, user_id, issuer, provider, provider_subject, created_at, updated_at, last_sign_in_at)
    VALUES (?, ?, 'https://www.facebook.com', 'facebook', ?, ?, ?, ?)
  `).bind(identityId, actorUserId, profile.id, now, now, now).run();
  return { identity_id: identityId, user_id: actorUserId };
}

async function findFacebookIdentity(env: CloudflareEnvLike, subject: string) {
  return env.DB.prepare(`
    SELECT i.id AS identity_id, i.user_id, u.role
    FROM auth_identities i JOIN app_users u ON u.id = i.user_id
    WHERE i.issuer = 'https://www.facebook.com' AND i.provider = 'facebook'
      AND i.provider_subject = ? LIMIT 1
  `).bind(subject).first<{ identity_id: string; user_id: string; role: 'user' | 'ctv' | 'admin' }>();
}

async function verifyActorBinding(
  state: Awaited<ReturnType<typeof loadOAuthState>> & {},
  actor: InternalSession | null,
): Promise<void> {
  if (state.purpose === 'login') {
    if (state.actorUserId || state.actorSessionHash) throw new OAuthError('oauth_actor', 'Phiên đăng nhập Facebook không hợp lệ.', 400);
    return;
  }
  const bound = requireActor(actor, state.purpose);
  if (state.actorUserId !== bound.userId || !state.actorSessionHash ||
      !constantTimeEqual(state.actorSessionHash, await sha256(bound.id))) {
    throw new OAuthError('oauth_actor', 'Phiên Facebook không thuộc tài khoản khởi tạo.', 403);
  }
  if (state.requiredCapability && !can(bound, state.requiredCapability)) {
    throw new OAuthError('oauth_capability', 'Tài khoản không còn đủ quyền.', 403);
  }
}

function requireActor(actor: InternalSession | null, purpose: OAuthPurpose): InternalSession {
  if (!actor) throw new OAuthError('authentication_required', 'Cần đăng nhập để liên kết Facebook.', 401);
  if (purpose === 'connector' && !can(actor, 'admin:dashboard')) {
    throw new OAuthError('forbidden', 'Chỉ quản trị viên được kết nối nguồn Facebook.', 403);
  }
  return actor;
}

function validateDebug(debug: Awaited<ReturnType<typeof debugFacebookToken>>, env: CloudflareEnvLike): void {
  if (!debug.isValid || !debug.userId || debug.appId !== requiredSecret(env, 'FACEBOOK_APP_ID')) {
    throw new OAuthError('facebook_token_invalid', 'Access token Facebook không hợp lệ.', 401);
  }
}

function assertFacebookLoginConfigured(env: CloudflareEnvLike): void {
  try {
    requiredSecret(env, 'FACEBOOK_APP_ID');
    requiredSecret(env, 'FACEBOOK_APP_SECRET');
  } catch {
    throw new OAuthError('facebook_configuration_error', 'Facebook Login chưa được cấu hình.', 503);
  }
}

function completion(
  returnPath: string,
  state: string,
  env: CloudflareEnvLike,
  outcome: FacebookCompletionResult['outcome'],
  sessionCookie: string | null,
): FacebookCompletionResult {
  return {
    returnPath,
    sessionCookie,
    transactionCookie: clearOAuthTransactionCookie(env, state),
    outcome,
  };
}

function epochIso(epoch: number | null, now: Date, fallbackSeconds: number | null): string | null {
  if (epoch) return new Date(epoch * 1_000).toISOString();
  return fallbackSeconds ? new Date(now.getTime() + fallbackSeconds * 1_000).toISOString() : null;
}
