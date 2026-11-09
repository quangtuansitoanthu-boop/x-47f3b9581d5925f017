<script lang="ts">
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import { X } from '@lucide/svelte';
  import { onMount, untrack } from 'svelte';
  import type { AdminMember, AdminMemberRole, MemberDialogSubmission } from './admin-member-types';

  interface Props {
    member: AdminMember;
    busy?: boolean;
    error?: string;
    onClose: () => void;
    onSubmit: (submission: MemberDialogSubmission) => void | Promise<void>;
  }

  let { member, busy = false, error = '', onClose, onSubmit }: Props = $props();
  let dialog: HTMLElement | null = $state(null);
  let firstInput: HTMLInputElement | null = $state(null);
  const initial = untrack(() => ({ name: member.name, role: member.role }));
  let name = $state(initial.name);
  let role = $state<AdminMemberRole>(initial.role);

  function close(): void {
    if (busy) return;
    onClose();
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const body: Record<string, string | null> = {
      name: name.trim(),
      ...(!member.isSelf ? { role } : {}),
    };
    const changesRole = !member.isSelf && role !== member.role;
    void onSubmit({
      body,
      confirmation: changesRole
        ? `Xác nhận đổi vai trò thành ${roleLabel(role)} cho “${member.name}”? Phiên đang hoạt động của tài khoản này sẽ bị thu hồi.`
        : null,
    });
  }

  function roleLabel(value: AdminMemberRole): string {
    return { user: 'Thành viên', ctv: 'Cộng tác viên', admin: 'Quản trị viên' }[value];
  }

  onMount(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    releaseBodyScroll ??= acquireScrollLock();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((item) => item.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    queueMicrotask(() => firstInput?.focus({ preventScroll: true }));
    return () => {
      releaseBodyScroll?.(); releaseBodyScroll = null;
      window.removeEventListener('keydown', keydown);
      previousFocus?.focus({ preventScroll: true });
    };
  });
</script>

<div class="admin-member-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) close(); }}>
  <div class="admin-member-dialog" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="member-dialog-title" bind:this={dialog}>
    <header><div><span>{member.accountType === 'admin' ? 'Tài khoản quản trị viên' : 'Tài khoản thành viên'}</span><h2 id="member-dialog-title">Chỉnh sửa {member.name}</h2></div><button type="button" aria-label="Đóng hộp thoại" disabled={busy} onclick={close}><X aria-hidden="true" size={20} strokeWidth={2} /></button></header>
    <form onsubmit={submit}>
      <label for="member-name">Tên hiển thị</label><input id="member-name" name="name" bind:this={firstInput} bind:value={name} required maxlength="200" autocomplete="name" />
      <label for="member-email">Email tài khoản</label><input id="member-email" name="email" value={member.email || ''} type="email" readonly aria-describedby="member-email-note" autocomplete="email" spellcheck="false" />
      <p id="member-email-note" class="field-note">Email gắn với danh tính đăng nhập và không thể thay đổi tại đây.</p>

      <label for="member-role">Vai trò</label>
      <select id="member-role" name="role" bind:value={role} disabled={member.isSelf} aria-describedby={member.isSelf ? 'self-role-note' : undefined}>
        <option value="user">Thành viên</option>
        <option value="ctv">Cộng tác viên</option><option value="admin">Quản trị viên</option>
      </select>
      {#if member.isSelf}<p id="self-role-note" class="field-note">Bạn không thể tự hạ quyền của tài khoản đang đăng nhập.</p>{/if}
      {#if error}<p class="admin-member-form-error" role="alert">{error}</p>{/if}
      <footer class="dialog-actions-balanced"><button class="secondary" type="button" disabled={busy} onclick={close}>Huỷ</button><button class="primary" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></footer>
    </form>
  </div>
</div>
