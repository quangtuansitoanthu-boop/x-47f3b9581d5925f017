<script lang="ts">
  import { RefreshCw } from '@lucide/svelte';
  import type { AdminDateRange } from '$lib/domain/admin-date-range';
  import AdminDateRangeFilter from './AdminDateRangeFilter.svelte';

  interface Props {
    busy: boolean;
    generatedAt: string;
    menuId?: string;
    onRefresh: () => void | Promise<void>;
    range?: AdminDateRange;
  }

  let { busy, generatedAt, menuId = 'admin-date-range-menu', onRefresh, range }: Props = $props();
  const updatedFormat = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  });
</script>

<div class="admin-refresh-control">
  <small>Cập nhật {updatedFormat.format(new Date(generatedAt))}</small>
  <div class="admin-overview-actions">
    {#if range}
      <AdminDateRangeFilter value={range} {menuId} />
    {/if}
    <button class="admin-refresh-button" type="button" disabled={busy} onclick={() => void onRefresh()}>
      <RefreshCw class={busy ? 'spinning' : ''} aria-hidden="true" size={16} strokeWidth={2} />
      {busy ? 'Đang làm mới' : 'Làm mới'}
    </button>
  </div>
</div>
