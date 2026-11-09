<script lang="ts">
  import { RotateCcw, X } from '@lucide/svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';

  interface Props {
    title: string;
    busy?: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void | Promise<void>;
  }

  let { title, busy = false, onClose, onConfirm }: Props = $props();
  let reason = $state('');

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void onConfirm(reason.trim());
  }

</script>

<dialog class="reject-modal-overlay" use:modalDialog aria-labelledby="reject-modal-title" oncancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onclick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
  <div class="reject-modal-card" data-dialog-glass>
    <header class="reject-modal-header">
      <div class="reject-modal-heading">
        <span class="reject-modal-badge"><RotateCcw aria-hidden="true" size={13} strokeWidth={2.4} /> Trả lại bài viết</span>
        <h3 id="reject-modal-title" tabindex="-1" data-modal-focus>{title}</h3>
      </div>
      <button type="button" class="reject-modal-close" aria-label="Đóng" disabled={busy} onclick={onClose}>
        <X aria-hidden="true" size={18} strokeWidth={2} />
      </button>
    </header>

    <form onsubmit={handleSubmit}>
      <div class="reject-modal-body">
        <label for="reject-reason-input">
          <strong>Lý do trả lại / Hướng dẫn chỉnh sửa <span class="required">*</span></strong>
          <small>Lý do này sẽ hiển thị trực tiếp cho Cộng tác viên để họ nắm được nội dung cần hoàn thiện.</small>
        </label>
        <textarea
          id="reject-reason-input"
          bind:value={reason}
          rows="4"
          placeholder="Ví dụ: Cần bổ sung nguồn bài viết, sửa chính tả ở mục 2, chọn ảnh đại diện rõ nét hơn..."
          required
          disabled={busy}
        ></textarea>
      </div>

      <footer class="reject-modal-footer dialog-actions-balanced">
        <button type="button" class="secondary" disabled={busy} onclick={onClose}>Hủy</button>
        <button type="submit" class="reject-submit-btn" disabled={busy || !reason.trim()}>
          <RotateCcw aria-hidden="true" size={14} strokeWidth={2.2} />
          <span>{busy ? 'Đang gửi…' : 'Xác nhận trả lại'}</span>
        </button>
      </footer>
    </form>
  </div>
</dialog>

<style>
  .reject-modal-overlay {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    border: 0;
    box-sizing: border-box;
    color: var(--text);
    z-index: 9500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    animation: reject-fade-in 0.15s ease-out;
  }
  .reject-modal-overlay::backdrop { background: transparent; }
  @keyframes reject-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .reject-modal-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 520px;
    border-radius: 12px;
    background: var(--dialog-surface-background, var(--card));
    border: 1px solid var(--border2, #e5e7eb);
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    overflow: hidden;
    animation: reject-scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);

    border-color: var(--dialog-surface-border, var(--border));
  }
  @keyframes reject-scale-in {
    from { opacity: 0; transform: scale(0.96) translateY(6px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .reject-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border2, #e5e7eb);
    background: color-mix(in srgb, #f59e0b 6%, var(--card, #fff));
  }
  .reject-modal-heading {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .reject-modal-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 6px;
    background: color-mix(in srgb, #f59e0b 16%, transparent);
    color: #b45309;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .reject-modal-heading h3 {
    margin: 0;
    color: var(--text, #111827);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 420px;
  }
  .reject-modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text2, #6b7280);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .reject-modal-close:hover:not(:disabled) {
    background: var(--bg2, #f3f4f6);
    color: var(--text, #111827);
  }
  .reject-modal-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 20px;
  }
  .reject-modal-body label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .reject-modal-body strong {
    color: var(--text, #111827);
    font-size: 13px;
    font-weight: 600;
  }
  .reject-modal-body .required {
    color: #dc2626;
  }
  .reject-modal-body small {
    color: var(--text2, #6b7280);
    font-size: 11.5px;
    line-height: 1.4;
  }
  .reject-modal-body textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 10px 12px;
    border: 1.5px solid var(--border, #d1d5db);
    border-radius: 8px;
    background: var(--bg, #f9fafb);
    color: var(--text, #111827);
    font: inherit;
    font-size: 13px;
    line-height: 1.5;
    outline: none;
    resize: vertical;
    transition: border-color 0.15s, background 0.15s;
  }
  .reject-modal-body textarea:focus {
    border-color: #f59e0b;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
  }
  .reject-modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--border2, #e5e7eb);
    background: var(--bg3, #f9fafb);
  }
  .reject-modal-footer button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 16px;
    border-radius: 8px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .reject-modal-footer button.secondary {
    border: 1px solid var(--border, #d1d5db);
    background: var(--card, #fff);
    color: var(--text2, #6b7280);
  }
  .reject-modal-footer button.secondary:hover:not(:disabled) {
    border-color: var(--text2, #6b7280);
    color: var(--text, #111827);
  }
  .reject-submit-btn {
    border: 1px solid #f59e0b;
    background: #f59e0b;
    color: #fff;
    box-shadow: 0 2px 6px rgba(245, 158, 11, 0.25);
  }
  .reject-submit-btn:hover:not(:disabled) {
    background: #d97706;
    border-color: #d97706;
    transform: translateY(-1px);
  }
  .reject-submit-btn:disabled {
    opacity: 0.5;
    cursor: default;
    transform: none;
  }
</style>
