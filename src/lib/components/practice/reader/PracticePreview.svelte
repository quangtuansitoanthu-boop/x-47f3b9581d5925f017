<script lang="ts">
  import { uiScrollBehavior } from '$lib/browser/ui-motion';
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  import { savedContentImages } from '$lib/browser/session-cover';
  let releaseBodyScroll: (() => void) | null = null;
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import { renderReaderContent } from '$lib/components/reader/content-renderer';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import type { PracticeArticleDetail, PracticeChapterContent, PracticeChapterPreview } from '$lib/domain/practice/state';
  import ReaderToolbar from '$lib/components/reader/ReaderToolbar.svelte';
  import ReaderImageLightbox from '$lib/components/reader/ReaderImageLightbox.svelte';
  import ReaderToast from '$lib/components/reader/ReaderToast.svelte';
  import { createReaderTextToSpeech } from '$lib/components/reader/reader-text-to-speech';
  import { createReaderBookmarkAdapter, restoreReaderScroll } from '$lib/browser/reader-bookmarks';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { hasEnglishReadingContent, ENGLISH_TRANSLATION_NOTICE, prepareLocalizedReadingContent, localizeChapterTitle } from '$lib/domain/library/localized-article';
  import { isHtmlResponse } from '$lib/browser/native-api';

  interface ReaderSession {
    authenticated: boolean;
    csrfToken?: string | null;
    user?: null | { id: string };
  }

  interface Props {
    article: PracticeArticleDetail;
    chapterContent: PracticeChapterContent | null;
    chapters: PracticeChapterPreview[];
    currentChapterIndex: number | null;
    fontSize?: number;
    onBack: () => void;
    onChapterOpen: (index: number) => void;
    onChapterClose?: () => void;
    onStartPractice: () => void;
    onEnglishContentReady?: (articleId: string, content: string | null) => void;
    readBackground?: string;
    onFontSizeChange?: (size: number) => void;
    onBackgroundChange?: (background: string) => void;
    session?: ReaderSession;
  }

  let {
    article,
    chapterContent,
    chapters,
    currentChapterIndex,
    fontSize: initialFontSize = 15,
    onBack,
    onChapterOpen,
    onChapterClose = () => {},
    onStartPractice,
    onEnglishContentReady = () => {},
    readBackground = 'cream',
    onFontSizeChange = () => {},
    onBackgroundChange = () => {},
    session = { authenticated: false }
  }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const ritualHeadingLines = $derived.by(() => {
    const id = article.id.replace(/^book_/u, '');
    if (id === 'tt_nghi_thuc_tri_chu_bao_khiep_an') {
      return isEn ? ['Treasure Chest Seal Dhāraṇī', 'Recitation Ritual'] : ['Nghi thức trì chú', 'Bảo Khiếp Ấn Đà Ra Ni'];
    }
    if (id === 'tt_nghi_thuc_tho_tri_dai_tuy_cau') {
      return isEn ? ['Great Mahāpratisarā Dhāraṇī', 'Practice Ritual'] : ['Nghi thức thọ trì', 'Đại Tùy Cầu Tức Đắc Đà La Ni'];
    }
    return null;
  });
  // shared helper kept in sync with ReaderBoundary/tu-tap
  const t = $derived(localeStore.t.practice);
  let singleArticleEnContent = $state<string | null>(null);
  const previewEnglishAvailable = $derived(hasEnglishReadingContent(article.id, singleArticleEnContent));
  const showPreviewEnglishFallback = $derived(localeStore.current === 'en' && !previewEnglishAvailable);
  const showPreviewEnglishDraft = $derived(localeStore.current === 'en' && previewEnglishAvailable);

  function getLocalizedChapterTitle(title: string | undefined): string {
    return localizeChapterTitle(title, localeStore.current);
  }

  let fontSize = $state(15);
  let bold = $state(false);
  let background = $state('cream');
  let fontFamily = $state('bookerly');
  let lineHeight = $state(1.9);
  let textAlign = $state<'justify' | 'left'>('justify');
  let ttsSpeed = $state(1);
  let ttsVoice = $state('auto');
  let autoScrollActive = $state(false);
  let autoScrollSpeed = $state(0.5);
  let bookmarked = $state(false);
  let ttsActive = $state(false);
  let ttsLoading = $state(false);
  let autoFrame: number | null = null;
  let autoFrameTime = 0;

  let scrollArea = $state<HTMLElement | null>(null);
  let contentArea = $state<HTMLElement | null>(null);
  let lightboxSource = $state('');
  let lightboxAlt = $state('');
  let lightboxTrigger: HTMLElement | null = null;
  let toastMessage = $state('');
  let toastVisible = $state(false);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let toastFrame: number | null = null;

  $effect(() => {
    const curLocale = localeStore.current;
    const curArticle = article;
    const notifyEnglishContent = untrack(() => onEnglishContentReady);
    const controller = new AbortController();
    let active = true;
    singleArticleEnContent = null;
    if (curLocale === 'en' && curArticle && !curArticle.hasTableOfContents) {
      notifyEnglishContent(curArticle.id, null);
      void fetch('/offline-data/articles-en.json', { signal: controller.signal })
        .then((r) => r.ok && !isHtmlResponse(r) ? r.json() : null)
        .then((map) => {
          if (!active || !map) return;
          const item = map[curArticle.id] || map[curArticle.id.replace(/^book_/u, '')] || map[`book_${curArticle.id}`];
          if (typeof item?.noi_dung === 'string' && item.noi_dung.trim()) {
            singleArticleEnContent = item.noi_dung;
            notifyEnglishContent(curArticle.id, item.noi_dung);
          }
        })
        .catch(() => {});
    }
    return () => { active = false; controller.abort(); };
  });

  const fullContent = $derived(
    (localeStore.current === 'en' && singleArticleEnContent)
      ? singleArticleEnContent
      : article.content
  );
  const fullContentHtml = $derived(fullContent.trim() ? renderReaderContent(prepareLocalizedReadingContent(fullContent, localeStore.current)) : '');
  const activeContentHtml = $derived(chapterContent?.content.trim()
    ? renderReaderContent(prepareLocalizedReadingContent(chapterContent.content, localeStore.current))
    : chapters.length === 0 ? fullContentHtml : '');

  const activeFontCss = $derived(
    fontFamily === 'merriweather' ? "'Merriweather', Georgia, serif"
    : fontFamily === 'literata' ? "'Literata', Georgia, serif"
    : fontFamily === 'be-vietnam-pro' ? "var(--font-app)"
    : "var(--font-reader)"
  );

  const isReadingChapter = $derived(currentChapterIndex !== null && chapters.length > 0);
  const isSingleTextScripture = $derived(chapters.length === 0 && !article.hasTableOfContents);
  const rawChapterTitle = $derived(
    chapterContent?.title || (currentChapterIndex !== null ? chapters[currentChapterIndex]?.title : '') || article.title
  );
  const currentChapterTitle = $derived(getLocalizedChapterTitle(rawChapterTitle));

  function hasChapterVideo(chap: { title?: string; summary?: string } | undefined | null): boolean {
    if (!chap) return false;
    return Boolean(
      (chap.summary && (chap.summary.includes('[Có Video]') || chap.summary.includes('[Video]'))) ||
      (chap.title && /video/i.test(chap.title))
    );
  }

  function cleanChapterSummary(summary: string | undefined | null): string {
    return summary ? summary.replace(/^\[(?:Có )?Video\]\s*/i, '') : '';
  }

  function getResolvedBackground(isDark: boolean, configuredBackground: string): string {
    if (typeof localStorage === 'undefined') return isDark ? 'dark' : (configuredBackground || 'cream');
    if (isDark) {
      const savedDarkBg = localStorage.getItem('tutam_read_bg_dark');
      if (savedDarkBg === 'dark' || savedDarkBg === 'cream') return savedDarkBg;
      return 'dark';
    }
    const savedLightBg = localStorage.getItem('tutam_read_bg') || configuredBackground;
    if (savedLightBg === 'cream' || savedLightBg === 'gray' || savedLightBg === 'white') return savedLightBg;
    return 'cream';
  }

  function normalizeBackground(value: string, isDark: boolean): string {
    if (isDark) return value === 'cream' ? 'cream' : 'dark';
    return value === 'cream' || value === 'gray' || value === 'white' || value === 'dark' ? value : 'cream';
  }

  function activePrincipal(): string {
    return session.authenticated && session.user?.id ? session.user.id : 'anonymous';
  }

  function bookmarkAdapter() {
    return createReaderBookmarkAdapter(typeof localStorage !== 'undefined' ? localStorage : ({} as Storage), activePrincipal());
  }

  function persistSettings(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('tutam_read_fontsize', String(fontSize));
    localStorage.setItem('tutam_read_bold', bold ? '1' : '0');
    const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
    if (isDark) {
      localStorage.setItem('tutam_read_bg_dark', background);
    } else {
      localStorage.setItem('tutam_read_bg', background);
    }
    localStorage.setItem('tutam_read_font', fontFamily);
    localStorage.setItem('tutam_read_line_height', String(lineHeight));
    localStorage.setItem('tutam_read_align', textAlign);
    localStorage.setItem('tutam_read_tts_speed', String(ttsSpeed));
    localStorage.setItem('tutam_read_tts_voice', ttsVoice);
  }

  function notify(message: string): void {
    toastMessage = message;
    toastVisible = false;
    if (toastTimer) clearTimeout(toastTimer);
    if (toastFrame !== null) cancelAnimationFrame(toastFrame);
    toastFrame = requestAnimationFrame(() => {
      toastFrame = null;
      toastVisible = true;
    });
    toastTimer = setTimeout(() => {
      toastVisible = false;
      toastTimer = null;
    }, message.startsWith('❌') ? 5000 : 3000);
  }

  const ttsController = createReaderTextToSpeech({
    getContent: () => contentArea,
    getScrollArea: () => isSingleTextScripture ? (typeof document !== 'undefined' ? document.documentElement : null) : scrollArea,
    onNotify: notify,
    getVoice: () => ttsVoice,
    getLocale: () => localeStore.current,
    onState: (state) => {
      ttsLoading = state === 'loading';
      ttsActive = state === 'playing';
    }
  });

  function font(delta: number): void {
    fontSize = Math.min(45, Math.max(13, fontSize + delta));
    persistSettings();
    onFontSizeChange(fontSize);
  }

  function toggleBold(): void {
    bold = !bold;
    persistSettings();
  }

  function changeBackground(value: string): void {
    background = value;
    persistSettings();
    onBackgroundChange(value);
  }

  function changeFontFamily(value: string): void {
    fontFamily = value;
    persistSettings();
  }

  function changeLineHeight(value: number): void {
    lineHeight = value;
    persistSettings();
  }

  function changeTextAlign(value: 'justify' | 'left'): void {
    textAlign = value;
    persistSettings();
  }

  function changeTtsSpeed(value: number): void {
    ttsSpeed = value;
    ttsController.setRate(value);
    persistSettings();
  }

  function changeTtsVoice(voice: string): void {
    ttsVoice = voice;
    ttsController.setVoice(voice);
    persistSettings();
  }

  function toggleBookmark(): void {
    if (!article) return;
    const currentScroll = isSingleTextScripture
      ? (typeof window !== 'undefined' ? Math.round(window.scrollY) : 0)
      : Math.round(scrollArea?.scrollTop || 0);
    bookmarked = bookmarkAdapter().toggle({
      articleId: article.id,
      articleTitle: article.title,
      chapterIndex: currentChapterIndex,
      chapterTitle: currentChapterTitle,
      scrollTop: currentScroll
    });
    notify(bookmarked
      ? (localeStore.current === 'en' ? '✓ Bookmarked!' : '✓ Đã đánh dấu trang!')
      : (localeStore.current === 'en' ? 'Bookmark removed' : 'Đã bỏ đánh dấu trang'));
  }

  async function goToBookmark(): Promise<void> {
    if (!article) return;
    const bookmark = bookmarkAdapter().find(article.id);
    if (!bookmark) {
      bookmarked = false;
      return;
    }
    if (isSingleTextScripture) {
      if (typeof window !== 'undefined' && bookmark.scrollTop > 0) {
        window.scrollTo({ top: bookmark.scrollTop, behavior: uiScrollBehavior() });
      }
      notify(localeStore.current === 'en' ? '📖 Jumped to bookmark' : '📖 Đang ở vị trí đánh dấu');
      return;
    }
    if (bookmark.chapIdx !== null && bookmark.chapIdx < chapters.length) {
      if (bookmark.chapIdx !== currentChapterIndex) {
        onChapterOpen(bookmark.chapIdx);
      }
      await tick();
      const target = scrollArea;
      if (target && bookmark.scrollTop > 0) {
        restoreReaderScroll(target, bookmark.scrollTop, requestAnimationFrame, () => true);
      }
      notify(`📖 Tiếp tục đọc: ${bookmark.chapTitle || `Phẩm ${bookmark.chapIdx + 1}`}`);
      return;
    }
    const target = scrollArea;
    if (target && bookmark.scrollTop > 0) {
      restoreReaderScroll(target, bookmark.scrollTop, requestAnimationFrame, () => true);
    }
    notify('📖 Đang ở vị trí đánh dấu');
  }

  function stopTts(): void {
    ttsController.stop();
  }

  function speak(): void {
    ttsController.toggle();
  }

  function stopAutoScroll(): void {
    if (autoFrame !== null) cancelAnimationFrame(autoFrame);
    autoFrame = null;
    autoFrameTime = 0;
    autoScrollActive = false;
  }

  function autoScrollFrame(time: number): void {
    if (!autoScrollActive) return stopAutoScroll();
    if (isSingleTextScripture) {
      if (typeof window === 'undefined') return stopAutoScroll();
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (window.scrollY >= maxScroll - 1) return stopAutoScroll();
      if (autoFrameTime) window.scrollBy(0, autoScrollSpeed * ((time - autoFrameTime) / 16.667));
      autoFrameTime = time;
      autoFrame = requestAnimationFrame(autoScrollFrame);
      return;
    }
    if (!scrollArea) return stopAutoScroll();
    if (scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1) return stopAutoScroll();
    if (autoFrameTime) scrollArea.scrollTop += autoScrollSpeed * ((time - autoFrameTime) / 16.667);
    autoFrameTime = time;
    autoFrame = requestAnimationFrame(autoScrollFrame);
  }

  function autoScroll(): void {
    if (autoScrollActive) return stopAutoScroll();
    autoScrollActive = true;
    autoFrame = requestAnimationFrame(autoScrollFrame);
  }

  function changeAutoScrollSpeed(speed: number): void {
    autoScrollSpeed = speed;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tutam_auto_scroll_speed', String(speed));
    }
  }

  function fallbackCopy(value: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      notify(document.execCommand('copy') ? (isEn ? 'Article link copied!' : 'Đã copy link bài viết!') : (isEn ? 'Browser does not support automatic copying' : 'Trình duyệt không hỗ trợ copy tự động'));
    } catch {
      notify(isEn ? 'Failed to copy link!' : 'Lỗi khi copy link!');
    } finally {
      textArea.remove();
    }
  }

  async function share(): Promise<void> {
    if (typeof location === 'undefined') return;
    const shareUrl = location.href;
    const title = currentChapterTitle ? `${currentChapterTitle} - ${article.title}` : article.title;
    const data = { title, text: title, url: shareUrl };
    if (navigator.share) {
      await navigator.share(data).catch(() => {});
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl)
        .then(() => notify(isEn ? 'Article link copied!' : 'Đã copy link bài viết!'))
        .catch(() => fallbackCopy(shareUrl));
      return;
    }
    fallbackCopy(shareUrl);
  }

  function readerImageAction(node: HTMLElement) {
    const enhance = () => node.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', image.alt ? (isEn ? `Open image: ${image.alt}` : `Mở ảnh: ${image.alt}`) : (isEn ? 'Open illustration image' : 'Mở ảnh minh họa'));
    });
    const click = (event: MouseEvent) => openContentImage(event.target);
    const keydown = (event: KeyboardEvent) => contentKeydown(event);
    const observer = new MutationObserver(enhance);
    observer.observe(node, { childList: true, subtree: true });
    node.addEventListener('click', click);
    node.addEventListener('keydown', keydown);
    enhance();
    return {
      update: enhance,
      destroy: () => {
        observer.disconnect();
        node.removeEventListener('click', click);
        node.removeEventListener('keydown', keydown);
      }
    };
  }

  function openContentImage(target: EventTarget | null): boolean {
    const image = target instanceof HTMLImageElement ? target : target instanceof HTMLElement ? target.closest<HTMLImageElement>('img') : null;
    if (!image || !image.src) return false;
    lightboxTrigger = image;
    lightboxSource = image.currentSrc || image.src;
    lightboxAlt = image.alt || (isEn ? 'Article illustration image' : 'Ảnh minh họa bài viết');
    return true;
  }

  function contentKeydown(event: KeyboardEvent): void {
    if ((event.key === 'Enter' || event.key === ' ') && openContentImage(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function closeLightbox(): void {
    const trigger = lightboxTrigger;
    lightboxSource = '';
    lightboxAlt = '';
    lightboxTrigger = null;
    void tick().then(() => trigger?.focus());
  }

  function updateRouteHeader(active: boolean): void {
    document.dispatchEvent(new CustomEvent('qts:practice-header', {
      detail: active
        ? { active: true, backLabel: isEn ? 'Back' : 'Quay lại', onBack: handlePreviewBack, title: article.title }
        : { active: false }
    }));
  }

  function handleCloseChapter(): void {
    stopTts();
    stopAutoScroll();
    onChapterClose();
  }

  function handlePreviewBack(): void {
    if (isReadingChapter) handleCloseChapter();
    else onBack();
  }

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      fontSize = Math.min(45, Math.max(13, Number(localStorage.getItem('tutam_read_fontsize') || initialFontSize || 15)));
      bold = localStorage.getItem('tutam_read_bold') === '1';
      const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
      background = getResolvedBackground(isDark, readBackground);
      fontFamily = localStorage.getItem('tutam_read_font') || 'bookerly';
      lineHeight = Number(localStorage.getItem('tutam_read_line_height') || 1.9) || 1.9;
      textAlign = localStorage.getItem('tutam_read_align') === 'left' ? 'left' : 'justify';
      ttsSpeed = Number(localStorage.getItem('tutam_read_tts_speed') || 1) || 1;
      ttsVoice = 'auto';
      ttsController.setRate(ttsSpeed);
      ttsController.setVoice(ttsVoice);
      autoScrollSpeed = Number(localStorage.getItem('tutam_auto_scroll_speed') || 0.5) || 0.5;
    }
    updateRouteHeader(true);
    return () => {
      stopTts();
      stopAutoScroll();
      ttsController.destroy();
      if (toastTimer) clearTimeout(toastTimer);
      if (toastFrame !== null) cancelAnimationFrame(toastFrame);
      updateRouteHeader(false);
      if (typeof document !== 'undefined') {
        releaseBodyScroll?.(); releaseBodyScroll = null;
      }
    };
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    background = getResolvedBackground(isDark, readBackground);
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      releaseBodyScroll?.(); releaseBodyScroll = null;
    }
  });

  $effect(() => {
    if (typeof document !== 'undefined') {
      if (isReadingChapter) {
        releaseBodyScroll ??= acquireScrollLock();
      } else {
        releaseBodyScroll?.(); releaseBodyScroll = null;
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        releaseBodyScroll?.(); releaseBodyScroll = null;
      }
    };
  });

  $effect(() => {
    // When switching chapters, stop TTS and scroll to top
    if (currentChapterIndex !== null) {
      stopTts();
      stopAutoScroll();
      if (scrollArea) scrollArea.scrollTo({ top: 0 });
      if (article) {
        const bookmark = bookmarkAdapter().find(article.id);
        bookmarked = bookmark?.chapIdx === currentChapterIndex;
      }
    } else if (article) {
      // In single text preview mode, ensure window is at top on open
      if (typeof window !== 'undefined') {
        window.scrollTo({ behavior: 'instant', top: 0, left: 0 });
      }
      const bookmark = bookmarkAdapter().find(article.id);
      bookmarked = bookmark !== null;
    }
  });

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (lightboxSource) closeLightbox();
      else if (isReadingChapter) handleCloseChapter();
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<section
  class="tt-preview practice-theme"
  data-practice={article.category}
  class:tt-preview--reading={isReadingChapter}
  data-read-bg={isReadingChapter ? background : readBackground}
  aria-label={isEn ? 'Practice Scripture Preview' : 'Xem trước bài tu tập'}
>
  {#if !isReadingChapter}
    <!-- OVERVIEW / TOC MODE -->
    <div class="tt-preview__wrap">
      <header class="tt-preview__header">
        <span class="tt-preview__category">{article.category === 'TRÌ CHÚ' ? `🙏 ${isEn ? 'Mantra Recitation' : 'Trì chú'}` : article.category === 'KINH PHẬT' ? `📖 ${t.categorySutras}` : `🙏 ${t.categoryRituals}`}</span>
        <h1 class:tt-ritual-heading={ritualHeadingLines !== null}>{#if ritualHeadingLines}{#each ritualHeadingLines as line, index}<span>{index > 0 ? ' ' : ''}{line}</span>{/each}{:else}{article.title}{/if}</h1>
        {#if showPreviewEnglishFallback}
          <p class="preview-en-fallback" role="status">English version is in progress. Showing Vietnamese original below — bundled offline in the app.</p>
        {:else if showPreviewEnglishDraft}
          <p class="preview-en-fallback preview-en-draft" role="status">{ENGLISH_TRANSLATION_NOTICE}</p>
        {/if}
        <div class="tt-preview__meta">
          <span>📅 {formatVietnamDate(article.publishedAt, localeStore.current)}</span>
          {#if article.author}<span>✍️ {article.author}</span>{/if}
        </div>
      </header>

      <div class="tt-preview__start-card">
        <button class="tt-preview__start" type="button" onclick={onStartPractice}>
          <span aria-hidden="true">🙏</span>
          {t.startSessionCard}
        </button>
        <p>{t.startSessionCardDesc}</p>
      </div>

      {#if chapters.length > 0}
        <div class="tt-preview__toc">
          <div class="tt-preview__toc-header">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            <strong>{t.tocHeader}</strong>
            <small>{chapters.length} {t.chaptersUnit}</small>
          </div>
          <div class="tt-preview__toc-list">
            {#each chapters as chapter}
              <button
                class:active={chapter.index === currentChapterIndex}
                type="button"
                onclick={() => onChapterOpen(chapter.index)}
              >
                <span class="tt-preview__chapter-number">{chapter.index + 1}</span>
                <span class="tt-preview__chapter-copy">
                  <span class="tt-preview__chapter-title-row">
                    <strong>{getLocalizedChapterTitle(chapter.title)}</strong>
                    {#if hasChapterVideo(chapter)}
                      <span class="toc-video-badge" title={isEn ? 'Chapter includes companion video' : 'Bài pháp có video kèm theo'}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M4 5a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2v-3.333l3.414 1.707A1 1 0 0023 14.472V9.528a1 1 0 00-1.586-.895L18 10.333V7a2 2 0 00-2-2H4zm10 2v10H4V7h10z" />
                        </svg>
                        <span>Video</span>
                      </span>
                    {/if}
                  </span>
                  {#if chapter.summary}<small>{cleanChapterSummary(chapter.summary)}</small>{/if}
                </span>
                <span class="tt-preview__chapter-action">
                  <span>{t.readChapter}</span>
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>
                </span>
              </button>
            {/each}
          </div>
          <p class="tt-preview__toc-hint">{t.tocHint}</p>
        </div>
      {/if}

      {#if article.hasTableOfContents && chapters.length === 0}
        <div class="tt-preview__loading" aria-live="polite">
          <div class="tt-preview__spinner"></div>
          <p>{t.loadingToc}</p>
        </div>
      {:else if isSingleTextScripture}
        <!-- Single text without chapters: show standard reader toolbar and content -->
        <div class="tt-single-reader">
          <ReaderToolbar
            {fontSize}
            {bold}
            {background}
            {fontFamily}
            {lineHeight}
            {textAlign}
            {ttsSpeed}
            {ttsVoice}
            {bookmarked}
            {ttsActive}
            {ttsLoading}
            {autoScrollActive}
            {autoScrollSpeed}
            onFont={font}
            onBold={toggleBold}
            onBackground={changeBackground}
            onFontFamily={changeFontFamily}
            onLineHeight={changeLineHeight}
            onTextAlign={changeTextAlign}
            onTtsSpeed={changeTtsSpeed}
            onTtsVoice={changeTtsVoice}
            onBookmark={toggleBookmark}
            onSpeak={speak}
            onShare={share}
            onAutoScroll={autoScroll}
            onAutoScrollSpeed={changeAutoScrollSpeed}
            onNotify={notify}
            onClose={onBack}
          />
          <article class="reader-body" style={`font-size:${fontSize}px`}>
            <div
              class:bold
              class="reader-content"
              style={`--reader-font:${activeFontCss};--reader-lh:${lineHeight};--reader-align:${textAlign}`}
              bind:this={contentArea}
              use:readerImageAction
              use:savedContentImages
            >
              {@html fullContentHtml}
            </div>
          </article>
        </div>
      {/if}
    </div>
  {:else}
    <!-- CHAPTER READING MODE: IDENTICAL TO NORMAL BOOK READING WITH TOOLBAR & NAVIGATION -->
    <div class={`tt-chapter-reader bg-${background}`}>
      <!-- Top Action Bar: Back to TOC & Switch to Practice -->
      <div class="tt-reader-top-bar">
        <button class="tt-reader-back-btn" type="button" onclick={handleCloseChapter}>
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{localeStore.current === 'en' ? 'Back' : 'Quay lại'}</span>
        </button>
        <span class="tt-reader-top-title">{currentChapterTitle}</span>
        <button class="tt-reader-practice-btn" type="button" onclick={onStartPractice}>
          <span aria-hidden="true">🙏</span>
          <span>{localeStore.current === 'en' ? 'Cultivate' : 'Vào chế độ tu tập'}</span>
        </button>
      </div>

      <!-- Standard Reader Toolbar -->
      <ReaderToolbar
        {fontSize}
        {bold}
        {background}
        {fontFamily}
        {lineHeight}
        {textAlign}
        {ttsSpeed}
        {ttsVoice}
        {bookmarked}
        {ttsActive}
        {ttsLoading}
        {autoScrollActive}
        {autoScrollSpeed}
        onFont={font}
        onBold={toggleBold}
        onBackground={changeBackground}
        onFontFamily={changeFontFamily}
        onLineHeight={changeLineHeight}
        onTextAlign={changeTextAlign}
        onTtsSpeed={changeTtsSpeed}
        onTtsVoice={changeTtsVoice}
        onBookmark={toggleBookmark}
        onSpeak={speak}
        onShare={share}
        onAutoScroll={autoScroll}
        onAutoScrollSpeed={changeAutoScrollSpeed}
        onNotify={notify}
        onClose={handleCloseChapter}
      />

      <!-- Chapter Navigation Bar -->
      {#if chapters.length > 1}
        <nav class="chapter-nav" aria-label={localeStore.current === 'en' ? 'Chapter navigation' : 'Điều hướng phẩm'}>
          <button
            class:hidden={currentChapterIndex === null || currentChapterIndex <= 0}
            type="button"
            aria-label={localeStore.current === 'en' ? 'Previous chapter' : 'Bài trước'}
            disabled={currentChapterIndex === null || currentChapterIndex <= 0}
            onclick={() => currentChapterIndex !== null && onChapterOpen(currentChapterIndex - 1)}
          >
            ← {localeStore.current === 'en' ? 'Previous' : 'Bài trước'}
          </button>
          <span class="chapter-nav-title">
            {currentChapterIndex !== null ? `${currentChapterIndex + 1}. ` : ''}{currentChapterTitle}
          </span>
          <button
            class:hidden={currentChapterIndex === null || currentChapterIndex >= chapters.length - 1}
            type="button"
            aria-label={localeStore.current === 'en' ? 'Next chapter' : 'Bài tiếp'}
            disabled={currentChapterIndex === null || currentChapterIndex >= chapters.length - 1}
            onclick={() => currentChapterIndex !== null && onChapterOpen(currentChapterIndex + 1)}
          >
            {localeStore.current === 'en' ? 'Next' : 'Bài tiếp'} →
          </button>
        </nav>
      {/if}

      <!-- Reading Scroll Area -->
      <div
        class={`reader-scroll bg-${background}`}
        role="region"
        aria-label={isEn ? 'Reading content' : 'Nội dung bài đọc'}
        bind:this={scrollArea}
        onwheel={() => { if (autoScrollActive) stopAutoScroll(); }}
        ontouchstart={() => { if (autoScrollActive) stopAutoScroll(); }}
      >
        {#if bookmarked}
          <button
            class="bookmark-ribbon"
            type="button"
            aria-label={localeStore.current === 'en' ? 'Go to bookmarked position' : 'Đi tới vị trí đã đánh dấu'}
            title={localeStore.current === 'en' ? 'Click to go to bookmarked position' : 'Nhấn để đến vị trí đã đánh dấu'}
            onclick={() => void goToBookmark()}
          >
            <svg width="30" height="58" viewBox="0 0 30 58" aria-hidden="true">
              <defs><linearGradient id="practice-bookmark-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a23c"/><stop offset="1" stop-color="#edbd58"/></linearGradient></defs>
              <path d="M0 0h30v58L15 48 0 58z" fill="url(#practice-bookmark-gradient)"/>
              <path d="m15 18 2.35 4.76 5.25.76-3.8 3.7.9 5.23L15 30l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76z" fill="#fff"/>
            </svg>
          </button>
        {/if}

        {#if !activeContentHtml}
          <div class="tt-preview__loading" aria-live="polite">
            <div class="tt-preview__spinner"></div>
            <p>{localeStore.current === 'en' ? 'Loading chapter content…' : 'Đang tải nội dung phẩm…'}</p>
          </div>
        {:else}
          <article class="reader-body" style={`font-size:${fontSize}px`}>
            <h1 class="tt-reader-chapter-title">{currentChapterTitle}</h1>
            <div
              class:bold
              class="reader-content"
              style={`--reader-font:${activeFontCss};--reader-lh:${lineHeight};--reader-align:${textAlign}`}
              bind:this={contentArea}
              use:readerImageAction
            >
              {@html activeContentHtml}
            </div>

            <!-- Bottom Chapter Navigation -->
          </article>
        {/if}
      </div>
    </div>
  {/if}

  {#if lightboxSource}
    <ReaderImageLightbox source={lightboxSource} alt={lightboxAlt} onClose={closeLightbox} />
  {/if}
  <ReaderToast message={toastMessage} visible={toastVisible} />
</section>

<style>
  .tt-preview{min-height:100vh;padding-top:58px;background:var(--bg);color:var(--text);font-family:var(--font-app)}
  .tt-preview--reading{padding-top:58px}
  .tt-preview__wrap{max-width:720px;margin:0 auto;padding:28px 20px 120px}
  .tt-preview__header{display:grid;justify-items:start;gap:12px;margin:0 0 16px;padding:0;background:transparent}
  .tt-preview__category{display:inline-block;padding:3px 10px;border-radius:12px;background:var(--gold-light);color:var(--gold);font-size:11px;font-weight:700;letter-spacing:.5px;line-height:1.6}
  .tt-preview__header h1{width:100%;margin:0;color:var(--text);font:700 clamp(20px,4vw,26px)/1.4 Lora,Georgia,serif;text-align:center}
  .tt-preview__meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin:0;padding:0;color:var(--muted);font-size:12px}
  .tt-preview__start-card{margin:0 0 10px;padding:20px;border:1.5px solid var(--gold-muted);border-radius:18px;background:var(--gold-light);text-align:center}
  .tt-preview__start{display:inline-flex;align-items:center;gap:10px;padding:14px 28px;border:0;border-radius:36px;background:linear-gradient(135deg,var(--gold) 0%,#b8843a 100%);box-shadow:0 4px 20px rgba(200,150,62,.4);color:#fff;cursor:pointer;font:700 16px/1.6 var(--font-app);letter-spacing:.3px;transition:transform .18s,box-shadow .18s}
  .tt-preview__start span{font-size:22px}
  .tt-preview__start:hover{box-shadow:0 6px 26px rgba(200,150,62,.55);transform:translateY(-2px)}
  .tt-preview__start:focus-visible,.tt-preview__toc-list button:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
  .tt-preview__start-card p{margin:12px 0 0;color:var(--muted);font-size:13px;line-height:1.6}
  .tt-preview__toc{overflow:hidden;margin-bottom:24px;border:1.5px solid var(--border2);border-radius:14px;background:var(--white)}
  .tt-preview__toc-header{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--gold-muted);background:var(--gold-light);color:var(--brown);font-size:14px;font-weight:700}
  .tt-preview__toc-header small{margin-left:auto;padding:2px 9px;border-radius:10px;background:var(--gold);color:#fff;font-size:11px;font-weight:700}
  .tt-preview__toc-list{display:flex;flex-direction:column}
  .tt-preview__toc-list button{display:flex;width:100%;align-items:center;gap:12px;padding:13px 16px;border:0;border-bottom:1px solid var(--border2);background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left;transition:background .15s}
  .tt-preview__toc-list button:last-child{border-bottom:0}
  .tt-preview__toc-list button:hover{background:var(--gold-light)}
  .tt-preview__toc-list button.active{background:var(--gold-muted)}
  .tt-preview__chapter-number{display:flex;width:28px;height:28px;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%;background:var(--gold);color:#fff;font-size:12px;font-weight:700}
  .tt-preview__chapter-copy{min-width:0;flex:1}
  .tt-preview__chapter-title-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .toc-video-badge{display:inline-flex;align-items:center;gap:3.5px;padding:1.5px 6.5px;border-radius:10px;background:rgba(220,38,38,.09);color:#dc2626;border:1px solid rgba(220,38,38,.25);font-size:10.5px;font-weight:700;line-height:1.2;letter-spacing:.2px;vertical-align:middle;flex-shrink:0}
  .toc-video-badge svg{flex-shrink:0}
  :root[data-theme='dark'] .toc-video-badge{background:rgba(239,68,68,.18);color:#f87171;border-color:rgba(239,68,68,.35)}
  .tt-preview__chapter-copy strong{color:var(--text);font-size:13px;font-weight:600}
  .tt-preview__chapter-copy small{display:block;margin-top:2px;color:var(--muted);font-size:11px}
  .tt-preview__chapter-action{display:flex;align-items:center;gap:4px;color:var(--gold);font-size:12px;font-weight:600}
  .tt-preview__chapter-action svg{color:var(--gold)}
  .tt-preview__toc-list svg{flex-shrink:0}
  .tt-preview__toc-hint{margin:0;padding:8px 14px 12px;color:var(--muted);font-size:11px;text-align:center}

  /* CHAPTER READER STYLING */
  .tt-chapter-reader{
    position: fixed;
    inset: 0;
    z-index: 700;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background: var(--card);
    animation: readerModalUp .24s cubic-bezier(.34,1.2,.64,1);
  }
  @keyframes readerModalUp{
    from{opacity:0;transform:translateY(16px) scale(.98)}
    to{opacity:1;transform:translateY(0) scale(1)}
  }
  .tt-reader-top-bar{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border2);background:var(--bg2)}
  .tt-reader-back-btn{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:8px 18px;border:1.5px solid var(--border);border-radius:22px;background:var(--card);color:var(--text2);cursor:pointer;font:inherit;font-size:14.5px;font-weight:700;white-space:nowrap;transition:border-color .15s,background-color .15s,color .15s,transform .12s}
  .tt-reader-back-btn:hover{border-color:var(--gold);background:var(--gold-light);color:var(--brown);transform:translateY(-1px)}
  .tt-reader-back-btn:active{transform:scale(.97)}
  .tt-reader-back-btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .tt-reader-top-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-size:14px;font-weight:700;text-align:center}
  .tt-reader-practice-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;min-height:42px;border:0;border-radius:22px;background:linear-gradient(135deg,var(--gold) 0%,#b8843a 100%);box-shadow:0 2px 8px rgba(200,150,62,.3);color:#fff;cursor:pointer;font:inherit;font-size:13.5px;font-weight:700;white-space:nowrap;transition:transform .15s,box-shadow .15s}
  .tt-reader-practice-btn:hover{box-shadow:0 4px 14px rgba(200,150,62,.45);transform:translateY(-1px)}
  .tt-reader-practice-btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

  .chapter-nav{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);flex:0 0 auto;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border2);background:var(--bg2)}
  .chapter-nav button{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:8px 16px;border:2px solid var(--gold);border-radius:22px;background:transparent;color:var(--gold);cursor:pointer;font:inherit;font-size:14px;font-weight:700;white-space:nowrap;transition:background .15s,color .15s,transform .12s}
  .chapter-nav button:hover:not(:disabled){background:var(--gold);color:#fff;transform:translateY(-1px)}
  .chapter-nav button:active:not(:disabled){transform:scale(.97)}
  .chapter-nav button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:2px}
  .chapter-nav button.hidden{visibility:hidden}
  .chapter-nav-title{grid-column:2;overflow:hidden;padding:0 8px;color:var(--text);font-size:14px;font-weight:700;text-align:center;text-overflow:ellipsis;white-space:nowrap}
  .chapter-nav button{grid-column:3;justify-self:end}

  .reader-scroll{
    position: relative;
    display: flex;
    min-height: 0;
    flex: 1 1 0%;
    overflow-y: auto;
    overflow-x: hidden;
    flex-direction: column;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    transition: background-color .24s ease-out, color .24s ease-out;
  }
  .reader-body{width:100%;max-width:820px;margin:0 auto;padding:36px 24px 100px;font-family:var(--font-app);line-height:1.9}
  .tt-reader-chapter-title{margin:0 0 24px;color:inherit;font-family:var(--font-app);font-size:clamp(19px,2.6vw,26px);font-weight:700;letter-spacing:-.3px;line-height:1.35;text-align:center;text-transform:uppercase}
  .reader-content{font-family:var(--reader-font,var(--font-reader));line-height:var(--reader-lh,1.9);text-align:var(--reader-align,justify);font-size:inherit;white-space:normal;-webkit-touch-callout:none}
  .reader-content.bold,.reader-content.bold :global(*){font-weight:700!important}
  .reader-content :global(p){margin:0 0 .38em!important;white-space:normal}
  .reader-content :global(p:empty){display:none!important}
  .reader-content :global(h1),.reader-content :global(h2),.reader-content :global(h3){margin:1.1em 0 .4em!important}
  .reader-content :global(strong){color:var(--brown);font-weight:700}
  .reader-content :global(em){color:var(--gold)}
  .reader-content :global(img){display:block;max-width:100%;height:auto;margin:12px 0;border-radius:8px;cursor:zoom-in;transition:transform .2s}
  .reader-content :global(img:hover){transform:scale(1.01)}
  .reader-content :global(img:focus-visible){outline:3px solid var(--gold);outline-offset:3px}
  .reader-content :global(.reader-video-wrapper){position:relative;margin:22px auto 26px;max-width:100%;text-align:center}
  .reader-content :global(video),.reader-content :global(.reader-video){display:block;width:100%;max-width:640px;margin:0 auto;border-radius:12px;border:1.5px solid var(--gold-muted);box-shadow:0 4px 16px rgba(0,0,0,0.12);background:#000;outline:none}
  .reader-content :global(video:focus-visible),.reader-content :global(.reader-video:focus-visible){outline:3px solid var(--gold);outline-offset:3px}
  .reader-content :global(.tt-content__line){display:block;margin-bottom:.15em;text-align:justify;text-align-last:left}
  .reader-content :global(.tt-content__line--center){text-align:center;text-align-last:center}
  .reader-content :global(.tt-content__line--right){text-align:right;text-align-last:right}
  .reader-content :global(.tt-content__line--form){text-align:left;text-align-last:left;white-space:normal;overflow-wrap:anywhere;word-spacing:normal}
  .reader-content :global(.tt-content__blank){display:inline-block;max-width:100%;overflow:hidden;vertical-align:bottom;white-space:nowrap;letter-spacing:0}
  .reader-content :global(.tt-content__gap){height:.38em!important}
  .reader-content :global(.tts-word.active){border-radius:2px;background:var(--gold);color:var(--bg)}

  .bookmark-ribbon{position:absolute;top:0;right:40px;z-index:30;width:30px;height:58px;padding:0;border:0;background:transparent;filter:drop-shadow(0 5px 7px rgba(115,70,18,.28));cursor:pointer;animation:bookmarkRibbonDrop .4s cubic-bezier(.34,1.4,.64,1)}
  .bookmark-ribbon svg{display:block}
  .bookmark-ribbon:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}
  @keyframes bookmarkRibbonDrop{from{opacity:0;transform:translateY(-32px)}to{opacity:1;transform:translateY(0)}}

  /* Theme variables applied to reader and preview */
  .bg-white{--bg:#fff;--bg2:#f7f7f7;--bg3:#eee;--card:#fff;--text:#1c1a15;--text2:#333;--muted:#666;--border:#ccc;--border2:#e2e2e2;--gold:#b37d22;--gold-light:#fdfaf3;--gold-muted:#e6dac3;--brown:#2e241c;background:#fff;color:#1c1a15}
  .bg-cream{--bg:#f4ecd8;--bg2:#eee2ca;--bg3:#e4d6bc;--card:#f7efde;--text:#33271f;--text2:#403126;--muted:#675548;--border:#9b8069;--border2:#c7b39a;--gold:#b37d22;--gold-light:#fbf3e4;--gold-muted:#e1cfad;--brown:#4a3525;background:#f4ecd8;color:#33271f}
  .bg-gray{--bg:#e8e8e8;--bg2:#dedede;--bg3:#d2d2d2;--card:#e8e8e8;--text:#222;--text2:#333;--muted:#666;--border:#bbb;--border2:#ccc;--gold:#b37d22;--gold-light:#f0ece3;--gold-muted:#d9cfbc;--brown:#333;background:#e8e8e8;color:#222}
  .bg-dark{--bg:#15120d;--bg2:#1c1813;--bg3:#241e17;--card:#15120d;--text:#ede8df;--text2:#cfc8be;--muted:#8e8477;--border:#3a3227;--border2:#28221a;--gold:#d4a84b;--gold-light:#221c13;--gold-muted:#3a2e1d;--brown:#f5eedf;background:#15120d;color:#ede8df}


  .tt-single-bottom-practice{margin:40px 0 20px;padding:32px 20px;border:1.5px solid var(--gold-muted);border-radius:18px;background:var(--gold-light);text-align:center}
  .tt-single-bottom-practice p{margin:12px 0 0;color:var(--muted);font-size:13px;line-height:1.6}
  .tt-reader-empty{display:flex;align-items:center;justify-content:center;padding:60px 20px;color:var(--muted);font-size:15px;text-align:center}

  .tt-preview[data-read-bg='white'],.tt-preview[data-read-bg='white'] .tt-preview__wrap{background:#fff}
  .tt-preview[data-read-bg='white'] .tt-preview__header h1{color:#1c1a15}
  .tt-preview[data-read-bg='white'] .tt-preview__meta{border-color:#ddd8cc;color:#6b5d4f}
  .tt-preview[data-read-bg='cream'],.tt-preview[data-read-bg='cream'] .tt-preview__wrap{background:#faf6ee}
  .tt-preview[data-read-bg='cream'] .tt-preview__header h1{color:#3a2e1a}
  .tt-preview[data-read-bg='cream'] .tt-preview__meta{border-color:#e5dec9;color:#7a6a54}
  .tt-preview[data-read-bg='gray'],.tt-preview[data-read-bg='gray'] .tt-preview__wrap{background:#e8e8e8}
  .tt-preview[data-read-bg='gray'] .tt-preview__header h1{color:#1c1c1c}
  .tt-preview[data-read-bg='gray'] .tt-preview__meta{border-color:#ccc;color:#666}
  .tt-preview[data-read-bg='dark'],.tt-preview[data-read-bg='dark'] .tt-preview__wrap,
  :global([data-theme='dark']) .tt-preview,:global([data-theme='dark']) .tt-preview .tt-preview__wrap{background:#15120d}
  .tt-preview[data-read-bg='dark'],:global([data-theme='dark']) .tt-preview{color:#ede8df}
  .tt-preview[data-read-bg='dark'] .tt-preview__header h1,:global([data-theme='dark']) .tt-preview .tt-preview__header h1{color:#ede8df}
  .tt-preview[data-read-bg='dark'] .tt-preview__meta,:global([data-theme='dark']) .tt-preview .tt-preview__meta{border-color:#2e2820;color:#8a7b68}
  .tt-preview[data-read-bg='dark'] .tt-preview__category,:global([data-theme='dark']) .tt-preview .tt-preview__category{background:#2a2318;color:#d4a84b}
  .tt-preview[data-read-bg='dark'] .tt-preview__start-card,:global([data-theme='dark']) .tt-preview .tt-preview__start-card{border-color:#2e2820;background:#1c1812}
  .tt-preview[data-read-bg='dark'] .tt-preview__start-card p,:global([data-theme='dark']) .tt-preview .tt-preview__start-card p{color:#958570}
  .tt-preview[data-read-bg='dark'] .tt-preview__toc,:global([data-theme='dark']) .tt-preview .tt-preview__toc{border-color:#2e2820;background:#1c1812}
  .tt-preview[data-read-bg='dark'] .tt-preview__toc-header,:global([data-theme='dark']) .tt-preview .tt-preview__toc-header{border-color:#2e2820;background:#231e16;color:#c8a87a}
  .tt-preview[data-read-bg='dark'] .tt-preview__toc-list button,:global([data-theme='dark']) .tt-preview .tt-preview__toc-list button{border-color:#2e2820}
  .tt-preview[data-read-bg='dark'] .tt-preview__toc-list button:hover,:global([data-theme='dark']) .tt-preview .tt-preview__toc-list button:hover{background:#231e16}
  .tt-preview[data-read-bg='dark'] .tt-preview__chapter-copy strong,:global([data-theme='dark']) .tt-preview .tt-preview__chapter-copy strong{color:#ede8df}
  .tt-preview[data-read-bg='dark'] .tt-preview__chapter-copy small,:global([data-theme='dark']) .tt-preview .tt-preview__chapter-copy small{color:#958570}

  .tt-single-reader{position:relative;margin-top:20px}
  .tt-single-reader .bookmark-ribbon{right:20px}
  .tt-preview,.tt-preview__header h1,.tt-preview__start{font-family:var(--font-app)}
  .tt-preview__loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 20px;color:var(--muted);font-size:14px}
  .tt-preview__spinner{width:28px;height:28px;border:2.5px solid var(--border2);border-top-color:var(--gold);border-radius:50%;animation:tt-preview-spin .8s linear infinite}
  @keyframes tt-preview-spin{to{transform:rotate(360deg)}}
  @media(prefers-reduced-motion:reduce){.tt-preview__start,.bookmark-ribbon{transition:none;animation:none}}
  @media(max-width:768px){
    .tt-reader-top-bar{padding:8px 12px;gap:8px}
    .tt-reader-back-btn{min-height:36px;padding:6px 12px;font-size:13px}
    .tt-reader-top-title{font-size:13px}
    .tt-reader-practice-btn{min-height:36px;padding:6px 12px;font-size:12.5px}
    .reader-body{padding:20px 16px 80px}
    .chapter-nav{padding:8px 12px;gap:8px}
    .chapter-nav button{min-height:36px;padding:6px 12px;font-size:13px}
    .chapter-nav-title{font-size:12.5px}
  }
  @media(max-width:480px){
    .tt-reader-top-bar{padding:6px 10px;gap:6px}
    .tt-reader-back-btn{padding:5px 10px;font-size:12px}
    .tt-reader-back-btn svg{width:16px;height:16px}
    .tt-reader-top-title{font-size:12px;max-width:140px}
    .tt-reader-practice-btn{padding:5px 10px;font-size:12px}
    .chapter-nav button{padding:5px 10px;font-size:12px}
  }

  .tt-preview{padding-top:var(--practice-topbar-height,calc(64px + var(--app-safe-top,env(safe-area-inset-top,0px))))}
  .tt-preview__header h1.tt-ritual-heading{font-size:clamp(16px,4.6vw,24px);line-height:1.5;text-align:center}
  .tt-ritual-heading span{display:block;white-space:nowrap}
  .tt-reader-top-bar{
    padding:calc(10px + var(--app-safe-top, max(env(safe-area-inset-top, 0px), 32px))) 16px 10px;
    min-height:calc(56px + var(--app-safe-top, max(env(safe-area-inset-top, 0px), 32px)));
  }
    .tt-reader-top-bar{
      padding:calc(8px + var(--app-safe-top, max(env(safe-area-inset-top, 0px), 32px))) 12px 8px;
      min-height:calc(54px + var(--app-safe-top, max(env(safe-area-inset-top, 0px), 32px)));
    }
  .reader-content :global(.tt-content__line--fill-in){text-align:left;text-align-last:left;white-space:normal}
  .reader-content :global(.tt-content__blank){display:inline-block;max-width:min(6em,calc(100% - .4em));overflow:hidden;white-space:nowrap;vertical-align:bottom;margin-inline:.2em}
  button{min-height:44px}

  /* Giữ tiêu đề ở cột co giãn, hai nút chuyển phẩm ở cùng một hàng. */
  .chapter-nav{grid-template-columns:auto minmax(0,1fr) auto}
  .chapter-nav button:first-child{grid-column:1;grid-row:1;justify-self:start}
  .chapter-nav-title{grid-column:2;grid-row:1;min-width:0;max-width:100%}
  .chapter-nav button:last-child{grid-column:3;grid-row:1;justify-self:end}
  .tt-reader-back-btn,.tt-reader-practice-btn,.chapter-nav button,.reader-tools-toggle{min-height:44px;min-width:44px}
  .tt-preview :global(.reader-tools-toggle){min-height:44px;min-width:44px}
</style>
