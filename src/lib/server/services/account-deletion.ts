import type { CloudflareEnvLike } from '../cloudflare-context';
import type { InternalSession } from '../auth/types';
import { ServerInputError } from '../errors';
import { revokeStoredAppleAuthorization, storeAppleAuthorization } from '../auth/apple-authorization';
import { verifyAppleNativeToken } from '../auth/native-token-verification';

export interface AccountDeletionAuthorization {
  appleIdentityToken?: string;
  appleAuthorizationCode?: string;
}

// Every statement in the atomic D1 batch uses this predicate: rejecting deletion
// must also leave private data unchanged, including concurrent last-admin changes.
const eligibleAccount = `SELECT account.id FROM app_users account WHERE account.id = ?
  AND (account.role <> 'admin' OR (SELECT COUNT(*) FROM app_users remaining_admin
    WHERE remaining_admin.role = 'admin' AND (COALESCE(account.status, 'active') <> 'active'
      OR COALESCE(remaining_admin.status, 'active') = 'active')) > 1)
  AND NOT EXISTS (SELECT 1 FROM auth_identities identity
    LEFT JOIN apple_account_tokens token ON token.owner_id = identity.user_id
      AND token.provider_subject = identity.provider_subject
    WHERE identity.user_id = account.id AND identity.provider = 'apple'
      AND (token.revoked_at IS NULL))`;

export async function deleteAccount(env: CloudflareEnvLike, session: InternalSession, authorization: AccountDeletionAuthorization = {}): Promise<void> {
  const ownerId = session.appUserId;
  if (!ownerId) throw new ServerInputError(403, 'account_required', 'Tài khoản không hợp lệ.');
  // Avoid revoking an external grant when the account is already known protected.
  if (session.role === 'admin') {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM app_users
      WHERE role = 'admin' AND COALESCE(status, 'active') = 'active'`).first<{ total: number }>();
    if (Number(row?.total ?? 0) <= 1) throw lastAdminError();
  }
  const identities = await env.DB.prepare(`SELECT provider, provider_subject FROM auth_identities
    WHERE user_id = ? AND provider = 'apple'`).bind(ownerId).all<{ provider: string; provider_subject: string }>();
  for (const identity of identities.results ?? []) {
    try {
      let revoked = await revokeStoredAppleAuthorization(env, ownerId, identity.provider_subject);
      if (!revoked) {
        if (!authorization.appleIdentityToken || !authorization.appleAuthorizationCode) {
          throw new ServerInputError(409, 'apple_reauthentication_required', 'Vui lòng xác thực lại bằng Apple để xóa tài khoản.');
        }
        const claims = await verifyAppleNativeToken(env, authorization.appleIdentityToken);
        if (claims.sub !== identity.provider_subject) throw new ServerInputError(403, 'apple_identity_mismatch', 'Tài khoản Apple không khớp tài khoản cần xóa.');
        await storeAppleAuthorization(env, ownerId, identity.provider_subject, authorization.appleAuthorizationCode);
        revoked = await revokeStoredAppleAuthorization(env, ownerId, identity.provider_subject);
      }
      if (!revoked) throw new Error('apple-revocation-incomplete');
    } catch (error) {
      if (error instanceof ServerInputError) throw error;
      throw new ServerInputError(503, 'apple_authorization_unavailable', 'Chưa thể thu hồi quyền Apple. Tài khoản và dữ liệu vẫn được giữ. Vui lòng thử lại.');
    }
  }
  const owned = (column: string) => `${column} IN (${eligibleAccount})`;
  const statements = [
    env.DB.prepare(`DELETE FROM pt_player_sync WHERE id = ? AND EXISTS (${eligibleAccount})`).bind(`google_${ownerId}`, ownerId),
    env.DB.prepare(`DELETE FROM thanh_tinh_pledges WHERE ${owned('user_id')}`).bind(ownerId),
    env.DB.prepare(`DELETE FROM active_visitors WHERE ${owned('principal_id')}`).bind(ownerId),
    // Keep structural parent rows so another person's replies are not cascaded away.
    env.DB.prepare(`UPDATE binh_luan SET noi_dung = '', ten = '', email = '', dien_thoai = '',
      approved_author_name = NULL, approved_author_avatar_url = NULL,
      moderation_status = 'rejected', moderation_reason = NULL, moderation_revision = moderation_revision + 1
      WHERE ${owned('author_user_id')}`).bind(ownerId),
    env.DB.prepare(`DELETE FROM app_users WHERE id IN (${eligibleAccount})`).bind(ownerId),
  ];
  const results = await env.DB.batch(statements);
  if (Number(results.at(-1)?.meta?.changes ?? 0) < 1) {
    if (session.role === 'admin') throw lastAdminError();
    throw new ServerInputError(409, 'account_deletion_changed', 'Tài khoản vừa thay đổi. Vui lòng xác thực lại và thử xóa tài khoản.');
  }
}

function lastAdminError(): ServerInputError {
  return new ServerInputError(409, 'last_admin_protected', 'Không thể xoá tài khoản quản trị viên duy nhất.');
}
