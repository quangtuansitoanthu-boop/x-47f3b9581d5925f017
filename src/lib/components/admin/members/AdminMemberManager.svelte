<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { onMount, untrack } from 'svelte';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import AdminMemberConfirmDialog from './AdminMemberConfirmDialog.svelte';
  import AdminMemberDialog from './AdminMemberDialog.svelte';
  import AdminMemberSuspendDialog from './AdminMemberSuspendDialog.svelte';
  import type { AdminAccountType, AdminMember, AdminMemberRole, AdminMemberStatus, MemberDialogSubmission } from './admin-member-types';

  interface Props { initialMembers: AdminMember[]; }
  let { initialMembers }: Props = $props();
  let members = $state(untrack(() => [...initialMembers]));
  let query = $state('');
  let accountType = $state<'all' | AdminAccountType>('all');
  let role = $state<'all' | AdminMemberRole>('all');
  let statusFilter = $state<'all' | AdminMemberStatus>('all');
  let editing = $state<AdminMember | null>(null);
  let deleting = $state<AdminMember | null>(null);
  let suspending = $state<{ member: AdminMember; targetStatus: AdminMemberStatus } | null>(null);
  let busy = $state(false);
  let formError = $state('');
  let notice = $state('');
  let page = $state(1);
  const pageSize = 10;

  const filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase('vi');
    return members.filter((member) => {
      if (accountType !== 'all' && member.accountType !== accountType) return false;
      if (role !== 'all' && member.role !== role) return false;
      if (statusFilter !== 'all' && (member.status ?? 'active') !== statusFilter) return false;
      return !needle || [member.name, member.email].some((value) => value?.toLocaleLowerCase('vi').includes(needle));
    });
  });
  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
  const pagedMembers = $derived(filtered.slice((page - 1) * pageSize, page * pageSize));
  const pageStart = $derived(filtered.length ? (page - 1) * pageSize + 1 : 0);
  const pageEnd = $derived(Math.min(page * pageSize, filtered.length));
  const paginationItems = $derived(buildPaginationItems(page, totalPages));
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  $effect(() => { if (page > totalPages) page = totalPages; });

  function resetFilters(): void { query = ''; accountType = 'all'; role = 'all'; statusFilter = 'all'; page = 1; }
  function updateQuery(event: Event): void { query = (event.currentTarget as HTMLInputElement).value; page = 1; }
  function updateAccountType(event: Event): void { accountType = (event.currentTarget as HTMLSelectElement).value as typeof accountType; page = 1; }
  function updateRole(event: Event): void { role = (event.currentTarget as HTMLSelectElement).value as typeof role; page = 1; }
  function updateStatusFilter(event: Event): void { statusFilter = (event.currentTarget as HTMLSelectElement).value as typeof statusFilter; page = 1; }
  function goToPage(nextPage: number): void { page = Math.min(Math.max(nextPage, 1), totalPages); }
  function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis-start' | 'ellipsis-end'> {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    if (current <= 4) {
      const pages: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [];
      for (let i = 1; i <= 6; i += 1) pages.push(i);
      pages.push('ellipsis-end');
      pages.push(total);
      return pages;
    }
    if (current >= total - 3) {
      const pages: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [1, 'ellipsis-start'];
      for (let i = total - 5; i <= total; i += 1) pages.push(i);
      return pages;
    }
    const pages: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [1, 'ellipsis-start'];
    for (let i = current - 2; i <= current + 2; i += 1) pages.push(i);
    pages.push('ellipsis-end');
    pages.push(total);
    return pages;
  }
  function openEditor(member: AdminMember): void { formError = ''; notice = ''; editing = member; }
  function openSuspendDialog(member: AdminMember, targetStatus: AdminMemberStatus): void { formError = ''; notice = ''; suspending = { member, targetStatus }; }
  function closeDialogs(): void { if (busy) return; editing = null; deleting = null; suspending = null; formError = ''; }
  function roleLabel(value: AdminMemberRole): string { return { user: 'Thành viên', ctv: 'Cộng tác viên', admin: 'Quản trị viên' }[value]; }
  function accountTypeLabel(value: AdminAccountType): string { return value === 'admin' ? 'Quản trị viên' : 'Thành viên'; }
  function formatDate(value: string | null): string { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date); }
  function initials(member: AdminMember): string { return member.name.trim().split(/\s+/u).slice(-2).map((part) => part[0] || '').join('').toLocaleUpperCase('vi') || 'TV'; }

  async function saveMember(submission: MemberDialogSubmission): Promise<void> {
    const target = editing;
    const principal = getBrowserSessionSnapshot();
    if (!target || busy) return;
    const body = { ...submission.body };
    if (submission.confirmation && !await confirmInApp(submission.confirmation)) return;
    const current = getBrowserSessionSnapshot();
    if (busy || editing !== target || current.user?.id !== principal.user?.id || current.user?.role !== principal.user?.role) return;
    busy = true;
    formError = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(memberUrl(target), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) { leaveAdmin(); return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || 'Không thể lưu thành viên.');
      const saved = payload.member as AdminMember;
      members = members.map((member) => member.id === target.id ? saved : member);
      notice = `Đã cập nhật “${saved.name}”.`;
      editing = null;
    } catch (cause) {
      formError = cause instanceof Error ? cause.message : 'Không thể lưu thành viên.';
    } finally { busy = false; }
  }

  async function handleSuspend(targetStatus: AdminMemberStatus): Promise<void> {
    if (!suspending || (readOnly && (suspending.member.accountType === 'admin' || suspending.member.role === 'admin'))) return;
    const target = suspending.member;
    busy = true;
    formError = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(memberUrl(target), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (response.status === 401 || response.status === 403) { leaveAdmin(); return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || 'Không thể cập nhật trạng thái tài khoản.');
      const saved = payload.member as AdminMember;
      members = members.map((m) => m.id === target.id ? saved : m);
      notice = targetStatus === 'suspended'
        ? `Đã khoá tài khoản “${saved.name}”. Toàn bộ dữ liệu tu tập đã được bảo lưu an toàn.`
        : `Đã mở khoá tài khoản “${saved.name}”.`;
      suspending = null;
    } catch (cause) {
      formError = cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái tài khoản.';
    } finally {
      busy = false;
    }
  }

  async function deleteMember(): Promise<void> {
    if (!deleting) return;
    const target = deleting;
    busy = true;
    formError = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(memberUrl(target), { method: 'DELETE', headers: { 'x-csrf-token': csrf } });
      if (response.status === 401 || response.status === 403) { leaveAdmin(); return; }
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload?.error?.message || 'Không thể xoá thành viên.'); }
      members = members.filter((member) => member.id !== target.id);
      notice = `Đã xoá “${target.name}”.`;
      deleting = null;
    } catch (cause) { formError = cause instanceof Error ? cause.message : 'Không thể xoá thành viên.'; }
    finally { busy = false; }
  }

  function memberUrl(member: AdminMember): string { return `/api/admin/members/${encodeURIComponent(member.id)}`; }
  function leaveAdmin(): void { members = []; globalThis.location.replace('/?login=1'); }

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

<section class="admin-content-manager admin-members" aria-labelledby="admin-members-title">
  <header class="admin-content-header">
    <div><span>Quản trị truy cập</span><h1 id="admin-members-title">Thành viên</h1><p>Quản lý tài khoản thành viên và phân loại riêng các tài khoản quản trị viên.</p></div>
  </header>
  <section class="admin-inventory" aria-labelledby="members-list-title">
    <header><div><span>Danh sách truy cập</span><h2 id="members-list-title">Tất cả thành viên</h2></div><strong>{filtered.length}/{members.length}</strong></header>
    <div class="admin-inventory-toolbar member-toolbar">
      <label class="wide"><span>Tìm kiếm</span><input value={query} oninput={updateQuery} type="search" placeholder="Tên hoặc email…" /></label>
      <label><span>Loại tài khoản</span><div class="member-filter-select"><select value={accountType} onchange={updateAccountType}><option value="all">Tất cả loại</option><option value="member">Thành viên</option><option value="admin">Quản trị viên</option></select><ChevronDown aria-hidden="true" size={16} strokeWidth={2} /></div></label>
      <label><span>Vai trò</span><div class="member-filter-select"><select value={role} onchange={updateRole}><option value="all">Tất cả vai trò</option><option value="user">Thành viên</option><option value="ctv">Cộng tác viên</option><option value="admin">Quản trị viên</option></select><ChevronDown aria-hidden="true" size={16} strokeWidth={2} /></div></label>
      <label><span>Trạng thái</span><div class="member-filter-select"><select value={statusFilter} onchange={updateStatusFilter}><option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="suspended">Đã khoá / Đình chỉ</option></select><ChevronDown aria-hidden="true" size={16} strokeWidth={2} /></div></label>
      <button class="reset" type="button" onclick={resetFilters}>Xóa bộ lọc</button>
    </div>
    {#if notice}<p class="admin-inventory-alert" role="status">{notice}</p>{/if}
    {#if filtered.length === 0}<div class="admin-inventory-empty"><strong>Không có thành viên phù hợp</strong><p>Thử xóa bộ lọc hoặc tìm bằng thông tin khác.</p><button type="button" onclick={resetFilters}>Xóa bộ lọc</button></div>
    {:else}<div class="admin-inventory-table-wrap"><table><caption>Danh sách thành viên quản trị</caption><thead><tr><th>Thành viên</th><th>Loại</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Cập nhật</th><th><span class="sr-only">Hành động</span></th></tr></thead><tbody>
      {#each pagedMembers as member (member.id)}<tr>
        <td data-label="Thành viên"><div class="inventory-title member-identity"><span class="inventory-cover">{#if member.avatarUrl}<img src={member.avatarUrl} alt="" width="42" height="42" loading="lazy" referrerpolicy="no-referrer" />{:else}{initials(member)}{/if}</span><div><strong>{member.name}{#if member.isSelf}<span class="self-label">Bạn</span>{/if}</strong><small>{member.email || member.id}</small></div></div></td>
        <td data-label="Loại">{accountTypeLabel(member.accountType)}</td>
        <td data-label="Vai trò"><span class:warning={member.role === 'ctv'} class:private={member.role === 'user'} class="admin-status-badge">{roleLabel(member.role)}</span></td>
        <td data-label="Trạng thái">
          {#if member.status === 'suspended'}
            <span class="admin-status-badge suspended">Đã khoá</span>
          {:else}
            <span class="admin-status-badge ok">Hoạt động</span>
          {/if}
        </td>
        <td data-label="Ngày tạo">{formatDate(member.createdAt)}</td>
        <td data-label="Cập nhật">{formatDate(member.updatedAt)}</td>
        <td data-label="Hành động">
          <div class="member-row-actions">
            {#if !readOnly}<button class="row-action" type="button" onclick={() => openEditor(member)}>Chỉnh sửa</button>{/if}
            {#if !readOnly || (member.accountType === 'member' && member.role !== 'admin')}
            {#if member.status === 'suspended'}
              <button class="row-action success" type="button" disabled={busy || member.isSelf} title={member.isSelf ? 'Không thể thao tác trên tài khoản đang đăng nhập' : 'Mở khoá tài khoản'} onclick={() => openSuspendDialog(member, 'active')}>
                Mở khoá
              </button>
            {:else}
              <button class="row-action warning" type="button" disabled={busy || member.isSelf} title={member.isSelf ? 'Không thể tự khoá tài khoản đang đăng nhập' : 'Đình chỉ / Khoá tài khoản để bảo toàn dữ liệu tu tập'} onclick={() => openSuspendDialog(member, 'suspended')}>
                Khoá
              </button>
            {/if}
            {/if}
            {#if !readOnly}<button class="row-action danger desktop-only" type="button" disabled={member.isSelf} title={member.isSelf ? 'Không thể tự xoá tài khoản đang đăng nhập' : 'Xoá vĩnh viễn (Chỉ khả dụng trên máy tính)'} onclick={() => { formError = ''; deleting = member; }}>
              Xoá
            </button>{/if}
          </div>
        </td>
      </tr>{/each}
    </tbody></table></div>
      {#if totalPages > 1}<nav class="member-pagination" aria-label="Phân trang thành viên">
        <p aria-live="polite">Hiển thị <strong>{pageStart}–{pageEnd}</strong> trong {filtered.length} thành viên</p>
        <div class="member-pagination__controls">
          <button type="button" aria-label="Trang trước" disabled={page === 1} onclick={() => goToPage(page - 1)}><ChevronLeft aria-hidden="true" size={17} strokeWidth={2} /></button>
          <div class="member-pagination__pages">
            {#each paginationItems as item}
              {#if typeof item === 'number'}<button type="button" class:active={item === page} aria-current={item === page ? 'page' : undefined} aria-label={`Trang ${item}`} onclick={() => goToPage(item)}>{item}</button>
              {:else}<span aria-hidden="true">…</span>{/if}
            {/each}
          </div>
          <button type="button" aria-label="Trang sau" disabled={page === totalPages} onclick={() => goToPage(page + 1)}><ChevronRight aria-hidden="true" size={17} strokeWidth={2} /></button>
        </div>
      </nav>{/if}
    {/if}
  </section>
</section>

{#if editing && !readOnly}<AdminMemberDialog member={editing} {busy} error={formError} onClose={closeDialogs} onSubmit={saveMember} />{/if}
{#if suspending}<AdminMemberSuspendDialog member={suspending.member} targetStatus={suspending.targetStatus} {busy} error={formError} onClose={closeDialogs} onConfirm={handleSuspend} />{/if}
{#if deleting && !readOnly}<AdminMemberConfirmDialog member={deleting} {busy} error={formError} onClose={closeDialogs} onConfirm={deleteMember} onRequestSuspend={() => { const m = deleting; deleting = null; if (m) openSuspendDialog(m, 'suspended'); }} />{/if}
