import type { CloudflareEnvLike } from '../cloudflare-context';
import { consumeOAuthState, createOAuthState, loadOAuthState } from './oauth-state';
import { sha256 } from './crypto';
import { constantTimeEqual } from '../http/security';
import { OAuthError } from './google-oauth';
import { createSession } from './sessions';

export const FACEBOOK_NATIVE_CALLBACK = 'vn.quangtu.tutam://auth/facebook';
export const validFacebookChallenge = (value: string): boolean => /^[A-Za-z0-9_-]{43}$/u.test(value);

export async function issueFacebookHandoff(env: CloudflareEnvLike, challenge: string,
  principal: { user_id: string; identity_id: string }): Promise<string> {
  const handoff = await createOAuthState(env, '/', { provider: 'facebook', purpose: 'login',
    nativeFacebook: { phase: 'handoff', challenge, userId: principal.user_id, identityId: principal.identity_id } });
  const callback = new URL(FACEBOOK_NATIVE_CALLBACK);
  callback.searchParams.set('code', handoff.state);
  return callback.toString();
}

export async function redeemFacebookHandoff(env: CloudflareEnvLike, code: unknown, verifier: unknown) {
  const invalid = () => new OAuthError('facebook_handoff_invalid', 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.', 401);
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(code)
    || typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/u.test(verifier)) throw invalid();
  const pending = await loadOAuthState(env, code);
  const binding = pending?.nativeFacebook;
  if (pending?.provider !== 'facebook' || pending.purpose !== 'login' || binding?.phase !== 'handoff'
    || !binding.userId || !binding.identityId || !constantTimeEqual(binding.challenge, await sha256(verifier))) throw invalid();
  // Chỉ consume sau khi kiểm tra verifier; một bên đọc trộm URL không thể đốt mã của app.
  const consumed = await consumeOAuthState(env, code);
  if (!consumed) throw invalid();
  const account = await env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url, u.role
    FROM app_users u JOIN auth_identities i ON i.user_id = u.id
    WHERE u.id = ? AND i.id = ? AND i.provider = 'facebook' AND u.status = 'active'
  `).bind(binding.userId, binding.identityId).first<{
    id: string; email: string | null; display_name: string | null; avatar_url: string | null; role: string;
  }>();
  if (!account) throw invalid();
  const session = await createSession(env, { userId: account.id, identityId: binding.identityId, authProvider: 'facebook' });
  return { cookie: session.cookie, payload: { success: true, userId: account.id,
    user: { id: account.id, email: account.email || '', displayName: account.display_name || 'Người dùng Facebook',
      avatarUrl: account.avatar_url || '', role: account.role === 'admin' || account.role === 'ctv' ? account.role : 'user' },
    session: { csrfToken: session.csrfToken, expiresAt: session.expiresAt } } };
}
