import type { CloudflareRequestContext } from '../cloudflare-context';
import {
  adminDateRangeBuckets,
  resolveAdminDateRange,
  type AdminDateRange,
  type AdminTrafficInterval,
} from '../../domain/admin-date-range';
import { vietnamDateKey } from '../domain/visitor-client';
import { createAdminDashboardRepository, type OnlineVisitorRow } from '../repositories/admin-dashboard-repository';

export interface AdminDashboardData {
  content: {
    articles: number;
    pdfs: number;
    privateTalks: number;
    publicTalks: number;
    rituals: number;
    sutras: number;
    talks: number;
  };
  engagement: { articleViews: number; comments: number };
  generatedAt: string;
  members: { admins: number; collaborators: number; members: number; users: number };
  onlineVisitorCount: number;
  onlineVisitors: Array<{
    accountType: 'guest' | 'member' | 'internal';
    accountLabel: string;
    browserName: string;
    currentPath: string;
    deviceType: string;
    firstSeenAt: string;
    id: string;
    isAuthenticated: boolean;
    isOverflow: boolean;
    lastSeenAt: string;
    operatingSystem: string;
    role: 'guest' | 'user' | 'ctv' | 'admin';
  }>;
  range: AdminDateRange;
  system: { analyticsAvailable: boolean; mediaConfigured: boolean; presenceEnabled: boolean };
  traffic: {
    daily: Array<{ date: string; visitors: number }>;
    interval: AdminTrafficInterval;
    rangeVisitors: number;
    thisMonth: number;
    thisYear: number;
    today: number;
  };
}

export function createAdminDashboardService(context: CloudflareRequestContext) {
  const repository = createAdminDashboardRepository(context.env);

  return {
    async getDashboard(now = Date.now(), rangeInput: unknown = '28d'): Promise<AdminDashboardData> {
      const today = vietnamDateKey(now);
      const window = resolveAdminDateRange(rangeInput, today);
      const chartDates = adminDateRangeBuckets(window);
      const analyticsPromise = Promise.all([
        repository.trafficSummary(today, `${today.slice(0, 7)}-01`, `${today.slice(0, 4)}-01-01`, window.startDate, window.endDate),
        repository.trafficSeries(window.startDate, window.endDate, window.interval),
      ]).then(([traffic, dailyRows]) => ({
        available: true,
        dailyRows,
        traffic,
      }))
        .catch((error: unknown) => {
          if (!isMissingAnalyticsSchema(error)) throw error;
          return { available: false, traffic: null, dailyRows: [], onlineRows: [], onlineVisitorCount: 0 };
        });
      const [content, talks, engagement, members, analytics] = await Promise.all([
        repository.contentSummary(),
        repository.talkSummary(),
        repository.engagementSummary(),
        repository.memberSummary(),
        analyticsPromise,
      ]);
      const { traffic, dailyRows } = analytics;
      const dailyByDate = new Map(dailyRows.map((row) => [String(row.visit_date), number(row.visitor_count)]));
      return {
        content: {
          articles: number(content?.articles),
          pdfs: number(content?.pdfs),
          privateTalks: number(talks?.private_talks),
          publicTalks: number(talks?.public_talks),
          rituals: number(content?.rituals),
          sutras: number(content?.sutras),
          talks: number(talks?.talks),
        },
        engagement: {
          articleViews: number(engagement?.article_views),
          comments: number(engagement?.comments),
        },
        generatedAt: new Date(now).toISOString(),
        members: {
          admins: number(members?.admins),
          collaborators: number(members?.collaborators),
          members: number(members?.members),
          users: number(members?.users),
        },
        onlineVisitorCount: 0,
        onlineVisitors: [],
        range: window.range,
        system: {
          analyticsAvailable: analytics.available,
          mediaConfigured: Boolean(context.env.MEDIA),
          presenceEnabled: false,
        },
        traffic: {
          daily: chartDates.map((date) => ({ date, visitors: dailyByDate.get(date) || 0 })),
          interval: window.interval,
          rangeVisitors: number(traffic?.range_visitors),
          thisMonth: number(traffic?.this_month),
          thisYear: number(traffic?.this_year),
          today: number(traffic?.today),
        },
      };
    },
  };
}

export function serializeOnlineVisitors(rows: OnlineVisitorRow[]): AdminDashboardData['onlineVisitors'] {
  return rows.map((row, index) => ({
    accountType: row.role === 'admin' || row.role === 'ctv' ? 'internal' : row.role === 'user' ? 'member' : 'guest',
    accountLabel: row.display_name?.trim() || (row.is_overflow ? 'Nhiều khách cùng mạng' : 'Khách'),
    browserName: row.browser_name || 'Chưa xác định',
    currentPath: row.current_path || '/',
    deviceType: row.device_type || 'Chưa xác định',
    firstSeenAt: new Date(Number(row.first_seen_at || row.last_seen_at)).toISOString(),
    id: `visitor-${index + 1}`,
    isAuthenticated: Boolean(row.principal_id),
    isOverflow: row.is_overflow === 1,
    lastSeenAt: new Date(Number(row.last_seen_at)).toISOString(),
    operatingSystem: row.operating_system || 'Chưa xác định',
    role: role(row.role),
  }));
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function role(value: unknown): 'guest' | 'user' | 'ctv' | 'admin' {
  return value === 'admin' || value === 'ctv' || value === 'user' ? value : 'guest';
}

function isMissingAnalyticsSchema(error: unknown): boolean {
  return /(?:no such table:\s*visitor_daily_presence|no such column:\s*(?:principal_id|device_type|current_path))/iu
    .test(String((error as Error)?.message || error));
}
