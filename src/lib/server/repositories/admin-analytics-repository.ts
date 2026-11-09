import type { CloudflareEnvLike } from '../cloudflare-context';
import type { AdminTrafficInterval } from '../../domain/admin-date-range';

export interface AnalyticsMetricRow {
  average_duration_seconds?: number;
  bounce_rate?: number;
  pageviews?: number;
  unique_visitors?: number;
  visits?: number;
}

export interface AnalyticsDailyRow {
  average_duration_seconds: number;
  bounce_rate: number;
  pageviews: number;
  unique_visitors: number;
  visit_date: string;
  visits: number;
}

export interface AnalyticsBreakdownRow {
  label: string;
  pageviews?: number;
  visitors: number;
  visits?: number;
}

export function createAdminAnalyticsRepository(env: CloudflareEnvLike) {
  return {
    async summary(startDate: string, endDate: string): Promise<AnalyticsMetricRow | null> {
      return env.DB.prepare(`
        WITH scoped AS (
          SELECT * FROM analytics_pageviews WHERE visit_date >= ? AND visit_date <= ?
        ), sessions AS (
          SELECT session_id_hash, COUNT(*) AS pageviews,
            MAX(last_seen_at) - MIN(started_at) AS duration_ms
          FROM scoped GROUP BY session_id_hash
        )
        SELECT
          (SELECT COUNT(DISTINCT visitor_id_hash) FROM scoped) AS unique_visitors,
          (SELECT COUNT(*) FROM sessions) AS visits,
          (SELECT COUNT(*) FROM scoped) AS pageviews,
          COALESCE((SELECT 100.0 * SUM(CASE WHEN pageviews = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) FROM sessions), 0) AS bounce_rate,
          COALESCE((SELECT AVG(duration_ms) / 1000.0 FROM sessions), 0) AS average_duration_seconds
      `).bind(startDate, endDate).first<AnalyticsMetricRow>();
    },

    async trafficSeries(startDate: string, endDate: string, interval: AdminTrafficInterval): Promise<AnalyticsDailyRow[]> {
      const bucket = interval === 'month' ? "substr(visit_date, 1, 7) || '-01'" : 'visit_date';
      const response = await env.DB.prepare(`
        WITH scoped AS (
          SELECT ${bucket} AS visit_date, visitor_id_hash, session_id_hash, started_at, last_seen_at
          FROM analytics_pageviews
          WHERE visit_date >= ? AND visit_date <= ?
        ), traffic AS (
          SELECT visit_date,
            COUNT(DISTINCT visitor_id_hash) AS unique_visitors,
            COUNT(DISTINCT session_id_hash) AS visits,
            COUNT(*) AS pageviews
          FROM scoped
          GROUP BY visit_date
        ), sessions AS (
          SELECT visit_date, session_id_hash, COUNT(*) AS pageviews,
            MAX(last_seen_at) - MIN(started_at) AS duration_ms
          FROM scoped
          GROUP BY visit_date, session_id_hash
        ), session_stats AS (
          SELECT visit_date,
            COALESCE(100.0 * SUM(CASE WHEN pageviews = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS bounce_rate,
            COALESCE(AVG(duration_ms) / 1000.0, 0) AS average_duration_seconds
          FROM sessions
          GROUP BY visit_date
        )
        SELECT traffic.visit_date, traffic.unique_visitors, traffic.visits, traffic.pageviews,
          COALESCE(session_stats.bounce_rate, 0) AS bounce_rate,
          COALESCE(session_stats.average_duration_seconds, 0) AS average_duration_seconds
        FROM traffic
        LEFT JOIN session_stats ON session_stats.visit_date = traffic.visit_date
        ORDER BY traffic.visit_date ASC
      `).bind(startDate, endDate).all<AnalyticsDailyRow>();
      return response.results ?? [];
    },

    sources(startDate: string, endDate: string) {
      return breakdown(env, `
        SELECT source AS label, COUNT(DISTINCT visitor_id_hash) AS visitors,
          COUNT(DISTINCT session_id_hash) AS visits
        FROM analytics_pageviews WHERE visit_date >= ? AND visit_date <= ?
        GROUP BY source ORDER BY visits DESC, label ASC LIMIT 10
      `, startDate, endDate);
    },

    topPages(startDate: string, endDate: string) {
      return breakdown(env, `
        SELECT path AS label, COUNT(DISTINCT visitor_id_hash) AS visitors,
          COUNT(*) AS pageviews
        FROM analytics_pageviews WHERE visit_date >= ? AND visit_date <= ?
        GROUP BY path ORDER BY pageviews DESC, label ASC LIMIT 10
      `, startDate, endDate);
    },

    browsers(startDate: string, endDate: string) {
      return dimension(env, 'browser_name', startDate, endDate);
    },

    operatingSystems(startDate: string, endDate: string) {
      return dimension(env, 'operating_system', startDate, endDate);
    },

    devices(startDate: string, endDate: string) {
      return dimension(env, 'device_type', startDate, endDate);
    },

    countries(startDate: string, endDate: string) {
      return dimension(env, 'country_code', startDate, endDate);
    },

    regions(startDate: string, endDate: string) {
      return dimension(env, 'region_code', startDate, endDate);
    },

    cities(startDate: string, endDate: string) {
      return dimension(env, 'city', startDate, endDate);
    },
  };
}

async function breakdown(env: CloudflareEnvLike, query: string, startDate: string, endDate: string): Promise<AnalyticsBreakdownRow[]> {
  const response = await env.DB.prepare(query).bind(startDate, endDate).all<AnalyticsBreakdownRow>();
  return response.results ?? [];
}

async function dimension(
  env: CloudflareEnvLike,
  column: 'browser_name' | 'operating_system' | 'device_type' | 'country_code' | 'region_code' | 'city',
  startDate: string,
  endDate: string,
): Promise<AnalyticsBreakdownRow[]> {
  return breakdown(env, `
    SELECT ${column} AS label, COUNT(DISTINCT visitor_id_hash) AS visitors
    FROM analytics_pageviews WHERE visit_date >= ? AND visit_date <= ?
    GROUP BY ${column} ORDER BY visitors DESC, label ASC LIMIT 10
  `, startDate, endDate);
}
