<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    system: { analyticsAvailable: boolean; mediaConfigured: boolean; presenceEnabled: boolean };
    children?: Snippet;
  }
  let { system, children }: Props = $props();
  const rows = $derived([
    {
      label: 'Analytics quản trị',
      detail: 'Lưu lượng truy cập và phiên đang hoạt động.',
      enabled: system.analyticsAvailable,
      ready: 'Sẵn sàng',
      unavailable: 'Chưa sẵn sàng',
    },
    {
      label: 'Theo dõi hiện diện',
      detail: 'Ghi nhận khách đang trực tuyến theo cửa sổ thời gian ngắn.',
      enabled: system.presenceEnabled,
      ready: 'Đang hoạt động',
      unavailable: 'Đang tắt',
    },
    {
      label: 'Kho media',
      detail: 'Lưu ảnh, PDF và tệp âm thanh do quản trị viên tải lên.',
      enabled: system.mediaConfigured,
      ready: 'Đã kết nối',
      unavailable: 'Chưa cấu hình',
    },
  ]);
</script>

<section class="admin-content-manager admin-settings" aria-labelledby="admin-settings-title">
  <header class="admin-content-header">
    <div><span>Vận hành hệ thống</span><h1 id="admin-settings-title">Cài đặt</h1><p>Theo dõi trạng thái dịch vụ và quản lý nguồn bài viết Facebook.</p></div>
  </header>
  <section class="admin-inventory" aria-labelledby="system-status-title">
    <header><div><span>Kiểm tra kết nối</span><h2 id="system-status-title">Trạng thái dịch vụ</h2></div><strong>{rows.filter((row) => row.enabled).length}/{rows.length}</strong></header>
    <div class="admin-inventory-table-wrap">
      <table class="admin-settings-table">
        <caption>Trạng thái các dịch vụ vận hành</caption>
        <thead><tr><th>Dịch vụ</th><th>Mô tả</th><th>Trạng thái</th><th>Nơi thay đổi</th></tr></thead>
        <tbody>
          {#each rows as row}
            <tr>
              <td data-label="Dịch vụ"><strong>{row.label}</strong></td>
              <td data-label="Mô tả">{row.detail}</td>
              <td data-label="Trạng thái"><span class:private={!row.enabled} class="admin-status-badge"><i class:ok={row.enabled} aria-hidden="true"></i>{row.enabled ? row.ready : row.unavailable}</span></td>
              <td data-label="Nơi thay đổi">Quy trình triển khai</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
  <p class="admin-settings-note">Trang này không hiển thị khoá, thông tin xác thực hoặc giá trị cấu hình nhạy cảm.</p>
  {@render children?.()}
</section>
