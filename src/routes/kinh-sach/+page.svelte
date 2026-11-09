<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();
  import { englishText } from '$lib/i18n/ui-copy';

  import { BookOpen, ChevronDown, Bookmark, SlidersHorizontal } from '@lucide/svelte';
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { catalogScrollArea } from '$lib/browser/catalog-scroll-area';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import ArticleCard from '$lib/components/library/ArticleCard.svelte';
  import ArticleCardSkeleton from '$lib/components/library/ArticleCardSkeleton.svelte';
  import TopTenDialog from '$lib/components/library/TopTenDialog.svelte';
  import { mostViewedArticles } from '$lib/domain/library/popularity';
  import { orderBookCatalog } from '$lib/domain/library/book-catalog-order';
  import ReaderBoundary from '$lib/components/library/ReaderBoundary.svelte';
  import ContinueReadingShelf from '$lib/components/library/ContinueReadingShelf.svelte';
  import { type ArticleCategory, type LibraryArticle, LIBRARY_SECTIONS, getCategoryLabel } from '$lib/components/library/article';
  import PresenceChip from '$lib/components/presence/PresenceChip.svelte';
  import { listenPresence } from '$lib/browser/presence';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { fetchHomepageWithOfflinePdfs } from '$lib/browser/offline-pdf-library';
  import { listOfflinePdfMetadata } from '$lib/browser/offline-pdf-database';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { getSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { createSessionContentGuard } from '$lib/browser/session-content-guard';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { ReadingProgressRecord } from '$lib/browser/reading-activity-client';
  import {
    DEFAULT_SITE_NAME,
    ensureAbsoluteUrl,
    getImageMimeType,
    cleanMetaDescription,
  } from '$lib/domain/social-preview';
  import { compareContentRecency } from '$lib/domain/content-recency';
  import { resolvePdfUrl } from '$lib/utils/pdf-url';
  import { matchesVietnameseSearch } from '$lib/utils/vietnamese-search';
  import { getLocalizedArticle } from '$lib/domain/library/localized-article';
  import { triggerHaptic } from '$lib/utils/haptics';
  import '$lib/styles/global.css';
  import '$lib/styles/library.css';

  const sessionStore = getSessionContext();
  const localeStore = getLocaleContext();
  const isEnglish = $derived(localeStore.current === 'en');
  const t = $derived(localeStore.t);

  let query = $state('');
  let libraryOpen = $state(false);
  let filtersOpen = $state(false);
  const libraryHash = $derived(page.url.hash);
  $effect(() => { libraryOpen = libraryHash === '#reading-library'; });
  let activeSection = $state<'all' | ArticleCategory>('all');
  let activeTag = $state('');
  let selectedArticle = $state<LibraryArticle | null>(null);
  let editingArticle = $state<LibraryArticle | null | 'new'>(null);
  let importJsonOpen = $state(false);
  let presenceCount = $state<number | null>(null);
  let catalogEnabled = $state(false);
  let downloadedPdfIds = $state<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const effectiveRole = $derived(sessionStore.value.user?.role ?? 'guest');
  const effectivePrincipal = $derived(sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null);
  const contentGuard = createSessionContentGuard(untrack(() => sessionStore.value));
  let previousHomepageRole = untrack(() => effectiveRole);
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialTargetId = initialParams?.get('article') || initialParams?.get('book') || initialParams?.get('id') || initialParams?.get('bai-viet') || initialParams?.get('bai_viet') || initialParams?.get('sach') || initialParams?.get('doc') || initialParams?.get('slug');
  let recoveredInitialReader = false;
  let singleArticleRequest = 0;

  let downloadedPdfGeneration = 0;
  async function refreshDownloadedPdfs() {
    const generation = ++downloadedPdfGeneration;
    const principal = effectivePrincipal;
    const token = contentGuard.capture();
    const isCurrent = () => generation === downloadedPdfGeneration
      && principal === effectivePrincipal && contentGuard.isCurrent(token);
    try {
      const records = await listOfflinePdfMetadata(principal);
      if (!isCurrent()) return;
      downloadedPdfIds = new Set(records.map((r) => r.documentId));
    } catch {
      if (!isCurrent()) return;
      downloadedPdfIds = new Set();
    }
  }

  $effect(() => {
    void effectivePrincipal;
    void effectiveRole;
    downloadedPdfIds = new Set();
    void refreshDownloadedPdfs();
  });

  const articlesQuery = createQuery(() => ({
    queryKey: serverStateKeys.articles.homepageForPrincipal(effectiveRole, effectivePrincipal),
    queryFn: ({ signal }) => fetchHomepageWithOfflinePdfs(fetch, effectiveRole, effectivePrincipal, signal),
    networkMode: 'always',
    refetchOnReconnect: 'always',
    enabled: catalogEnabled,
  }));

  const rawArticles = $derived(articlesQuery.data?.articles ?? []);
  // Trong tab Kinh Sách hiển thị sách khuyến thiện, nhân quả và sách khác; không hiển thị kinh và nghi thức (đã có trong mục Tu tập)
  const articles = $derived(
    rawArticles.filter((a) => {
      const cat = (a.category ?? '').trim().toUpperCase();
      return (
        cat !== 'KINH PHẬT' &&
        cat !== 'CÁC NGHI THỨC' &&
        cat !== 'TRÌ CHÚ' &&
        cat !== 'NGHI THỨC KHÁC' &&
        cat !== 'NGHI THỨC' &&
        (cat === 'SÁCH KHUYẾN THIỆN' || cat === 'KHÁC' || cat === 'CHUYỆN NHÂN QUẢ')
      );
    })
  );

  const localizedArticles = $derived(
    articles.map((article) => getLocalizedArticle(article, localeStore.current))
  );

  const offlineCatalog = $derived(articlesQuery.data?.offline ?? false);
  const canManage = $derived(!isNativeAdminReadOnly(effectiveRole) && (!offlineCatalog && (effectiveRole === 'admin' || effectiveRole === 'ctv')));
  const loading = $derived(articlesQuery.isPending);
  const loadError = $derived(!articlesQuery.data && articlesQuery.error instanceof Error ? articlesQuery.error.message : '');

  const popular = $derived(mostViewedArticles(localizedArticles));
  const normalFiltered = $derived(localizedArticles.filter((article: LibraryArticle) => {
    const sectionMatch = activeSection === 'all' || article.category === activeSection;
    const normalizedTag = activeTag.trim().toLocaleLowerCase('vi');
    const tagMatch = !normalizedTag || article.tags.some((tag) => tag.toLocaleLowerCase('vi').includes(normalizedTag));
    const searchMatch = matchesVietnameseSearch(
      [
        article.title,
        article.summary,
        article.author,
        article.originalTitle ?? '',
        article.originalSummary ?? '',
        article.originalAuthor ?? '',
        ...article.tags
      ],
      query
    );
    return sectionMatch && tagMatch && searchMatch;
  }).sort(compareContentRecency));

  const filtered = $derived(!query.trim() && !activeTag
    ? orderBookCatalog(normalFiltered) : normalFiltered);

  function selectTag(tag: string): void {
    triggerHaptic('selection');
    activeTag = activeTag === tag ? '' : tag;
    activeSection = 'all';
  }

  async function fetchSingleArticle(id: string): Promise<LibraryArticle | null> {
    try {
      const response = await fetchWithSessionRefresh(`/api/data/baiviet?id=eq.${encodeURIComponent(id)}&select=*`);
      if (!response.ok) return null;
      const rows = await response.json() as Array<Record<string, unknown>>;
      if (!rows.length) return null;
      const row = rows[0];
      const rawCategory = String(row.danh_muc ?? '').trim().toUpperCase();
      return {
        id: String(row.id ?? id),
        title: String(row.tieu_de ?? ''),
        summary: String(row.tom_tat ?? ''),
        content: String(row.noi_dung ?? ''),
        category: rawCategory as ArticleCategory,
        tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        author: String(row.tac_gia ?? 'Quang Từ'),
        imageUrl: String(row.anh_url ?? ''),
        featured: Number(row.noi_bat ?? 0) > 0,
        publishedAt: String(row.ngay_dang ?? ''),
        hasTableOfContents: Boolean(row.has_muc_luc),
        volumeCount: Number(row.so_tap ?? 0),
        status: String(row.trang_thai ?? ''),
        pdfUrl: resolvePdfUrl(row.pdf_url),
        externalUrl: String(row.link_ngoai ?? ''),
        viewCount: 0
      };
    } catch {
      return null;
    }
  }

  function loadSingleArticle(id: string, pushHistory = true): void {
    const request = ++singleArticleRequest;
    const token = contentGuard.capture();
    void fetchSingleArticle(id).then((article) => {
      if (request !== singleArticleRequest || !contentGuard.isCurrent(token)) return;
      if (article) openArticle(article, undefined, pushHistory);
    });
  }

  let initialReaderProgress = $state<ReadingProgressRecord | null>(null);
  let pushedArticleHistory = false;

  function openArticle(article: LibraryArticle, progress?: ReadingProgressRecord, pushHistory = true): void {
    triggerHaptic('light');
    initialReaderProgress = progress ?? null;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (progress || url.searchParams.get('article') !== article.id) url.searchParams.delete('annotation');
      url.searchParams.set('article', article.id);
      if (pushHistory) {
        pushedArticleHistory = true;
        window.history.pushState({ ...window.history.state, articleId: article.id }, '', url.toString());
      } else {
        window.history.replaceState({ ...window.history.state, articleId: article.id }, '', url.toString());
      }
    }
    selectedArticle = article;
  }

  function closeArticle(isFromPopState = false): void {
    singleArticleRequest += 1;
    triggerHaptic('selection');
    selectedArticle = null;
    initialReaderProgress = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quangtu:reading-progress-updated'));
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      url.searchParams.delete('annotation');
      url.searchParams.delete('book');
      url.searchParams.delete('id');
      url.searchParams.delete('bai-viet');
      url.searchParams.delete('bai_viet');
      url.searchParams.delete('sach');
      url.searchParams.delete('doc');
      url.searchParams.delete('slug');
      url.searchParams.delete('chap');
      const nextUrl = url.pathname + (url.search ? url.search : '');
      if (!isFromPopState && pushedArticleHistory) {
        pushedArticleHistory = false;
        window.history.back();
      } else {
        pushedArticleHistory = false;
        window.history.replaceState({ ...window.history.state, articleId: null }, '', nextUrl);
      }
    }
  }

  let checkedInitialUrl = false;
  $effect(() => {
    if (checkedInitialUrl || (loading && !articles.length)) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const searchQuery = params.get('q') || params.get('search');
    if (searchQuery && !query) {
      query = searchQuery;
    }
    const cat = params.get('cat') || params.get('danh-muc') || params.get('section');
    if (cat) {
      const matched = cat.toUpperCase();
      if (matched === 'ALL' || matched === 'TAT-CA') activeSection = 'all';
      else if (matched === 'SÁCH KHUYẾN THIỆN' || matched === 'SACH KHUYEN THIEN') activeSection = 'SÁCH KHUYẾN THIỆN';
      else if (matched === 'KHÁC' || matched === 'KHAC') activeSection = 'KHÁC';
      else activeSection = 'all';
    }
    const targetId = params.get('article') || params.get('book') || params.get('id') || params.get('bai-viet') || params.get('bai_viet') || params.get('sach') || params.get('doc') || params.get('slug');
    if (targetId) {
      checkedInitialUrl = true;
      const normalizedTarget = targetId.toLowerCase().trim();
      const found = articles.find((a) =>
        a.id === targetId ||
        a.id.toLowerCase() === normalizedTarget ||
        a.id.replace(/^book_/u, '').toLowerCase() === normalizedTarget ||
        a.title.toLowerCase().includes(normalizedTarget) ||
        matchesVietnameseSearch(a.title, normalizedTarget)
      );
      if (found) {
        openArticle(found, undefined, false);
      } else {
        if (!query) {
          query = targetId;
        }
        loadSingleArticle(targetId, false);
      }
    }
  });

  function finishAdminChange(): void {
    editingArticle = null;
  }

  onMount(() => {
    catalogEnabled = true;
    const stopPresence = listenPresence((snapshot) => presenceCount = snapshot?.activeCount ?? null);
    const openEditor = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: string }>).detail;
      if (detail?.mode === 'create' && canManage) editingArticle = 'new';
    };
    const openImportJson = () => {
      if (effectiveRole === 'admin') importJsonOpen = true;
    };
    const applyHomepageSession = (event: Event) => {
      const next = (event as CustomEvent<PageSessionDTO>).detail;
      const nextRole = next.user?.role ?? 'guest';
      const staleRole = previousHomepageRole;
      previousHomepageRole = nextRole;
      if (!contentGuard.transition(next)) return;
      downloadedPdfGeneration += 1;
      downloadedPdfIds = new Set();
      singleArticleRequest += 1;
      void queryClient.cancelQueries({ queryKey: serverStateKeys.articles.homepage(staleRole) });
      queryClient.removeQueries({ queryKey: serverStateKeys.articles.homepage(staleRole) });
      editingArticle = null;
      importJsonOpen = false;
      const currentUrl = new URL(window.location.href);
      const currentTarget = ['article', 'book', 'id', 'bai-viet', 'bai_viet', 'sach', 'doc', 'slug']
        .map(key => currentUrl.searchParams.get(key)).find(Boolean);
      const initialReaderUrl = !recoveredInitialReader && staleRole === 'guest' && next.authenticated
        && initialTargetId && currentTarget === initialTargetId && !pushedArticleHistory ? currentUrl : null;
      closeArticle();
      if (initialReaderUrl) {
        recoveredInitialReader = true;
        window.history.replaceState({ ...window.history.state, articleId: null }, '', initialReaderUrl.toString());
        checkedInitialUrl = false;
      }
    };

    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('article') || params.get('book') || params.get('id') || params.get('bai-viet') || params.get('bai_viet') || params.get('sach') || params.get('doc') || params.get('slug');
      if (!targetId) {
        pushedArticleHistory = false;
        closeArticle(true);
      } else if (selectedArticle?.id !== targetId) {
        const found = articles.find((a) => a.id === targetId);
        if (found) {
          openArticle(found, undefined, false);
        } else {
          loadSingleArticle(targetId, false);
        }
      }
    };

    const onOpenBook = (event: Event) => {
      const detail = (event as CustomEvent<{ bookId: string }>).detail;
      if (!detail?.bookId) return;
      const targetId = detail.bookId;
      const normalizedTarget = targetId.toLowerCase().trim();
      const found = articles.find((a) =>
        a.id === targetId ||
        a.id.toLowerCase() === normalizedTarget ||
        a.id.replace(/^book_/u, '').toLowerCase() === normalizedTarget ||
        a.title.toLowerCase().includes(normalizedTarget) ||
        matchesVietnameseSearch(a.title, normalizedTarget)
      );
      if (found) {
        openArticle(found);
      } else {
        loadSingleArticle(targetId);
      }
    };

    window.addEventListener('quangtu:open-book', onOpenBook);
    window.addEventListener('quangtu:article-editor', openEditor);
    window.addEventListener('quangtu:import-json', openImportJson);
    window.addEventListener('quangtu:offline-pdf-changed', refreshDownloadedPdfs);
    window.addEventListener(SESSION_CHANGE_EVENT, applyHomepageSession);
    window.addEventListener('popstate', onPopState);
    return () => {
      downloadedPdfGeneration += 1;
      stopPresence();
      window.removeEventListener('quangtu:open-book', onOpenBook);
      window.removeEventListener('quangtu:article-editor', openEditor);
      window.removeEventListener('quangtu:import-json', openImportJson);
      window.removeEventListener('quangtu:offline-pdf-changed', refreshDownloadedPdfs);
      window.removeEventListener(SESSION_CHANGE_EVENT, applyHomepageSession);
      window.removeEventListener('popstate', onPopState);
    };
  });

  const pageTitle = $derived(
    selectedArticle ? `${selectedArticle.title} — ${DEFAULT_SITE_NAME}` : `Kho Kinh Sách — ${DEFAULT_SITE_NAME}`
  );
  const metaDescription = $derived(
    cleanMetaDescription(selectedArticle?.summary, 'Kho kinh sách Phật giáo, truyện nhân quả và sách khuyến thiện.')
  );
  const absoluteImageUrl = $derived(
    ensureAbsoluteUrl(selectedArticle?.imageUrl, typeof window !== 'undefined' ? window.location.origin : 'https://quangtu.vn')
  );
  const imageMimeType = $derived(getImageMimeType(absoluteImageUrl));
  const canonicalUrl = $derived(
    selectedArticle
      ? `${(typeof window !== 'undefined' ? window.location.origin : 'https://quangtu.vn')}/kinh-sach?article=${encodeURIComponent(selectedArticle.id)}`
      : 'https://quangtu.vn/kinh-sach'
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="title" content={pageTitle} />
  <meta name="description" content={metaDescription} />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:type" content={selectedArticle ? 'article' : 'website'} />
  <meta property="og:site_name" content={DEFAULT_SITE_NAME} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={absoluteImageUrl} />
  <meta property="og:image:secure_url" content={absoluteImageUrl} />
  <meta property="og:image:type" content={imageMimeType} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={pageTitle} />
  <meta property="og:locale" content="vi_VN" />
  <meta name="robots" content="index, follow" />
</svelte:head>

<div class="kinh-sach-container">
  <h1 class="library-title">{localeStore.current === 'en' ? 'Sutra and Book Library' : 'Kho Kinh Sách'}</h1>
  {#if offlineCatalog}
    <p class="offline-catalog-notice" role="status">{t.library.offlineNotice}</p>
  {/if}

  <!-- 2. TOOLBAR TÌM KIẾM & DANH MỤC -->
  <div class="library-top-bar" use:catalogScrollArea>
    <details id="reading-library" class="library-disclosure" bind:open={libraryOpen}>
      <summary><span><BookOpen size={22} aria-hidden="true" />{localizeUi("Thư viện của bạn")}{activeSection !== 'all' || activeTag ? ' •' : ''}</span><ChevronDown size={20} aria-hidden="true" /></summary>
      <ContinueReadingShelf articles={localizedArticles} session={sessionStore.value} onOpen={openArticle} compactLibrary={true} />
    <a class="library-my-quotes" href="/trich-dan-cua-toi">
      <span class="library-my-quotes-title">
        <Bookmark size={22} aria-hidden="true" />
        <span>{isEnglish ? 'My quotes' : localizeUi("Trích dẫn của tôi")}</span>
      </span>
      <span class="library-my-quotes-arrow" aria-hidden="true">→</span>
    </a>
    </details>
    <div class="toolbar">
      <div class="toolbar-inner">
        <label class="search-wrap" class:has-query={Boolean(query)}>
          <span class="visually-hidden">{isEnglish ? "Search books" : localizeUi("Tìm kiếm bài viết")}</span>
          {#if !query}<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>{/if}
          <input class="search-input" type="search" aria-label={isEnglish ? "Search books" : localizeUi("Tìm kiếm bài viết")} placeholder={t.library.searchPlaceholder} bind:value={query} />
          {#if query}
            <button class="search-clear-btn" type="button" aria-label={localizeUi("Xóa tìm kiếm")} onclick={() => { query = ''; }}>✕</button>
          {/if}
          <PresenceChip count={presenceCount} hidden={presenceCount === null} />
        </label>
        <button class="library-options-toggle" type="button" aria-expanded={filtersOpen} aria-controls="library-options" onclick={() => filtersOpen = !filtersOpen}><SlidersHorizontal size={18} aria-hidden="true" />{isEnglish ? 'Filter' : localizeUi('Lọc')}{activeSection !== 'all' || activeTag ? ' •' : ''}</button>
        <TopTenDialog title={localizeUi("Top 10 sách được xem nhiều nhất")} {loading} unit={localizeUi("lượt xem")}
          error={''}
          items={popular.map((article) => ({ id: article.id, title: article.title, count: article.viewCount ?? 0, image: article.imageUrl }))}
          onOpen={(id) => { const article = articles.find((item) => item.id === id); if (article) openArticle(article); }} />
      </div>
    </div>
  </div>

  {#if filtersOpen}
  <div id="library-options" class="library-options">
    <div class="library-options-filters">
        <div class="library-book-type">
          <div class="library-options-header">
            <label for="library-category">{isEnglish ? 'Book type' : localizeUi("Loại sách")}</label>
            <span class="count-badge">{filtered.length} {localizeUi("bài viết")}</span>
          </div>
          <div class="category-select-wrap">
          <select 
            id="library-category"
            class="category-select" 
            bind:value={activeSection} 
            onchange={() => { activeTag = ''; }}
            aria-label={localizeUi("Lọc theo danh mục")}
          >
            {#each LIBRARY_SECTIONS as section}
              {#if section.key === 'all' || articles.some(a => a.category === section.key)}
                <option value={section.key}>{section.icon} {isEnglish ? englishText(section.label) : section.label}</option>
              {/if}
            {/each}
          </select>
          </div>
        </div>
        {#if activeTag}<button class="library-options-toggle" type="button" onclick={() => activeTag = ''}>{activeTag} <span aria-hidden="true">×</span><span class="visually-hidden">{localizeUi("Xóa lọc")}</span></button>{/if}
    </div>
  </div>
  {/if}

  <!-- 4. LƯỚI BÀI VIẾT & SIDEBAR -->
  <div class="page-wrap library-results">
    <div class="articles-column">
      <main class="articles-grid" aria-live="polite" aria-busy={loading}>
        {#if loading}
          <p class="visually-hidden" role="status">{t.common.loading}</p>
          {#each Array(5) as _, index}
            <ArticleCardSkeleton
              featured={index === 0}
              short={index === 1}
              compact={index >= 3}
            />
          {/each}
        {:else if loadError}
          <div class="state-box"><span class="ico" aria-hidden="true">⚠️</span><p>{loadError}</p><button type="button" onclick={() => void articlesQuery.refetch()}>🔄 {localeStore.current === 'en' ? 'Retry' : 'Thử lại'}</button></div>
        {:else if filtered.length === 0}
          <div class="state-box"><span class="ico" aria-hidden="true">{articles.length ? '🔍' : '📿'}</span><p>{articles.length ? (localeStore.current === 'en' ? 'No matching scriptures found.' : 'Không tìm thấy bài viết phù hợp.') : (localeStore.current === 'en' ? 'No scriptures yet.' : 'Chưa có bài viết nào.')}</p></div>
        {:else}
          {#each filtered as article, index (article.id)}
            <ArticleCard
              {article}
              featured={index === 0 && activeSection === 'all' && !query && !activeTag}
              mostViewed={index === 0 && !query && !activeTag}
              isDownloaded={downloadedPdfIds.has(article.id)}
              onOpen={openArticle}
              onTag={selectTag}
            />
          {/each}
        {/if}
      </main>
    </div>
  </div>


  <!-- TRÌNH ĐỌC BÀI VIẾT TOÀN MÀN HÌNH -->
  <ReaderBoundary article={selectedArticle} articles={localizedArticles} initialProgress={initialReaderProgress} session={sessionStore.value} onOpen={openArticle} onClose={closeArticle} />
</div>

<style>
  .library-title{font-size:var(--font-size-section-title);line-height:1.3;text-align:center}
  .library-disclosure{max-width:1160px;margin:0 auto;padding-inline:calc(var(--space-page)*1.4)}
  .library-disclosure>summary{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--space-page)/2);min-height:calc(var(--space-page)*2.4);padding-block:calc(var(--space-page)/2);border-bottom:1px solid var(--border2);font-weight:700;cursor:pointer;list-style:none}
  .library-disclosure>summary::-webkit-details-marker{display:none}
  .library-disclosure>summary>span{display:flex;align-items:center;gap:calc(var(--space-page)*.6)}
  .library-disclosure>summary>span :global(svg){color:var(--gold)}
  .library-disclosure[open]>summary>:global(svg){transform:rotate(180deg)}
  .library-disclosure>summary:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .library-disclosure :global(.compact-library){margin-block:calc(var(--space-page)/2);padding-inline:0}
  .kinh-sach-container :global(.toolbar-inner){display:grid;grid-template-columns:minmax(0,1fr) auto auto;justify-content:flex-start;gap:calc(var(--space-page)/2);padding-block:calc(var(--space-page) / 2)}
  .kinh-sach-container :global(.search-wrap){display:flex;align-items:center;gap:calc(var(--space-page)/4);max-width:none;min-width:0;padding-right:calc(var(--space-page)/4);border:1px solid var(--border2);border-radius:var(--radius-feature);background:var(--bg2);overflow:hidden}
  .kinh-sach-container :global(.search-wrap:focus-within){outline:2px solid var(--gold);outline-offset:2px}
  .kinh-sach-container :global(.search-input){flex:1;min-width:0;min-height:44px;padding-right:0;border:0;background:transparent;box-shadow:none}
  .kinh-sach-container :global(.search-input[type="search"]::-webkit-search-cancel-button){-webkit-appearance:none;appearance:none}
  .kinh-sach-container :global(.search-wrap.has-query .search-input){padding-left:44px}
  .kinh-sach-container :global(.search-clear-btn){left:0;right:auto}
  .kinh-sach-container :global(.search-wrap .presence-chip){position:static;flex:0 1 auto;min-width:0;max-width:45%;transform:none}
  .kinh-sach-container :global(.search-wrap .presence-chip>span:last-child){overflow:hidden;text-overflow:ellipsis}
  .library-options-toggle{display:inline-flex;align-items:center;justify-content:center;gap:calc(var(--space-page) / 4);min-height:44px;padding:8px 16px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);font:600 13px var(--font-app);white-space:nowrap;cursor:pointer}
  .library-options-toggle:focus-visible,.library-my-quotes:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .library-options{max-width:1160px;margin:0 auto;padding:calc(var(--space-page) * .9);border:1px solid var(--border2);border-radius:14px;background:var(--card);box-shadow:0 2px 10px rgba(0,0,0,.06)}
  :root[data-theme="dark"] .library-options{background:var(--bg2);border-color:var(--border2)}
  .library-options-filters{display:flex;flex-direction:column;gap:10px}
  .library-book-type{display:grid;min-width:0;gap:8px}
  .library-options-header{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .library-options-header>label{font-size:13px;font-weight:700;color:var(--gold2)}
  .library-my-quotes{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--space-page) / 2);min-height:calc(var(--space-page)*3.8);min-width:44px;margin-block:var(--space-page);padding:calc(var(--space-page)*.8);border:1px solid var(--border2);border-radius:var(--radius-control);background:var(--bg2);color:var(--text);font-weight:600;font-size:var(--font-size-card-title);text-decoration:none;transition:all .2s ease}
  :root[data-theme="dark"] .library-my-quotes{background:var(--bg3);border-color:var(--border2)}
  .library-my-quotes:hover{background:var(--gold-light);border-color:var(--gold);color:var(--gold2)}
  .library-my-quotes-title{display:inline-flex;align-items:center;gap:8px}
  .library-my-quotes-title :global(svg){color:var(--gold)}
  .library-my-quotes-arrow{font-weight:700;color:var(--gold);transition:transform .2s}
  .library-my-quotes:hover .library-my-quotes-arrow{transform:translateX(4px)}
  .library-options :global(.category-select){min-height:44px;max-width:100%;border:1px solid var(--border2);border-radius:var(--radius-control);background:var(--bg);color:var(--text);padding:0 12px;font-size:13px;font-weight:600}
  :root[data-theme="dark"] .library-options :global(.category-select){background:var(--bg3);border-color:var(--border2)}
  .library-options :global(.count-badge){display:inline-flex;align-items:center;padding:3px 9px;border-radius:12px;background:var(--bg3);color:var(--muted);font-size:11.5px;font-weight:600}
  .library-results{grid-template-columns:minmax(0,1fr)}
  @media(max-width:600px){
    .kinh-sach-container :global(.toolbar-inner){grid-template-columns:minmax(0,1fr) auto auto;gap:calc(var(--space-page) / 2)}
    .library-disclosure{padding-inline:var(--radius-control)}
    .library-options{margin-inline:var(--radius-control);padding:var(--radius-control)}
    .library-book-type{flex-basis:100%}
    .library-options-filters :global(.category-select-wrap){width:100%}
    .library-options-filters :global(.category-select){width:100%}
  }
  .kinh-sach-container {
    width: 100%;
    padding-top: 8px;
  }
  .offline-catalog-notice {
    max-width: 1100px;
    margin: 12px auto;
    padding: 12px 18px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--gold-light);
    color: var(--text);
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  @media (max-width: 768px) {
    .kinh-sach-container {
      padding-top: 4px;
    }
  }

</style>
