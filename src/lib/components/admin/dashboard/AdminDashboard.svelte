<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { ADMIN_REFRESH_INTERVAL_MS, startVisibleInterval } from '$lib/browser/visible-interval';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { AdminDashboardData } from '$lib/server/services/admin-dashboard';
  import { adminDateRangeLabel } from '$lib/domain/admin-date-range';
  import AdminRefreshControl from '../shared/AdminRefreshControl.svelte';

  interface Props { initialData: AdminDashboardData; }
  let { initialData }: Props = $props();
  let dashboard = $state(untrack(() => initialData));
  let busy = $state(false);
  let refreshError = $state('');
  let disposed = false;
  let refreshController: AbortController | null = null;
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const rangeLabel = $derived(adminDateRangeLabel(dashboard.range));

  $effect(() => {
    const nextInitialData = initialData;
    untrack(() => {
      refreshController?.abort();
      refreshController = null;
      dashboard = nextInitialData;
      busy = false;
      refreshError = '';
    });
  });

  async function refresh(): Promise<void> {
    if (busy) return;
    busy = true;
    refreshError = '';
    const controller = new AbortController();
    refreshController = controller;
    try {
      const response = await fetchWithSessionRefresh(`/api/admin/dashboard?range=${dashboard.range}`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (disposed || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        leaveAdmin();
        return;
      }
      if (!response.ok) throw new Error(`dashboard_refresh_${response.status}`);
      const nextDashboard = await response.json() as AdminDashboardData;
      if (!disposed && !controller.signal.aborted) dashboard = nextDashboard;
    } catch (cause) {
      if (disposed || controller.signal.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      refreshError = 'Không thể làm mới. Dữ liệu gần nhất vẫn được giữ lại.';
    } finally {
      if (refreshController === controller) refreshController = null;
      if (!disposed) busy = false;
    }
  }

  onMount(() => {
    disposed = false;
    const stopPolling = startVisibleInterval(() => void refresh(), ADMIN_REFRESH_INTERVAL_MS);
    const sessionChanged = (event: Event) => {
      const session = (event as CustomEvent<PageSessionDTO>).detail;
      if (!session?.authenticated || session.user?.role !== 'admin') leaveAdmin();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      disposed = true;
      stopPolling();
      refreshController?.abort();
      refreshController = null;
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });

  function leaveAdmin(): void {
    if (disposed) return;
    dashboard = redactedDashboard();
    refreshError = 'Phiên quản trị đã hết hạn hoặc cần đăng nhập với vai trò Quản trị viên.';
  }

  function redactedDashboard(): AdminDashboardData {
    return {
      content: { articles: 0, pdfs: 0, privateTalks: 0, publicTalks: 0, rituals: 0, sutras: 0, talks: 0 },
      engagement: { articleViews: 0, comments: 0 },
      generatedAt: new Date().toISOString(),
      members: { admins: 0, collaborators: 0, members: 0, users: 0 },
      onlineVisitorCount: 0,
      onlineVisitors: [],
      range: dashboard.range,
      system: { analyticsAvailable: false, mediaConfigured: false, presenceEnabled: false },
      traffic: { daily: [], interval: dashboard.traffic.interval, rangeVisitors: 0, thisMonth: 0, thisYear: 0, today: 0 },
    };
  }
</script>

<div class="admin-dashboard" aria-busy={busy}>
  <header class="admin-dashboard__intro">
    <div>
      <span>Không gian vận hành</span>
      <h1>Bảng điều khiển</h1>
      <p>Tổng quan nội dung, hoạt động người dùng và trạng thái hệ thống.</p>
    </div>
    <AdminRefreshControl busy={busy} generatedAt={dashboard.generatedAt} menuId="dashboard-date-range-menu" onRefresh={refresh} range={dashboard.range} />
  </header>

  {#if refreshError}<p class="admin-dashboard__stale" role="status">{refreshError}</p>{/if}

  <!-- 1. CHỈ SỐ NHANH -->
  <section class="admin-dashboard__overview-links" aria-label="Tóm tắt vận hành">
    <a href="/admin/community" class="admin-glance-card">
      <span class="admin-dashboard__live-label"><i class="admin-dashboard__live-dot" aria-hidden="true"></i>Đang online</span>
      <strong>{numberFormat.format(dashboard.onlineVisitorCount)}</strong>
      <small>phiên trực tuyến <b aria-hidden="true">→</b></small>
    </a>
    <a href={`/admin/analytics?range=${dashboard.range}`} class="admin-glance-card">
      <span>Lượt truy cập</span>
      <strong>{numberFormat.format(dashboard.traffic.rangeVisitors)}</strong>
      <small>{rangeLabel.toLocaleLowerCase('vi-VN')} <b aria-hidden="true">→</b></small>
    </a>
    <a href="/admin/members" class="admin-glance-card">
      <span>Thành viên</span>
      <strong>{numberFormat.format(dashboard.members.members)}</strong>
      <small>tài khoản đăng ký <b aria-hidden="true">→</b></small>
    </a>
    <a href="/admin/settings" class="admin-glance-card">
      <span>Hệ thống</span>
      <strong>{dashboard.system.analyticsAvailable && dashboard.system.presenceEnabled ? 'Ổn định' : 'Cần kiểm tra'}</strong>
      <small>D1 &amp; R2 đã kết nối <b aria-hidden="true">→</b></small>
    </a>
  </section>

  <!-- 2. QUẢN LÝ NỘI DUNG -->
  <section class="admin-hub-section" aria-labelledby="hub-content-title">
    <div class="admin-hub-header">
      <h2 id="hub-content-title">Quản lý nội dung</h2>
      <p>Biên tập sách, bài viết kinh điển và thư viện pháp thoại.</p>
    </div>
    <div class="admin-hub-grid">
      <article class="admin-hub-card">
        <div class="admin-hub-card__icon">📚</div>
        <div class="admin-hub-card__body">
          <h3>Sách &amp; bài viết</h3>
          <p>{numberFormat.format(dashboard.content.articles)} bài viết · {numberFormat.format(dashboard.content.pdfs)} PDF</p>
          <span class="admin-hub-card__sub">{numberFormat.format(dashboard.engagement.articleViews)} lượt xem bài</span>
        </div>
        <div class="admin-hub-card__actions">
          <a class="admin-hub-btn primary" href="/admin/books?mode=create">+ Viết bài mới</a>
          <a class="admin-hub-btn outline" href="/admin/books">Danh sách →</a>
        </div>
      </article>

      <article class="admin-hub-card">
        <div class="admin-hub-card__icon">🎧</div>
        <div class="admin-hub-card__body">
          <h3>Pháp thoại</h3>
          <p>{numberFormat.format(dashboard.content.talks)} album · {numberFormat.format(dashboard.content.publicTalks)} công khai</p>
          <span class="admin-hub-card__sub">Google Drive &amp; Archive.org</span>
        </div>
        <div class="admin-hub-card__actions">
          <a class="admin-hub-btn primary" href="/admin/phap-thoai">+ Tạo album</a>
          <a class="admin-hub-btn outline" href="/admin/phap-thoai">Danh sách →</a>
        </div>
      </article>

      <article class="admin-hub-card">
        <div class="admin-hub-card__icon">📿</div>
        <div class="admin-hub-card__body">
          <h3>Tu tập &amp; Nghi thức</h3>
          <p>{numberFormat.format(dashboard.content.sutras)} bài kinh · {numberFormat.format(dashboard.content.rituals)} nghi thức</p>
          <span class="admin-hub-card__sub">Kinh Phật, Trì chú, Thời khóa</span>
        </div>
        <div class="admin-hub-card__actions">
          <a class="admin-hub-btn outline" href="/admin/tu-tap">Quản lý nội dung →</a>
        </div>
      </article>

      <article class="admin-hub-card">
        <div class="admin-hub-card__icon">🎯</div>
        <div class="admin-hub-card__body">
          <h3>Chiến dịch tu tập</h3>
          <p>Phát nguyện &amp; cộng đồng tu tập</p>
          <span class="admin-hub-card__sub">Chiến dịch cộng đồng toàn app</span>
        </div>
        <div class="admin-hub-card__actions">
          <a class="admin-hub-btn outline" href="/admin/practice">Xem chiến dịch →</a>
        </div>
      </article>
    </div>
  </section>

  <!-- 3. HỆ THỐNG & CÀI ĐẶT -->
  <section class="admin-hub-section" aria-labelledby="hub-system-title">
    <div class="admin-hub-header">
      <h2 id="hub-system-title">Vận hành &amp; Hệ thống</h2>
      <p>Thành viên, báo cáo truy cập và cấu hình dịch vụ.</p>
    </div>
    <div class="admin-hub-grid">
      <a class="admin-hub-card admin-hub-card--link" href="/admin/members">
        <div class="admin-hub-card__icon">👥</div>
        <div class="admin-hub-card__body">
          <h3>Quản lý thành viên</h3>
          <p>{numberFormat.format(dashboard.members.members)} tài khoản</p>
          <span class="admin-hub-card__sub">{dashboard.members.collaborators} CTV · {dashboard.members.admins} Quản trị viên</span>
        </div>
        <span class="admin-hub-card__arrow">→</span>
      </a>

      <a class="admin-hub-card admin-hub-card--link" href={`/admin/analytics?range=${dashboard.range}`}>
        <div class="admin-hub-card__icon">📊</div>
        <div class="admin-hub-card__body">
          <h3>Báo cáo truy cập</h3>
          <p>Thống kê chi tiết</p>
          <span class="admin-hub-card__sub">Nguồn truy cập, thiết bị, hệ điều hành</span>
        </div>
        <span class="admin-hub-card__arrow">→</span>
      </a>

      <a class="admin-hub-card admin-hub-card--link" href="/admin/settings">
        <div class="admin-hub-card__icon">⚙️</div>
        <div class="admin-hub-card__body">
          <h3>Cài đặt hệ thống</h3>
          <p>D1 Database &amp; Media R2</p>
          <span class="admin-hub-card__sub">Đồng bộ Facebook, sao lưu dữ liệu</span>
        </div>
        <span class="admin-hub-card__arrow">→</span>
      </a>

      <a class="admin-hub-card admin-hub-card--link" href="/ca-nhan">
        <div class="admin-hub-card__icon">👤</div>
        <div class="admin-hub-card__body">
          <h3>Cá nhân &amp; Đọc sách</h3>
          <p>Tùy chỉnh giao diện đọc</p>
          <span class="admin-hub-card__sub">Cỡ chữ, màu nền, phông chữ kinh sách</span>
        </div>
        <span class="admin-hub-card__arrow">→</span>
      </a>
    </div>
  </section>

  <!-- 4. FOOTER STATUS BAR -->
  <footer class="admin-dashboard-footer-status">
    <span><i class="ok" aria-hidden="true"></i> D1 Database: Đang kết nối</span>
    <span><i class:ok={dashboard.system.mediaConfigured} aria-hidden="true"></i> Media R2: {dashboard.system.mediaConfigured ? 'Đã kết nối' : 'Chưa cấu hình'}</span>
    <span><i class:ok={dashboard.system.presenceEnabled} aria-hidden="true"></i> Presence: {dashboard.system.presenceEnabled ? 'Đang hoạt động' : 'Đang tắt'}</span>
  </footer>
</div>
