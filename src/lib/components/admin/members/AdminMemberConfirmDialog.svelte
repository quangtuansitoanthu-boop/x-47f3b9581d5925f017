<script lang="ts">
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import { onMount } from 'svelte';
  import type { AdminMember } from './admin-member-types';

  interface Props {
    member: AdminMember;
    busy?: boolean;
    error?: string;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    onRequestSuspend?: () => void;
  }

  let { member, busy = false, error = '', onClose, onConfirm, onRequestSuspend }: Props = $props();
  let dialog: HTMLElement | null = $state(null);
  let cancelButton: HTMLButtonElement | null = $state(null);
  let confirmInput = $state('');
  let isMobile = $state(false);

  let canConfirm = $derived(!isMobile && confirmInput.trim().toUpperCase() === 'XOÁ');

  function close(): void {
    if (!busy) onClose();
  }

  onMount(() => {
    isMobile = typeof window !== 'undefined' && (
      window.innerWidth < 768 ||
      /iPad|Tablet|Nexus 7|Nexus 10|SM-T|Mobi|iPhone|Android/i.test(navigator.userAgent)
    );

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    releaseBodyScroll ??= acquireScrollLock();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    queueMicrotask(() => cancelButton?.focus({ preventScroll: true }));
    return () => {
      releaseBodyScroll?.(); releaseBodyScroll = null;
      window.removeEventListener('keydown', keydown);
      previousFocus?.focus({ preventScroll: true });
    };
  });
</script>

<div class="admin-member-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) close(); }}>
  <div class="admin-member-dialog admin-member-confirm admin-member-delete-dialog" data-dialog-glass role="alertdialog" aria-modal="true" aria-labelledby="delete-member-title" aria-describedby="delete-member-description" bind:this={dialog}>
    <header>
      <div>
        <span>Nguy cơ mất dữ liệu tu tập</span>
        <h2 id="delete-member-title">Xoá thành viên?</h2>
      </div>
    </header>
    <div class="admin-member-confirm__body">
      {#if isMobile}
        <div class="admin-member-mobile-blocked">
          <strong>🚫 Không thể xoá trên điện thoại</strong>
          <p>Vì lý do an toàn bảo toàn dữ liệu tu tập, thao tác xoá thành viên <strong>bị cấm trên thiết bị di động</strong> để tránh chạm nhầm làm mất vĩnh viễn dữ liệu. Vui lòng sử dụng máy tính (Desktop) hoặc sử dụng tính năng <strong>Khoá tài khoản</strong>.</p>
        </div>
      {:else}
        <div class="admin-member-danger-box">
          <strong>⚠️ CẢNH BÁO NGUY HIỂM: MẤT TOÀN BỘ DỮ LIỆU TU TẬP</strong>
          <p id="delete-member-description">
            Xoá tài khoản <strong>{member.name}</strong> ({member.email || member.id}) sẽ <strong>xoá sạch vĩnh viễn</strong> toàn bộ lịch sử công phu, số chuỗi niệm Phật, huân chương, và tiến trình đọc kinh sách liên kết với tài khoản này. Hành động này không thể hoàn tác!
          </p>
        </div>

        {#if onRequestSuspend}
          <div class="admin-member-recommend-box">
            <strong>💡 Khuyên dùng: Chọn "Khoá tài khoản" thay vì xoá</strong>
            <p>Khoá tài khoản sẽ ngăn thành viên đăng nhập nhưng <em>toàn bộ dữ liệu tu tập được giữ nguyên vẹn 100%</em> và có thể mở lại bất cứ lúc nào.</p>
            <button class="suspend-btn-small" type="button" disabled={busy} onclick={onRequestSuspend}>
              Chuyển sang Khoá tài khoản
            </button>
          </div>
        {/if}

        <label class="confirm-type-label" for="confirm-delete-input">
          Để xác nhận xoá vĩnh viễn, hãy nhập chữ <strong>XOÁ</strong> vào ô dưới đây:
        </label>
        <input
          id="confirm-delete-input"
          class="confirm-type-input"
          type="text"
          placeholder="Nhập XOÁ để xác nhận"
          bind:value={confirmInput}
          disabled={busy}
          autocomplete="off"
          spellcheck="false"
        />

        {#if member.role === 'admin'}
          <p class="admin-member-warning">Hệ thống sẽ từ chối nếu đây là quản trị viên cuối cùng.</p>
        {/if}
      {/if}

      {#if error}
        <p class="admin-member-form-error" role="alert">{error}</p>
      {/if}
    </div>
    <footer class:dialog-actions-balanced={!isMobile}>
      <button bind:this={cancelButton} class="secondary" type="button" disabled={busy} onclick={close}>
        {isMobile ? 'Đóng' : 'Huỷ bỏ (Giữ an toàn)'}
      </button>
      {#if !isMobile}
        <button
          class="danger"
          type="button"
          disabled={busy || !canConfirm}
          title={!canConfirm ? 'Vui lòng nhập chữ XOÁ để kích hoạt nút' : undefined}
          onclick={() => void onConfirm()}
        >
          {busy ? 'Đang xoá…' : 'Xác nhận xoá vĩnh viễn'}
        </button>
      {/if}
    </footer>
  </div>
</div>
