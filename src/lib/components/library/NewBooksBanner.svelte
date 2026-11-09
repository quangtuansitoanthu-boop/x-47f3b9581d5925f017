<script lang="ts">
  import { onMount } from 'svelte';
  import type { LibraryArticle } from '$lib/components/library/article';
  import {
    findNewWebBooks,
    downloadAllNewBooks,
    dismissNewBooks,
    readDismissedBookIds
  } from '$lib/browser/offline-books-sync';
  import { getLocalizedArticle } from '$lib/domain/library/localized-article';
import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    articles: LibraryArticle[];
    onNotify?: (message: string) => void;
  }

  let { articles = [], onNotify = () => {} }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  let downloading = $state(false);
  let progressText = $state('');
  let dismissedInSession = $state(false);
  let updatedTick = $state(0);

  onMount(() => {
    const handleUpdate = () => {
      updatedTick++;
    };
    window.addEventListener('quangtu:offline-books-updated', handleUpdate);
    return () => {
      window.removeEventListener('quangtu:offline-books-updated', handleUpdate);
    };
  });

  const newBooks = $derived.by(() => {
    // re-evaluate when updatedTick changes or articles change
    void updatedTick;
    if (dismissedInSession) return [];
    const candidates = findNewWebBooks(articles);
    if (candidates.length === 0) return [];
    const dismissedIds = readDismissedBookIds();
    // Only show if there's at least one book not yet dismissed
    const undismissed = candidates.filter((b) => !dismissedIds.has(b.id));
    return undismissed;
  });

  const bookCount = $derived(newBooks.length);
  const sampleTitles = $derived(
    newBooks
      .slice(0, 2)
      .map((b) => `“${getLocalizedArticle(b, localeStore.current)?.title ?? b.title}”`)
      .join(', ') + (newBooks.length > 2 ? (isEn ? ` and ${newBooks.length - 2} other books` : ` và ${newBooks.length - 2} cuốn khác`) : '')
  );

  async function handleDownloadAll(): Promise<void> {
    if (downloading || newBooks.length === 0) return;
    downloading = true;
    try {
      const total = newBooks.length;
      const count = await downloadAllNewBooks(newBooks, (current, max, title) => {
        progressText = isEn
          ? `Downloading ${current}/${max}: ${title}...`
          : `Đang tải ${current}/${max}: ${title}...`;
      });
      if (count > 0) {
        const msg = isEn
          ? `✓ Downloaded ${count} new book(s) for offline reading!`
          : `✓ Đã tải xong ${count} sách mới về máy để đọc offline!`;
        onNotify(msg);
      }
    } catch {
      onNotify(isEn ? '❌ Could not download books. Please check connection.' : '❌ Không thể tải sách. Vui lòng kiểm tra kết nối mạng.');
    } finally {
      downloading = false;
      progressText = '';
      updatedTick++;
    }
  }

  function handleDismiss(): void {
    dismissedInSession = true;
    dismissNewBooks(newBooks.map((b) => b.id));
  }
</script>

{#if bookCount > 0}
  <aside class="new-books-banner" role="region" aria-label={isEn ? 'New books update' : 'Cập nhật sách mới'}>
    <div class="banner-body">
      <div class="banner-icon" aria-hidden="true">📚</div>
      <div class="banner-info">
        <strong class="banner-title">
          {isEn ? `New book updates available (${bookCount})` : `Có ${bookCount} sách mới được cập nhật trên web`}
        </strong>
        <p class="banner-desc">
          {#if downloading}
            <span class="loading-spinner" aria-hidden="true">⏳</span> {progressText || (isEn ? 'Downloading books to device...' : 'Đang tải sách về máy...')}
          {:else}
            {isEn
              ? `New regular books: ${sampleTitles}. Would you like to download them to read offline?`
              : `Các sách mới: ${sampleTitles}. Bạn có muốn tải về máy để đọc mượt mà khi không có mạng không?`}
          {/if}
        </p>
      </div>
    </div>
    <div class="banner-actions">
      <button
        class="download-btn"
        type="button"
        disabled={downloading}
        onclick={handleDownloadAll}
      >
        <span aria-hidden="true">📥</span>
        <span>{downloading ? (isEn ? 'Downloading...' : 'Đang tải...') : (isEn ? 'Download now' : 'Tải về máy')}</span>
      </button>
      <button
        class="dismiss-btn"
        type="button"
        disabled={downloading}
        aria-label={isEn ? 'Dismiss' : 'Để sau'}
        onclick={handleDismiss}
      >
        <span>{isEn ? 'Later' : 'Để sau'}</span>
      </button>
    </div>
  </aside>
{/if}

<style>
  .new-books-banner {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0 0 16px;
    padding: 14px 16px;
    border: 1.5px solid var(--gold);
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.14), rgba(247, 243, 234, 0.95));
    box-shadow: 0 4px 16px rgba(60, 40, 10, 0.08);
    color: var(--text);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    animation: bannerPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes bannerPop {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global([data-theme='dark']) .new-books-banner {
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.18), rgba(30, 26, 22, 0.98));
    border-color: rgba(200, 150, 62, 0.45);
  }

  .banner-body {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .banner-icon {
    font-size: 26px;
    line-height: 1;
    flex-shrink: 0;
  }

  .banner-info {
    flex: 1;
    min-width: 0;
  }

  .banner-title {
    display: block;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 3px;
  }

  .banner-desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text2, #555);
  }

  :global([data-theme='dark']) .banner-desc {
    color: var(--muted);
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 38px;
  }

  @media (max-width: 480px) {
    .banner-actions {
      padding-left: 0;
    }
  }

  .download-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid var(--gold);
    border-radius: 18px;
    background: var(--gold);
    color: #fff;
    font-family: var(--font-app);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(200, 150, 62, 0.3);
    transition: transform 0.15s, background-color 0.15s;
  }

  .download-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    background: var(--brown, #8c6016);
  }

  .download-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .dismiss-btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: transparent;
    color: var(--muted);
    font-family: var(--font-app);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .dismiss-btn:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--gold);
  }

  .loading-spinner {
    display: inline-block;
    animation: spin 1s infinite linear;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
