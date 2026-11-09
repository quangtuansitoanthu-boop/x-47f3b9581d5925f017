<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    title: string;
    mediaType: 'video' | 'image';
    count: number;
    totalCount: number;
    cachedBytes: number;
    totalBytes: number;
    isBusy: boolean;
    progressPercent?: number;
    errorMessage?: string;
    onDownloadAll: () => Promise<void>;
    onClearAll: () => Promise<void>;
    onClose: () => void;
  }

  let {
    title,
    mediaType,
    count,
    totalCount,
    cachedBytes,
    totalBytes,
    isBusy,
    progressPercent = 0,
    errorMessage = '',
    onDownloadAll,
    onClearAll,
    onClose
  }: Props = $props();

  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');

  let confirmingClear = $state(false);

  function formatMb(bytes: number): string {
    return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
  }

  const activePercent = $derived(
    isBusy
      ? Math.max(progressPercent, totalCount > 0 ? Math.round((count / totalCount) * 100) : 0)
      : (totalCount > 0 ? Math.min(100, Math.round((count / totalCount) * 100)) : 0)
  );

  const displayCachedBytes = $derived(
    isBusy && totalBytes > 0
      ? Math.max(cachedBytes, Math.round((activePercent / 100) * totalBytes))
      : cachedBytes
  );

  const displayCount = $derived(
    isBusy && totalCount > 0
      ? Math.max(count, Math.round((activePercent / 100) * totalCount))
      : count
  );
</script>

<dialog
  data-dialog-glass
  use:modalDialog
  aria-labelledby="reader-media-modal-title"
  oncancel={(e) => {
    e.preventDefault();
    if (!isBusy) onClose();
  }}
  onkeydown={(e) => e.stopPropagation()}
>
  <div class="modal-header">
    <h2 id="reader-media-modal-title">
      {isEn ? 'Offline Media Management' : 'Quản lý Dữ liệu Ngoại tuyến'}
    </h2>
    <button
      type="button"
      class="close-btn"
      aria-label={isEn ? 'Close' : 'Đóng'}
      disabled={isBusy}
      onclick={onClose}
    >
      ✕
    </button>
  </div>

  <div class="modal-body">
    <div class="book-info">
      <span class="book-badge">{mediaType === 'video' ? '🎬 Video' : '🖼️ Ảnh'}</span>
      <strong class="book-title">{title}</strong>
    </div>

    <div class="storage-card">
      <div class="storage-metric">
        <span>{isEn ? 'Saved to device storage:' : 'Đã lưu vào bộ nhớ máy:'}</span>
        <strong>
          {displayCount} / {totalCount} {mediaType === 'video' ? 'video' : (isEn ? 'images' : 'ảnh')}
          ({formatMb(displayCachedBytes)} MB / {formatMb(totalBytes)} MB)
        </strong>
      </div>

      <div class="progress-bar-bg" role="progressbar" aria-valuenow={activePercent} aria-valuemin={0} aria-valuemax={100}>
        <div class="progress-bar-fill" style={`width: ${activePercent}%`}></div>
      </div>
      <div class="progress-label">{activePercent}% {isEn ? 'completed' : 'hoàn thành'}</div>
    </div>

    {#if isBusy}
      <div class="busy-indicator" role="status">
        <span class="spinner"></span>
        <p>
          {isEn
            ? `Downloading into device storage... ${activePercent}%`
            : `Đang tải vào bộ nhớ máy... ${activePercent}%`}
        </p>
      </div>
    {/if}

    <p class="guide-note">
      {mediaType === 'video'
        ? (isEn
            ? '💡 When connected, videos stream online without taking storage. Download to view smoothly offline without internet.'
            : '💡 Khi có mạng, video tự phát trực tiếp không tốn dung lượng máy. Tải về để xem mượt mà khi không có mạng.')
        : (isEn
            ? '💡 Illustrations download separately to keep app install size light. Download for full offline viewing.'
            : '💡 Ảnh minh họa được tải riêng giúp app nhẹ nhàng. Tải về để xem trọn vẹn ngoại tuyến.')}
    </p>

    {#if errorMessage}
      <p role="alert" style="color:var(--danger-text)">{errorMessage}</p>
    {/if}

    {#if confirmingClear}
      <div class="confirm-box" role="alert">
        <p>
          {isEn
            ? 'Are you sure you want to delete all saved media from device storage? You can still stream online or re-download anytime.'
            : 'Quý vị có chắc muốn xóa toàn bộ dữ liệu này khỏi bộ nhớ máy để giải phóng dung lượng? Quý vị vẫn có thể xem online hoặc tải lại bất kỳ lúc nào.'}
        </p>
        <div class="confirm-actions">
          <button type="button" class="btn-cancel" onclick={() => (confirmingClear = false)}>
            {isEn ? 'Cancel' : 'Không xóa'}
          </button>
          <button
            type="button"
            class="btn-danger"
            onclick={async () => {
              confirmingClear = false;
              await onClearAll();
            }}
          >
            {isEn ? 'Confirm Delete' : 'Xác nhận Xóa'}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <div class="modal-footer">
    {#if isBusy}
      <div class="downloading-btn" role="status">
        <span class="spinner-white"></span>
        <span>{isEn ? `Downloading... ${activePercent}%` : `Đang tải vào bộ nhớ máy... ${activePercent}%`}</span>
      </div>
    {:else if count < totalCount}
      <button
        type="button"
        class="btn-primary"
        onclick={() => void onDownloadAll()}
      >
        {isEn
          ? `⬇ Download all (${formatMb(totalBytes - cachedBytes)} MB)`
          : `⬇ Tải toàn bộ (${formatMb(totalBytes - cachedBytes)} MB)`}
      </button>
      {#if count === 0}
        <button
          type="button"
          class="btn-dismiss"
          onclick={onClose}
        >
          {isEn ? 'Later' : 'Để sau'}
        </button>
      {/if}
    {:else}
      <div class="saved-all-badge" role="status">
        <span>✓ {isEn ? 'All saved offline on device' : 'Đã lưu trọn vẹn ngoại tuyến trong máy'}</span>
      </div>
    {/if}

    {#if count > 0 && !isBusy && !confirmingClear}
      <button
        type="button"
        class="btn-secondary"
        onclick={() => (confirmingClear = true)}
      >
        {isEn
          ? `🗑️ Delete from device (${formatMb(cachedBytes)} MB)`
          : `🗑️ Xóa khỏi máy để giải phóng bộ nhớ (${formatMb(cachedBytes)} MB)`}
      </button>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    margin: auto;
    width: min(calc(100% - var(--space-page, 16px)), 34em);
    box-sizing: border-box;
    max-height: calc(100dvh - var(--space-page, 16px));
    overflow: auto;
    padding: calc(var(--space-page, 16px) * 1.2);
    border: 1px solid var(--border);
    border-radius: var(--radius-card, 16px);
    background: var(--card, #fff);
    box-shadow: var(--shadow-xl);
    color: var(--text, #1c1917);
    font-family: var(--font-app, sans-serif);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border2, #f0ece1);
  }
  h2 {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0;
    color: var(--brown, #78350f);
  }
  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg2, #faf7f2);
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 15px;
    color: var(--text2, #57534e);
  }
  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .book-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .book-badge {
    padding: 3px 8px;
    border-radius: 8px;
    background: var(--gold-light, #fef3c7);
    color: var(--brown, #78350f);
    font-size: 11px;
    font-weight: 700;
  }
  .book-title {
    font-size: 0.95rem;
    color: var(--text);
  }
  .storage-card {
    padding: 14px;
    border-radius: 12px;
    background: var(--bg2, #faf7f2);
    border: 1px solid var(--border2, #e7e2d7);
  }
  .storage-metric {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 8px;
    flex-wrap: wrap;
    gap: 4px;
  }
  .progress-bar-bg {
    width: 100%;
    height: 10px;
    background: var(--border, #e5e7eb);
    border-radius: 5px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--gold, #d97706), #10b981);
    transition: width 0.3s ease;
  }
  .progress-label {
    font-size: 11px;
    color: var(--muted, #78716c);
    text-align: right;
    margin-top: 4px;
  }
  .busy-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--gold-light, #fef3c7);
    border-radius: 10px;
    color: var(--brown, #78350f);
    font-size: 13px;
    font-weight: 500;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--brown);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .guide-note {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text2, #57534e);
    margin: 0;
  }
  .confirm-box {
    padding: 12px;
    border-radius: 10px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    font-size: 13px;
  }
  .confirm-box p {
    margin: 0 0 10px 0;
  }
  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .modal-footer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--border2);
  }
  button {
    min-height: 44px;
    padding: 10px 16px;
    border-radius: var(--radius-control, 12px);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn-primary {
    background: var(--gold, #d97706);
    color: #fff;
    border: none;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--brown, #b45309);
  }
  .btn-dismiss {
    background: var(--bg2, #faf7f2);
    border: 1px solid var(--border);
    color: var(--text2, #57534e);
  }
  .btn-dismiss:hover {
    background: var(--border, #e5e7eb);
  }
  .downloading-btn {
    min-height: 44px;
    padding: 10px 16px;
    border-radius: var(--radius-control, 12px);
    background: var(--gold, #d97706);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: wait;
  }
  .spinner-white {
    width: 18px;
    height: 18px;
    border: 2px solid #fff;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .saved-all-badge {
    min-height: 44px;
    padding: 10px 16px;
    border-radius: var(--radius-control, 12px);
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #065f46;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn-secondary {
    background: transparent;
    border: 1.5px solid var(--border);
    color: var(--text2);
  }
  .btn-secondary:hover:not(:disabled) {
    border-color: #ef4444;
    color: #ef4444;
  }
  .btn-danger {
    background: #dc2626;
    color: #fff;
    border: none;
    min-height: 36px;
    padding: 6px 14px;
    font-size: 12px;
  }
  .btn-cancel {
    background: #fff;
    border: 1px solid #d1d5db;
    color: #374151;
    min-height: 36px;
    padding: 6px 14px;
    font-size: 12px;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
