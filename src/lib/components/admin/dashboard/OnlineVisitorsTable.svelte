<script lang="ts">
  import type { AdminDashboardData } from '$lib/server/services/admin-dashboard';
  interface Props { generatedAt: string; totalVisitors: number; visitors: AdminDashboardData['onlineVisitors']; }
  let { generatedAt, totalVisitors, visitors }: Props = $props();
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const relative = new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' });
  const roleLabel = (role: string) => ({ admin: 'Admin', ctv: 'CTV', user: 'Thành viên', guest: 'Khách' })[role] || 'Khách';
  const accountTypeLabel = (type: 'guest' | 'member' | 'internal') => ({ guest: 'Ẩn danh', member: 'Thành viên', internal: 'Nội bộ' })[type];
  const pathLabel = (path: string) => {
    if (path === '/') return 'Thư viện';
    if (path.startsWith('/phap-thoai')) return 'Pháp thoại';
    if (path.startsWith('/tu-tap')) return 'Tu tập';
    if (path.startsWith('/admin')) return 'Quản trị';
    if (path.startsWith('/huong-dan')) return 'Hướng dẫn';
    return path;
  };
  const lastActivity = (value: string) => {
    const seconds = Math.max(0, Math.round((Date.parse(generatedAt) - Date.parse(value)) / 1000));
    if (seconds < 60) return relative.format(-seconds, 'second');
    return relative.format(-Math.round(seconds / 60), 'minute');
  };
</script>

<section class="online-visitors" aria-labelledby="online-visitors-title">
  <header><div><span>Thời gian thực</span><h2 id="online-visitors-title">Đang truy cập</h2></div><p><i aria-hidden="true"></i>{numberFormat.format(totalVisitors)} phiên hoạt động{totalVisitors > visitors.length ? ` · hiển thị ${numberFormat.format(visitors.length)} gần nhất` : ''}</p></header>
  {#if visitors.length}
    <div class="online-visitors__table-wrap">
      <table>
        <caption class="visually-hidden">Danh sách người dùng truy cập trong 120 giây gần nhất</caption>
        <thead><tr><th scope="col">Tài khoản</th><th scope="col">Thiết bị</th><th scope="col">Đang xem</th><th scope="col">Hoạt động cuối</th></tr></thead>
        <tbody>
          {#each visitors as visitor (visitor.id)}
            <tr>
              <td data-label="Tài khoản"><strong>{visitor.accountLabel}</strong><small>{roleLabel(visitor.role)} · {accountTypeLabel(visitor.accountType)}</small></td>
              <td data-label="Thiết bị"><span>{visitor.deviceType}</span><small>{visitor.browserName} · {visitor.operatingSystem}</small></td>
              <td data-label="Đang xem"><span class="online-visitors__path" title={visitor.currentPath}>{pathLabel(visitor.currentPath)}</span></td>
              <td data-label="Hoạt động cuối"><span class="online-visitors__activity"><i aria-hidden="true"></i>{lastActivity(visitor.lastSeenAt)}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="online-visitors__empty"><span aria-hidden="true">○</span><p>Chưa có phiên truy cập trong 120 giây gần nhất.</p></div>
  {/if}
</section>
