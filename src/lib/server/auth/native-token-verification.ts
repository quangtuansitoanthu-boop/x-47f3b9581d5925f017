import type { CloudflareEnvLike } from '../cloudflare-context';
import { fromBase64Url } from './crypto';
import { requiredSecret } from './sessions';
import { constantTimeEqual } from '../http/security';
import { debugFacebookToken, getFacebookProfile, FacebookGraphError, type FacebookProfile } from '../integrations/facebook-graph';

export class NativeAuthError extends Error {
  constructor(public status: number, message = 'Thông tin xác thực không hợp lệ.', public code = 'native_auth_invalid') { super(message); }
}

export async function providerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // workerd rejects redirect:'error' before sending the request. Manual mode
  // plus an explicit rejection keeps tokens on the fixed provider endpoint.
  const response = await fetch(input, { ...init, signal: AbortSignal.timeout(12_000), redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    throw new NativeAuthError(503, 'Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại.');
  }
  return response;
}

export async function verifyGoogleNativeToken(env: CloudflareEnvLike, token: string): Promise<Record<string, unknown>> {
  const response = await providerFetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) throw new NativeAuthError(401);
  const claims = await response.json() as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  // Native apps can use their own server client IDs while web OAuth keeps its client.
  // Only server configuration may extend this list, never a field supplied by the app.
  const audiences = [requiredSecret(env, 'GOOGLE_CLIENT_ID'), ...(env.GOOGLE_NATIVE_CLIENT_IDS || '').split(',')]
    .map(value => value.trim()).filter(Boolean);
  if (typeof claims?.aud !== 'string' || !audiences.includes(claims.aud)) {
    throw new NativeAuthError(401, 'Cấu hình đăng nhập Google của ứng dụng chưa khớp với máy chủ.', 'google_audience_mismatch');
  }
  if (!claims || !['https://accounts.google.com', 'accounts.google.com'].includes(String(claims.iss)) ||
      !validSubject(claims.sub) ||
      !validNumericDate(claims.exp, true) || Number(claims.exp) <= now ||
      (claims.iat !== undefined && (!validNumericDate(claims.iat, true) || Number(claims.iat) > now + 60))) {
    throw new NativeAuthError(401);
  }
  return { ...claims, email_verified: claims.email_verified === true || claims.email_verified === 'true' };
}

export async function verifyFacebookNativeToken(env: CloudflareEnvLike, token: string): Promise<FacebookProfile> {
  try {
    const debug = await debugFacebookToken(env, token, providerFetch);
    const now = Math.floor(Date.now() / 1000);
    if (!debug.isValid || !debug.userId) throw new NativeAuthError(401, 'Phiên Facebook không còn hợp lệ. Vui lòng đăng nhập lại Facebook.', 'facebook_token_invalid');
    if (debug.appId !== requiredSecret(env, 'FACEBOOK_APP_ID').trim()) {
      throw new NativeAuthError(401, 'Cấu hình đăng nhập Facebook của ứng dụng chưa khớp với máy chủ.', 'facebook_app_mismatch');
    }
    if ((debug.expiresAt !== null && debug.expiresAt <= now) ||
        (debug.dataAccessExpiresAt !== null && debug.dataAccessExpiresAt <= now)) {
      throw new NativeAuthError(401, 'Phiên Facebook đã hết hạn. Vui lòng đăng nhập lại Facebook.', 'facebook_token_expired');
    }
    const profile = await getFacebookProfile(env, token, providerFetch);
    if (profile.id !== debug.userId) throw new NativeAuthError(401, 'Không thể xác minh danh tính Facebook. Vui lòng đăng nhập lại.', 'facebook_identity_mismatch');
    return profile;
  } catch (error) {
    if (error instanceof FacebookGraphError && error.code === 'reauthorization_required') {
      throw new NativeAuthError(401, 'Phiên Facebook không còn hợp lệ. Vui lòng đăng nhập lại Facebook.', 'facebook_token_invalid');
    }
    throw error;
  }
}

export async function verifyFacebookLimitedToken(env: Pick<CloudflareEnvLike, 'FACEBOOK_APP_ID'>, token: string, nonce: string): Promise<FacebookProfile> {
  if (!env.FACEBOOK_APP_ID?.trim()) throw new NativeAuthError(503);
  const parts = token.split('.');
  if (token.length > 16_384 || parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/u.test(part)) || !/^[a-f0-9]{64}$/u.test(nonce)) throw new NativeAuthError(401);
  try {
    const header = decodeObject(parts[0]);
    const claims = decodeObject(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
    // SDK Facebook iOS băm nonce đầu vào thành SHA-256 dạng hex.
    const expectedNonce = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 200 ||
        claims.iss !== 'https://www.facebook.com' || claims.aud !== env.FACEBOOK_APP_ID.trim() || !validSubject(claims.sub) ||
        !validNumericDate(claims.exp) || Number(claims.exp) <= now ||
        !validNumericDate(claims.iat) || Number(claims.iat) > now + 60 || Number(claims.iat) >= Number(claims.exp) ||
        (claims.nbf !== undefined && (!validNumericDate(claims.nbf) || Number(claims.nbf) > now + 60)) ||
        typeof claims.nonce !== 'string' || !constantTimeEqual(claims.nonce, expectedNonce)) throw new NativeAuthError(401);
    // Không nhận địa chỉ khóa từ JWT; giới hạn cả kích thước phản hồi khi tải khóa.
    const response = await providerFetch('https://www.facebook.com/.well-known/oauth/openid/jwks/');
    const jwks = await readFacebookKeys(response);
    const keyData = jwks.find(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
    if (!keyData) throw new NativeAuthError(401);
    const key = await crypto.subtle.importKey('jwk', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new NativeAuthError(401);
    const picture = typeof claims.picture === 'string' ? claims.picture.trim().slice(0, 2048) : '';
    return {
      id: claims.sub,
      name: typeof claims.name === 'string' ? claims.name.trim().slice(0, 200) : '',
      email: typeof claims.email === 'string' ? claims.email.trim().slice(0, 320) || null : null,
      pictureUrl: picture.startsWith('https://') ? picture : null,
    };
  } catch (error) {
    if (error instanceof NativeAuthError) throw error;
    if (error instanceof TypeError || (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))) throw error;
    throw new NativeAuthError(401);
  }
}

async function readFacebookKeys(response: Response): Promise<Array<JsonWebKey & { kid?: string }>> {
  if (!response.ok || !response.body) throw new NativeAuthError(503);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 65_536) { await reader.cancel(); throw new NativeAuthError(503); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || !Array.isArray(value.keys) || value.keys.length > 20 || value.keys.some((key: unknown) => !key || typeof key !== 'object' || Array.isArray(key))) throw new NativeAuthError(503);
    return value.keys;
  } catch (error) {
    if (error instanceof NativeAuthError) throw error;
    throw new NativeAuthError(503);
  } finally { reader.releaseLock(); }
}

export async function verifyAppleNativeToken(env: CloudflareEnvLike, token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) throw new NativeAuthError(401);
  try {
    const header = decodeObject(parts[0]);
    const claims = decodeObject(parts[1]);
    const audience = env.APPLE_CLIENT_ID || 'vn.quangtu.tutam';
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
        claims.iss !== 'https://appleid.apple.com' || claims.aud !== audience || !validSubject(claims.sub) ||
        !validNumericDate(claims.exp) || Number(claims.exp) <= now ||
        !validNumericDate(claims.iat) || Number(claims.iat) > now + 60 ||
        (claims.nbf !== undefined && (!validNumericDate(claims.nbf) || Number(claims.nbf) > now + 60))) {
      throw new NativeAuthError(401);
    }
    // Only Apple's fixed HTTPS JWKS endpoint is trusted; never use jku/x5u from a token.
    const response = await providerFetch('https://appleid.apple.com/auth/keys');
    if (!response.ok) throw new NativeAuthError(503, 'Dịch vụ xác thực Apple tạm thời không khả dụng.');
    const jwks = await response.json() as { keys?: Array<JsonWebKey & { kid?: string }> };
    const keyData = jwks.keys?.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
    if (!keyData) throw new NativeAuthError(401);
    const key = await crypto.subtle.importKey('jwk', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new NativeAuthError(401);
    return claims;
  } catch (error) {
    if (error instanceof NativeAuthError) throw error;
    if (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name)) throw error;
    throw new NativeAuthError(401);
  }
}

function decodeObject(value: string): Record<string, unknown> {
  const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(value)));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new NativeAuthError(401);
  return decoded;
}
function validSubject(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && value.trim() === value;
}
function validNumericDate(value: unknown, allowString = false): boolean {
  return (typeof value === 'number' || (allowString && typeof value === 'string' && /^\d+$/u.test(value))) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
