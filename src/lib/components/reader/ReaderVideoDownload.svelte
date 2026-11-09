<script lang="ts">
  import { onMount } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import {
    isSingleVideoCached,
    downloadSingleVideo,
    deleteSingleVideo,
    readVideoBlobUrl,
    revokeVideoBlobUrl
  } from '$lib/browser/quang-tu-facebook-videos';

  interface Props {
    filename: string;
    bytes: number;
    onUrlReady?: (filename: string, blobUrl: string | null) => void;
    onNotify?: (message: string) => void;
  }

  let { filename, bytes, onUrlReady, onNotify }: Props = $props();

  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');

  let isCached = $state(false);
  let isDownloading = $state(false);
  let progressPct = $state(0);
  let currentBlobUrl = $state<string | null>(null);
  let abortController: AbortController | null = null;
  let mounted = false;

  function formatMb(b: number): string {
    return (b / (1024 * 1024)).toFixed(1);
  }

  async function checkStatus(): Promise<void> {
    const cached = await isSingleVideoCached(filename);
    const blobUrl = cached ? await readVideoBlobUrl(filename) : null;
    if (!mounted) {
      revokeVideoBlobUrl(blobUrl);
      return;
    }
    revokeVideoBlobUrl(currentBlobUrl);
    isCached = cached;
    currentBlobUrl = blobUrl;
    onUrlReady?.(filename, blobUrl);
  }

  async function handleDownload(): Promise<void> {
    if (isDownloading) return;
    isDownloading = true;
    progressPct = 0;
    const controller = new AbortController();
    abortController = controller;

    try {
      await downloadSingleVideo(filename, controller.signal, (pct) => {
        if (mounted && abortController === controller) progressPct = pct;
      });
      if (mounted && abortController === controller && !controller.signal.aborted) await checkStatus();
    } catch (err: unknown) {
      if (mounted && abortController === controller && !controller.signal.aborted
        && !(err instanceof Error && (err.message === 'download-aborted' || err.name === 'AbortError'))) {
        onNotify?.(isEn ? 'Video download failed. Please try again.' : '❌ Tải video chưa hoàn tất. Vui lòng thử lại.');
      }
    } finally {
      if (mounted && abortController === controller) {
        isDownloading = false;
        abortController = null;
      }
    }
  }

  function handleCancel(): void {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isDownloading = false;
  }

  async function handleDelete(): Promise<void> {
    revokeVideoBlobUrl(currentBlobUrl);
    currentBlobUrl = null;
    await deleteSingleVideo(filename);
    isCached = false;
    onUrlReady?.(filename, null);
  }

  onMount(() => {
    mounted = true;
    void checkStatus();
    return () => {
      mounted = false;
      if (abortController) abortController.abort();
      revokeVideoBlobUrl(currentBlobUrl);
    };
  });
</script>

<div class="video-download-bar" data-video-file={filename}>
  {#if isDownloading}
    <div class="downloading-state" role="status">
      <span class="spinner"></span>
      <span class="pct-text">
        {isEn ? `Downloading video... ${progressPct}%` : `Đang tải video vào máy... ${progressPct}%`}
      </span>
      <button type="button" class="btn-cancel" onclick={handleCancel}>
        {isEn ? 'Cancel' : 'Hủy'}
      </button>
    </div>
  {:else if isCached}
    <div class="cached-state">
      <span class="badge-saved">
        ✓ {isEn ? `Saved offline (${formatMb(bytes)} MB)` : `Đã lưu ngoại tuyến (${formatMb(bytes)} MB)`}
      </span>
      <button
        type="button"
        class="btn-delete"
        title={isEn ? 'Delete video from device' : 'Xóa video khỏi bộ nhớ máy'}
        onclick={handleDelete}
      >
        🗑️ {isEn ? 'Delete' : 'Xóa'}
      </button>
    </div>
  {:else}
    <div class="uncached-state">
      <span class="online-hint">
        🌐 {isEn ? 'Stream online' : 'Phát trực tiếp online'}
      </span>
      <button type="button" class="btn-download" onclick={handleDownload}>
        ⬇ {isEn ? `Save offline (~${formatMb(bytes)} MB)` : `Tải về máy để xem ngoại tuyến (~${formatMb(bytes)} MB)`}
      </button>
    </div>
  {/if}
</div>

<style>
  .video-download-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 8px auto 18px;
    max-width: 640px;
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--bg2, #faf7f2);
    border: 1px solid var(--border2, #e7e2d7);
    font-size: 12px;
    font-family: var(--font-app, sans-serif);
  }
  .downloading-state,
  .cached-state,
  .uncached-state {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 10px;
    flex-wrap: wrap;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--brown, #78350f);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .pct-text {
    color: var(--brown, #78350f);
    font-weight: 600;
    flex: 1;
  }
  .badge-saved {
    color: #059669;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .online-hint {
    color: var(--muted, #78716c);
    font-size: 11.5px;
  }
  button {
    min-height: 36px;
    padding: 4px 12px;
    border-radius: 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .btn-download {
    background: var(--gold-light, #fef3c7);
    color: var(--brown, #78350f);
    border: 1px solid var(--gold, #d97706);
  }
  .btn-download:hover {
    background: var(--gold, #d97706);
    color: #fff;
  }
  .btn-delete {
    background: transparent;
    border: 1px solid var(--border, #d1d5db);
    color: var(--muted, #78716c);
  }
  .btn-delete:hover {
    border-color: #ef4444;
    color: #ef4444;
  }
  .btn-cancel {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text2);
  }
</style>
