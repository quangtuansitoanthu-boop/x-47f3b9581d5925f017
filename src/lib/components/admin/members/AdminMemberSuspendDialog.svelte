<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import type { AdminMember, AdminMemberStatus } from './admin-member-types';

  interface Props {
    member: AdminMember;
    targetStatus: AdminMemberStatus;
    busy?: boolean;
    error?: string;
    onClose: () => void;
    onConfirm: (status: AdminMemberStatus) => void | Promise<void>;
  }

  let { member, targetStatus, busy = false, error = '', onClose, onConfirm }: Props = $props();

  function close(): void {
    if (!busy) onClose();
  }

</script>

<dialog use:modalDialog class="admin-member-suspend-modal" oncancel={(event) => { event.preventDefault(); close(); }} onclick={(event) => { if (event.target === event.currentTarget) close(); }} aria-labelledby="suspend-dialog-title">
  <div class="admin-member-dialog admin-member-confirm" data-dialog-glass>
    <header>
      <div>
        <span>{targetStatus === 'suspended' ? 'Bảo vệ dữ liệu tu tập' : 'Khôi phục truy cập'}</span>
        <h2 id="suspend-dialog-title" tabindex="-1" data-modal-focus>{targetStatus === 'suspended' ? 'Khoá / Đình chỉ tài khoản' : 'Mở khoá tài khoản'}</h2>
      </div>
    </header>
    <div class="admin-member-confirm__body">
      {#if targetStatus === 'suspended'}
        <p>Tài khoản <strong>{member.name}</strong> sẽ bị tạm ngưng và thu hồi các phiên đăng nhập đang hoạt động.</p>
        <div class="admin-member-safe-box">
          <strong>🔒 Dữ liệu tu tập được bảo lưu an toàn 100%</strong>
          <p>Mọi thời khoá công phu, số chuỗi niệm Phật, huân chương, và tiến trình đọc kinh sách được <em>giữ nguyên vẹn</em>. Bạn có thể mở khoá lại cho thành viên bất kỳ lúc nào.</p>
        </div>
        {#if member.role === 'admin'}
          <p class="admin-member-warning">Hệ thống sẽ từ chối nếu đây là quản trị viên đang hoạt động duy nhất.</p>
        {/if}
      {:else}
        <p>Mở khoá quyền đăng nhập cho tài khoản <strong>{member.name}</strong>. Thành viên có thể đăng nhập lại và tiếp tục tu tập bình thường với đầy đủ dữ liệu trước đây.</p>
      {/if}
      {#if error}
        <p class="admin-member-form-error" role="alert">{error}</p>
      {/if}
    </div>
    <footer class="dialog-actions-balanced">
      <button class="secondary" type="button" disabled={busy} onclick={close}>Huỷ bỏ</button>
      {#if targetStatus === 'suspended'}
        <button class="suspend-btn" type="button" disabled={busy} onclick={() => void onConfirm('suspended')}>
          {busy ? 'Đang khoá…' : 'Xác nhận khoá tài khoản'}
        </button>
      {:else}
        <button class="primary" type="button" disabled={busy} onclick={() => void onConfirm('active')}>
          {busy ? 'Đang mở…' : 'Mở khoá ngay'}
        </button>
      {/if}
    </footer>
  </div>
</dialog>

<style>
  .admin-member-suspend-modal { width: min(540px, calc(100% - 32px)); max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px); padding: 0; border: 0; background: transparent; color: var(--text); overflow: auto; }
  .admin-member-suspend-modal::backdrop { background: var(--practice-dialog-backdrop); }
  .admin-member-suspend-modal .admin-member-dialog { width: 100%; max-width: none; }
</style>
