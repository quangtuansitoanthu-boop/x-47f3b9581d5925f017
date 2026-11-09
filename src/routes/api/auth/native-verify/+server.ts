import { json, type RequestHandler } from '@sveltejs/kit';
import { OAuthError, resolveOrCreateGoogleIdentity } from '../../../../lib/server/auth/google-oauth';
import { resolveOrCreateFacebookIdentity } from '../../../../lib/server/auth/facebook-oauth';
import { createSession } from '../../../../lib/server/auth/sessions';
import { storeAppleAuthorization } from '../../../../lib/server/auth/apple-authorization';
import { sha256 } from '../../../../lib/server/auth/crypto';
import { getApiLocals, type EventLike } from '../../../../lib/server/http/runtime';
import { clientAddressHashInput } from '../../../../lib/server/http/security';
import { checkRateLimit } from '../../../../lib/server/http/rate-limit';
import { NativeAuthError, verifyAppleNativeToken, verifyFacebookLimitedToken, verifyFacebookNativeToken, verifyGoogleNativeToken } from '../../../../lib/server/auth/native-token-verification';
import { formatVietnameseFullName } from '../../../../lib/utils/vietnamese-name';

export const POST: RequestHandler = async (event) => {
  const runtime = getApiLocals(event as unknown as EventLike);
  const env = runtime.env;
  if (!env?.DB) return json({ message: 'Database không sẵn sàng' }, { status: 503 });
  let stage = 'body';
  try {
    const body = await readNativeBody(event.request);
    const provider = body.provider;
    const token = body.token;
    if (typeof provider !== 'string' || !['google', 'facebook', 'apple'].includes(provider) ||
        typeof token !== 'string' || !token.trim() || token.length > 16_384) {
      throw new NativeAuthError(400, 'Thông tin provider hoặc token không hợp lệ.');
    }
    if (provider === 'apple' && body.authorizationCode !== undefined &&
      (typeof body.authorizationCode !== 'string' || !body.authorizationCode.trim() || body.authorizationCode.length > 4096)) {
      throw new NativeAuthError(400, 'Mã xác thực Apple không hợp lệ.');
    }
    stage = 'rate_limit';
    const bucket = await sha256(`${env.RATE_LIMIT_SALT || 'native-login'}:${clientAddressHashInput(event.request)}`);
    if (!await checkRateLimit(env.AUTH_RATE_LIMITER, `native-login:${bucket}`)) throw new NativeAuthError(429, 'Thử lại sau ít phút.');
    const user = body.user && typeof body.user === 'object' && !Array.isArray(body.user) ? body.user as Record<string, unknown> : {};
    const now = new Date().toISOString();
    let principal: { userId: string; identityId: string; authProvider: 'google' | 'facebook' | null };
    let profile: { email: string; displayName: string; avatarUrl: string; role: 'user' | 'ctv' | 'admin' };
    let appleSubject: string | null = null;
    if (provider === 'google') {
      stage = 'provider_verify';
      const claims = await verifyGoogleNativeToken(env, token);
      claims.name = text(claims.name, 200) || text(user.name, 200);
      claims.picture = text(claims.picture, 2048) || text(user.imageUrl || user.picture, 2048);
      stage = 'identity';
      const identity = await resolveOrCreateGoogleIdentity(env, claims, now);
      principal = { userId: identity.user_id, identityId: identity.identity_id, authProvider: 'google' };
      profile = { email: text(claims.email, 320), displayName: formatVietnameseFullName(text(claims.name, 200)) || 'Người dùng Google', avatarUrl: text(claims.picture, 2048), role: identity.role };
    } else if (provider === 'facebook') {
      stage = 'provider_verify';
      if (body.tokenType !== undefined && body.tokenType !== 'limited') throw new NativeAuthError(400);
      const verified = body.tokenType === 'limited'
        ? await verifyFacebookLimitedToken(env, token, typeof body.nonce === 'string' ? body.nonce : '')
        : await verifyFacebookNativeToken(env, token);
      verified.name = formatVietnameseFullName(verified.name || text(user.name, 200)) || 'Người dùng Facebook';
      verified.pictureUrl ||= text(user.picture || user.avatarUrl, 2048) || null;
      stage = 'identity';
      const identity = await resolveOrCreateFacebookIdentity(env, verified, now);
      principal = { userId: identity.user_id, identityId: identity.identity_id, authProvider: 'facebook' };
      profile = { email: verified.email || '', displayName: verified.name, avatarUrl: verified.pictureUrl || '', role: identity.role };
    } else {
      stage = 'provider_verify';
      const claims = await verifyAppleNativeToken(env, token);
      if (typeof claims.sub !== 'string' || !claims.sub) throw new NativeAuthError(401, 'Thông tin Apple không hợp lệ.');
      appleSubject = claims.sub;
      const digest = await sha256(`apple\n${claims.sub}`);
      const userId = `apple-${digest}`;
      const identityId = `apple-identity-${digest}`;
      const email = claims.email_verified === true || claims.email_verified === 'true' ? text(claims.email, 320) : '';
      const displayName = formatVietnameseFullName(null, text(user.givenName, 100), text(user.familyName, 100)) || 'Phật tử Apple';
      stage = 'identity';
      await env.DB.batch([
        // Email trùng provider khác không được bỏ qua user rồi làm identity lỗi khóa ngoại.
        env.DB.prepare("INSERT OR IGNORE INTO app_users (id, email, display_name, avatar_url, role, created_at, updated_at) VALUES (?, ?, ?, null, 'user', ?, ?)").bind(userId, null, displayName, now, now),
        env.DB.prepare("INSERT OR IGNORE INTO auth_identities (id, user_id, issuer, provider, provider_subject, created_at, updated_at, last_sign_in_at) VALUES (?, ?, 'https://appleid.apple.com', 'apple', ?, ?, ?, ?)").bind(identityId, userId, claims.sub, now, now, now),
        ...(email ? [env.DB.prepare('UPDATE OR IGNORE app_users SET email = ? WHERE id = ? AND email IS NULL')
          .bind(email, userId)] : []),
      ]);
      principal = { userId, identityId, authProvider: null };
      profile = { email, displayName, avatarUrl: '', role: 'user' };
    }
    // Read the persisted account, not a display name or client supplied role.
    stage = 'account';
    const account = await env.DB.prepare('SELECT role, status, email, display_name, avatar_url FROM app_users WHERE id = ?').bind(principal.userId)
      .first<{ role?: string; status?: string; email?: string; display_name?: string; avatar_url?: string }>();
    if (!account || account.status !== 'active') throw new NativeAuthError(403, 'Tài khoản không còn hoạt động.');
    profile.role = account.role === 'admin' || account.role === 'ctv' ? account.role : 'user';
    profile.email = account.email || profile.email;
    profile.displayName = account.display_name || profile.displayName;
    profile.avatarUrl = account.avatar_url || profile.avatarUrl;
    if (appleSubject && body.authorizationCode !== undefined) {
      stage = 'apple_authorization';
      await storeAppleAuthorization(env, principal.userId, appleSubject, body.authorizationCode as string);
    }
    stage = 'session';
    const session = await createSession(env, principal);
    return json({ success: true, userId: principal.userId, user: { id: principal.userId, ...profile }, session: { csrfToken: session.csrfToken, expiresAt: session.expiresAt } }, {
      headers: { 'Set-Cookie': session.cookie, 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof NativeAuthError) return json({ message: error.message, code: error.code, requestId: runtime.requestId }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof OAuthError) return json({ message: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    // Never log tokens, provider URLs, secrets or raw provider exceptions.
    const kind = error instanceof TypeError ? 'TypeError' : error instanceof Error ? 'Error' : 'UnknownError';
    console.error(JSON.stringify({ event: 'native_verify_failed', stage, kind, requestId: runtime.requestId }));
    return json({ message: 'Dịch vụ đăng nhập tạm thời không khả dụng. Vui lòng thử lại.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}
async function readNativeBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new NativeAuthError(415, 'Yêu cầu phải dùng application/json.');
  const maximum = 32_768;
  if (Number(request.headers.get('content-length')) > maximum) throw new NativeAuthError(413, 'Dữ liệu gửi lên vượt giới hạn.');
  const reader = request.body?.getReader();
  if (!reader) throw new NativeAuthError(400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new NativeAuthError(413, 'Dữ liệu gửi lên vượt giới hạn.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new NativeAuthError(400, 'JSON không hợp lệ.'); }
}
