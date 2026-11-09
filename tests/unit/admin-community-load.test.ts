import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import AdminCommunity from '../../src/lib/components/admin/community/AdminCommunity.svelte';
import AdminDashboard from '../../src/lib/components/admin/dashboard/AdminDashboard.svelte';
import AdminAnalytics from '../../src/lib/components/admin/analytics/AdminAnalytics.svelte';
import { load as communityLoad } from '../../src/routes/admin/community/+page';
import { load as dashboardLoad } from '../../src/routes/admin/+page';
import { load as analyticsLoad } from '../../src/routes/admin/analytics/+page';
import { isHttpError } from '@sveltejs/kit';
import type { AdminCommunityData } from '../../src/lib/server/services/admin-community';
import type { AdminDashboardData } from '../../src/lib/server/services/admin-dashboard';
import type { AdminAnalyticsData } from '../../src/lib/server/services/admin-analytics';

const generatedAt = '2026-10-28T10:00:00Z';
const community: AdminCommunityData = {
  generatedAt, period: 'year',
  online: { members: 1, guests: 2, internal: 3, total: 6, visitors: [] }, ranking: [],
};
const dashboard: AdminDashboardData = {
  generatedAt, range: '28d', content: { articles: 1, pdfs: 0, privateTalks: 0, publicTalks: 1, rituals: 0, sutras: 0, talks: 1 },
  engagement: { articleViews: 2, comments: 1 }, members: { admins: 1, collaborators: 0, members: 1, users: 2 },
  onlineVisitorCount: 0, onlineVisitors: [],
  system: { analyticsAvailable: true, mediaConfigured: false, presenceEnabled: true },
  traffic: { daily: [], interval: 'day', rangeVisitors: 2, thisMonth: 2, thisYear: 2, today: 1 },
};
const analytics: AdminAnalyticsData = {
  generatedAt, available: true, range: '28d', interval: 'day', browsers: [], cities: [], countries: [], daily: [], devices: [],
  metrics: { averageDurationSeconds: 0, bounceRate: 0, pageviews: 2, uniqueVisitors: 1, viewsPerVisit: 2, visits: 1 },
  operatingSystems: [], regions: [], sources: [], topPages: [],
};
const surfaces = [
  { name: 'community', load: communityLoad, url: '/admin/community?period=year', api: '/api/admin/community?period=year',
    data: { community }, renderData: (result: { community: AdminCommunityData }) => render(AdminCommunity, { props: { initialData: result.community } }) },
  { name: 'dashboard', load: dashboardLoad, url: '/admin?range=28d', api: '/api/admin/dashboard?range=28d',
    data: { dashboard }, renderData: (result: { dashboard: AdminDashboardData }) => render(AdminDashboard, { props: { initialData: result.dashboard } }) },
  { name: 'analytics', load: analyticsLoad, url: '/admin/analytics?range=28d', api: '/api/admin/analytics?range=28d',
    data: { analytics }, renderData: (result: { analytics: AdminAnalyticsData }) => render(AdminAnalytics, { props: { initialData: result.analytics } }) },
];

for (const surface of surfaces) describe(`${surface.name} load error boundary`, () => {
  it.each(['network', 'http', 'html', 'json'])('rejects %s failure before rendering unavailable statistics', async (failure) => {
    const fetch = vi.fn(async () => {
      if (failure === 'network') throw new TypeError('network unavailable');
      if (failure === 'http') return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
      if (failure === 'html') return new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } });
      return new Response('{', { headers: { 'content-type': 'application/json' } });
    });
    await expect(surface.load({ fetch, url: new URL(surface.url, 'https://example.test') } as never)).rejects.toSatisfy(error => isHttpError(error, 503));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('preserves authorization status %s rather than fabricating data', async (status) => {
    const fetch = vi.fn(async () => new Response('{}', { status, headers: { 'content-type': 'application/json' } }));
    await expect(surface.load({ fetch, url: new URL(surface.url, 'https://example.test') } as never)).rejects.toSatisfy(error => isHttpError(error, status));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the live API DTO and one-request success path', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(Object.values(surface.data)[0]), { headers: { 'content-type': 'application/json' } }));
    const result = await surface.load({ fetch, url: new URL(surface.url, 'https://example.test') } as never);
    expect(result).toEqual(surface.data);
    expect(() => surface.renderData(result as never)).not.toThrow();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(surface.api, {
      headers: { accept: 'application/json' }, credentials: 'include',
    });
  });
});
