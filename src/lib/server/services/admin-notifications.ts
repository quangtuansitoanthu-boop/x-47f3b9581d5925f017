import type { CloudflareRequestContext, D1ResultRow } from '../cloudflare-context';
import { ServerInputError } from '../errors';

export interface AdminNotificationItem {
  badge: string;
  id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  link: string;
  message: string;
  timestamp: string;
  title: string;
  type: 'pending_article' | 'rejected_article' | 'approved_article' | 'new_member';
}

export interface AdminNotificationsResponse {
  notifications: AdminNotificationItem[];
  total: number;
}

export async function getAdminNotifications(
  context: CloudflareRequestContext,
): Promise<AdminNotificationsResponse> {
  const session = context.principal;
  if (!session) {
    throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
  }
  const role = session.role;
  const env = context.env;
  const notifications: AdminNotificationItem[] = [];

  if (role === 'admin') {
    // 1. Pending articles for Admin approval
    try {
      const pendingArticles = await env.DB.prepare(`
        SELECT id, tieu_de, tac_gia, trang_thai, created_at, updated_at, ngay_dang
        FROM baiviet
        WHERE trang_thai = 'Chờ duyệt'
        ORDER BY COALESCE(updated_at, created_at, ngay_dang) DESC
        LIMIT 20
      `).all<D1ResultRow>();

      for (const row of pendingArticles.results ?? []) {
        const id = String(row.id);
        const title = String(row.tieu_de || 'Bài viết chưa đặt tên');
        const author = String(row.tac_gia || 'Cộng tác viên');
        const timestamp = String(row.updated_at || row.created_at || row.ngay_dang || new Date().toISOString());

        notifications.push({
          id: `article-pending-${id}`,
          type: 'pending_article',
          title: 'Bài viết chờ duyệt',
          message: `“${title}” của tác giả ${author} đang chờ bạn duyệt và phát hành.`,
          timestamp,
          link: `/admin/books?tab=pending&book=${encodeURIComponent(id)}`,
          badge: '⏳',
          level: 'warning',
        });
      }
    } catch (e) {
      console.warn('Failed to query pending articles for notifications:', e);
    }

    // 2. New members recently joined
    try {
      const recentUsers = await env.DB.prepare(`
        SELECT id, display_name, email, role, avatar_url, created_at
        FROM app_users
        ORDER BY created_at DESC
        LIMIT 10
      `).all<D1ResultRow>();

      for (const row of recentUsers.results ?? []) {
        const id = String(row.id);
        const name = String(row.display_name || row.email || 'Thành viên mới');
        const timestamp = String(row.created_at || new Date().toISOString());

        notifications.push({
          id: `user-new-${id}`,
          type: 'new_member',
          title: 'Thành viên mới',
          message: `“${name}” vừa đăng ký tài khoản trên hệ thống.`,
          timestamp,
          link: '/admin/members',
          badge: '👤',
          level: 'info',
        });
      }
    } catch (e) {
      console.warn('Failed to query recent users for notifications:', e);
    }
  } else if (role === 'ctv') {
    // CTV Notifications: Only notifications for articles created by or assigned to this CTV
    const displayName = (session.displayName || '').trim();
    const email = (session.email || '').trim();
    const namePattern = displayName ? `%${displayName}%` : '%';
    const emailPattern = email ? `%${email}%` : '%';

    try {
      const ctvArticles = await env.DB.prepare(`
        SELECT id, tieu_de, tac_gia, trang_thai, created_at, updated_at, ngay_dang
        FROM baiviet
        WHERE (trang_thai LIKE 'Trả lại%' OR trang_thai = 'Chờ duyệt' OR trang_thai = 'Hoàn thành')
          AND (
            LOWER(TRIM(COALESCE(tac_gia, ''))) = LOWER(?)
            OR LOWER(TRIM(COALESCE(tac_gia, ''))) = LOWER(?)
            OR (tac_gia IS NOT NULL AND (tac_gia LIKE ? OR tac_gia LIKE ?))
          )
        ORDER BY COALESCE(updated_at, created_at, ngay_dang) DESC
        LIMIT 25
      `).bind(displayName, email, namePattern, emailPattern).all<D1ResultRow>();

      for (const row of ctvArticles.results ?? []) {
        const id = String(row.id);
        const title = String(row.tieu_de || 'Bài viết chưa đặt tên');
        const rawStatus = String(row.trang_thai || '');
        const timestamp = String(row.updated_at || row.created_at || row.ngay_dang || new Date().toISOString());

        if (rawStatus.startsWith('Trả lại')) {
          const reason = rawStatus.replace(/^Trả lại:?\s*/u, '').trim();
          notifications.push({
            id: `article-rejected-${id}`,
            type: 'rejected_article',
            title: 'Bài viết cần chỉnh sửa',
            message: reason ? `“${title}” được QTV trả lại. Lý do: ${reason}` : `“${title}” được QTV yêu cầu chỉnh sửa lại.`,
            timestamp,
            link: `/admin/books?tab=pending&book=${encodeURIComponent(id)}`,
            badge: '⚠️',
            level: 'error',
          });
        } else if (rawStatus === 'Hoàn thành') {
          notifications.push({
            id: `article-approved-${id}`,
            type: 'approved_article',
            title: 'Bài viết đã duyệt',
            message: `“${title}” đã được Quản trị viên duyệt và phát hành.`,
            timestamp,
            link: `/admin/books?tab=approved&book=${encodeURIComponent(id)}`,
            badge: '✅',
            level: 'success',
          });
        } else if (rawStatus === 'Chờ duyệt') {
          notifications.push({
            id: `article-pending-${id}`,
            type: 'pending_article',
            title: 'Đang chờ duyệt',
            message: `“${title}” đang trong hàng đợi chờ Quản trị viên duyệt.`,
            timestamp,
            link: `/admin/books?tab=pending&book=${encodeURIComponent(id)}`,
            badge: '⏳',
            level: 'info',
          });
        }
      }
    } catch (e) {
      console.warn('Failed to query CTV articles for notifications:', e);
    }
  }

  // Sort by newest timestamp first
  notifications.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return {
    notifications,
    total: notifications.length,
  };
}
