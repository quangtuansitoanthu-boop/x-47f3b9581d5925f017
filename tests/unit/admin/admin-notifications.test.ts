import { describe, expect, it } from 'vitest';
import { getAdminNotifications } from '../../../src/lib/server/services/admin-notifications';
import type { CloudflareRequestContext } from '../../../src/lib/server/cloudflare-context';

describe('admin notifications service', () => {
  it('returns pending articles and new users for admin role', async () => {
    const mockEnv = {
      DB: {
        prepare: (sql: string) => ({
          all: async () => {
            if (sql.includes('FROM baiviet')) {
              return {
                results: [
                  { id: 'art-1', tieu_de: 'Kinh Pháp Cú', tac_gia: 'CTV1', trang_thai: 'Chờ duyệt', created_at: '2026-08-30T09:00:00Z' },
                ],
              };
            }
            if (sql.includes('FROM app_users')) {
              return {
                results: [
                  { id: 'user-1', display_name: 'Nguyen Van A', email: 'a@gmail.com', role: 'user', created_at: '2026-08-30T08:00:00Z' },
                ],
              };
            }
            return { results: [] };
          },
        }),
      },
    };

    const context: CloudflareRequestContext = {
      env: mockEnv as any,
      principal: {
        id: 'sess-1',
        userId: 'admin-1',
        appUserId: 'admin-1',
        displayName: 'Admin',
        email: 'admin@tutam.vn',
        role: 'admin',
        avatarUrl: null,
        expiresAt: '2026-09-01T00:00:00Z',
        csrfToken: 'token',
        rawToken: 'raw',
      },
      requestId: 'req-1',
    };

    const res = await getAdminNotifications(context);
    expect(res.notifications.length).toBe(2);
    expect(res.notifications[0].type).toBe('pending_article');
    expect(res.notifications[0].badge).toBe('⏳');
    expect(res.notifications[1].type).toBe('new_member');
    expect(res.notifications[1].badge).toBe('👤');
  });

  it('returns rejected and approved articles for ctv role', async () => {
    const createMockStmt = (sql: string, boundArgs: any[] = []) => ({
      bind: (...args: any[]) => createMockStmt(sql, args),
      all: async () => {
        if (sql.includes('FROM baiviet')) {
          if (boundArgs.length > 0) {
            // Filter by author matching boundArgs
            const authorQuery = String(boundArgs[0] || '').toLowerCase();
            const allArticles = [
              { id: 'art-2', tieu_de: 'Bài Của CTV', tac_gia: 'CTV User', trang_thai: 'Trả lại: Thiếu nguồn', updated_at: '2026-08-30T09:10:00Z' },
              { id: 'art-3', tieu_de: 'Bài Đã Duyệt', tac_gia: 'CTV User', trang_thai: 'Hoàn thành', updated_at: '2026-08-30T08:30:00Z' },
              { id: 'art-other', tieu_de: 'Bài Của Người Khác', tac_gia: 'Tác Giả Khác', trang_thai: 'Hoàn thành', updated_at: '2026-08-30T08:00:00Z' },
            ];
            return {
              results: allArticles.filter((a) => a.tac_gia.toLowerCase().includes(authorQuery)),
            };
          }
          return {
            results: [
              { id: 'art-1', tieu_de: 'Kinh Pháp Cú', tac_gia: 'CTV1', trang_thai: 'Chờ duyệt', created_at: '2026-08-30T09:00:00Z' },
            ],
          };
        }
        if (sql.includes('FROM app_users')) {
          return {
            results: [
              { id: 'user-1', display_name: 'Nguyen Van A', email: 'a@gmail.com', role: 'user', created_at: '2026-08-30T08:00:00Z' },
            ],
          };
        }
        return { results: [] };
      },
    });

    const mockEnv = {
      DB: {
        prepare: (sql: string) => createMockStmt(sql),
      },
    };

    const context: CloudflareRequestContext = {
      env: mockEnv as any,
      principal: {
        id: 'sess-2',
        userId: 'ctv-1',
        appUserId: 'ctv-1',
        displayName: 'CTV User',
        email: 'ctv@tutam.vn',
        role: 'ctv',
        avatarUrl: null,
        expiresAt: '2026-09-01T00:00:00Z',
        csrfToken: 'token',
        rawToken: 'raw',
      },
      requestId: 'req-2',
    };

    const res = await getAdminNotifications(context);
    expect(res.notifications.length).toBe(2);
    expect(res.notifications[0].type).toBe('rejected_article');
    expect(res.notifications[0].badge).toBe('⚠️');
    expect(res.notifications[0].message).toContain('Lý do: Thiếu nguồn');
    expect(res.notifications[1].type).toBe('approved_article');
    expect(res.notifications[1].badge).toBe('✅');
  });
});
