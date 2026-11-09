<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { ADMIN_REFRESH_INTERVAL_MS, startVisibleInterval } from '$lib/browser/visible-interval';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { AdminCommunityData, CommunityPeriod } from '$lib/server/services/admin-community';
  import OnlineVisitorsTable from '../dashboard/OnlineVisitorsTable.svelte';
  import AdminRefreshControl from '../shared/AdminRefreshControl.svelte';
  import AdminModerationQueue from './AdminModerationQueue.svelte';

  interface Props { initialData: AdminCommunityData; }
  let { initialData }: Props = $props();
  let community = $state(untrack(() => initialData));
  let busy = $state(false);
  let refreshError = $state('');
  let moderationReady = $state(false);
  let controller: AbortController | null = null;
  let disposed = false;
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const periods: Array<{ label: string; value: CommunityPeriod }> = [
    { label: 'Tuần này', value: 'week' }, { label: 'Tháng này', value: 'month' }, { label: 'Năm nay', value: 'year' },
  ];

  $effect(() => {
    const nextInitialData = initialData;
    untrack(() => {
      controller?.abort();
      controller = null;
      community = nextInitialData;
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
      const response = await fetchWithSessionRefresh(`/api/admin/community?period=${community.period}`, { headers: { accept: 'application/json' }, signal: nextController.signal });
      if (response.status === 401 || response.status === 403) {
        leaveAdmin();
        return;
      }
      if (!response.ok) throw new Error(`community_refresh_${response.status}`);
      const next = await response.json() as AdminCommunityData;
      if (!disposed && !nextController.signal.aborted) community = next;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) refreshError = 'Không thể làm mới. Dữ liệu gần nhất vẫn được giữ lại.';
    } finally {
      if (controller === nextController) controller = null;
      if (!disposed) busy = false;
    }
  }

  onMount(() => {
    disposed = false;
    moderationReady = true;
    const stopPolling = startVisibleInterval(() => void refresh(), ADMIN_REFRESH_INTERVAL_MS);
    const sessionChanged = (event: Event) => {
      const session = (event as CustomEvent<PageSessionDTO>).detail;
      if (!session?.authenticated || session.user?.role !== 'admin') leaveAdmin();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => { disposed = true; stopPolling(); controller?.abort(); window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged); };
  });

  function leaveAdmin(): void {
    if (disposed) return;
    controller?.abort();
    community = {
      ...community,
      online: { members: 0, guests: 0, internal: 0, total: 0, visitors: [] },
      ranking: [],
    };
    refreshError = 'Phiên quản trị đã hết hạn hoặc không đủ quyền.';
  }
</script>

<main class="admin-community" aria-busy={busy}>
  <header class="admin-overview-header">
    <div><span>Cộng đồng</span><h1>Hoạt động cộng đồng</h1><p>Theo dõi người đang online và sự đều đặn trong hành trình tu tập.</p></div>
    <AdminRefreshControl busy={busy} generatedAt={community.generatedAt} onRefresh={refresh} />
  </header>
  {#if refreshError}<p class="admin-overview-notice" role="status">{refreshError}</p>{/if}
  {#if moderationReady}<AdminModerationQueue />{/if}

  <dl class="admin-community__metrics" aria-label="Người đang hoạt động trong 120 giây gần nhất">
    <div><dt>Tổng đang online</dt><dd>{numberFormat.format(community.online.total)}</dd><small>phiên hoạt động</small></div>
    <div><dt>Thành viên</dt><dd>{numberFormat.format(community.online.members)}</dd><small>đã đăng nhập</small></div>
    <div><dt>Khách</dt><dd>{numberFormat.format(community.online.guests)}</dd><small>trình duyệt ẩn danh</small></div>
    <div><dt>Nội bộ</dt><dd>{numberFormat.format(community.online.internal)}</dd><small>Admin và CTV</small></div>
  </dl>

  <OnlineVisitorsTable generatedAt={community.generatedAt} totalVisitors={community.online.total} visitors={community.online.visitors} />

  <section class="admin-community__ranking" aria-labelledby="community-ranking-title">
    <header>
      <div><span>Tu tập đều đặn</span><h2 id="community-ranking-title">Bảng xếp hạng tu tập</h2><p>Ưu tiên số ngày thực hành, sau đó là chuỗi ngày và số lần ghi nhận. Không cộng chéo các loại công phu.</p></div>
      <nav class="admin-community__periods" aria-label="Khoảng thời gian xếp hạng">{#each periods as period}<a href={`?period=${period.value}`} aria-current={community.period === period.value ? 'page' : undefined}>{period.label}</a>{/each}</nav>
    </header>
    {#if community.ranking.length}
      <div class="admin-community__ranking-table"><table>
        <caption class="visually-hidden">Xếp hạng thành viên tu tập đều đặn</caption>
        <thead><tr><th scope="col">Hạng</th><th scope="col">Thành viên</th><th scope="col">Ngày tu tập</th><th scope="col">Chuỗi ngày</th><th scope="col">Ghi nhận</th><th scope="col">Theo loại</th></tr></thead>
        <tbody>{#each community.ranking as member}
          <tr class:top-three={member.rank <= 3}>
            <td data-label="Hạng"><strong>#{member.rank}</strong></td>
            <td data-label="Thành viên"><span class="admin-community__member">{#if member.avatarUrl}<img src={member.avatarUrl} alt="" width="34" height="34" referrerpolicy="no-referrer" />{:else}<i aria-hidden="true">{member.displayName.slice(0, 1).toUpperCase()}</i>{/if}<b>{member.displayName}</b></span></td>
            <td data-label="Ngày tu tập">{numberFormat.format(member.activeDays)}</td>
            <td data-label="Chuỗi ngày">{numberFormat.format(member.streak)} ngày</td>
            <td data-label="Ghi nhận">{numberFormat.format(member.logCount)} lần</td>
            <td data-label="Theo loại"><ul>{#each member.totalsByType as total}<li>{total.type}: <strong>{numberFormat.format(total.count)}</strong></li>{/each}</ul></td>
          </tr>
        {/each}</tbody>
      </table></div>
    {:else}
      <div class="admin-community__empty"><p>Chưa có thành viên ghi nhận công phu trong khoảng thời gian này.</p></div>
    {/if}
  </section>
</main>
