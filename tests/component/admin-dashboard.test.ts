import { readFileSync } from 'node:fs';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import AdminPage from '../../src/routes/admin/+page.svelte';
import { load as adminLoad } from '../../src/routes/admin/+page.ts';
import AdminDashboard from '../../src/lib/components/admin/dashboard/AdminDashboard.svelte';
import TrafficChart from '../../src/lib/components/admin/dashboard/TrafficChart.svelte';
import AnalyticsBreakdownCard from '../../src/lib/components/admin/analytics/AnalyticsBreakdownCard.svelte';
import AnalyticsRowIcon from '../../src/lib/components/admin/analytics/AnalyticsRowIcon.svelte';
import AnalyticsTabbedBreakdownCard from '../../src/lib/components/admin/analytics/AnalyticsTabbedBreakdownCard.svelte';
import AdminRefreshControl from '../../src/lib/components/admin/shared/AdminRefreshControl.svelte';
import AdminMemberManager from '../../src/lib/components/admin/members/AdminMemberManager.svelte';
import OnlineVisitorsTable from '../../src/lib/components/admin/dashboard/OnlineVisitorsTable.svelte';
import AdminShell from '../../src/lib/components/admin/layout/AdminShell.svelte';
import AdminSidebar from '../../src/lib/components/admin/layout/AdminSidebar.svelte';
import type { AdminDashboardData } from '../../src/lib/server/services/admin-dashboard';
import QueryTestHarness from './query-test-harness.svelte';

const themeStore = vi.hoisted(() => ({
  apply: vi.fn(),
  toggle: vi.fn(),
  value: 'dark' as const,
}));

describe('campaign management navigation', () => {
  it.each([false, true])('shows the selected campaign link in the admin sidebar (mobile: %s)', (mobileOpen) => {
    const { body } = render(AdminSidebar, { props: { currentPath: '/admin/practice', role: 'admin', mobileOpen } });
    expect(body).toMatch(/href="\/admin\/practice" aria-current="page"/);
    expect(body).toContain('Chiến dịch tu tập');
  });

  it('removes the campaign management shortcut from the account modal', () => {
    const account = readFileSync('src/lib/components/auth/SessionStatus.svelte', 'utf8');
    expect(account).not.toContain('href="/admin/practice"');
    expect(readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8')).toContain('/admin');
  });
});

vi.mock('$lib/stores/theme.svelte', () => ({
  getThemeContext: () => themeStore,
}));

const sampleDashboard: AdminDashboardData = {
  content: {
    articles: 3,
    pdfs: 1,
    privateTalks: 1,
    publicTalks: 1,
    rituals: 1,
    sutras: 1,
    talks: 2,
  },
  engagement: {
    articleViews: 37,
    comments: 1,
  },
  generatedAt: '2026-08-06T12:00:00.000Z',
  members: {
    admins: 1,
    collaborators: 1,
    members: 3,
    users: 1,
  },
  onlineVisitorCount: 2,
  onlineVisitors: [
    {
      accountType: 'guest',
      accountLabel: 'Nhiều khách cùng mạng',
      browserName: 'Nhiều trình duyệt',
      currentPath: '/phap-thoai',
      deviceType: 'Nhiều thiết bị',
      firstSeenAt: '2026-08-06T11:59:00.000Z',
      id: 'visitor-1',
      isAuthenticated: false,
      isOverflow: true,
      lastSeenAt: '2026-08-06T11:59:59.000Z',
      operatingSystem: 'Nhiều hệ điều hành',
      role: 'guest',
    },
    {
      accountType: 'internal',
      accountLabel: 'Quản trị viên',
      browserName: 'Google Chrome',
      currentPath: '/admin/books?tab=traffic',
      deviceType: 'Máy tính',
      firstSeenAt: '2026-08-06T11:58:30.000Z',
      id: 'visitor-2',
      isAuthenticated: true,
      isOverflow: false,
      lastSeenAt: '2026-08-06T11:59:58.000Z',
      operatingSystem: 'Windows',
      role: 'admin',
    },
  ],
  range: '28d',
  system: {
    analyticsAvailable: true,
    mediaConfigured: true,
    presenceEnabled: true,
  },
  traffic: {
    daily: [
      { date: '2026-07-24', visitors: 0 },
      { date: '2026-07-25', visitors: 0 },
      { date: '2026-07-26', visitors: 0 },
      { date: '2026-07-27', visitors: 0 },
      { date: '2026-07-28', visitors: 0 },
      { date: '2026-07-29', visitors: 0 },
      { date: '2026-07-30', visitors: 0 },
      { date: '2026-07-31', visitors: 1 },
      { date: '2026-08-01', visitors: 0 },
      { date: '2026-08-02', visitors: 0 },
      { date: '2026-08-03', visitors: 0 },
      { date: '2026-08-04', visitors: 0 },
      { date: '2026-08-05', visitors: 1 },
      { date: '2026-08-06', visitors: 2 },
    ],
    interval: 'day',
    rangeVisitors: 2,
    thisMonth: 3,
    thisYear: 5,
    today: 2,
  },
};

describe('admin dashboard surfaces', () => {
  it('redirects non-admins at the page load boundary and fetches the dashboard for admins', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(sampleDashboard), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const result = await adminLoad({
      fetch,
      parent: async () => ({ session: { user: { role: 'admin' } } }),
      url: new URL('https://quangtu.vn/admin'),
    } as never);

    expect(fetch).toHaveBeenCalledWith('/api/admin/dashboard?range=28d', {
      headers: { accept: 'application/json' }, credentials: 'include',
    });
    expect(result).toEqual({ dashboard: sampleDashboard });
  });

  it('renders the dashboard page chrome and metadata from the SSR contract', () => {
    const { body, head } = render(AdminPage, {
      props: {
        data: {
          dashboard: sampleDashboard,
        },
      },
    });

    expect(head).toContain('<title>Bảng điều khiển — Quản trị Quang Từ</title>');
    expect(head).toContain('name="robots" content="noindex,nofollow"');
    expect(body).toContain('Tổng quan nội dung, hoạt động người dùng và trạng thái hệ thống.');
    expect(body).toContain('Quản lý nội dung');
    expect(body).toContain('Tu tập &amp; Nghi thức');
    expect(body).toContain('href="/admin/phap-thoai"');
    expect(body).toContain('href="/admin/tu-tap"');
    // DTO cũ có thể còn các field online; dashboard đã ngừng hiển thị presence.
    expect(body).not.toContain('Đang hoạt động');
    expect(body).not.toContain('admin-dashboard__live-dot');
    expect(body).toContain('28 ngày gần nhất');
    expect(body).toContain('/admin/analytics?range=28d');
    expect(body).toContain('/admin/analytics');
    expect(body).not.toContain('Presence:');
    expect(body).toContain('D1 Database: Đang kết nối');
    expect(body).toMatch(/Media R2:\s*(?:<!--.*?-->\s*)*Đã kết nối/u);
    expect(body).not.toContain('1 tài khoản đăng nhập và 1 khách trong danh sách gần nhất.');
    expect(body).toContain('Vận hành &amp; Hệ thống');
  });

  it('keeps the admin shell and drawer semantics intact across desktop and mobile chrome', () => {
    const children = createRawSnippet(() => ({
      render: () => '<section id="admin-slot">Nội dung quản trị</section>',
    }));

    const shell = render(QueryTestHarness, {
      props: {
        Target: AdminShell,
        targetProps: {
          children,
          currentPath: '/admin/books',
          session: {
            authenticated: true,
            user: { displayName: 'Quản trị viên', role: 'admin' },
          },
        },
      },
    }).body;

    expect(shell).toContain('aria-controls="admin-sidebar"');
    expect(shell).toContain('aria-label="Mở menu quản trị"');
    expect(shell).toContain('id="admin-content"');
    expect(shell).toContain('Quản lý sách');
    expect(shell).not.toContain('Quản lý pháp thoại');
    expect(shell).not.toContain('Quản lý tu tập');
    expect(shell).toContain('Về trang chính');
    expect(shell).not.toContain('admin-shell__scrim');
    expect(shell).toContain('Phân tích truy cập');
    expect(shell).toContain('Hoạt động cộng đồng');
    expect(shell).toContain('Bảng điều khiển');

    const adminSidebar = render(AdminSidebar, {
      props: {
        currentPath: '/admin',
        mobileOpen: true,
        onClose: vi.fn(),
        role: 'admin',
      },
    }).body;

    expect(adminSidebar).toContain('admin-sidebar--open');
    expect(adminSidebar).toContain('Bảng điều khiển');
    expect(adminSidebar).toContain('Thành viên');
    expect(adminSidebar).toContain('Cài đặt');
    expect(adminSidebar).toContain('href="/admin/phap-thoai"');
    expect(adminSidebar).toContain('href="/admin/tu-tap"');
    expect(adminSidebar).toContain('Pháp thoại');
    expect(adminSidebar).toContain('Tu tập');
    expect(adminSidebar).toContain('aria-current="page"');

    const adminShellSource = readFileSync('src/lib/components/admin/layout/AdminShell.svelte', 'utf8');
    const adminAnalyticsSource = readFileSync('src/lib/components/admin/analytics/AdminAnalytics.svelte', 'utf8');
    const adminAnalyticsStyles = readFileSync('src/lib/styles/admin-analytics.css', 'utf8');
    const adminAnalyticsBreakdownStyles = readFileSync('src/lib/styles/admin-analytics-breakdowns.css', 'utf8');
    const adminCommunitySource = readFileSync('src/lib/components/admin/community/AdminCommunity.svelte', 'utf8');
    const adminSidebarSource = readFileSync('src/lib/components/admin/layout/AdminSidebar.svelte', 'utf8');
    expect(adminShellSource).toContain("if (currentPath.startsWith('/admin/phap-thoai')) return 'Quản lý pháp thoại';");
    expect(adminShellSource).toContain("if (currentPath.startsWith('/admin/tu-tap')) return 'Quản lý tu tập';");
    expect(adminShellSource).toContain("if (currentPath.startsWith('/admin/analytics')) return 'Phân tích truy cập';");
    expect(adminShellSource).toContain("if (currentPath.startsWith('/admin/community')) return 'Hoạt động cộng đồng';");
    expect(adminSidebarSource).toContain("href: '/admin/analytics'");
    expect(adminSidebarSource).toContain("href: '/admin/community'");
    expect(adminSidebarSource).toContain("label: 'Bảng điều khiển'");
    expect(adminSidebarSource).toContain("label: 'Phân tích truy cập'");
    expect(adminSidebarSource).toContain("label: 'Hoạt động cộng đồng'");
    expect(adminAnalyticsSource).toContain('SESSION_CHANGE_EVENT');
    expect(adminAnalyticsSource).toContain('controller?.abort()');
    expect(adminAnalyticsSource).toContain('leaveAdmin()');
    expect(adminAnalyticsSource).toContain('AnalyticsTabbedBreakdownCard');
    expect(adminAnalyticsSource).toContain('AdminRefreshControl');
    expect(adminAnalyticsSource).toContain('metrics={trafficMetrics}');
    expect(adminAnalyticsSource).not.toContain('class="admin-analytics__metrics"');
    expect(adminAnalyticsSource).toContain('cardId="analytics-sources"');
    expect(adminAnalyticsSource).toContain('cardId="analytics-pages"');
    expect(adminAnalyticsSource).toContain('cardId="analytics-technology"');
    expect(adminAnalyticsSource).toContain('cardId="analytics-location"');
    expect(adminAnalyticsSource).not.toContain('<header><span>Khám phá</span>');
    expect(adminAnalyticsSource).not.toContain('analytics-content-title');
    expect(adminAnalyticsSource).not.toContain('admin-analytics__anchors');
    expect(adminAnalyticsSource).not.toContain('aria-label="Các phần phân tích"');
    expect(adminAnalyticsSource).not.toContain('<header><span>Môi trường</span>');
    expect(adminAnalyticsSource).not.toContain('analytics-environment-title');
    expect(adminAnalyticsStyles).toContain('height: 440px;');
    expect(adminAnalyticsStyles).toContain('overflow-y: auto;');
    expect(adminAnalyticsStyles).toContain('scrollbar-gutter: stable;');
    expect(adminAnalyticsBreakdownStyles).toContain('overflow-y: hidden;');
    expect(adminAnalyticsBreakdownStyles).toContain('scrollbar-width: none;');
    expect(adminAnalyticsBreakdownStyles).toContain('.analytics-breakdown__tabs::-webkit-scrollbar');
    expect(adminAnalyticsBreakdownStyles).toContain('display: none;');
    expect(adminCommunitySource).toContain('SESSION_CHANGE_EVENT');
    expect(adminCommunitySource).toContain('stopPolling()');
    expect(adminCommunitySource).toContain('controller?.abort()');
    expect(adminCommunitySource).toContain('leaveAdmin()');
    expect(adminCommunitySource).toContain('AdminRefreshControl');
    expect(adminCommunitySource).toContain('class="admin-community__periods"');
    expect(adminCommunitySource).not.toContain('OnlineVisitorsTable');
    expect(adminCommunitySource).not.toContain('community.online.');

    const ctvSidebar = render(AdminSidebar, {
      props: {
        currentPath: '/admin/books',
        mobileOpen: true,
        onClose: vi.fn(),
        role: 'ctv',
      },
    }).body;

    expect(ctvSidebar).not.toContain('/admin/practice');
    expect(ctvSidebar).not.toContain('Bảng điều khiển');
    expect(ctvSidebar).not.toContain('Thành viên');
    expect(ctvSidebar).not.toContain('Cài đặt');
    expect(ctvSidebar).toContain('Sách');
    expect(ctvSidebar).toContain('Pháp thoại');
    expect(ctvSidebar).toContain('Tu tập');

    const layoutCss = readFileSync('src/lib/styles/admin-layout.css', 'utf8');
    const dashboardCss = readFileSync('src/lib/styles/admin-dashboard.css', 'utf8');
    const dashboardSource = readFileSync('src/lib/components/admin/dashboard/AdminDashboard.svelte', 'utf8');
    const shellSource = readFileSync('src/lib/components/admin/layout/AdminShell.svelte', 'utf8');
    expect(layoutCss).toContain('@media (max-width: 900px)');
    expect(layoutCss).toContain('@media (max-width: 520px)');
    expect(layoutCss).toContain('@media (max-width: 768px)');
    expect(layoutCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(dashboardCss).toContain('@media (max-width: 700px)');
    expect(dashboardCss).toContain('@media (max-width: 420px)');
    expect(dashboardCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(layoutCss).toContain('z-index: 10020');
    expect(layoutCss).toContain('z-index: 10010');
    expect(shellSource).toContain("!sidebar?.contains(document.activeElement)");
    expect(dashboardSource).toContain('new AbortController()');
    expect(dashboardSource).toContain('SESSION_CHANGE_EVENT');
    expect(dashboardSource).toContain('refreshController?.abort()');
    expect(dashboardSource).toContain('AdminRefreshControl');
  });

  it('uses one refresh control contract with optional date-range filtering', () => {
    const withRange = render(AdminRefreshControl, {
      props: {
        busy: false,
        generatedAt: '2026-08-07T08:25:00.000Z',
        menuId: 'refresh-control-range',
        onRefresh: vi.fn(),
        range: 'year',
      },
    }).body;
    const withoutRange = render(AdminRefreshControl, {
      props: {
        busy: true,
        generatedAt: '2026-08-07T08:25:00.000Z',
        onRefresh: vi.fn(),
      },
    }).body;

    expect(withRange).toContain('Cập nhật');
    expect(withRange).toContain('Chọn khoảng thời gian. Hiện tại: Năm nay');
    expect(withRange).toContain('Làm mới');
    expect(withoutRange).toContain('Đang làm mới');
    expect(withoutRange).toContain('disabled');
    expect(withoutRange).not.toContain('Chọn khoảng thời gian');
  });

  it('renders the dashboard body with the expected summary and live-visitor sections', () => {
    const { body } = render(AdminDashboard, {props:{initialData:sampleDashboard}});
    for(const label of ['Bảng điều khiển','Quản lý nội dung','Vận hành &amp; Hệ thống','/admin/analytics?range=28d']) expect(body).toContain(label);
    expect(body).toContain('aria-labelledby=');
    expect(body).not.toContain('1 tài khoản đăng nhập và 1 khách trong danh sách gần nhất.');
  });

  it('renders the annual range as twelve monthly points with month-aware labels and details', () => {
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 7 + index, 1)).toISOString().slice(0, 10);
      return { date, pageviews: index * 3, visitors: index + 1 };
    });
    const { body } = render(TrafficChart, {
      props: { daily: monthly, interval: 'month', periodLabel: '12 tháng gần nhất' },
    });

    expect(body).toContain('theo tháng trong 12 tháng gần nhất');
    expect(body).toContain('Tháng 8, 2025');
    expect(body).toContain('Tháng 6, 2026');
    expect(body).toContain('Xem dữ liệu theo tháng');
    expect(body).toContain('<th scope="col">Tháng</th>');
    expect(body).not.toContain('Xem dữ liệu từng ngày');
  });

  it('integrates analytics metrics into the traffic chart as accessible tabs', () => {
    const body = render(TrafficChart, {
      props: {
        daily: [
          { averageDurationSeconds: 90, bounceRate: 50, date: '2026-08-05', pageviews: 4, visitors: 2, visits: 3, viewsPerVisit: 1.33 },
          { averageDurationSeconds: 120, bounceRate: 25, date: '2026-08-06', pageviews: 8, visitors: 4, visits: 5, viewsPerVisit: 1.6 },
        ],
        metrics: [
          { format: 'number', key: 'visitors', label: 'Khách duy nhất', value: '6' },
          { format: 'number', key: 'visits', label: 'Phiên truy cập', value: '8' },
          { format: 'percent', key: 'bounceRate', label: 'Tỷ lệ thoát', value: '37,5%' },
        ],
        panelId: 'analytics-chart-test',
        periodLabel: '7 ngày gần nhất',
      },
    }).body;

    expect(body).toContain('role="tablist"');
    expect(body).toContain('aria-label="Chỉ số biểu đồ"');
    expect(body).toContain('aria-selected="true"');
    expect(body).toContain('data-active-metric="visitors"');
    expect(body).toContain('id="analytics-chart-test"');
    expect(body).toContain('<th scope="col">Khách duy nhất</th>');
    expect(body).toContain('traffic-chart__hit-surface');
    expect(body).toContain('role="button"');
    expect(body).toContain('aria-label="05-08: Khách duy nhất 2"');
  });

  it('paginates the filtered member inventory in groups of ten', () => {
    const members = Array.from({ length: 12 }, (_, index) => ({
      avatarUrl: null,
      accountType: 'member' as const,
      createdAt: '2026-08-01T00:00:00.000Z',
      email: `member-${index + 1}@example.com`,
      id: `member-${index + 1}`,
      isSelf: false,
      kind: 'member' as const,
      name: `Thành viên ${index + 1}`,
      role: 'user' as const,
      updatedAt: '2026-08-01T00:00:00.000Z',
      username: null,
    }));
    const body = render(AdminMemberManager, { props: { initialMembers: members } }).body;

    expect(body).toContain('aria-label="Phân trang thành viên"');
    expect(body).toContain('Hiển thị <strong>1–10</strong> trong 12 thành viên');
    expect(body).toContain('member-10@example.com');
    expect(body).not.toContain('member-11@example.com');
    expect(body).toContain('aria-label="Trang 2"');
    expect(body).toContain('<option value="member">Thành viên</option>');
    expect(body).not.toContain('Google');
    expect(body).toContain('<option value="admin">Quản trị viên</option>');
    const dialogSource = readFileSync('src/lib/components/admin/members/AdminMemberDialog.svelte', 'utf8');
    expect(dialogSource).toContain('readonly');
    expect(dialogSource).not.toContain('bind:value={email}');
    expect(dialogSource).not.toContain('Google');
  });

  it('labels member, guest and internal presence without inferring an OAuth provider', () => {
    const body = render(OnlineVisitorsTable, {
      props: {
        generatedAt: '2026-09-04T10:00:00.000Z',
        totalVisitors: 3,
        visitors: [
          { accountType: 'member', accountLabel: 'Thành viên Facebook', browserName: 'Firefox', currentPath: '/tu-tap', deviceType: 'Điện thoại', firstSeenAt: '2026-09-04T09:58:00.000Z', id: 'member', isAuthenticated: true, isOverflow: false, lastSeenAt: '2026-09-04T09:59:50.000Z', operatingSystem: 'Android', role: 'user' },
          { accountType: 'guest', accountLabel: 'Khách', browserName: 'Safari', currentPath: '/', deviceType: 'Điện thoại', firstSeenAt: '2026-09-04T09:58:00.000Z', id: 'guest', isAuthenticated: false, isOverflow: false, lastSeenAt: '2026-09-04T09:59:40.000Z', operatingSystem: 'iOS / iPadOS', role: 'guest' },
          { accountType: 'internal', accountLabel: 'Quản trị viên', browserName: 'Firefox', currentPath: '/admin', deviceType: 'Máy tính', firstSeenAt: '2026-09-04T09:58:00.000Z', id: 'internal', isAuthenticated: true, isOverflow: false, lastSeenAt: '2026-09-04T09:59:30.000Z', operatingSystem: 'Windows', role: 'admin' },
        ],
      },
    }).body;

    expect(body).toContain('Thành viên Facebook');
    expect(body).toContain('Thành viên · Thành viên');
    expect(body).toContain('Khách · Ẩn danh');
    expect(body).toContain('Admin · Nội bộ');
    expect(body).not.toContain('Google');
  });

  it('renders contextual analytics icons and accessible grouped tabs', () => {
    const sourceCard = render(AnalyticsBreakdownCard, {
      props: {
        emptyMessage: 'Không có nguồn.',
        iconDimension: 'source',
        rows: [
          { label: 'Google', note: '2 khách', value: 4 },
          { label: 'Trực tiếp', value: 2 },
        ],
        title: 'Nguồn truy cập',
      },
    }).body;

    expect(sourceCard).toContain('analytics-row-icon--google');
    expect(sourceCard).toContain('analytics-row-icon--link');
    expect(sourceCard).toContain('Google');
    expect(sourceCard).toContain('analytics-breakdown__note');
    expect(sourceCard).toContain('2 khách');

    const tabbedCard = render(AnalyticsTabbedBreakdownCard, {
      props: {
        cardId: 'analytics-technology-test',
        label: 'Trình duyệt, hệ điều hành và thiết bị',
        tabs: [
          {
            id: 'browsers', label: 'Trình duyệt', iconDimension: 'browser', emptyMessage: 'Không có trình duyệt.',
            rows: [{ label: 'Google Chrome', value: 3 }],
          },
          {
            id: 'operating-systems', label: 'Hệ điều hành', iconDimension: 'operating-system', emptyMessage: 'Không có hệ điều hành.',
            rows: [{ label: 'Windows', value: 2 }],
          },
          {
            id: 'devices', label: 'Thiết bị', iconDimension: 'device', emptyMessage: 'Không có thiết bị.',
            rows: [{ label: 'Máy tính', value: 2 }],
          },
        ],
      },
    }).body;

    expect(tabbedCard).toContain('role="tablist"');
    expect(tabbedCard).toContain('aria-label="Trình duyệt, hệ điều hành và thiết bị"');
    expect(tabbedCard).toContain('aria-selected="true"');
    expect(tabbedCard).toContain('role="tabpanel"');
    expect(tabbedCard).toContain('analytics-row-icon--chrome');
    expect(tabbedCard).toContain('Google Chrome');
    expect(tabbedCard).not.toContain('analytics-row-icon--windows');

    const environmentIcons = [
      render(AnalyticsRowIcon, { props: { dimension: 'operating-system', label: 'Windows' } }).body,
      render(AnalyticsRowIcon, { props: { dimension: 'device', label: 'Điện thoại' } }).body,
      render(AnalyticsRowIcon, { props: { dimension: 'country', label: 'VN' } }).body,
    ].join('');
    expect(environmentIcons).toContain('analytics-row-icon--windows');
    expect(environmentIcons).toContain('analytics-row-icon--mobile');
    expect(environmentIcons).toContain('analytics-row-icon__flag');
    expect(environmentIcons).toContain('🇻🇳');
  });
});
