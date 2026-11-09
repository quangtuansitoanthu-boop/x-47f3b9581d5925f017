import type { CloudflareRequestContext } from '../cloudflare-context';
import {
  adminDateRangeBuckets,
  normalizeAdminDateRange,
  resolveAdminDateRange,
  type AdminDateRange,
  type AdminTrafficInterval,
} from '../../domain/admin-date-range';
import { vietnamDateKey } from '../domain/visitor-client';
import {
  createAdminAnalyticsRepository,
  type AnalyticsBreakdownRow,
  type AnalyticsDailyRow,
} from '../repositories/admin-analytics-repository';

export type AdminAnalyticsRange = AdminDateRange;

export interface AdminAnalyticsData {
  available: boolean;
  browsers: AnalyticsBreakdown[];
  cities: AnalyticsBreakdown[];
  countries: AnalyticsBreakdown[];
  daily: Array<{
    averageDurationSeconds: number;
    bounceRate: number;
    date: string;
    pageviews: number;
    visitors: number;
    visits: number;
    viewsPerVisit: number;
  }>;
  devices: AnalyticsBreakdown[];
  generatedAt: string;
  interval: AdminTrafficInterval;
  metrics: {
    averageDurationSeconds: number;
    bounceRate: number;
    pageviews: number;
    uniqueVisitors: number;
    viewsPerVisit: number;
    visits: number;
  };
  operatingSystems: AnalyticsBreakdown[];
  range: AdminAnalyticsRange;
  regions: AnalyticsBreakdown[];
  sources: Array<AnalyticsBreakdown & { visits: number }>;
  topPages: Array<AnalyticsBreakdown & { pageviews: number }>;
}

export interface AnalyticsBreakdown {
  label: string;
  visitors: number;
}

export function normalizeAnalyticsRange(value: unknown): AdminAnalyticsRange {
  return normalizeAdminDateRange(value);
}

export function createAdminAnalyticsService(context: CloudflareRequestContext) {
  const repository = createAdminAnalyticsRepository(context.env);
  return {
    async getAnalytics(rangeInput: unknown, now = Date.now()): Promise<AdminAnalyticsData> {
      const range = normalizeAnalyticsRange(rangeInput);
      const window = resolveAdminDateRange(range, vietnamDateKey(now));
      try {
        const [summary, dailyRows, sources, topPages, browsers, operatingSystems, devices, countries, regions, cities] = await Promise.all([
          repository.summary(window.startDate, window.endDate), repository.trafficSeries(window.startDate, window.endDate, window.interval),
          repository.sources(window.startDate, window.endDate), repository.topPages(window.startDate, window.endDate),
          repository.browsers(window.startDate, window.endDate), repository.operatingSystems(window.startDate, window.endDate),
          repository.devices(window.startDate, window.endDate), repository.countries(window.startDate, window.endDate),
          repository.regions(window.startDate, window.endDate), repository.cities(window.startDate, window.endDate),
        ]);
        const visits = number(summary?.visits);
        const pageviews = number(summary?.pageviews);
        return {
          available: true,
          browsers: mapBreakdown(browsers),
          cities: mapBreakdown(cities),
          countries: mapBreakdown(countries),
          daily: fillTrafficSeries(dailyRows, adminDateRangeBuckets(window)),
          devices: mapBreakdown(devices),
          generatedAt: new Date(now).toISOString(),
          interval: window.interval,
          metrics: {
            averageDurationSeconds: Math.round(number(summary?.average_duration_seconds)),
            bounceRate: round(number(summary?.bounce_rate), 1),
            pageviews,
            uniqueVisitors: number(summary?.unique_visitors),
            viewsPerVisit: visits ? round(pageviews / visits, 2) : 0,
            visits,
          },
          operatingSystems: mapBreakdown(operatingSystems),
          range,
          regions: mapBreakdown(regions),
          sources: sources.map((row) => ({ ...breakdown(row), visits: number(row.visits) })),
          topPages: topPages.map((row) => ({ ...breakdown(row), pageviews: number(row.pageviews) })),
        };
      } catch (error) {
        if (!/no such table:\s*analytics_pageviews/iu.test(String((error as Error)?.message || error))) throw error;
        return emptyAnalytics(range, window.interval, adminDateRangeBuckets(window), now);
      }
    },
  };
}

function fillTrafficSeries(
  rows: AnalyticsDailyRow[],
  buckets: string[],
) {
  const byDate = new Map(rows.map((row) => [row.visit_date, row]));
  return buckets.map((date) => {
    const row = byDate.get(date);
    const pageviews = number(row?.pageviews);
    const visits = number(row?.visits);
    return {
      averageDurationSeconds: Math.round(number(row?.average_duration_seconds)),
      bounceRate: round(number(row?.bounce_rate), 1),
      date,
      pageviews,
      visitors: number(row?.unique_visitors),
      visits,
      viewsPerVisit: visits ? round(pageviews / visits, 2) : 0,
    };
  });
}

function emptyAnalytics(
  range: AdminAnalyticsRange,
  interval: AdminTrafficInterval,
  buckets: string[],
  now: number,
): AdminAnalyticsData {
  return {
    available: false, browsers: [], cities: [], countries: [], devices: [], generatedAt: new Date(now).toISOString(),
    daily: fillTrafficSeries([], buckets), interval,
    metrics: { averageDurationSeconds: 0, bounceRate: 0, pageviews: 0, uniqueVisitors: 0, viewsPerVisit: 0, visits: 0 },
    operatingSystems: [], range, regions: [], sources: [], topPages: [],
  };
}

function mapBreakdown(rows: AnalyticsBreakdownRow[]): AnalyticsBreakdown[] {
  return rows.map(breakdown);
}

function breakdown(row: AnalyticsBreakdownRow): AnalyticsBreakdown {
  return { label: row.label || 'Chưa xác định', visitors: number(row.visitors) };
}

function number(value: unknown): number {
  const result = Number(value || 0);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
