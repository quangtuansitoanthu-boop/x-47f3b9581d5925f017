<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
  import { uiScrollBehavior } from '$lib/browser/ui-motion';
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  import { browser } from '$app/environment';
  import { Check, ChevronDown, FilePenLine, Plus, RefreshCw, Save, Trash2, UsersRound, X } from '@lucide/svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import {
    createPracticeCampaign,
    deletePracticeCampaign,
    fetchPracticeCampaignMembers,
    fetchPracticeCampaigns,
    updatePracticeCampaign,
    type PracticeCampaign,
    type PracticeCampaignInput,
    type PracticeCampaignListData,
    type PracticeCampaignMembersData,
    type PracticeCampaignMetric,
    type PracticeCampaignStatus,
  } from '$lib/browser/practice-community';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { serverStateKeys } from '$lib/browser/server-state';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

  interface Props {
    initialCampaigns: PracticeCampaignListData;
    userId: string;
  }

  let { initialCampaigns, userId }: Props = $props();
  const queryClient = useQueryClient();
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const campaignsQuery = createQuery(() => ({
    queryKey: serverStateKeys.practiceCommunity.adminCampaigns(userId),
    queryFn: ({ signal }) => fetchPracticeCampaigns(fetchWithSessionRefresh, { includeDrafts: true, signal }),
    initialData: initialCampaigns,
    enabled: browser,
  }));
  const campaigns = $derived(campaignsQuery.data?.campaigns ?? initialCampaigns.campaigns);
  let formOpen = $state(false);
  let editingId = $state<string | null>(null);
  let definitionLocked = $state(false);
  let title = $state('');
  let description = $state('');
  let metric = $state<PracticeCampaignMetric>('sessions');
  let goalValue = $state(21);
  let startsAt = $state('');
  let endsAt = $state('');
  let status = $state<PracticeCampaignStatus>('draft');
  let busyAction = $state('');
  let notice = $state('');
  let actionError = $state('');
  let expandedMembers = $state<string | null>(null);
  let membersByCampaign = $state<Record<string, PracticeCampaignMembersData>>({});
  let memberBusyId = $state<string | null>(null);

  function openCreate(): void {
    const start = new Date();
    const end = new Date(start.getTime() + 21 * 86_400_000);
    editingId = null;
    definitionLocked = false;
    title = '';
    description = '';
    metric = 'sessions';
    goalValue = 21;
    startsAt = toDateTimeLocal(start.toISOString());
    endsAt = toDateTimeLocal(end.toISOString());
    status = 'draft';
    formOpen = true;
    notice = '';
    actionError = '';
  }

  function openEdit(campaign: PracticeCampaign): void {
    editingId = campaign.id;
    definitionLocked = campaign.contributionValue > 0;
    title = campaign.title;
    description = campaign.description;
    metric = campaign.metric;
    goalValue = campaign.goalValue;
    startsAt = toDateTimeLocal(campaign.startsAt);
    endsAt = toDateTimeLocal(campaign.endsAt);
    status = campaign.status;
    formOpen = true;
    notice = '';
    actionError = '';
    requestAnimationFrame(() => document.getElementById('campaign-form-title')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : uiScrollBehavior(), block: 'start' }));
  }

  function closeForm(): void {
    formOpen = false;
    editingId = null;
  }

  async function saveCampaign(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busyAction) return;
    actionError = '';
    notice = '';
    let input: PracticeCampaignInput;
    try {
      const s = new Date(startsAt);
      const e = new Date(endsAt);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        actionError = 'Thời gian chiến dịch không hợp lệ.';
        return;
      }
      if (e <= s) {
        actionError = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
        return;
      }
      input = {
        title: title.trim(),
        description: description.trim(),
        metric,
        goalValue: Math.floor(Number(goalValue)),
        startsAt: s.toISOString(),
        endsAt: e.toISOString(),
        status,
      };
    } catch {
      actionError = 'Thời gian chiến dịch không hợp lệ.';
      return;
    }
    busyAction = 'save';
    try {
      if (editingId) await updatePracticeCampaign(editingId, input);
      else await createPracticeCampaign(input);
      await refreshCampaigns();
      notice = editingId ? 'Đã cập nhật chiến dịch.' : 'Đã tạo chiến dịch.';
      closeForm();
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể lưu chiến dịch.';
    } finally {
      busyAction = '';
    }
  }

  async function removeCampaign(campaign: PracticeCampaign): Promise<void> {
    const principal = getBrowserSessionSnapshot();
    if (busyAction || !await confirmInApp(`Xóa chiến dịch “${campaign.title}”? Thành viên và đóng góp liên quan cũng sẽ bị xóa.`)) return;
    const current = getBrowserSessionSnapshot();
    if (busyAction || current.user?.id !== principal.user?.id || current.user?.role !== principal.user?.role) return;
    busyAction = `delete:${campaign.id}`;
    actionError = '';
    notice = '';
    try {
      await deletePracticeCampaign(campaign.id);
      queryClient.setQueryData<PracticeCampaignListData>(
        serverStateKeys.practiceCommunity.adminCampaigns(userId),
        (current) => ({ campaigns: (current?.campaigns ?? campaigns).filter((item) => item.id !== campaign.id) }),
      );
      notice = 'Đã xóa chiến dịch.';
      if (expandedMembers === campaign.id) expandedMembers = null;
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể xóa chiến dịch.';
    } finally {
      busyAction = '';
    }
  }

  async function refreshCampaigns(): Promise<void> {
    const result = await campaignsQuery.refetch();
    if (result.error) throw result.error;
  }

  async function toggleMembers(campaignId: string): Promise<void> {
    if (expandedMembers === campaignId) {
      expandedMembers = null;
      return;
    }
    expandedMembers = campaignId;
    if (membersByCampaign[campaignId]) return;
    memberBusyId = campaignId;
    actionError = '';
    try {
      const members = await fetchPracticeCampaignMembers(campaignId);
      membersByCampaign = { ...membersByCampaign, [campaignId]: members };
    } catch (cause) {
      expandedMembers = null;
      actionError = cause instanceof Error ? cause.message : 'Không thể tải đóng góp thành viên.';
    } finally {
      memberBusyId = null;
    }
  }

  function statusLabel(value: PracticeCampaignStatus): string {
    if (value === 'active') return 'Đang hoạt động';
    if (value === 'closed') return 'Đã đóng';
    return 'Bản nháp';
  }

  function metricLabel(value: PracticeCampaignMetric): string {
    if (value === 'count') return 'Số biến';
    if (value === 'duration_seconds') return 'Thời lượng';
    return 'Số phiên';
  }

  function formatValue(metricName: PracticeCampaignMetric, value: number): string {
    if (metricName !== 'duration_seconds') return numberFormat.format(value);
    const minutes = Math.floor(value / 60);
    if (minutes < 60) return `${numberFormat.format(minutes)} phút`;
    return `${numberFormat.format(Math.floor(minutes / 60))} giờ ${numberFormat.format(minutes % 60)} phút`;
  }

  function formatDateTime(value: string): string {
    return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function toDateTimeLocal(value: string): string {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function leaveAdmin(): void {
    queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.adminCampaigns(userId) });
    membersByCampaign = {};
  }

  onMount(() => {
    const sessionChanged = (event: Event) => {
      const session = (event as CustomEvent<PageSessionDTO>).detail;
      if (!session.authenticated || session.user?.role !== 'admin') leaveAdmin();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
  });
  const readOnly = $derived(isNativeAdminReadOnly('admin'));
</script>

<main class="admin-practice-campaigns" aria-busy={campaignsQuery.isFetching || Boolean(busyAction)}>
  <header class="admin-practice-campaigns__header">
    <div><span>Tiến độ và cộng đồng</span><h1>Chiến dịch tu tập</h1><p>Tạo mục tiêu chung, theo dõi đóng góp hợp lệ và bảo vệ lựa chọn riêng tư của thành viên.</p></div>
    <div><button class="secondary" type="button" disabled={campaignsQuery.isFetching || Boolean(busyAction)} onclick={() => void refreshCampaigns().catch(() => actionError = 'Không thể làm mới chiến dịch.')}><RefreshCw aria-hidden="true" size={16} strokeWidth={2} /> {campaignsQuery.isFetching ? 'Đang tải…' : 'Làm mới'}</button>{#if !readOnly}<button type="button" onclick={openCreate}><Plus aria-hidden="true" size={16} strokeWidth={2} /> Tạo chiến dịch</button>{/if}</div>
  </header>

  {#if notice}<p class="admin-practice-campaigns__notice" role="status">{notice}</p>{/if}
  {#if actionError || campaignsQuery.error}<p class="admin-practice-campaigns__notice error" role="alert">{actionError || 'Không thể tải danh sách chiến dịch.'}</p>{/if}

  {#if formOpen && !readOnly}
    <section class="campaign-form" aria-labelledby="campaign-form-title">
      <header><div><span>{editingId ? 'Cập nhật' : 'Tạo mới'}</span><h2 id="campaign-form-title">{editingId ? 'Chỉnh sửa chiến dịch' : 'Chiến dịch mới'}</h2></div><button type="button" aria-label="Đóng biểu mẫu" onclick={closeForm}><X aria-hidden="true" size={20} strokeWidth={2} /></button></header>
      <form onsubmit={saveCampaign}>
        <fieldset><legend>Nội dung</legend><label class="wide">Tên chiến dịch<input bind:value={title} maxlength="160" required /></label><label class="wide">Mô tả<textarea bind:value={description} maxlength="4000" rows="3"></textarea></label></fieldset>
        <fieldset class="three"><legend>Mục tiêu</legend><label>Chỉ số<select bind:value={metric} disabled={definitionLocked}><option value="sessions">Số phiên</option><option value="count">Số biến</option><option value="duration_seconds">Thời lượng, giây</option></select></label><label>Giá trị mục tiêu<input bind:value={goalValue} type="number" min="1" step="1" required /></label><label>Trạng thái<select bind:value={status}><option value="draft">Bản nháp</option><option value="active">Đang hoạt động</option><option value="closed">Đã đóng</option></select></label></fieldset>
        <fieldset class="two"><legend>Thời gian</legend><label>Bắt đầu<input bind:value={startsAt} type="datetime-local" required disabled={definitionLocked} /></label><label>Kết thúc<input bind:value={endsAt} type="datetime-local" min={startsAt} required /></label></fieldset>
        {#if definitionLocked}<p class="campaign-definition-note">Chiến dịch đã có đóng góp nên chỉ số và thời gian bắt đầu được khóa để bảo toàn dữ liệu. Bạn vẫn có thể điều chỉnh mốc thời gian kết thúc.</p>{/if}
        <div class="campaign-form__actions"><button class="secondary" type="button" disabled={Boolean(busyAction)} onclick={closeForm}>Hủy</button><button type="submit" disabled={Boolean(busyAction)}><Save aria-hidden="true" size={16} strokeWidth={2} /> {busyAction === 'save' ? 'Đang lưu…' : 'Lưu chiến dịch'}</button></div>
      </form>
    </section>
  {/if}

  <section class="campaign-inventory" aria-labelledby="campaign-inventory-title">
    <header><div><span>Danh sách quản trị</span><h2 id="campaign-inventory-title">Tất cả chiến dịch</h2></div><strong>{numberFormat.format(campaigns.length)}</strong></header>
    {#if campaigns.length}
      <div class="campaign-inventory__list">
        {#each campaigns as campaign (campaign.id)}
          <article>
            <div class="campaign-row">
              <div class="campaign-row__main"><span class:active={campaign.status === 'active'} class:closed={campaign.status === 'closed'}>{statusLabel(campaign.status)}</span><h3>{campaign.title}</h3>{#if campaign.description}<p>{campaign.description}</p>{/if}</div>
              <dl><div><dt>Chỉ số</dt><dd>{metricLabel(campaign.metric)}</dd></div><div><dt>Tiến độ</dt><dd>{formatValue(campaign.metric, campaign.contributionValue)} / {formatValue(campaign.metric, campaign.goalValue)}</dd></div><div><dt>Thành viên</dt><dd>{numberFormat.format(campaign.memberCount)}</dd></div><div><dt>Thời gian</dt><dd>{formatDateTime(campaign.startsAt)}<br />{formatDateTime(campaign.endsAt)}</dd></div></dl>
              <div class="campaign-row__actions">{#if !readOnly}<button type="button" disabled={Boolean(busyAction)} onclick={() => openEdit(campaign)}><FilePenLine aria-hidden="true" size={15} strokeWidth={2} /> Sửa</button>{/if}{#if !readOnly}<button class="danger" type="button" disabled={Boolean(busyAction)} onclick={() => removeCampaign(campaign)}><Trash2 aria-hidden="true" size={15} strokeWidth={2} /> {busyAction === `delete:${campaign.id}` ? 'Đang xóa…' : 'Xóa'}</button>{/if}</div>
            </div>
            <button class="campaign-members-toggle" class:open={expandedMembers === campaign.id} type="button" disabled={memberBusyId === campaign.id} aria-expanded={expandedMembers === campaign.id} aria-controls={`campaign-members-${campaign.id}`} onclick={() => toggleMembers(campaign.id)}><UsersRound aria-hidden="true" size={16} strokeWidth={1.9} /> {memberBusyId === campaign.id ? 'Đang tải…' : 'Xem đóng góp thành viên'} <ChevronDown aria-hidden="true" size={16} strokeWidth={2} /></button>
            {#if expandedMembers === campaign.id}
              <div id={`campaign-members-${campaign.id}`} class="campaign-members">
                {#each membersByCampaign[campaign.id]?.members ?? [] as member (member.ownerId)}
                  <div class:left={Boolean(member.leftAt)}>
                    <span class="campaign-members__avatar" aria-hidden="true">
                      {#if member.avatarUrl}
                        <img src={member.avatarUrl} alt="" width="36" height="36" referrerpolicy="no-referrer" />
                      {:else}
                        <UsersRound size={17} strokeWidth={1.8} />
                      {/if}
                    </span>
                    <span>
                      <strong>
                        {member.displayName}
                        {#if !member.identityVisible}
                          <span class="campaign-anonymous-badge" title="Thành viên này chọn ẩn danh trên bảng xếp hạng công khai">Ẩn danh</span>
                        {/if}
                      </strong>
                      <small>{member.leftAt ? 'Đã rời chiến dịch' : `Tham gia ${formatDateTime(member.joinedAt)}`}</small>
                    </span>
                    <b>{formatValue(campaign.metric, member.contributionValue)}</b>
                  </div>
                {:else}
                  <p>Chưa có thành viên tham gia chiến dịch này.</p>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="campaign-inventory__empty"><Check aria-hidden="true" size={28} strokeWidth={1.7} /><strong>Chưa có chiến dịch</strong><p>Tạo mục tiêu đầu tiên khi cộng đồng đã sẵn sàng.</p>{#if !readOnly}<button type="button" onclick={openCreate}><Plus aria-hidden="true" size={16} strokeWidth={2} /> Tạo chiến dịch</button>{/if}</div>
    {/if}
  </section>
</main>

<style>
  .admin-practice-campaigns{--ap-space-1:4px;--ap-space-2:8px;--ap-space-3:12px;--ap-space-4:16px;--ap-space-5:24px;--ap-space-6:32px;--ap-radius:10px;--ap-radius-lg:14px;--ap-ease:cubic-bezier(.25,1,.5,1);display:grid;max-width:1240px;margin:0 auto;padding:var(--ap-space-6);gap:var(--ap-space-5);color:var(--text);font-family:var(--font-app)}
  .admin-practice-campaigns__header{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--ap-space-5)}.admin-practice-campaigns__header>div:first-child>span,.campaign-form>header span,.campaign-inventory>header span{color:var(--admin-accent-text,var(--brown));font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.admin-practice-campaigns__header h1{margin:var(--ap-space-1) 0 0;font-size:30px;line-height:1.2;text-wrap:balance}.admin-practice-campaigns__header p{max-width:68ch;margin:var(--ap-space-2) 0 0;color:var(--muted);font-size:13px;line-height:1.6;text-wrap:pretty}.admin-practice-campaigns__header>div:last-child{display:flex;flex:0 0 auto;gap:var(--ap-space-2)}
  button{display:inline-flex;min-height:44px;align-items:center;justify-content:center;gap:var(--ap-space-2);padding:0 var(--ap-space-4);border:1px solid var(--admin-primary-bg,var(--brown));border-radius:var(--ap-radius);background:var(--admin-primary-bg,var(--brown));color:var(--admin-primary-text,var(--bg));cursor:pointer;font:700 12px var(--font-app);transition:transform .12s var(--ap-ease),background .2s var(--ap-ease),border-color .2s var(--ap-ease),color .2s var(--ap-ease)}button:hover:not(:disabled){background:var(--brown2);transform:translateY(-2px)}button:active:not(:disabled){transform:translateY(2px)}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}button:disabled{cursor:wait;opacity:.62;transform:none}button.secondary{border-color:var(--border);background:var(--card);color:var(--text2)}button.secondary:hover:not(:disabled){border-color:var(--brown);background:var(--gold-light);color:var(--brown)}button.danger{border-color:var(--red);background:transparent;color:var(--red)}button.danger:hover:not(:disabled){background:color-mix(in srgb,var(--red) 10%,var(--card));color:var(--red)}
  .admin-practice-campaigns__notice{margin:0;padding:var(--ap-space-3) var(--ap-space-4);border-radius:var(--ap-radius);background:var(--gold-light);color:var(--brown);font-size:13px}.admin-practice-campaigns__notice.error{background:color-mix(in srgb,var(--red) 10%,var(--card));color:var(--red)}
  .campaign-form,.campaign-inventory{border:1px solid var(--border2);border-radius:var(--ap-radius-lg);background:var(--card)}.campaign-form>header,.campaign-inventory>header{display:flex;min-height:72px;align-items:center;justify-content:space-between;gap:var(--ap-space-4);padding:var(--ap-space-4) var(--ap-space-5);border-bottom:1px solid var(--border2)}.campaign-form>header h2,.campaign-inventory>header h2{margin:var(--ap-space-1) 0 0;font-size:20px;line-height:1.2}.campaign-form>header button{width:44px;padding:0;border:0;background:transparent;color:var(--muted)}.campaign-form>header button:hover{background:var(--bg2);color:var(--text)}.campaign-inventory>header>strong{display:grid;min-width:40px;height:40px;place-items:center;border-radius:var(--ap-radius);background:var(--gold-light);color:var(--brown);font-size:14px}
  .campaign-definition-note{margin:0;padding:var(--ap-space-2) var(--ap-space-3);border-radius:var(--ap-radius);background:var(--bg2);color:var(--muted);font-size:12px;line-height:1.5}
  form{display:grid;padding:var(--ap-space-5);gap:var(--ap-space-5)}fieldset{display:grid;margin:0;padding:0;border:0;grid-template-columns:1fr;gap:var(--ap-space-3)}fieldset.two{grid-template-columns:1fr 1fr}fieldset.three{grid-template-columns:1fr 1fr 1fr}legend{margin-bottom:var(--ap-space-2);color:var(--text);font-size:13px;font-weight:800}label{display:grid;gap:var(--ap-space-2);color:var(--text2);font-size:12px;font-weight:700}input,select,textarea{box-sizing:border-box;width:100%;min-height:44px;padding:var(--ap-space-2) var(--ap-space-3);border:1px solid var(--border);border-radius:var(--ap-radius);background:var(--bg);color:var(--text);font:16px var(--font-app)}textarea{min-height:96px;line-height:1.5;resize:vertical}.campaign-form__actions{display:flex;justify-content:flex-end;gap:var(--ap-space-2);padding-top:var(--ap-space-4);border-top:1px solid var(--border2)}
  .campaign-inventory__list{display:grid}.campaign-inventory__list>article{border-bottom:1px solid var(--border2)}.campaign-inventory__list>article:last-child{border-bottom:0}.campaign-row{display:grid;align-items:start;padding:var(--ap-space-5);grid-template-columns:minmax(240px,1.2fr) minmax(420px,1.8fr) auto;gap:var(--ap-space-5)}.campaign-row__main>span{display:inline-flex;padding:var(--ap-space-1) var(--ap-space-2);border-radius:999px;background:var(--bg3);color:var(--muted);font-size:10px;font-weight:800}.campaign-row__main>span.active{background:color-mix(in srgb,var(--green-ok) 14%,var(--bg2));color:var(--green-ok)}.campaign-row__main>span.closed{background:color-mix(in srgb,var(--red) 10%,var(--bg2));color:var(--red)}.campaign-row h3{margin:var(--ap-space-2) 0 0;font-size:17px;line-height:1.3;text-wrap:balance}.campaign-row__main p{margin:var(--ap-space-2) 0 0;color:var(--muted);font-size:12px;line-height:1.55;text-wrap:pretty}.campaign-row dl{display:grid;margin:0;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ap-space-3)}.campaign-row dl div{min-width:0}.campaign-row dt{color:var(--muted);font-size:10px;font-weight:700}.campaign-row dd{margin:var(--ap-space-1) 0 0;color:var(--text);font-size:12px;font-weight:700;line-height:1.45;font-variant-numeric:tabular-nums}.campaign-row__actions{display:flex;gap:var(--ap-space-2)}.campaign-row__actions button{min-width:72px;padding-inline:var(--ap-space-3);border-color:var(--border);background:var(--card);color:var(--text2)}
  .campaign-members-toggle{min-height:44px;margin:0 var(--ap-space-5) var(--ap-space-4);padding-inline:var(--ap-space-3);border-color:transparent;background:var(--bg2);color:var(--text2)}.campaign-members-toggle:hover:not(:disabled){border-color:var(--border);background:var(--gold-light);color:var(--brown)}.campaign-members-toggle>:global(svg:last-child){transition:transform .2s var(--ap-ease)}.campaign-members-toggle.open>:global(svg:last-child){transform:rotate(180deg)}.campaign-members{display:grid;margin:0 var(--ap-space-5) var(--ap-space-5);border:1px solid var(--border2);border-radius:var(--ap-radius);background:var(--bg)}.campaign-members>div{display:grid;min-height:64px;align-items:center;padding:var(--ap-space-2) var(--ap-space-3);border-bottom:1px solid var(--border2);grid-template-columns:36px minmax(0,1fr) auto;gap:var(--ap-space-3)}.campaign-members>div:last-child{border-bottom:0}.campaign-members>div.left{color:var(--muted)}.campaign-members__avatar{display:grid;width:36px;height:36px;overflow:hidden;place-items:center;border-radius:50%;background:var(--bg3);color:var(--muted)}.campaign-members__avatar img{width:100%;height:100%;object-fit:cover}.campaign-members>div>span:nth-child(2){display:grid;gap:var(--ap-space-1)}.campaign-members strong{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ap-space-1);font-size:12px}.campaign-anonymous-badge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:999px;background:var(--bg3);color:var(--muted);font-size:10px;font-weight:700}.campaign-members small{color:var(--muted);font-size:10px}.campaign-members>div>b{font-size:12px;font-variant-numeric:tabular-nums}.campaign-members>p{margin:0;padding:var(--ap-space-5);color:var(--muted);font-size:12px;text-align:center}
  .campaign-inventory__empty{display:grid;min-height:260px;place-items:center;align-content:center;padding:var(--ap-space-6);color:var(--muted);text-align:center}.campaign-inventory__empty strong{margin-top:var(--ap-space-3);color:var(--text);font-size:16px}.campaign-inventory__empty p{margin:var(--ap-space-1) 0 var(--ap-space-4);font-size:12px}
  @media(max-width:1080px){.campaign-row{grid-template-columns:1fr 1.5fr}.campaign-row__actions{grid-column:1/-1;justify-content:flex-end}}
  @media(max-width:760px){.admin-practice-campaigns{padding:var(--ap-space-4)}.admin-practice-campaigns__header{align-items:flex-start;flex-direction:column}.admin-practice-campaigns__header>div:last-child{width:100%}.admin-practice-campaigns__header>div:last-child button{flex:1}.campaign-row{grid-template-columns:1fr}.campaign-row__actions{grid-column:auto;justify-content:flex-start}fieldset.two,fieldset.three{grid-template-columns:1fr}}
  @media(max-width:420px){.admin-practice-campaigns{padding:var(--ap-space-3)}.admin-practice-campaigns__header h1{font-size:24px}.admin-practice-campaigns__header>div:last-child{flex-direction:column}.campaign-row,.campaign-form>form{padding:var(--ap-space-4)}.campaign-row__actions{display:grid;grid-template-columns:1fr 1fr}.campaign-members-toggle,.campaign-members{margin-inline:var(--ap-space-4)}.campaign-form__actions{display:grid;grid-template-columns:1fr 1fr}}
  @media(prefers-reduced-motion:reduce){button,.campaign-members-toggle>:global(svg:last-child){transition:none}button:hover,button:active{transform:none}}
</style>
