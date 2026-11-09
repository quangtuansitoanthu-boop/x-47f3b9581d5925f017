import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';
import type { InternalSession, SessionRole } from '../auth/types';
import { ServerInputError } from '../errors';
import { buildMemberUpdate, type AdminMemberStatus } from './admin-members-input';

export type AdminMemberKind = 'member';
export type AdminAccountType = 'member' | 'admin';
export type { AdminMemberStatus };

export interface AdminMemberDTO {
  kind: AdminMemberKind;
  accountType: AdminAccountType;
  id: string;
  name: string;
  email: string | null;
  username: null;
  role: SessionRole;
  status: AdminMemberStatus;
  suspendedAt: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isSelf: boolean;
}

const LAST_ADMIN_PREDICATE = `(
  role <> 'admin'
  OR (COALESCE(?, role) = 'admin' AND (COALESCE(status, 'active') <> 'active' OR COALESCE(?, status, 'active') = 'active'))
  OR (SELECT COUNT(*) FROM app_users remaining_admin
      WHERE remaining_admin.role = 'admin'
        AND (COALESCE(app_users.status, 'active') <> 'active' OR COALESCE(remaining_admin.status, 'active') = 'active')) > 1
)`;

export function createAdminMembersService(env: CloudflareEnvLike, actor: InternalSession) {
  return {
    async listMembers(): Promise<{ members: AdminMemberDTO[] }> {
      const result = await env.DB.prepare(`
        SELECT id, COALESCE(NULLIF(display_name, ''), NULLIF(email, ''), 'Thành viên') AS name,
          email, role, status, suspended_at, avatar_url, created_at, updated_at
        FROM app_users
        ORDER BY created_at DESC, id ASC
      `).all<D1ResultRow>();
      return { members: (result.results ?? []).map((row) => mapMember(row, actor)) };
    },

    async update(rawId: string, input: Record<string, unknown>): Promise<AdminMemberDTO> {
      const target = await findMember(env, rawId);
      if (!target) throw new ServerInputError(404, 'member_not_found', 'Không tìm thấy thành viên.');
      const current = mapMember(target, actor);
      const update = buildMemberUpdate(input);
      if (!update.assignments.length) {
        throw new ServerInputError(400, 'empty_update', 'Không có thông tin hợp lệ để cập nhật.');
      }
      if (current.isSelf && update.role && update.role !== 'admin') {
        throw new ServerInputError(409, 'self_role_protected', 'Bạn không thể tự hạ quyền quản trị của mình.');
      }
      if (current.isSelf && update.status === 'suspended') {
        throw new ServerInputError(409, 'self_suspend_protected', 'Bạn không thể tự đình chỉ/khoá tài khoản đang đăng nhập của mình.');
      }
      const now = new Date().toISOString();
      // Guard nằm ngay trong lệnh ghi để hai request không cùng thu hồi admin cuối.
      const accountUpdate = env.DB.prepare(`
        UPDATE app_users
        SET ${update.assignments.join(', ')}, updated_at = ?
        WHERE id = ? AND ${LAST_ADMIN_PREDICATE}
      `).bind(...update.values, now, rawId, update.role ?? null, update.status ?? null);
      const roleChanged = update.role !== undefined && update.role !== current.role;
      const statusSuspended = update.status === 'suspended' && current.status !== 'suspended';
      const needSessionRevocation = roleChanged || statusSuspended;
      const result = needSessionRevocation
        ? (await env.DB.batch([
            accountUpdate,
            env.DB.prepare(`
              UPDATE auth_sessions
              SET revoked_at = ?
              WHERE user_id = ? AND revoked_at IS NULL AND changes() > 0
            `).bind(now, rawId),
          ]))[0]
        : await accountUpdate.run();
      if (Number(result.meta?.changes ?? 0) < 1) {
        throw new ServerInputError(409, 'last_admin_protected', update.status === 'suspended'
          ? 'Không thể đình chỉ quản trị viên đang hoạt động duy nhất của hệ thống.'
          : 'Hệ thống phải luôn còn ít nhất một quản trị viên.');
      }
      return requireMember(await findMember(env, rawId), actor);
    },

    async remove(rawId: string): Promise<void> {
      const target = await findMember(env, rawId);
      if (!target) throw new ServerInputError(404, 'member_not_found', 'Không tìm thấy thành viên.');
      const current = mapMember(target, actor);
      if (current.isSelf) {
        throw new ServerInputError(409, 'self_delete_protected', 'Bạn không thể tự xoá tài khoản đang đăng nhập.');
      }
      const result = await env.DB.prepare(`
        DELETE FROM app_users
        WHERE id = ? AND (
          role <> 'admin'
          OR (SELECT COUNT(*) FROM app_users remaining_admin
              WHERE remaining_admin.role = 'admin'
                AND (COALESCE(app_users.status, 'active') <> 'active' OR COALESCE(remaining_admin.status, 'active') = 'active')) > 1
        )
      `).bind(rawId).run();
      // D1 includes rows removed by ON DELETE CASCADE, including sessions and identities.
      if (Number(result.meta?.changes ?? 0) < 1) {
        throw new ServerInputError(409, 'last_admin_protected', 'Không thể xoá quản trị viên cuối cùng.');
      }
    },
  };
}

async function findMember(env: CloudflareEnvLike, id: string) {
  return env.DB.prepare(`
    SELECT id, COALESCE(NULLIF(display_name, ''), NULLIF(email, ''), 'Thành viên') AS name,
      email, role, status, suspended_at, avatar_url, created_at, updated_at
    FROM app_users WHERE id = ?
  `).bind(id).first<D1ResultRow>();
}

function mapMember(row: D1ResultRow, actor: InternalSession): AdminMemberDTO {
  const id = String(row.id);
  const role: SessionRole = row.role === 'admin' || row.role === 'ctv' ? row.role : 'user';
  const status: AdminMemberStatus = row.status === 'suspended' ? 'suspended' : 'active';
  return {
    kind: 'member',
    accountType: role === 'admin' ? 'admin' : 'member',
    id,
    name: String(row.name || row.email || 'Thành viên'),
    email: row.email ? String(row.email) : null,
    username: null,
    role,
    status,
    suspendedAt: row.suspended_at ? String(row.suspended_at) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    isSelf: actor.appUserId === id,
  };
}

function requireMember(row: D1ResultRow | null, actor: InternalSession): AdminMemberDTO {
  if (!row) throw new ServerInputError(500, 'member_write_failed', 'Không thể đọc lại thành viên vừa cập nhật.');
  return mapMember(row, actor);
}
