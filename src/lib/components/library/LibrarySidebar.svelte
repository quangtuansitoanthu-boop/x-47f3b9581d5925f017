<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();
  import type { LibraryArticle } from './article';
  import { categoryIcon } from './article';
  import { mostViewedArticles } from '$lib/domain/library/popularity';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getLocalizedArticle } from '$lib/domain/library/localized-article';

  interface Props {
    articles: LibraryArticle[];
    loading?: boolean;
    showPopular?: boolean;
    showTeachings?: boolean;
    onOpen?: (article: LibraryArticle) => void;
    onTag?: (tag: string) => void;
  }

  let { articles, loading = false, showPopular = true, showTeachings = true, onOpen = () => {}, onTag = () => {} }: Props = $props();
  let quoteIndex = $state(0);
  let shareNotice = $state('');

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.sidebar);

  const quotesVi = [
    ['Gieo nhân nào, gặt quả nấy. Tâm thiện là hạt giống của an lạc.', '— Kinh Pháp Cú'],
    ['Tâm bình thế giới bình. Một niệm thiện sinh, vạn điều lành đến.', '— Thiền ngữ'],
    ['Buông bỏ không phải là từ bỏ, mà là nhận ra rằng một số thứ không thuộc về ta.', '— Thiền ngữ']
  ];

  const quotesEn = [
    ['As you sow, so shall you reap. A pure mind is the seed of peace.', '— Dhammapada'],
    ['When the mind is peaceful, the world is at peace. A single good thought invites thousands of blessings.', '— Zen Teaching'],
    ['Letting go does not mean giving up; it means realizing that some things were never ours to hold.', '— Zen Teaching']
  ];

  const activeQuotes = $derived(localeStore.current === 'en' ? quotesEn : quotesVi);

  function rankTags(items: LibraryArticle[]): string[] {
    const counts = new Map<string, number>();
    for (const article of items) {
      for (const tag of article.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([tag]) => tag);
  }

  const popular = $derived(
    mostViewedArticles(articles)
      .map((art) => getLocalizedArticle(art, localeStore.current))
      .filter((art): art is LibraryArticle => art !== null)
  );
  const tags = $derived(rankTags(articles));

  function notifyShare(message: string): void {
    shareNotice = message;
    window.setTimeout(() => {
      if (shareNotice === message) shareNotice = '';
    }, 3000);
  }

  function shareFacebook(): void {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`, '_blank');
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      notifyShare(t.copiedLink);
    } catch {
      notifyShare(t.cannotCopy);
    }
  }
</script>

<aside class="sidebar" aria-label={localizeUi("Nội dung bổ sung")}>
  {#if showPopular}
  <section class="sidebar-widget">
    <div class="sw-head"><span class="sw-icon" aria-hidden="true">👁️</span><h3>{t.mostViewed}</h3></div>
    <div class="sw-body"><div class="pop-list">
      {#if loading}
        <div class="sidebar-popular-skeleton" aria-hidden="true">
          {#each Array(5) as _, index}
            <div class="sidebar-popular-skeleton__row">
              <span class="sidebar-popular-skeleton__rank shimmer"></span>
              <span class="sidebar-popular-skeleton__copy">
                <span class:short={index > 2} class="sidebar-popular-skeleton__title shimmer"></span>
                <span class="sidebar-popular-skeleton__meta shimmer"></span>
              </span>
            </div>
          {/each}
        </div>
      {:else}{#each popular as article, index}
        <button class:top={index < 2} class="pop-item" type="button" onclick={() => onOpen(article)}>
          <b class="pop-num">{index + 1}</b>
          <span class="pop-copy">
            <strong class="pop-title">{article.title.toUpperCase()}</strong>
            <small class="pop-cat">
              <span>{categoryIcon(article.category)} {article.category}</span>
              {#if (article.viewCount ?? 0) > 0}<span class="pop-views">👁 {article.viewCount}</span>{/if}
            </small>
          </span>
        </button>
      {:else}<p>{t.noArticles}</p>{/each}{/if}
    </div></div>
  </section>
  {/if}
  {#if showTeachings}
  <section class="sidebar-widget">
    <div class="sw-head"><span class="sw-icon" aria-hidden="true">📿</span><h3>{t.dharmaQuote}</h3></div>
    <div class="sw-body"><blockquote class="dharma-quote"><p>{activeQuotes[quoteIndex % activeQuotes.length][0]}</p><cite>{activeQuotes[quoteIndex % activeQuotes.length][1]}</cite></blockquote>
    <button class="sidebar-action" type="button" onclick={() => quoteIndex = (quoteIndex + 1) % activeQuotes.length}>{t.anotherQuote}</button></div>
  </section>
  {/if}
  <section class="sidebar-widget">
    <div class="sw-head"><span class="sw-icon" aria-hidden="true">🏷️</span><h3>{t.popularTopics}</h3></div>
    <div class="sw-body"><div class="tag-cloud">
      {#if loading}
        <div class="sidebar-tags-skeleton" aria-hidden="true">
          {#each [64, 82, 104, 68, 74, 92, 70, 108, 78, 96] as width}
            <span class="sidebar-tags-skeleton__pill shimmer" style:width={`${width}px`}></span>
          {/each}
        </div>
      {:else}
        {#each tags as tag}<button class="art-tag" type="button" onclick={() => onTag(tag)}>{tag}</button>{/each}
      {/if}
    </div></div>
  </section>
  <section class="sidebar-widget">
    <div class="sw-head"><span class="sw-icon" aria-hidden="true">🌐</span><h3>{t.shareSite}</h3></div>
    <div class="sw-body"><p class="share-copy">{localeStore.current === 'en' ? 'If you find this website helpful, please share it to spread good karma and wholesome deeds.' : 'Nếu bạn thấy trang hữu ích, hãy chia sẻ để nhiều người cùng biết gieo nhân lành.'}</p>
    <button class="share-facebook" type="button" onclick={shareFacebook}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97H15.83c-1.491 0-1.956.93-1.956 1.886v2.252h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
      {localeStore.current === 'en' ? 'Share to Facebook' : 'Chia sẻ Facebook'}
    </button>
    <button class="share-copy-button" type="button" onclick={() => void copyLink()}>🔗 {t.copyLink}</button>
    {#if shareNotice}<span class="share-notice" role="status">{shareNotice}</span>{/if}</div>
  </section>
</aside>

<style>
  .sidebar-popular-skeleton{display:flex;flex-direction:column;gap:3px}.sidebar-popular-skeleton__row{display:flex;min-height:50px;align-items:flex-start;gap:11px;padding:8px}.sidebar-popular-skeleton__rank{width:18px;height:24px;flex:0 0 18px;border-radius:6px}.sidebar-popular-skeleton__copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:7px;padding-top:2px}.sidebar-popular-skeleton__title{width:90%;height:12px;border-radius:6px}.sidebar-popular-skeleton__title.short{width:68%}.sidebar-popular-skeleton__meta{width:56%;height:10px;border-radius:6px}.sidebar-tags-skeleton{display:flex;flex-wrap:wrap;gap:6px}.sidebar-tags-skeleton__pill{height:26px;border-radius:16px}.shimmer{position:relative;display:block;overflow:hidden;background:var(--bg3)}.shimmer::after{position:absolute;inset:0;content:'';background:linear-gradient(90deg,transparent,rgba(255,255,255,.58),transparent);transform:translateX(-100%);animation:sidebar-skeleton-shimmer 1.35s ease-in-out infinite}@keyframes sidebar-skeleton-shimmer{to{transform:translateX(100%)}}@media(prefers-reduced-motion:reduce){.shimmer::after{animation:none}}
</style>
