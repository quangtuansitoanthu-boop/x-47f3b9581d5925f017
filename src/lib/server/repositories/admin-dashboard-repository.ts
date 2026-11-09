import type { CloudflareEnvLike } from '../cloudflare-context';
import type { AdminTrafficInterval } from '../../domain/admin-date-range';

export interface DailyTrafficRow {
  visit_date: string;
  visitor_count: number;
}

export interface OnlineVisitorRow {
  browser_name: string | null;
  current_path: string | null;
  device_type: string | null;
  display_name: string | null;
  first_seen_at: number | null;
  is_overflow: number | null;
  last_seen_at: number;
  operating_system: string | null;
  principal_id: string | null;
  role: string | null;
}

export function createAdminDashboardRepository(env: CloudflareEnvLike) {
  return {
    async contentSummary() {
      return env.DB.prepare(`
        SELECT
          COUNT(*) AS articles,
          SUM(CASE WHEN danh_muc = 'KINH PHẬT' THEN 1 ELSE 0 END) AS sutras,
          SUM(CASE WHEN danh_muc = 'CÁC NGHI THỨC' THEN 1 ELSE 0 END) AS rituals,
          SUM(CASE WHEN pdf_url IS NOT NULL AND pdf_url <> '' THEN 1 ELSE 0 END) AS pdfs
        FROM baiviet
      `).first<Record<string, unknown>>();
    },

    async talkSummary() {
      return env.DB.prepare(`
        SELECT COUNT(*) AS talks,
          SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END) AS public_talks,
          SUM(CASE WHEN visibility = 'private' THEN 1 ELSE 0 END) AS private_talks
        FROM phap_thoai
      `).first<Record<string, unknown>>();
    },

    async engagementSummary() {
      return env.DB.prepare(`
        SELECT
          (SELECT COALESCE(SUM(so_luot), 0) FROM luot_xem) AS article_views,
          (SELECT COUNT(*) FROM binh_luan) AS comments
      `).first<Record<string, unknown>>();
    },

    async memberSummary() {
      return env.DB.prepare(`
        SELECT COUNT(*) AS members,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS users,
          SUM(CASE WHEN role = 'ctv' THEN 1 ELSE 0 END) AS collaborators,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins
        FROM app_users
      `).first<Record<string, unknown>>();
    },

    async trafficSummary(today: string, monthStart: string, yearStart: string, rangeStart: string, rangeEnd: string) {
      return env.DB.prepare(`
        SELECT
          COUNT(DISTINCT CASE WHEN visit_date = ? THEN visitor_id_hash END) AS today,
          COUNT(DISTINCT CASE WHEN visit_date >= ? AND visit_date <= ? THEN visitor_id_hash END) AS this_month,
          COUNT(DISTINCT CASE WHEN visit_date >= ? AND visit_date <= ? THEN visitor_id_hash END) AS this_year,
          COUNT(DISTINCT CASE WHEN visit_date >= ? AND visit_date <= ? THEN visitor_id_hash END) AS range_visitors
        FROM visitor_daily_presence
      `).bind(today, monthStart, today, yearStart, today, rangeStart, rangeEnd).first<Record<string, unknown>>();
    },

    async trafficSeries(startDate: string, endDate: string, interval: AdminTrafficInterval): Promise<DailyTrafficRow[]> {
      const bucket = interval === 'month' ? "substr(visit_date, 1, 7) || '-01'" : 'visit_date';
      const response = await env.DB.prepare(`
        SELECT ${bucket} AS visit_date, COUNT(DISTINCT visitor_id_hash) AS visitor_count
        FROM visitor_daily_presence
        WHERE visit_date >= ? AND visit_date <= ?
        GROUP BY 1
        ORDER BY visit_date ASC
      `).bind(startDate, endDate).all<DailyTrafficRow>();
      return response.results ?? [];
    },

    async onlineVisitors(activeCutoff: number): Promise<OnlineVisitorRow[]> {
      const response = await env.DB.prepare(`
        SELECT principal_id, display_name, role, device_type, browser_name,
          operating_system, current_path, first_seen_at, last_seen_at, is_overflow
        FROM active_visitors
        WHERE last_seen_at >= ?
        ORDER BY last_seen_at DESC
        LIMIT 50
      `).bind(activeCutoff).all<OnlineVisitorRow>();
      return response.results ?? [];
    },

    async onlineVisitorCount(activeCutoff: number): Promise<number> {
      const row = await env.DB.prepare(`
        SELECT COUNT(*) AS active_count
        FROM active_visitors
        WHERE last_seen_at >= ?
      `).bind(activeCutoff).first<{ active_count?: number }>();
      return Number(row?.active_count || 0);
    },
  };
}
