<script lang="ts">
  import type { LibraryArticle } from './article';
  import { categoryIcon } from './article';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import { parsePositionedImage } from '$lib/domain/positioned-image';
  import { handleCoverImgError, normalizeCoverSrc } from '$lib/domain/cover-url';
  import { sessionCover } from '$lib/browser/session-cover';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    article: LibraryArticle;
    featured?: boolean;
    mostViewed?: boolean;
    isDownloaded?: boolean;
    onOpen?: (article: LibraryArticle) => void;
    onTag?: (tag: string) => void;
  }

  let {
    article,
    featured = false,
    mostViewed = false,
    isDownloaded = false,
    onOpen = () => {},
    onTag = () => {},
  }: Props = $props();

  import { getLocalizedArticle } from '$lib/domain/library/localized-article';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.library);
  const displayArticle = $derived(getLocalizedArticle(article, localeStore.current) ?? article);

  const categoryLabel = $derived.by(() => {
    switch (displayArticle.category) {
      case 'CHUYỆN NHÂN QUẢ': return t.karma;
      case 'SÁCH KHUYẾN THIỆN': return t.moral;
      case 'KINH PHẬT': return t.sutras;
      case 'CÁC NGHI THỨC': return t.rituals;
      case 'KHÁC': return t.other;
      default: return displayArticle.category;
    }
  });

  const cover = $derived(parsePositionedImage(normalizeCoverSrc(displayArticle.imageUrl)));
  let coverFailed = $state(false);
  // Reset khi chuyển bài khác để ảnh mới được thử lại từ đầu.
  $effect(() => {
    void displayArticle.id;
    void displayArticle.imageUrl;
    coverFailed = false;
  });

</script>

<div
  class:featured
  class:is-most-viewed={mostViewed}
  class="art-card"
>
  <button
    class="art-card__open"
    type="button"
    aria-label={`${t.readNow} ${article.title}`}
    onclick={() => onOpen(article)}
  ></button>
  <div class="art-cover">
    <div class="art-thumb">
      {#if cover.src && !coverFailed}
        <img use:sessionCover={cover.src} alt={article.title} loading="lazy" decoding="async" width="480" height="720" style:object-position={cover.position} onerror={(event) => handleCoverImgError(event.currentTarget as HTMLImageElement, () => { coverFailed = true; })} />
      {:else}
        <div class="art-thumb-placeholder" aria-hidden="true">{categoryIcon(article.category)}</div>
      {/if}
    </div>
  </div>
  <div class="art-body">
    <span class="art-cat-badge">{categoryIcon(article.category)} {categoryLabel}</span>
    <div class="art-meta">
      {#if mostViewed}
        <span class="art-badge-most-viewed">🔥 {t.mostViewed}</span>
      {/if}
      <span class="art-author">{displayArticle.author}</span>
      <span class="art-date">{formatVietnamDate(article.publishedAt)}</span>
    </div>
    <h2 class="art-title">{displayArticle.title.toUpperCase()}</h2>
    {#if localeStore.current === 'en' && displayArticle.originalTitle && displayArticle.originalTitle.trim().toLowerCase() !== displayArticle.title.trim().toLowerCase()}
      <p class="art-original-title">({displayArticle.originalTitle})</p>
    {/if}
    <p class="art-excerpt">{displayArticle.summary}</p>
    {#if article.hasTableOfContents || article.pdfUrl}
      <div class="art-formats">
        {#if article.volumeCount}<span class="art-volume">📚 {article.volumeCount} {t.chapters}</span>{/if}
        {#if article.status}
          {@const statusText = localeStore.current === 'en' ? (article.status === 'Hoàn thành' ? 'Completed' : article.status === 'Tạm dừng' ? 'Paused' : article.status) : article.status}
          <span class="art-status">{article.status === 'Hoàn thành' ? '✅' : article.status === 'Tạm dừng' ? '⏸' : '📝'} {statusText}</span>
        {/if}
        {#if article.pdfUrl && !article.hasTableOfContents && article.volumeCount <= 0}
          <span class="art-pdf">PDF</span>
          {#if isDownloaded}
            <span class="art-pdf-downloaded">✓ {t.downloaded}</span>
          {/if}
        {/if}
      </div>
    {/if}
    {#if article.tags.length}
      <div class="art-footer">
        <div class="art-tags">
          {#each article.tags.slice(0, 3) as tag}
            <button class="art-tag" type="button" onclick={(event) => { event.stopPropagation(); onTag(tag); }}>{tag}</button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
