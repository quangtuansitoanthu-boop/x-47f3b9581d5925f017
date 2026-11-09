<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { AdminAnalyticsData } from '$lib/server/services/admin-analytics';
  import { adminDateRangeLabel } from '$lib/domain/admin-date-range';
  import AdminRefreshControl from '../shared/AdminRefreshControl.svelte';
  import TrafficChart from '../dashboard/TrafficChart.svelte';
  import type { TrafficChartMetric } from '../dashboard/traffic-chart-types';
  import AnalyticsTabbedBreakdownCard from './AnalyticsTabbedBreakdownCard.svelte';
  import type { AnalyticsBreakdownTabView } from './analytics-breakdown';

  interface Props { initialData: AdminAnalyticsData; }
  let { initialData }: Props = $props();
  let analytics = $state(untrack(() => initialData));
  let busy = $state(false);
  let refreshError = $state('');
  let controller: AbortController | null = null;
  let disposed = false;
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const rangeLabel = $derived(adminDateRangeLabel(analytics.range));
  const durationLabel = $derived(formatDuration(analytics.metrics.averageDurationSeconds));
  const trafficMetrics = $derived<TrafficChartMetric[]>([
    { format: 'number', key: 'visitors', label: 'Khách duy nhất', value: numberFormat.format(analytics.metrics.uniqueVisitors) },
    { format: 'number', key: 'visits', label: 'Phiên truy cập', value: numberFormat.format(analytics.metrics.visits) },
    { format: 'number', key: 'pageviews', label: 'Lượt xem trang', value: numberFormat.format(analytics.metrics.pageviews) },
    { format: 'decimal', key: 'viewsPerVisit', label: 'Trang / phiên', value: analytics.metrics.viewsPerVisit.toLocaleString('vi-VN') },
    { format: 'percent', key: 'bounceRate', label: 'Tỷ lệ thoát', value: `${analytics.metrics.bounceRate.toLocaleString('vi-VN')}%` },
    { format: 'duration', key: 'averageDurationSeconds', label: 'Thời lượng', value: durationLabel },
  ]);
  const sourceTabs = $derived<AnalyticsBreakdownTabView[]>([
    {
      id: 'sources', label: 'Nguồn truy cập', iconDimension: 'source',
      emptyMessage: 'Chưa có nguồn truy cập trong khoảng thời gian này.',
      rows: analytics.sources.map((row) => ({ label: row.label, value: row.visits, note: `${numberFormat.format(row.visitors)} khách` })),
    },
  ]);
  const pageTabs = $derived<AnalyticsBreakdownTabView[]>([
    {
      id: 'top-pages', label: 'Trang được xem nhiều', iconDimension: 'page',
      emptyMessage: 'Chưa có lượt xem trang trong khoảng thời gian này.',
      rows: analytics.topPages.map((row) => ({ label: row.label, value: row.pageviews, note: `${numberFormat.format(row.visitors)} khách` })),
    },
  ]);
  const environmentTabs = $derived<AnalyticsBreakdownTabView[]>([
    {
      id: 'browsers', label: 'Trình duyệt', iconDimension: 'browser',
      emptyMessage: 'Chưa có dữ liệu trình duyệt.',
      rows: analytics.browsers.map((row) => ({ label: row.label, value: row.visitors })),
    },
    {
      id: 'operating-systems', label: 'Hệ điều hành', iconDimension: 'operating-system',
      emptyMessage: 'Chưa có dữ liệu hệ điều hành.',
      rows: analytics.operatingSystems.map((row) => ({ label: row.label, value: row.visitors })),
    },
    {
      id: 'devices', label: 'Thiết bị', iconDimension: 'device',
      emptyMessage: 'Chưa có dữ liệu thiết bị.',
      rows: analytics.devices.map((row) => ({ label: row.label, value: row.visitors })),
    },
  ]);
  const locationTabs = $derived<AnalyticsBreakdownTabView[]>([
    {
      id: 'countries', label: 'Quốc gia', iconDimension: 'country',
      emptyMessage: 'Cloudflare chưa cung cấp dữ liệu quốc gia cho các lượt truy cập này.',
      rows: analytics.countries.filter((row) => row.label !== 'Chưa xác định').map((row) => ({ label: row.label, value: row.visitors })),
    },
    {
      id: 'regions', label: 'Vùng / tỉnh', iconDimension: 'region',
      emptyMessage: 'Chưa có dữ liệu vùng hoặc tỉnh.',
      rows: analytics.regions.filter((row) => row.label !== 'Chưa xác định').map((row) => ({ label: row.label, value: row.visitors })),
    },
    {
      id: 'cities', label: 'Thành phố', iconDimension: 'city',
      emptyMessage: 'Chưa có dữ liệu thành phố.',
      rows: analytics.cities.filter((row) => row.label !== 'Chưa xác định').map((row) => ({ label: row.label, value: row.visitors })),
    },
  ]);

  $effect(() => {
    const nextInitialData = initialData;
    untrack(() => {
      controller?.abort();
      controller = null;
      analytics = nextInitialData;
      busy = false;
      refreshError = '';
    });
  });

  async function refresh(): Promise<void> {
    if (busy) return;
    busy = true;
    refreshError = '';
    const nextController = new AbortController();
    controller = nextController;
    try {
      const response = await fetchWithSessionRefresh(`/api/admin/analytics?range=${analytics.range}`, { headers: { accept: 'application/json' }, signal: nextController.signal });
      if (response.status === 401 || response.status === 403) {
        leaveAdmin();
        return;
      }
      if (!response.ok) throw new Error(`analytics_refresh_${response.status}`);
      const next = await response.json() as AdminAnalyticsData;
      if (!disposed && !nextController.signal.aborted) analytics = next;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) refreshError = 'Không thể làm mới. Dữ liệu gần nhất vẫn được giữ lại.';
    } finally {
      if (controller === nextController) controller = null;
      if (!disposed) busy = false;
    }
  }

  onMount(() => {
    disposed = false;
    const sessionChanged = (event: Event) => {
      const session = (event as CustomEvent<PageSessionDTO>).detail;
      if (!session?.authenticated || session.user?.role !== 'admin') leaveAdmin();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => { disposed = true; controller?.abort(); window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged); };
  });

  function leaveAdmin(): void {
    if (disposed) return;
    controller?.abort();
    analytics = {
      ...analytics,
      available: false,
      browsers: [], cities: [], countries: [], devices: [], operatingSystems: [], regions: [], sources: [], topPages: [],
      daily: analytics.daily.map((point) => ({
        ...point,
        averageDurationSeconds: 0,
        bounceRate: 0,
        pageviews: 0,
        visitors: 0,
        visits: 0,
        viewsPerVisit: 0,
      })),
      metrics: { averageDurationSeconds: 0, bounceRate: 0, pageviews: 0, uniqueVisitors: 0, viewsPerVisit: 0, visits: 0 },
    };
    refreshError = 'Phiên quản trị đã hết hạn hoặc không đủ quyền.';
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}g`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}p ${seconds % 60}g`;
  }
</script>

<main class="admin-analytics" aria-busy={busy}>
  <header class="admin-overview-header">
    <div><span>Analytics</span><h1>Phân tích truy cập</h1><p>Toàn cảnh người ghé thăm, nguồn nội dung và môi trường truy cập trên cùng một trang.</p></div>
    <AdminRefreshControl busy={busy} generatedAt={analytics.generatedAt} menuId="analytics-date-range-menu" onRefresh={refresh} range={analytics.range} />
  </header>
  {#if refreshError}<p class="admin-overview-notice" role="status">{refreshError}</p>{/if}
  {#if !analytics.available}<p class="admin-overview-notice" role="status">Analytics nâng cao sẽ bắt đầu ghi nhận sau khi cập nhật cơ sở dữ liệu. Không có số liệu giả được hiển thị.</p>{/if}

  <section id="analytics-overview" class="admin-analytics__section" aria-label="Tổng quan truy cập">
    <TrafficChart daily={analytics.daily} interval={analytics.interval} metrics={trafficMetrics} panelId="analytics-traffic-chart-panel" periodLabel={rangeLabel} />
  </section>

  <section id="analytics-content" class="admin-analytics__section" aria-label="Nguồn truy cập và trang được xem nhiều">
    <div class="admin-analytics__grid admin-analytics__grid--content">
      <AnalyticsTabbedBreakdownCard cardId="analytics-sources" label="Nguồn truy cập" tabs={sourceTabs} />
      <AnalyticsTabbedBreakdownCard cardId="analytics-pages" label="Trang được xem nhiều" tabs={pageTabs} />
    </div>
  </section>

  <section id="analytics-environment" class="admin-analytics__section" aria-label="Thiết bị và khu vực">
    <div class="admin-analytics__grid admin-analytics__grid--environment">
      <AnalyticsTabbedBreakdownCard cardId="analytics-technology" label="Trình duyệt, hệ điều hành và thiết bị" tabs={environmentTabs} />
      <AnalyticsTabbedBreakdownCard cardId="analytics-location" label="Quốc gia, vùng tỉnh và thành phố" tabs={locationTabs} />
    </div>
  </section>
</main>
