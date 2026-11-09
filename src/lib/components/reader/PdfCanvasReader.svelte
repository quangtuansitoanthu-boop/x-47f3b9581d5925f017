<script module lang="ts">
  interface PdfStorageSession {
    authenticated: boolean;
    user?: null | { id: string };
  }

  export async function resolvePdfStoragePrincipal(
    getSession: () => Promise<PdfStorageSession | null>,
    isCurrent: () => boolean,
  ): Promise<string | null> {
    const session = await getSession().catch(() => null);
    if (!isCurrent()) return null;
    if (session?.authenticated && session.user?.id) return session.user.id;
    return 'anonymous';
  }
</script>

<script lang="ts">
  import { fetchBoundedBytes } from '$lib/browser/network-deadline';
  let pdfFallbackAbort: AbortController | null = null;
  import { createReaderProgressSync } from '$lib/browser/reader-progress-sync';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { englishText } from '$lib/i18n/ui-copy';
  const localizeUi = createInterfaceTranslator();

  import { onMount, tick, untrack } from 'svelte';
  import { loadPdfjs, getPdfjsWorker } from '$lib/browser/pdfjs-loader';
  import { detectPdfCropBox, type PdfCropBox, type PdfPageForCrop } from '$lib/browser/pdf-crop';
  import { installPdfGestures } from '$lib/browser/pdf-gesture-controller';
  import { getBrowserSession } from '$lib/browser/session-csrf';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { createPrivateReadingPrincipalGuard, type PrivateReadingPrincipalToken } from '$lib/browser/private-reading-principal-lifecycle';
  import { isOnlineOnlyBook } from '$lib/domain/online-only-policy';
  import { isNativeApp } from '$lib/browser/native-platform';
  import {
    createReadingActivityClient,
    createThrottledReadingProgressWriter,
    isReadingActivityCapacityError,
    type ReadingActivitySession,
    type ReadingProgressRecord,
  } from '$lib/browser/reading-activity-client';
  import { copyLegacyKeysToAnonymousNamespace, createPrincipalStorage } from '$lib/browser/principal-storage';
  import type { OfflinePdfRecord } from '$lib/browser/offline-pdf-database';
  import {
    downloadPdfForOffline,
    offlinePdfNeedsUpdate,
    probeOfflinePdfSourceVersion,
    probePdfTotalBytes,
    readPdfOfflineState,
    removePdfOfflineCopy,
    type OfflinePdfDownloadProgress,
  } from '$lib/browser/pdf-offline-downloads';
  import type { LibraryArticle } from '$lib/components/library/article';
  import CommentsPanel from '$lib/components/comments/CommentsPanel.svelte';
  import ReaderToolsPanel from './ReaderToolsPanel.svelte';
  import { readerPanelKeyboard } from '$lib/browser/reader-panel-keyboard';
  import MostViewedArticles from '$lib/components/reader/MostViewedArticles.svelte';
  import { extractPdfPageText } from './pdf-page-text';
  import { createReaderTextToSpeech, type ReaderSpeechState } from './reader-text-to-speech';
  import PdfAnnotations from './PdfAnnotations.svelte';
  import {
    buildPdfSpreads,
    canonicalPdfPage,
    flattenPdfOutline,
    resolvePdfOutlinePage,
    type PdfOutlineDocument,
    type PdfOutlineSourceItem,
  } from './pdf-reading-model';
  import { resolvePdfUrl } from '$lib/utils/pdf-url';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { cachedQuoteNavigation, quoteNavigationPage } from '$lib/domain/reading/quote-navigation';
  import { resolveTextAnnotation } from '$lib/domain/reading/annotation-anchors';
  import { quoteCardCopy } from '$lib/i18n/quote-card';
  import { resolveApiUrl } from '$lib/browser/native-api';

  interface Props {
    url: string;
    articleId: string;
    title: string;
    category: string;
    categoryIcon: string;
    author: string;
    dateLabel: string;
    viewCount: number | null;
    authenticated: boolean;
    session?: ReadingActivitySession;
    currentArticle: LibraryArticle;
    articles?: LibraryArticle[];
    onShare?: () => void;
    onNotify?: (message: string) => void;
    onOpenArticle?: (article: LibraryArticle) => void;
    onViewerScroll?: (scrollTop: number) => void;
    onClose?: () => void;
    targetAnnotationId?: string | null;
  }

  interface PdfBookmarkState {
    lastPage?: number;
    lastScrollY?: number;
    bookmarks?: number[];
  }

  interface PdfDocumentLike extends PdfOutlineDocument {
    getOutline: () => Promise<PdfOutlineSourceItem[] | null>;
    getPage: (page: number) => Promise<any>;
  }

  interface ResolvedOutlineItem {
    depth: number;
    id: string;
    pageNumber: number | null;
    title: string;
  }

  let { url, articleId, title, category, categoryIcon, author, dateLabel, viewCount, authenticated, session = { authenticated: false, csrfToken: null, user: null }, currentArticle, articles = [], onShare = () => {}, onNotify = () => {}, onOpenArticle = () => {}, onViewerScroll = () => {}, onClose = () => {}, targetAnnotationId = null }: Props = $props();
  const localeStore = getLocaleContext();
  let isOfflineError = $state(false);
  let retryStart = $state<() => void>(() => {});
  const isOnlineOnly = $derived(isOnlineOnlyBook(title, author));
  let viewer = $state<HTMLElement | null>(null);
  let pagesContainer = $state<HTMLElement | null>(null);
  let pageCount = $state(0);
  let currentPage = $state(1);
  let pageInput = $state<number | undefined>(1);
  let toolsOpen = $state(false);
  let bookmarkPanel = $state<HTMLElement>();
  let bookmarkTrigger = $state<HTMLButtonElement>();
  let bookmarkReturnFocus: HTMLElement | null = null;
  let ttsVoice = $state('auto');
  let ttsSpeed = $state(1);
  let pdfQuoteBtnPos = $state<{ top: number; left: number } | null>(null);
  let pdfSelectedText = $state('');
  let pdfSelectedPage = $state(1);
  const textLayers = new Map<number, HTMLElement>();

  function pageTextLayer(node: HTMLElement, pageNumber: number) {
    textLayers.set(pageNumber, node);
    return {
      destroy: () => {
        textLayers.delete(pageNumber);
      },
    };
  }

  function checkPdfSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
      pdfQuoteBtnPos = null;
      pdfSelectedText = '';
      return;
    }
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      pdfQuoteBtnPos = null;
      pdfSelectedText = '';
      return;
    }
    const commonNode = range.commonAncestorContainer;
    const pageNode = (commonNode instanceof Element ? commonNode : commonNode.parentElement)?.closest('.pdf-page') as HTMLElement | null;
    if (!pageNode && !viewer?.contains(commonNode)) {
      pdfQuoteBtnPos = null;
      pdfSelectedText = '';
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    pdfSelectedText = text;
    pdfSelectedPage = pageNode?.dataset.page ? parseInt(pageNode.dataset.page, 10) : currentPage;

    const btnWidth = Math.min(260, window.innerWidth - 20);
    const btnHeight = 36;
    let top = rect.top - btnHeight - 8;
    if (top < 60) top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - btnWidth / 2;
    left = Math.max(10, Math.min(window.innerWidth - btnWidth - 10, left));
    pdfQuoteBtnPos = { top, left };
  }

  async function handlePdfCopy() {
    if (!pdfSelectedText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pdfSelectedText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = pdfSelectedText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      onNotify(localizeUi('✓ Đã sao chép đoạn văn'));
    } catch {
      onNotify(localizeUi('⚠️ Không thể sao chép'));
    }
    pdfQuoteBtnPos = null;
    pdfSelectedText = '';
    window.getSelection()?.removeAllRanges();
  }

  async function handlePdfQuoteSave() {
    if (!pdfSelectedText || !readingClient) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `pdf-quote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      readingClient.enqueueAnnotationCreate({
        id,
        idempotencyKey: id,
        contentId: articleId,
        contentKind: 'pdf',
        contentVersion,
        quoteText: pdfSelectedText,
        contextBefore: '',
        contextAfter: '',
        color: 'yellow',
        note: '',
        anchorStatus: 'active',
        locator: {
          page: pdfSelectedPage,
          startOffset: 0,
          endOffset: pdfSelectedText.length,
          rectangles: [],
        },
      });
      await readingClient.flush();
      onNotify(localizeUi('✓ Đã lưu trích dẫn PDF'));
    } catch {
      onNotify(localizeUi('⚠️ Không thể lưu trích dẫn PDF lúc này'));
    }
    pdfQuoteBtnPos = null;
    pdfSelectedText = '';
    window.getSelection()?.removeAllRanges();
  }

  if (typeof localStorage !== 'undefined') {
    ttsVoice = 'auto';
    ttsSpeed = Number(localStorage.getItem('tutam_read_tts_speed')) || 1;
  }
  $effect(() => { pageInput = currentPage; });

  async function toggleBookmarkList(event?: MouseEvent) {
    if (!bookmarkListOpen) bookmarkReturnFocus = event?.currentTarget instanceof HTMLElement ? event.currentTarget : bookmarkTrigger ?? null;
    bookmarkListOpen = !bookmarkListOpen;
    offlinePanelOpen = false;
    await tick();
    (bookmarkListOpen ? bookmarkPanel : bookmarkReturnFocus ?? bookmarkTrigger)?.focus({ preventScroll: true });
  }

  function handleFloatingPanelPointerDown(event: PointerEvent): void {
    if (!bookmarkListOpen) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (bookmarkPanel?.contains(target) || bookmarkTrigger?.contains(target)) return;
    bookmarkListOpen = false;
  }

  function submitPage(event: SubmitEvent) {
    event.preventDefault();
    if (pageInput === undefined || !Number.isInteger(pageInput) || pageInput < 1 || pageInput > pageCount) return;
    goToPage(pageInput);
  }
  let speechPage = $state(1);
  let zoom = $state(1);
  let displayZoom = $state(1);
  let loadingProgress = $state(0);
  let error = $state('');
  let bookmarked = $state(false);
  let bookmarkListOpen = $state(false);
  let annotationsOpen = $state(false);
  let quoteTargetId = $state<string | null>(null);
  let quoteTargetPage = $state<number | null>(null);
  $effect(() => { if (!annotationsOpen) { quoteTargetId = null; quoteTargetPage = null; } });
  let bookmarkPages = $state<number[]>([]);
  let pageAspectRatio = $state(1.414);
  let autoSpread = $state(false);
  let layoutPreference = $state<'auto' | 'single' | 'spread'>('auto');
  let navigationOpen = $state(false);
  let navigationTab = $state<'thumbnails' | 'outline'>('thumbnails');
  let thumbnailRail = $state<HTMLElement | null>(null);
  let outlineStatus = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');
  let outlineItems = $state<ResolvedOutlineItem[]>([]);
  let visualMode = $state<'default' | 'sepia'>('sepia');

  function togglePaperMode(): void {
    visualMode = visualMode === 'sepia' ? 'default' : 'sepia';
    localStorage.setItem('tutam_pdf_paper_mode', visualMode);
  }
  let speechState = $state<ReaderSpeechState>('idle');
  let pageTextState = $state<'idle' | 'loading' | 'ready' | 'no-text' | 'error'>('idle');
  let offlineState = $state<'checking' | 'unavailable' | 'none' | 'saving' | 'saved' | 'update' | 'error'>('checking');
  let offlinePanelOpen = $state(false);
  $effect(() => {
    const panelId = annotationsOpen ? 'pdf-annotation-panel' : offlinePanelOpen ? 'pdf-offline-panel' : navigationOpen ? 'pdf-navigation-panel' : null;
    if (panelId && window.matchMedia('(max-width: 768px)').matches) {
      toolsOpen = false;
      void tick().then(() => document.getElementById(panelId)?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
    }
  });
  let offlineRecord = $state<OfflinePdfRecord | null>(null);
  let offlineProgress = $state<OfflinePdfDownloadProgress>({ bytesDownloaded: 0, bytesTotal: null, percent: null });
  let offlineError = $state('');
  let storagePrincipal = $state('anonymous');
  let confirmDownloadModalOpen = $state(false);
  let downloadProgressModalOpen = $state(false);
  let estimatedPdfBytes = $state<number | null>(null);
  let loadingBytes = $state(0);
  let knownPdfTotal = $state<number | null>(null);
  let userChoiceResolver: ((choice: 'download' | 'online') => void) | null = null;
  let pdfSizeProbe: { url: string; controller: AbortController; promise: Promise<number | null> } | null = null;

  function cancelPdfSizeProbe(): void {
    pdfSizeProbe?.controller.abort();
    pdfSizeProbe = null;
  }

  function requestPdfSize(sourceUrl: string): Promise<number | null> {
    if (pdfSizeProbe?.url === sourceUrl) return pdfSizeProbe.promise;
    cancelPdfSizeProbe();
    const controller = new AbortController();
    const promise = probePdfTotalBytes(sourceUrl, fetch, controller.signal)
      .then(size => controller.signal.aborted ? null : size)
      .catch(() => null);
    pdfSizeProbe = { url: sourceUrl, controller, promise };
    return promise;
  }

  function resolveUserChoice(choice: 'download' | 'online'): void {
    confirmDownloadModalOpen = false;
    if (userChoiceResolver) {
      const resolver = userChoiceResolver;
      userChoiceResolver = null;
      resolver(choice);
    } else if (choice === 'download') {
      downloadProgressModalOpen = true;
      toolsOpen = false;
      void saveOffline();
    }
  }

  function handleOfflineButtonClick(): void {
    if (isOnlineOnly) return;
    if (offlineState === 'saving') {
      downloadProgressModalOpen = true;
      return;
    }
    if (offlineState === 'saved') {
      offlinePanelOpen = true;
      return;
    }
    confirmDownloadModalOpen = true;
    if (!estimatedPdfBytes) {
      void requestPdfSize(resolvePdfUrl(url)).then((size) => {
        if (size) estimatedPdfBytes = size;
      });
    }
  }

  function startOfflineDownloadConfirmed(): void {
    resolveUserChoice('download');
  }
  let progressRevision = $state(0);
  let progressReadyForPrincipal = false;
  let readingClient: ReturnType<typeof createReadingActivityClient> | null = null;
  const principalGuard = createPrivateReadingPrincipalGuard(untrack(() => session));
  const spreadActive = $derived(layoutPreference === 'spread' || (layoutPreference === 'auto' && autoSpread));
  const pageSpreads = $derived(buildPdfSpreads(pageCount, spreadActive));
  const externalUrl = $derived(safeExternalUrl(currentArticle.externalUrl));

  const PDF_BOOKMARK_KEY = 'tutam_pdf_bookmarks_v1';
  const canvases = new Map<number, HTMLCanvasElement>();
  const pageWraps = new Map<number, HTMLElement>();
  const visiblePages = new Set<number>();
  const renderingPages = new Set<number>();
  const renderTasks = new Map<number, { cancel: () => void; promise: Promise<unknown> }>();
  const cropBoxes = new Map<number, PdfCropBox | null>();
  let observer: IntersectionObserver | null = null;
  let pdfDocument = $state<PdfDocumentLike | null>(null);
  let loadingTask: { promise: Promise<any>; destroy: () => Promise<void>; onProgress?: (progress: { loaded: number; total: number }) => void } | null = null;
  let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let startupFrame: number | null = null;
  let renderGeneration = 0;
  let latestScrollY = 0;
  let documentGeneration = 0;
  let thumbnailGeneration = 0;
  let thumbnailObserver: IntersectionObserver | null = null;
  let activeThumbnailRenders = 0;
  const thumbnailCanvases = new Map<number, HTMLCanvasElement>();
  const thumbnailQueue: number[] = [];
  const queuedThumbnails = new Set<number>();
  const visibleThumbnails = new Set<number>();
  const renderedThumbnails = new Map<number, true>();
  const thumbnailTasks = new Map<number, { cancel: () => void; promise: Promise<unknown> }>();
  const THUMBNAIL_CACHE_LIMIT = 18;
  const THUMBNAIL_RENDER_CONCURRENCY = 2;
  const pageTextCache = new Map<number, string>();
  let speechExtraction: AbortController | null = null;
  let offlineDownload: AbortController | null = null;
  let offlineGeneration = 0;
  const contentVersion = $derived(currentArticle.updatedAt || currentArticle.publishedAt || null);

  const progressSync = createReaderProgressSync();
  const progressWriter = createThrottledReadingProgressWriter((draft) => {
    if (!readingClient) return;
    const principalToken = principalGuard.capture();
    try {
      readingClient.enqueueProgress(draft);
    } catch (cause) {
      if (principalGuard.isCurrent(principalToken)) {
        onNotify(isReadingActivityCapacityError(cause)
          ? localizeUi('❌ Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ.')
          : localizeUi('❌ Không thể lưu tiến độ PDF trên thiết bị.'));
      }
      return;
    }
    progressSync.schedule(() => {
    if (!principalGuard.isCurrent(principalToken)) return;
    void readingClient?.flush().then(() => {
      if (!principalGuard.isCurrent(principalToken)) return;
      const current = readingClient?.cachedProgress().find((row) => row.contentKind === 'pdf' && row.contentId === articleId);
      if (current) progressRevision = current.revision;
    }).catch(() => {});
    });
  });

  const pdfSpeech = createReaderTextToSpeech({
    getText: extractCurrentPageText,
    onState: (state) => { speechState = state; },
    onNotify: (message) => onNotify(message),
    getVoice: () => ttsVoice,
    getLocale: () => localeStore.current,
    initialVoice: untrack(() => ttsVoice),
    initialRate: untrack(() => ttsSpeed),
    emptyTextMessage: localizeUi('Trang này không có lớp văn bản để đọc. Tài liệu quét cần OCR, hiện chưa được hỗ trợ.'),
  });

  function changeTtsVoice(voice: string): void {
    ttsVoice = voice;
    pdfSpeech.setVoice(voice);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tutam_read_tts_voice', voice);
    }
  }

  function changeTtsSpeed(speed: number): void {
    ttsSpeed = speed;
    pdfSpeech.setRate(speed);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tutam_read_tts_speed', String(speed));
    }
  }

  function formatStorageBytes(value: number): string {
    if (value <= 0) return '0 KiB';
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KiB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function cancelSpeech(resetTextState = true): void {
    speechExtraction?.abort();
    speechExtraction = null;
    pdfSpeech.stop();
    if (resetTextState) pageTextState = 'idle';
  }

  async function extractCurrentPageText(): Promise<string | null> {
    const document = pdfDocument;
    const page = speechPage;
    const generation = documentGeneration;
    if (!document) throw new Error('pdf_document_unavailable');
    const cached = pageTextCache.get(page);
    if (cached !== undefined) {
      pageTextState = cached ? 'ready' : 'no-text';
      return cached || null;
    }
    speechExtraction?.abort();
    const controller = new AbortController();
    speechExtraction = controller;
    pageTextState = 'loading';
    try {
      const text = await extractPdfPageText(document, page, controller.signal);
      if (generation !== documentGeneration || page !== speechPage) throw new DOMException('Aborted', 'AbortError');
      pageTextCache.set(page, text);
      // Keep repeated Listen taps local without retaining text for an entire large book.
      if (pageTextCache.size > 24) pageTextCache.delete(pageTextCache.keys().next().value!);
      pageTextState = text ? 'ready' : 'no-text';
      return text || null;
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) pageTextState = 'error';
      throw cause;
    } finally {
      if (speechExtraction === controller) speechExtraction = null;
    }
  }

  function toggleSpeech(): void {
    if (speechState === 'playing') cancelSpeech(false);
    else if (speechState === 'paused') pdfSpeech.play();
    else void pdfSpeech.play();
  }

  async function refreshOfflineState(
    checkVersion = false,
    principalToken = principalGuard.capture(),
    expectedPrincipal = storagePrincipal,
  ): Promise<OfflinePdfRecord | null> {
    const generation = ++offlineGeneration;
    const requestIsCurrent = () => generation === offlineGeneration
      && principalGuard.isCurrent(principalToken)
      && storagePrincipal === expectedPrincipal;
    if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
      if (!requestIsCurrent()) return null;
      offlineState = 'unavailable';
      offlineRecord = null;
      return null;
    }
    if (!requestIsCurrent()) return null;
    offlineState = 'checking';
    offlineError = '';
    try {
      const effectiveUrl = resolvePdfUrl(url);
      const record = await readPdfOfflineState({ principalId: expectedPrincipal, documentId: articleId, title, sourceUrl: effectiveUrl });
      if (!requestIsCurrent()) return null;
      offlineRecord = record;
      if (!record) {
        offlineState = 'none';
        return null;
      }
      let update = offlinePdfNeedsUpdate(record, { sourceUrl: effectiveUrl });
      if (!update && checkVersion && navigator.onLine) {
        const version = await probeOfflinePdfSourceVersion(effectiveUrl).catch(() => null);
        if (!requestIsCurrent()) return null;
        update = offlinePdfNeedsUpdate(record, { sourceUrl: effectiveUrl, sourceVersion: version });
      }
      if (!requestIsCurrent()) return null;
      offlineState = update ? 'update' : 'saved';
      return record;
    } catch {
      if (!requestIsCurrent()) return null;
      offlineRecord = null;
      offlineState = 'error';
      offlineError = 'Không thể đọc bộ nhớ ngoại tuyến trên thiết bị này.';
      return null;
    }
  }

  async function setStoragePrincipalFromSession(
    principalToken = principalGuard.capture(),
  ): Promise<OfflinePdfRecord | null> {
    const nextPrincipal = await resolvePdfStoragePrincipal(
      () => getBrowserSession(),
      () => principalGuard.isCurrent(principalToken),
    );
    if (nextPrincipal === null || !principalGuard.isCurrent(principalToken)) return null;
    storagePrincipal = nextPrincipal;
    return refreshOfflineState(true, principalToken, nextPrincipal);
  }

  async function saveOffline(): Promise<void> {
    if (offlineState === 'saving' || offlineState === 'unavailable') return;
    const previous = offlineRecord;
    offlineDownload?.abort();
    const controller = new AbortController();
    offlineDownload = controller;
    const generation = ++offlineGeneration;
    offlineState = 'saving';
    offlineError = '';
    offlineProgress = {
      bytesDownloaded: 0,
      bytesTotal: knownPdfTotal || null,
      percent: knownPdfTotal ? 0 : null,
    };
    try {
      const effectiveUrl = resolvePdfUrl(url);
      const record = await downloadPdfForOffline({
        principalId: storagePrincipal,
        documentId: articleId,
        title,
        sourceUrl: effectiveUrl,
      }, {
        signal: controller.signal,
        onProgress: (progress) => { if (generation === offlineGeneration) offlineProgress = progress; },
      });
      if (offlineDownload !== controller || generation !== offlineGeneration) return;
      offlineRecord = record;
      offlineState = 'saved';
      downloadProgressModalOpen = false;
      onNotify(localizeUi('✓ Đã lưu ngoại tuyến {0}', formatStorageBytes(record.sizeBytes)));
    } catch (cause) {
      if (generation !== offlineGeneration) return;
      if (controller.signal.aborted) {
        downloadProgressModalOpen = false;
        offlineRecord = previous;
        offlineState = previous ? 'saved' : 'none';
        return;
      }
      downloadProgressModalOpen = false;
      const message = cause instanceof Error ? cause.message : '';
      offlineState = previous ? 'update' : 'error';
      offlineError = message === 'offline_pdf_too_large'
        ? 'PDF vượt giới hạn an toàn 80 MiB hoặc dung lượng còn trống.'
        : message === 'offline_pdf_quota_exceeded'
          ? 'Thiết bị không còn đủ dung lượng an toàn để lưu PDF.'
          : message === 'offline_pdf_invalid_content'
            ? 'Tệp tải về không phải PDF hợp lệ.'
            : 'Không thể lưu PDF ngoại tuyến. Bản cũ (nếu có) vẫn được giữ.';
    } finally {
      if (offlineDownload === controller) offlineDownload = null;
    }
  }

  function cancelOfflineSave(): void {
    offlineDownload?.abort();
  }

  async function removeOffline(): Promise<void> {
    offlineDownload?.abort();
    const generation = ++offlineGeneration;
    const expectedPrincipal = storagePrincipal;
    const principalToken = principalGuard.capture();
    const reclaimed = offlineRecord?.sizeBytes ?? 0;
    const requestIsCurrent = () => generation === offlineGeneration
      && storagePrincipal === expectedPrincipal
      && principalGuard.isCurrent(principalToken);
    try {
      await removePdfOfflineCopy({ principalId: expectedPrincipal, documentId: articleId });
      if (!requestIsCurrent()) return;
      offlineRecord = null;
      offlineState = 'none';
      offlineError = '';
      onNotify(reclaimed ? localizeUi('Đã giải phóng {0}', formatStorageBytes(reclaimed)) : localizeUi('Đã xóa bản ngoại tuyến'));
    } catch {
      if (!requestIsCurrent()) return;
      offlineState = 'error';
      offlineError = 'Không thể xóa bản ngoại tuyến lúc này.';
    }
  }

  function safeExternalUrl(value: string | undefined): string {
    const candidate = String(value || '').trim();
    if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : '';
    } catch {
      return '';
    }
  }

  function readState(): PdfBookmarkState {
    try {
      const all = JSON.parse(createPrincipalStorage(localStorage, storagePrincipal).getItem(PDF_BOOKMARK_KEY) || '{}');
      return all[String(articleId)] || {};
    } catch {
      return {};
    }
  }

  function writeState(patch: Partial<PdfBookmarkState>) {
    try {
      const scoped = createPrincipalStorage(localStorage, storagePrincipal);
      const all = JSON.parse(scoped.getItem(PDF_BOOKMARK_KEY) || '{}');
      all[String(articleId)] = { ...(all[String(articleId)] || {}), ...patch };
      scoped.setItem(PDF_BOOKMARK_KEY, JSON.stringify(all));
    } catch {
      // Reading remains available when storage is full or disabled.
    }
  }

  function updateBookmarkState() {
    bookmarkPages = [...(readState().bookmarks || [])].sort((a, b) => a - b);
    bookmarked = bookmarkPages.includes(currentPage);
  }

  function toggleBookmark() {
    const bookmarks = new Set(readState().bookmarks || []);
    const removing = bookmarks.has(currentPage);
    if (removing) bookmarks.delete(currentPage);
    else bookmarks.add(currentPage);
    writeState({ bookmarks: [...bookmarks].sort((a, b) => a - b) });
    updateBookmarkState();
    onNotify(removing ? localizeUi('Đã bỏ đánh dấu trang {0}', currentPage) : localizeUi('✓ Đã đánh dấu trang {0}', currentPage));
  }

  function removeBookmark(page: number) {
    const bookmarks = new Set(readState().bookmarks || []);
    bookmarks.delete(page);
    writeState({ bookmarks: [...bookmarks].sort((a, b) => a - b) });
    updateBookmarkState();
    onNotify(localizeUi('Đã xoá đánh dấu trang {0}', page));
  }

  function clearThumbnailRendering() {
    thumbnailGeneration += 1;
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    thumbnailQueue.length = 0;
    queuedThumbnails.clear();
    visibleThumbnails.clear();
    renderedThumbnails.clear();
    for (const task of thumbnailTasks.values()) task.cancel();
    thumbnailTasks.clear();
    for (const canvas of thumbnailCanvases.values()) {
      canvas.width = 1;
      canvas.height = 1;
      delete canvas.dataset.rendered;
    }
  }

  function trimThumbnailCache() {
    while (renderedThumbnails.size > THUMBNAIL_CACHE_LIMIT) {
      const evictable = [...renderedThumbnails.keys()].find((page) => !visibleThumbnails.has(page) && !thumbnailTasks.has(page));
      if (!evictable) return;
      renderedThumbnails.delete(evictable);
      const canvas = thumbnailCanvases.get(evictable);
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
        delete canvas.dataset.rendered;
      }
    }
  }

  async function renderThumbnail(pageNumber: number, generation: number) {
    const document = pdfDocument;
    const canvas = thumbnailCanvases.get(pageNumber);
    let registeredTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    if (!document || !canvas || generation !== thumbnailGeneration) return;
    try {
      const page = await document.getPage(pageNumber);
      if (generation !== thumbnailGeneration || canvas !== thumbnailCanvases.get(pageNumber)) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const cssWidth = 92;
      const viewport = page.getViewport({ scale: cssWidth / baseViewport.width });
      const outputScale = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      registeredTask = task;
      thumbnailTasks.set(pageNumber, task);
      await task.promise;
      if (generation !== thumbnailGeneration) return;
      canvas.dataset.rendered = String(generation);
      renderedThumbnails.delete(pageNumber);
      renderedThumbnails.set(pageNumber, true);
      trimThumbnailCache();
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'RenderingCancelledException')) delete canvas.dataset.rendered;
    } finally {
      if (registeredTask && thumbnailTasks.get(pageNumber) === registeredTask) thumbnailTasks.delete(pageNumber);
    }
  }

  function pumpThumbnailQueue() {
    while (activeThumbnailRenders < THUMBNAIL_RENDER_CONCURRENCY && thumbnailQueue.length) {
      const page = thumbnailQueue.shift();
      if (!page) continue;
      queuedThumbnails.delete(page);
      if (renderedThumbnails.has(page) || thumbnailTasks.has(page)) continue;
      const generation = thumbnailGeneration;
      activeThumbnailRenders += 1;
      void renderThumbnail(page, generation).finally(() => {
        activeThumbnailRenders = Math.max(0, activeThumbnailRenders - 1);
        pumpThumbnailQueue();
      });
    }
  }

  function requestThumbnail(pageNumber: number) {
    if (renderedThumbnails.has(pageNumber)) {
      renderedThumbnails.delete(pageNumber);
      renderedThumbnails.set(pageNumber, true);
      return;
    }
    if (queuedThumbnails.has(pageNumber) || thumbnailTasks.has(pageNumber)) return;
    queuedThumbnails.add(pageNumber);
    thumbnailQueue.push(pageNumber);
    pumpThumbnailQueue();
  }

  function thumbnailCanvas(node: HTMLCanvasElement, pageNumber: number) {
    node.width = 1;
    node.height = 1;
    thumbnailCanvases.set(pageNumber, node);
    node.dataset.page = String(pageNumber);
    thumbnailObserver?.observe(node);
    return {
      destroy: () => {
        thumbnailObserver?.unobserve(node);
        thumbnailCanvases.delete(pageNumber);
        visibleThumbnails.delete(pageNumber);
      },
    };
  }

  function setupThumbnailObserver() {
    thumbnailObserver?.disconnect();
    visibleThumbnails.clear();
    if (!thumbnailRail || navigationTab !== 'thumbnails') return;
    thumbnailObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const page = Number((entry.target as HTMLCanvasElement).dataset.page);
        if (entry.isIntersecting) {
          visibleThumbnails.add(page);
          requestThumbnail(page);
        } else visibleThumbnails.delete(page);
      }
      trimThumbnailCache();
    }, { root: thumbnailRail, rootMargin: '160px 0px' });
    for (const canvas of thumbnailCanvases.values()) thumbnailObserver.observe(canvas);
  }

  async function showNavigation(tab: 'thumbnails' | 'outline') {
    if (navigationOpen && navigationTab === tab) {
      closeNavigation();
      return;
    }
    if (navigationTab === 'thumbnails' && tab === 'outline') clearThumbnailRendering();
    navigationTab = tab;
    navigationOpen = true;
    await tick();
    if (tab === 'thumbnails') setupThumbnailObserver();
    else {
      thumbnailObserver?.disconnect();
      thumbnailObserver = null;
    }
  }

  function closeNavigation() {
    navigationOpen = false;
    clearThumbnailRendering();
  }

  let refreshingLayout = false;
  let layoutRefreshRequest = 0;

  async function refreshLayout() {
    const request = ++layoutRefreshRequest;
    const generation = documentGeneration;
    refreshingLayout = true;
    try {
      const targetPage = currentPage;
      // Stop any pending smooth page navigation before changing spread geometry.
      viewer?.scrollTo({ top: viewer.scrollTop, behavior: 'instant' });
      await tick();
      const nextPage = canonicalPdfPage(targetPage, pageCount, spreadActive);
      if (nextPage !== currentPage) cancelSpeech();
      currentPage = nextPage;
      await tick();
      rerenderVisible();
      // Canvas dimensions and the page wrappers settle on the following frames.
      // Restoring before that reflow can move a rotated reader back to page one.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (request !== layoutRefreshRequest || generation !== documentGeneration) return;
      pageWraps.get(nextPage)?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
      latestScrollY = viewer?.scrollTop ?? 0;
    } finally {
      requestAnimationFrame(() => {
        if (request === layoutRefreshRequest) refreshingLayout = false;
      });
    }
  }

  function updateAutomaticLayout() {
    const next = window.innerWidth >= 720 && window.innerWidth > window.innerHeight;
    if (next === autoSpread) return;
    autoSpread = next;
    if (layoutPreference === 'auto') void refreshLayout();
  }

  async function loadOutline(document: PdfDocumentLike, generation: number) {
    outlineStatus = 'loading';
    outlineItems = [];
    try {
      const source = await document.getOutline();
      if (generation !== documentGeneration) return;
      const flattened = flattenPdfOutline(source);
      if (!flattened.length) {
        outlineStatus = 'empty';
        return;
      }
      const resolved: ResolvedOutlineItem[] = [];
      for (const item of flattened) {
        const pageNumber = await resolvePdfOutlinePage(document, item.destination);
        if (generation !== documentGeneration) return;
        resolved.push({ depth: item.depth, id: item.id, pageNumber, title: item.title });
      }
      outlineItems = resolved;
      outlineStatus = 'ready';
    } catch {
      if (generation !== documentGeneration) return;
      outlineStatus = 'error';
      outlineItems = [];
    }
  }

  function pageCanvas(node: HTMLCanvasElement, pageNumber: number) {
    node.width = 1;
    node.height = 1;
    const ctx = node.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
    }
    node.style.visibility = 'hidden';
    canvases.set(pageNumber, node);
    if (visiblePages.has(pageNumber)) void renderPage(pageNumber);
    return { destroy: () => canvases.delete(pageNumber) };
  }

  function observePage(node: HTMLElement, pageNumber: number) {
    pageWraps.set(pageNumber, node);
    node.dataset.page = String(pageNumber);
    observer?.observe(node);
    return {
      destroy: () => {
        observer?.unobserve(node);
        pageWraps.delete(pageNumber);
        visiblePages.delete(pageNumber);
      },
    };
  }

  const textRenderTasks = new Map<number, { cancel: () => void }>();

  async function renderPage(pageNumber: number) {
    const document = pdfDocument;
    const canvas = canvases.get(pageNumber);
    const wrap = pageWraps.get(pageNumber);
    const container = pagesContainer;
    if (!document || !canvas || !wrap || !container || renderingPages.has(pageNumber)) return;
    const generation = renderGeneration;
    if (canvas.dataset.rendered === String(generation)) {
      canvas.style.visibility = 'visible';
      return;
    }
    let retryCancelled = false;
    let renderFailed = false;
    renderingPages.add(pageNumber);
    try {
      const page = await document.getPage(pageNumber);
      const isStillNeeded = visiblePages.has(pageNumber) || pageNumber === currentPage || (spreadActive && Math.abs(pageNumber - currentPage) <= 1);
      if (generation !== renderGeneration || !isStillNeeded) return;
      const cropBox = await detectPdfCropBox(page as PdfPageForCrop, pageNumber, cropBoxes);
      if (generation !== renderGeneration || !isStillNeeded) return;
      const baseViewport = page.getViewport(cropBox ? { scale: 1, viewBox: cropBox } : { scale: 1 });
      // The fit-width basis must stay independent from the zoomed page bed;
      // otherwise each re-render compounds the previous zoomed width.
      const availableWidth = Math.max(280, Math.min(820, viewer?.clientWidth || 800));
      const spreadPageWidth = Math.max(280, Math.min(720, Math.floor(((viewer?.clientWidth || 800) - 20) / 2)));
      const fitScale = (spreadActive ? spreadPageWidth : availableWidth) / baseViewport.width;
      const viewport = page.getViewport(cropBox
        ? { scale: fitScale * zoom, viewBox: cropBox }
        : { scale: fitScale * zoom });
      const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1), Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      const cssWidth = Math.floor(viewport.width);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      wrap.style.width = `${cssWidth}px`;
      wrap.style.height = `${Math.floor(viewport.height)}px`;
      container.style.width = `${Math.max(availableWidth, cssWidth)}px`;
      if (spreadActive) container.style.width = `${Math.max(availableWidth, cssWidth * 2 + 8)}px`;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas không khả dụng.');
      // Solid white background fill immediately upon allocating canvas dimensions prevents
      // GPU black/transparent texture flashes and keeps inverted dark mode / sepia tint rock-solid.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        background: 'rgb(255, 255, 255)',
      });
      renderTasks.set(pageNumber, task);
      await task.promise;
      canvas.style.visibility = 'visible';
      canvas.dataset.rendered = String(generation);
      const textLayerNode = textLayers.get(pageNumber);
      if (textLayerNode) {
        textLayerNode.innerHTML = '';
        textLayerNode.style.width = `${cssWidth}px`;
        textLayerNode.style.height = `${Math.floor(viewport.height)}px`;
        try {
          const pdfjs = await loadPdfjs();
          const textContent = await page.getTextContent();
          if (generation === renderGeneration && textLayers.get(pageNumber) === textLayerNode) {
            const textLayer = new pdfjs.TextLayer({
              textContentSource: textContent,
              container: textLayerNode,
              viewport,
            });
            textRenderTasks.set(pageNumber, textLayer);
            await textLayer.render();
            textRenderTasks.delete(pageNumber);
          }
        } catch {
          // ignore non-fatal textLayer issues
        }
      }
    } catch (cause) {
      retryCancelled = cause instanceof Error && cause.name === 'RenderingCancelledException';
      if (!retryCancelled) {
        renderFailed = true;
        if (!error) {
          error = 'Không thể hiển thị một trang PDF. Bạn có thể thử tải lại.';
          onNotify(`⚠️ ${error}`);
        }
      }
    } finally {
      renderTasks.delete(pageNumber);
      renderingPages.delete(pageNumber);
      const isStillNeeded = visiblePages.has(pageNumber) || pageNumber === currentPage || (spreadActive && Math.abs(pageNumber - currentPage) <= 1);
      if (!renderFailed && isStillNeeded && canvas.dataset.rendered !== String(renderGeneration)) {
        void renderPage(pageNumber);
      }
    }
  }

  function rerenderVisible() {
    renderGeneration += 1;
    for (const task of renderTasks.values()) task.cancel();
    renderTasks.clear();
    // Invalidate rendered marker so visible pages re-render at new zoom,
    // preserving existing canvas content to prevent blank white flashing.
    for (const canvas of canvases.values()) {
      delete canvas.dataset.rendered;
    }
    const pagesToRender = new Set(visiblePages);
    if (currentPage >= 1 && currentPage <= pageCount) pagesToRender.add(currentPage);
    if (spreadActive && currentPage + 1 <= pageCount) pagesToRender.add(currentPage + 1);
    requestAnimationFrame(() => {
      for (const page of pagesToRender) void renderPage(page);
    });
  }

  function setZoomAt(next: number, clientX?: number, clientY?: number) {
    const nextZoom = Math.min(4, Math.max(0.5, Math.round(next * 100) / 100));
    if (nextZoom === zoom) { displayZoom = nextZoom; return; }
    const previousZoom = zoom;
    const activeViewer = viewer;
    const pageTop = pagesContainer?.offsetTop || 0;
    const viewerRect = activeViewer?.getBoundingClientRect();
    const localX = activeViewer && viewerRect && Number.isFinite(clientX)
      ? Math.min(activeViewer.clientWidth, Math.max(0, Number(clientX) - viewerRect.left))
      : (activeViewer?.clientWidth || 0) / 2;
    const localY = activeViewer && viewerRect && Number.isFinite(clientY)
      ? Math.min(activeViewer.clientHeight, Math.max(0, Number(clientY) - viewerRect.top))
      : (activeViewer?.clientHeight || 0) / 2;
    const anchorX = activeViewer ? activeViewer.scrollLeft + localX : 0;
    const anchorY = activeViewer ? Math.max(0, activeViewer.scrollTop + localY - pageTop) : 0;
    zoom = nextZoom;
    displayZoom = nextZoom;
    rerenderVisible();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!activeViewer || viewer !== activeViewer || zoom !== nextZoom) return;
      const ratio = nextZoom / previousZoom;
      activeViewer.scrollLeft = Math.max(0, anchorX * ratio - localX);
      activeViewer.scrollTop = Math.max(0, pageTop + anchorY * ratio - localY);
      latestScrollY = activeViewer.scrollTop;
    }));
  }

  function setZoom(next: number) {
    setZoomAt(next);
  }

  function fitWidth() {
    setZoom(1);
  }

  function goToPage(page: number, quoteJump = false) {
    if (!Number.isFinite(page) || !pageCount) return;
    if (!quoteJump) { quoteTargetId = null; quoteTargetPage = null; }
    const requestedPage = Math.min(pageCount, Math.max(1, Math.floor(page)));
    const nextPage = canonicalPdfPage(requestedPage, pageCount, spreadActive);
    if (requestedPage !== speechPage) cancelSpeech();
    speechPage = requestedPage;
    currentPage = nextPage;
    pageWraps.get(requestedPage)?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
    const activeSpread = buildPdfSpreads(pageCount, spreadActive).find((spread) => spread.pages.includes(requestedPage));
    for (const visiblePage of activeSpread?.pages || [requestedPage]) {
      visiblePages.add(visiblePage);
      void renderPage(visiblePage);
    }
    schedulePdfProgress();
    updateBookmarkState();
    bookmarkListOpen = false;
    closeNavigation();
  }

  function onScroll() {
    if (!viewer || refreshingLayout) return;
    latestScrollY = viewer.scrollTop;
    onViewerScroll(latestScrollY);
    const marker = viewer.getBoundingClientRect().top + viewer.clientHeight / 3;
    let nearest = currentPage;
    for (let page = 1; page <= pageCount; page++) {
      const wrap = pageWraps.get(page);
      if (wrap && wrap.getBoundingClientRect().bottom >= marker) {
        nearest = page;
        break;
      }
    }
    const nextPage = canonicalPdfPage(nearest, pageCount, spreadActive);
    if (quoteTargetPage !== null && canonicalPdfPage(quoteTargetPage, pageCount, spreadActive) !== nextPage) {
      quoteTargetId = null;
      quoteTargetPage = null;
    }
    if (nearest !== speechPage) {
      cancelSpeech();
      speechPage = nearest;
    }
    if (nextPage !== currentPage) {
      currentPage = nextPage;
      updateBookmarkState();
    }
    if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(schedulePdfProgress, 250);
  }

  function schedulePdfProgress(flush = false): void {
    // The former writeState({ lastPage: currentPage, lastScrollY: latestScrollY }) path is intentionally retired;
    // typed reading progress is the only automatic position writer.
    if (!progressReadyForPrincipal || !readingClient || !pageCount) return;
    progressWriter.schedule({
      baseRevision: progressRevision,
      clientUpdatedAt: new Date().toISOString(),
      contentId: articleId,
      contentKind: 'pdf',
      contentVersion,
      epoch: 1,
      percent: Math.round((currentPage / pageCount) * 1_000) / 10,
      position: { page: currentPage, scrollTop: Math.round(latestScrollY) },
      total: pageCount,
    });
    if (flush) progressWriter.flush();
  }

  async function readTypedProgress(principalToken = principalGuard.capture()): Promise<ReadingProgressRecord | null> {
    if (!readingClient) return null;
    try {
      const progress = await readingClient.getProgress('pdf', articleId);
      if (!principalGuard.isCurrent(principalToken)) return null;
      if (progress) progressRevision = progress.revision;
      return progress;
    } catch {
      if (!principalGuard.isCurrent(principalToken)) return null;
      onNotify(localizeUi('⚠️ Không thể đồng bộ vị trí đọc PDF'));
      return readingClient.cachedProgress().find((row) => row.contentKind === 'pdf' && row.contentId === articleId) ?? null;
    }
  }

  function resetPrivatePdfState(): void {
    quoteTargetId = null;
    quoteTargetPage = null;
    progressWriter.cancel();
    if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
    scrollSaveTimer = null;
    if (startupFrame !== null) cancelAnimationFrame(startupFrame);
    startupFrame = null;
    progressReadyForPrincipal = false;
    progressRevision = 0;
    currentPage = 1;
    speechPage = 1;
    latestScrollY = 0;
    bookmarked = false;
    bookmarkPages = [];
    bookmarkListOpen = false;
    viewer?.scrollTo({ left: 0, top: 0 });
  }

  async function applyPrivatePdfResume(
    progress: ReadingProgressRecord | null,
    fallback: PdfBookmarkState,
    principalToken: PrivateReadingPrincipalToken,
  ): Promise<void> {
    if (!principalGuard.isCurrent(principalToken) || !pageCount) return;
    let resumePage = Number(progress?.position.page || fallback.lastPage || 1);
    let resumeScroll = Number(progress?.position.scrollTop || fallback.lastScrollY || 0);
    let quotePage: number | null = null;
    if (targetAnnotationId) {
      const target = cachedQuoteNavigation(readingClient?.cachedAnnotations() ?? [], targetAnnotationId, articleId);
      const copy = quoteCardCopy[localeStore.current];
      const page = target.status === 'pdf' ? quoteNavigationPage(target.page, pageCount) : null;
      if (target.status === 'pdf' && page !== null && pdfDocument) {
        try {
          const content = await extractPdfPageText(pdfDocument, page);
          if (!principalGuard.isCurrent(principalToken)) return;
          const resolved = resolveTextAnnotation({ content, locator: target.annotation.locator, quoteText: target.annotation.quoteText,
            contextBefore: target.annotation.contextBefore, contextAfter: target.annotation.contextAfter });
          if (resolved.status === 'active') { quotePage = page; resumePage = page; resumeScroll = 0; }
          else onNotify(copy.targetOrphaned);
        } catch { if (principalGuard.isCurrent(principalToken)) onNotify(copy.targetInvalid); }
      } else {
        onNotify(target.status === 'missing' ? copy.targetMissing : target.status === 'orphaned' ? copy.targetOrphaned : copy.targetInvalid);
      }
    }
    if (!principalGuard.isCurrent(principalToken)) return;
    currentPage = canonicalPdfPage(resumePage, pageCount, spreadActive);
    speechPage = currentPage;
    updateBookmarkState();
    if (startupFrame !== null) cancelAnimationFrame(startupFrame);
    startupFrame = requestAnimationFrame(() => {
      startupFrame = null;
      if (!principalGuard.isCurrent(principalToken)) return;
      if (quotePage !== null) {
        goToPage(quotePage, true);
        quoteTargetId = targetAnnotationId;
        quoteTargetPage = quotePage;
        annotationsOpen = true;
      } else if (resumeScroll > 10 && viewer) {
        viewer.scrollTop = resumeScroll;
        latestScrollY = viewer.scrollTop;
        onNotify(localizeUi('📖 Tiếp tục từ vị trí đã đọc'));
      } else if (currentPage > 1) {
        goToPage(currentPage);
      } else if (viewer) {
        viewer.scrollTop = 0;
        latestScrollY = 0;
      }
      progressReadyForPrincipal = true;
      for (const page of visiblePages) void renderPage(page);
    });
  }

  onMount(() => {
    let disposed = false;
    const generation = ++documentGeneration;
    visualMode = localStorage.getItem('tutam_pdf_paper_mode') === 'default' ? 'default' : 'sepia';
    copyLegacyKeysToAnonymousNamespace(localStorage, [PDF_BOOKMARK_KEY]);
    readingClient = createReadingActivityClient(fetch, localStorage);
    readingClient.setSession(session);
    const handleSessionChange = (event: Event) => {
      const detail = (event as CustomEvent<ReadingActivitySession>).detail;
      const principalChanged = principalGuard.transition(detail);
      if (principalChanged) {
        cancelPdfSizeProbe();
        resetPrivatePdfState();
      }
      readingClient?.setSession(detail);
      if (!principalChanged) return;
      const nextPrincipal = detail?.authenticated && detail.user?.id ? String(detail.user.id) : 'anonymous';
      cancelOfflineSave();
      storagePrincipal = nextPrincipal;
      offlineRecord = null;
      const principalToken = principalGuard.capture();
      void refreshOfflineState(true, principalToken, nextPrincipal);
      updateBookmarkState();
      const fallback = readState();
      void readTypedProgress(principalToken).then((progress) => {
        if (!principalGuard.isCurrent(principalToken) || !pageCount) return;
        void applyPrivatePdfResume(progress, fallback, principalToken);
      });
    };
    updateAutomaticLayout();
    window.addEventListener('resize', updateAutomaticLayout, { passive: true });
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    let pdfSelectionTimer: ReturnType<typeof setTimeout> | null = null;
    const onPdfSelectionChange = () => {
      if (pdfSelectionTimer) clearTimeout(pdfSelectionTimer);
      pdfSelectionTimer = setTimeout(checkPdfSelection, 150);
    };
    document.addEventListener('selectionchange', onPdfSelectionChange);
    window.addEventListener('mouseup', checkPdfSelection);
    const removeGestures = viewer
      ? installPdfGestures(viewer, {
          getTransformTarget: () => pagesContainer,
          getZoom: () => zoom,
          onPreviewZoom: (nextZoom) => { displayZoom = nextZoom; },
          setZoomAt,
        })
      : () => {};
    latestScrollY = Number(readState().lastScrollY || 0);
    const start = async () => {
      try {
        let storageToken = principalGuard.capture();
        let stored = await setStoragePrincipalFromSession(storageToken);
        if (!principalGuard.isCurrent(storageToken)) {
          storageToken = principalGuard.capture();
          stored = await refreshOfflineState(true, storageToken, storagePrincipal);
        }
        if (disposed) return;
        const pdfjs = await loadPdfjs();
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        const effectiveUrl = resolvePdfUrl(url);
        const useStored = Boolean(
          !isOnlineOnly &&
          stored &&
          principalGuard.isCurrent(storageToken) &&
          stored.ownerId === storagePrincipal &&
          (stored.sourceUrl === effectiveUrl || stored.sourceUrl === url),
        );
        // Sách chỉ đọc online: xóa mọi bản lưu cũ (nếu có) khỏi bộ nhớ app.
        if (isOnlineOnly && stored) void removeOffline();
        let source: { data: Uint8Array } | { url: string } = { url: effectiveUrl };
        if (useStored && stored) {
          knownPdfTotal = stored.sizeBytes;
          estimatedPdfBytes = stored.sizeBytes;
          const buffer = await stored.blob.arrayBuffer();
          if (principalGuard.isCurrent(storageToken) && stored.ownerId === storagePrincipal) {
            source = { data: new Uint8Array(buffer) };
            loadingProgress = 100;
          }
        } else if (!isOnlineOnly) {
          // Chưa có bản lưu offline: Kiểm tra trạng thái mạng
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('offline_no_network');
          }

          // Kích hoạt lấy dung lượng ngầm để hiển thị trên hộp thoại
          void requestPdfSize(effectiveUrl).then((size) => {
            if (size && !disposed && generation === documentGeneration) {
              knownPdfTotal = size;
              estimatedPdfBytes = size;
            }
          });

          // Mở hộp thoại hỏi người dùng muốn tải offline về máy không
          confirmDownloadModalOpen = true;
          const choice = await new Promise<'download' | 'online'>((resolve) => {
            userChoiceResolver = resolve;
          });
          if (disposed || generation !== documentGeneration) return;

          if (choice === 'download') {
            downloadProgressModalOpen = true;
            await saveOffline();
            if (disposed || generation !== documentGeneration) return;
            if (offlineRecord?.blob) {
              const buffer = await offlineRecord.blob.arrayBuffer();
              source = { data: new Uint8Array(buffer) };
              loadingProgress = 100;
            } else {
              // Tải offline không thành công (hoặc hủy): chuyển sang luồng online
              loadingProgress = 15;
              const mediaPath = effectiveUrl.replace(/^https?:\/\/media\.quangtu\.vn\//u, '/api/media/');
              const proxyUrl = mediaPath.startsWith('/api/media/') ? resolveApiUrl(mediaPath) : '';
              source = { url: proxyUrl || effectiveUrl };
            }
          } else {
            // Người dùng chọn đọc trực tuyến
            loadingProgress = 15;
            const mediaPath = effectiveUrl.replace(/^https?:\/\/media\.quangtu\.vn\//u, '/api/media/');
            const proxyUrl = mediaPath.startsWith('/api/media/') ? resolveApiUrl(mediaPath) : '';
            source = { url: proxyUrl || effectiveUrl };
          }
        } else {
          loadingProgress = 15;
          const mediaPath = effectiveUrl.replace(/^https?:\/\/media\.quangtu\.vn\//u, '/api/media/');
          const proxyUrl = mediaPath.startsWith('/api/media/') ? resolveApiUrl(mediaPath) : '';
          source = { url: proxyUrl || effectiveUrl };
        }
        if (disposed) return;
        if (!useStored) {
          void requestPdfSize(effectiveUrl).then((size) => {
            if (size && !disposed && generation === documentGeneration) {
              knownPdfTotal = size;
              estimatedPdfBytes = size;
            }
          });
        }
        if (useStored) {
          loadingProgress = 100;
        }

        const task = pdfjs.getDocument({
          ...source,
          worker: getPdfjsWorker(pdfjs),
          cMapUrl: '/vendor/pdfjs/cmaps/',
          disableRange: false,
          disableStream: false,
          disableAutoFetch: true,
          rangeChunkSize: 262144,
          withCredentials: false,
        }) as unknown as typeof loadingTask;
        loadingTask = task;
        if (task) {
          task.onProgress = ({ loaded, total }) => {
            const effTotal = total || knownPdfTotal || estimatedPdfBytes;
            if (effTotal && effTotal > 0) {
              const realPercent = Math.min(99, Math.max(15, Math.round((loaded / effTotal) * 100)));
              loadingProgress = Math.max(loadingProgress, realPercent);
            } else if (loaded > 0) {
              loadingBytes = loaded;
              loadingProgress = Math.min(90, Math.max(loadingProgress, 20 + Math.round(loaded / 50000)));
            }
          };
        }
        let loadedDocument: any = null;
        try {
          loadedDocument = await task?.promise;
        } catch (streamErr) {
          if (disposed || generation !== documentGeneration) return;
          console.warn('[PdfReader] Range stream error, fallback to full fetch:', streamErr);
          const fallbackUrl = (source as any).url || effectiveUrl;
          pdfFallbackAbort?.abort();
      for (const task of textRenderTasks.values()) task.cancel();
      textRenderTasks.clear();
          pdfFallbackAbort = new AbortController();
          const buf = await fetchBoundedBytes(fallbackUrl, pdfFallbackAbort.signal);
          const fallbackTask = pdfjs.getDocument({
            data: new Uint8Array(buf),
            cMapUrl: '/vendor/pdfjs/cmaps/',
          });
          loadedDocument = await fallbackTask.promise;
        } finally {
          loadingProgress = 100;
        }

        if (disposed || !loadedDocument) return;
        if (generation !== documentGeneration) return;
        pdfDocument = loadedDocument as PdfDocumentLike;
        // Web đã cập nhật PDF: tự tải lại bản lưu trong bộ nhớ app (không cần bấm tay).
        if (!isOnlineOnly && offlineState === 'update' && navigator.onLine) void saveOffline();
        void loadOutline(pdfDocument, generation);
        const first = await loadedDocument.getPage(1);
        if (disposed) return;
        pageCount = loadedDocument.numPages;
        const viewport = first.getViewport({ scale: 1 });
        pageAspectRatio = viewport.height / viewport.width;
        observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page);
            if (!page || Number.isNaN(page)) continue;
            if (entry.isIntersecting) {
              visiblePages.add(page);
              void renderPage(page);
            } else {
              visiblePages.delete(page);
              renderTasks.get(page)?.cancel();
              textRenderTasks.get(page)?.cancel();
              textRenderTasks.delete(page);
              const oldCanvas = canvases.get(page);
              if (oldCanvas) {
                oldCanvas.style.visibility = 'hidden';
                oldCanvas.width = 1;
                oldCanvas.height = 1;
                const ctx = oldCanvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, 1, 1);
                }
                delete oldCanvas.dataset.rendered;
              }
              const oldText = textLayers.get(page);
              if (oldText) oldText.innerHTML = '';
            }
          }
        }, { root: viewer, rootMargin: '800px 0px' });
        for (const [page, wrap] of pageWraps) {
          observer.observe(wrap);
          if (page <= 2) {
            visiblePages.add(page);
            void renderPage(page);
          }
        }
        const principalToken = principalGuard.capture();
        const saved = readState();
        const typedProgress = await readTypedProgress(principalToken);
        if (disposed || !principalGuard.isCurrent(principalToken)) return;
        await applyPrivatePdfResume(typedProgress, saved, principalToken);
      } catch (cause) {
        if (!disposed && generation === documentGeneration) {
          const isActuallyOffline = (
            (typeof navigator !== 'undefined' && !navigator.onLine) ||
            (cause instanceof Error && cause.message === 'offline_no_network')
          );
          if (isActuallyOffline) {
            isOfflineError = true;
            error = localeStore.current === 'en'
              ? 'Please connect to the internet to read this PDF book.'
              : 'Vui lòng kết nối mạng để đọc sách PDF này.';
            onNotify(localeStore.current === 'en' ? 'ℹ️ PDF book requires an internet connection' : 'ℹ️ Sách PDF cần kết nối mạng để tải');
          } else {
            isOfflineError = false;
            error = cause instanceof Error ? `Không thể tải PDF: ${cause.message}` : 'Không thể tải PDF.';
            onNotify(`⚠️ ${error}`);
          }
        }
      }
    };
    retryStart = () => void start();
    const handleOnline = () => {
      if (isOfflineError && !disposed) {
        onNotify(localeStore.current === 'en' ? '📶 Internet connection restored. Loading PDF...' : '📶 Đã có kết nối mạng trở lại. Đang tải sách...');
        isOfflineError = false;
        error = '';
        documentGeneration += 1;
        void start();
      }
    };
    window.addEventListener('online', handleOnline);
    void start();
    return () => {
      disposed = true;
      cancelPdfSizeProbe();
      if (userChoiceResolver) {
        userChoiceResolver('online');
        userChoiceResolver = null;
      }
      documentGeneration += 1;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('resize', updateAutomaticLayout);
      window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
      removeGestures();
      cancelSpeech();
      cancelOfflineSave();
      schedulePdfProgress(true);
      progressSync.flush();
      principalGuard.invalidate();
      progressReadyForPrincipal = false;
      void readingClient?.flush().catch(() => {});
      renderGeneration += 1;
      observer?.disconnect();
      observer = null;
      if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
      pdfFallbackAbort?.abort();
      if (startupFrame !== null) cancelAnimationFrame(startupFrame);
      startupFrame = null;
      for (const task of renderTasks.values()) task.cancel();
      renderTasks.clear();
      renderingPages.clear();
      visiblePages.clear();
      cropBoxes.clear();
      pageTextCache.clear();
      clearThumbnailRendering();
      thumbnailCanvases.clear();
      const task = loadingTask;
      loadingTask = null;
      pdfDocument = null;
      if (pdfSelectionTimer) clearTimeout(pdfSelectionTimer);
      document.removeEventListener('selectionchange', onPdfSelectionChange);
      window.removeEventListener('mouseup', checkPdfSelection);
      if (task) void task.destroy().catch(() => {});
    };
  });
</script>

<svelte:window onpointerdown={handleFloatingPanelPointerDown} />

<section class:sepia={visualMode === 'sepia'} class:annotations-open={annotationsOpen} class="pdf-shell" aria-label="Trình đọc PDF">
  {#if !isOfflineError}
  <ReaderToolsPanel bind:open={toolsOpen} scrollElement={viewer}>
  <div class="pdf-controls">
    {#if !isOnlineOnly}
      <div class="pdf-control-group pdf-offline-controls primary-offline-group">
        <button
          type="button"
          class="pdf-offline-main-btn"
          class:active={offlineState === 'saved' || offlineState === 'update'}
          class:saving={offlineState === 'saving'}
          aria-expanded={confirmDownloadModalOpen || downloadProgressModalOpen || offlinePanelOpen}
          aria-controls="pdf-offline-panel"
          title={offlineState === 'saved' ? 'Đã tải offline (Bấm để quản lý)' : offlineState === 'saving' ? 'Đang tải để đọc offline' : 'Tải để đọc offline'}
          onclick={handleOfflineButtonClick}
        >
          <span class="offline-btn-icon" aria-hidden="true">
            {#if offlineState === 'saving'}
              ⏳
            {:else if offlineState === 'saved'}
              ✓
            {:else if offlineState === 'update'}
              🔄
            {:else}
              📥
            {/if}
          </span>
          <span class="offline-btn-label">
            {#if offlineState === 'saving'}
              Đang tải {offlineProgress.percent !== null ? `${offlineProgress.percent}%` : '...'}
            {:else if offlineState === 'saved'}
              Đã tải offline
            {:else if offlineState === 'update'}
              Cập nhật bản mới
            {:else}
              Tải để đọc offline
            {/if}
          </span>
        </button>
        <button class="pdf-action-button" type="button" onclick={onShare} title="Chia sẻ bài viết"><span aria-hidden="true">📤</span><span>Chia sẻ</span></button>
      </div>
    {:else}
      <div class="pdf-control-group primary-share-group"><button class="pdf-action-button" type="button" onclick={onShare} title="Chia sẻ bài viết"><span aria-hidden="true">📤</span><span>Chia sẻ</span></button></div>
    {/if}
    <div class="pdf-control-group pdf-zoom">
      <button type="button" aria-label="Thu nhỏ" title="Thu nhỏ" onclick={() => setZoom(zoom - 0.05)}>−</button>
      <output>{Math.round(displayZoom * 100)}%</output>
      <button type="button" aria-label="Phóng to" title="Phóng to" onclick={() => setZoom(zoom + 0.05)}>+</button>
      <button type="button" title="Vừa màn hình" onclick={fitWidth}><span class="desktop-label">Fit</span><span class="mobile-label">Vừa màn hình</span></button>
    </div>
    <div class="pdf-control-group pdf-page-status">
      <button
        type="button"
        class="pdf-page-step-btn prev"
        disabled={!pageCount || currentPage <= 1}
        onclick={() => goToPage(currentPage - 1)}
        title="Trang trước"
        aria-label="Trang trước"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        <span class="desktop-label">Trước</span>
      </button>
      <span class="pdf-page-indicator" aria-live="polite">Trang {currentPage} / {pageCount || '…'}</span>
      <button
        type="button"
        class="pdf-page-step-btn next"
        disabled={!pageCount || currentPage >= pageCount}
        onclick={() => goToPage(currentPage + 1)}
        title="Trang sau"
        aria-label="Trang sau"
      >
        <span class="desktop-label">Sau</span>
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <form class="pdf-page-form" aria-label="Đi đến trang PDF" onsubmit={submitPage}>
        <input type="number" inputmode="numeric" min="1" max={Math.max(1, pageCount)} step="1" required bind:value={pageInput} disabled={!pageCount} aria-label="Số trang PDF" />
        <button type="submit" disabled={!pageCount}>Đi</button>
      </form>
    </div>
    <div class="pdf-control-group pdf-navigation-buttons">
      <button type="button" class:active={navigationOpen && navigationTab === 'thumbnails'} aria-expanded={navigationOpen && navigationTab === 'thumbnails'} aria-controls="pdf-navigation-panel" onclick={() => void showNavigation('thumbnails')} title="Ảnh thu nhỏ các trang">Trang</button>
      <button type="button" class:active={navigationOpen && navigationTab === 'outline'} aria-expanded={navigationOpen && navigationTab === 'outline'} aria-controls="pdf-navigation-panel" onclick={() => void showNavigation('outline')} title="Mục lục trong PDF">Mục lục</button>
    </div>
    <div class="pdf-control-group pdf-reading-options">
      <label class="sr-only" for="pdf-layout-mode">Bố cục trang</label>
      <select id="pdf-layout-mode" value={layoutPreference} onchange={(event) => { layoutPreference = event.currentTarget.value as typeof layoutPreference; void refreshLayout(); }} title="Bố cục trang">
        <option value="auto">Tự động</option>
        <option value="single">Một trang</option>
        <option value="spread">Hai trang</option>
      </select>
      <button type="button" class:active={visualMode === 'sepia'} aria-pressed={visualMode === 'sepia'} onclick={togglePaperMode} title="Chế độ nền ấm"><span class="desktop-label">Ấm</span><span class="mobile-label">Nền ấm</span></button>
    </div>
    <div class="pdf-control-group pdf-speech-controls">
      <button
        type="button"
        class:active={speechState === 'playing' || speechState === 'paused'}
        aria-pressed={speechState === 'playing' || speechState === 'paused'}
        aria-busy={speechState === 'loading'}
        disabled={!pageCount || speechState === 'loading'}
        title={speechState === 'playing' ? 'Dừng đọc trang' : speechState === 'paused' ? 'Tiếp tục đọc trang' : 'Đọc trang hiện tại'}
        onclick={toggleSpeech}
      >
        <span aria-hidden="true">{speechState === 'loading' ? '⏳' : speechState === 'playing' ? '⏹️' : '🔊'}</span>
        <span class="compact-label">{speechState === 'loading' ? 'Đang tải...' : speechState === 'playing' ? 'Dừng' : speechState === 'paused' ? 'Tiếp' : 'Nghe'}</span>
      </button>
      {#if speechState === 'paused'}
        <button type="button" aria-label="Dừng đọc trang" title="Dừng đọc trang" onclick={() => cancelSpeech(false)}>■<span class="mobile-label">Dừng đọc</span></button>
      {/if}
<span class="pdf-voice-default">{localeStore.t.readerToolbar.voiceDefault}</span>
      <select
        class="pdf-speech-select"
        aria-label="Tốc độ giọng đọc"
        value={String(ttsSpeed)}
        onchange={(e) => changeTtsSpeed(Number(e.currentTarget.value))}
        title="Tốc độ giọng đọc"
      >
        <option value="0.8">0.8×</option>
        <option value="1">1.0×</option>
        <option value="1.2">1.2×</option>
      </select>
    </div>
    <div class="pdf-control-group pdf-bookmarks">
      <button class:active={bookmarked} type="button" onclick={() => { offlinePanelOpen = false; toggleBookmark(); }} aria-label="Đánh dấu trang" aria-pressed={bookmarked} title={bookmarked ? 'Bỏ đánh dấu trang này' : 'Đánh dấu trang này'}>🔖<span class="mobile-label">{bookmarked ? 'Bỏ đánh dấu trang này' : 'Đánh dấu trang này'}</span></button>
      <button class:active={bookmarkListOpen} type="button" onclick={toggleBookmarkList} aria-label="Trang đã đánh dấu" aria-expanded={bookmarkListOpen} title="Trang đã đánh dấu">☰<span class="mobile-label">Danh sách đã đánh dấu</span></button>
    </div>
    <div class="pdf-control-group pdf-annotations">
      <button type="button" class:active={annotationsOpen} aria-expanded={annotationsOpen} aria-controls="pdf-annotation-panel" title="Tô sáng và ghi chú văn bản PDF" onclick={() => annotationsOpen = !annotationsOpen}>
        <span aria-hidden="true">✦</span><span class="compact-label">Trích dẫn</span>
      </button>
    </div>

  </div>
  </ReaderToolsPanel>
  {/if}
  {#if confirmDownloadModalOpen}
    <div class="pdf-offline-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pdf-confirm-dl-title" tabindex="-1">
      <div data-dialog-glass class="pdf-offline-modal-card">
        <div class="pdf-offline-modal-icon">📥</div>
        <h3 id="pdf-confirm-dl-title">Tải sách để đọc offline</h3>
        <p class="pdf-offline-modal-desc">
          Bạn có muốn tải toàn bộ sách PDF <strong>"{title}"</strong> về thiết bị để đọc khi không có mạng không?
        </p>
        {#if estimatedPdfBytes}
          <div class="pdf-offline-modal-size-tag">
            Dung lượng: <strong>{formatStorageBytes(estimatedPdfBytes)}</strong>
          </div>
        {/if}
        <div class="pdf-offline-modal-actions dialog-actions-balanced">
          <button type="button" class="btn-cancel" onclick={() => resolveUserChoice('online')}>
            Đọc online
          </button>
          <button type="button" class="btn-confirm" onclick={() => resolveUserChoice('download')}>
            Tải về máy
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if downloadProgressModalOpen}
    <div class="pdf-offline-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pdf-dl-progress-title" tabindex="-1">
      <div data-dialog-glass class="pdf-offline-modal-card">
        <div class="pdf-offline-modal-icon pulse">⏳</div>
        <h3 id="pdf-dl-progress-title">Đang tải sách PDF...</h3>
        <p class="pdf-offline-modal-sub">{title}</p>
        
        <div class="pdf-dl-progress-display">
          <div class="pdf-dl-percent-number">
            {offlineProgress.percent !== null ? `${offlineProgress.percent}%` : 'Đang tải...'}
          </div>
          <progress
            class="pdf-dl-progress-bar"
            value={offlineProgress.bytesTotal ? offlineProgress.bytesDownloaded : undefined}
            max={offlineProgress.bytesTotal || 100}
            aria-label="Tiến độ tải sách PDF"
          ></progress>
          <div class="pdf-dl-bytes-info">
            <span>{formatStorageBytes(offlineProgress.bytesDownloaded)}</span>
            {#if offlineProgress.bytesTotal}
              <span>/ {formatStorageBytes(offlineProgress.bytesTotal)}</span>
            {/if}
          </div>
        </div>

        {#if offlineError}
          <p class="pdf-dl-error-msg" role="alert">{offlineError}</p>
        {/if}

        <div class="pdf-offline-modal-actions">
          <button type="button" class="btn-cancel" onclick={() => { cancelOfflineSave(); downloadProgressModalOpen = false; }}>
            Hủy tải
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if offlinePanelOpen}
    <section id="pdf-offline-panel" class="pdf-offline-panel" aria-label="Quản lý PDF ngoại tuyến">
      <header><strong>PDF ngoại tuyến</strong><button type="button" aria-label="Đóng quản lý ngoại tuyến" onclick={() => offlinePanelOpen = false}>✕</button></header>
      <div class="pdf-offline-body">
        {#if offlineState === 'checking'}
          <p role="status">Đang kiểm tra bộ nhớ…</p>
        {:else if offlineState === 'unavailable'}
          <p role="alert">Trình duyệt này không hỗ trợ lưu PDF an toàn bằng IndexedDB và kiểm tra checksum.</p>
        {:else if offlineState === 'saving'}
          <p role="status">Đang lưu {offlineProgress.percent === null ? formatStorageBytes(offlineProgress.bytesDownloaded) : `${offlineProgress.percent}%`}</p>
          <progress max={offlineProgress.bytesTotal || 100} value={offlineProgress.bytesTotal ? offlineProgress.bytesDownloaded : undefined} aria-label="Tiến độ lưu PDF ngoại tuyến"></progress>
          <button type="button" class="pdf-offline-secondary" onclick={cancelOfflineSave}>Hủy</button>
        {:else if offlineState === 'saved' || offlineState === 'update'}
          <p><strong>{offlineState === 'update' ? 'Có bản mới trên máy chủ.' : 'Sẵn sàng khi mất mạng.'}</strong><br />Đang dùng {formatStorageBytes(offlineRecord?.sizeBytes || 0)} trên thiết bị.</p>
          <div class="pdf-offline-actions">
            {#if offlineState === 'update'}<button type="button" onclick={() => void saveOffline()}>Cập nhật</button>{/if}
            <button type="button" class="pdf-offline-secondary" onclick={() => void removeOffline()}>Xóa và giải phóng</button>
          </div>
        {:else}
          {#if offlineError}<p role="alert">{offlineError}</p>{:else}<p>Lưu một bản hoàn chỉnh để đọc khi mất mạng.</p>{/if}
          <button type="button" onclick={() => void saveOffline()}>{offlineState === 'error' ? 'Thử lại' : 'Lưu trên thiết bị'}</button>
        {/if}
        <small>Tối đa 80 MiB và không vượt dung lượng an toàn còn trống. Trình duyệt vẫn có thể thu hồi dữ liệu. {storagePrincipal === 'anonymous' ? 'Bản khách chỉ thuộc vùng dữ liệu ẩn danh.' : 'Bản này thuộc tài khoản hiện tại.'}</small>
      </div>
    </section>
  {/if}
  <PdfAnnotations targetAnnotationId={quoteTargetId} bind:open={annotationsOpen} {articleId} {contentVersion} document={pdfDocument} page={quoteTargetPage ?? speechPage} {session} {onNotify} />
  <span class="sr-only" aria-live="polite">{speechState === 'loading' ? `Đang chuẩn bị văn bản trang ${speechPage}` : speechState === 'playing' ? `Đang đọc trang ${speechPage}` : speechState === 'paused' ? `Đã tạm dừng trang ${speechPage}` : ''}</span>
  {#if pageTextState === 'no-text'}<div class="pdf-capability-message" role="status">Trang này không có lớp văn bản để đọc. Tài liệu quét cần OCR, hiện chưa được hỗ trợ.</div>{/if}
  {#if pageTextState === 'error'}<div class="pdf-capability-message pdf-capability-error" role="alert">Không thể trích xuất văn bản của trang này.</div>{/if}
  {#if navigationOpen}
    <aside id="pdf-navigation-panel" class="pdf-navigation-panel" aria-label={navigationTab === 'thumbnails' ? 'Điều hướng bằng ảnh thu nhỏ' : 'Mục lục PDF'}>
      <header>
        <strong>{navigationTab === 'thumbnails' ? 'Các trang' : 'Mục lục PDF'}</strong>
        <button type="button" aria-label="Đóng bảng điều hướng" onclick={closeNavigation}>✕</button>
      </header>
      {#if navigationTab === 'thumbnails'}
        <div class="pdf-thumbnail-rail" bind:this={thumbnailRail} aria-label="Danh sách ảnh thu nhỏ">
          {#each Array(pageCount) as _, index}
            <button type="button" class:active={canonicalPdfPage(index + 1, pageCount, spreadActive) === currentPage} aria-current={canonicalPdfPage(index + 1, pageCount, spreadActive) === currentPage ? 'page' : undefined} aria-label={`Đi đến trang ${index + 1}`} onclick={() => goToPage(index + 1)}>
              <span class="pdf-thumbnail-canvas"><canvas use:thumbnailCanvas={index + 1}></canvas></span>
              <span>Trang {index + 1}</span>
            </button>
          {/each}
        </div>
      {:else if outlineStatus === 'loading'}
        <p class="pdf-navigation-state" role="status">Đang tải mục lục…</p>
      {:else if outlineStatus === 'empty'}
        <p class="pdf-navigation-state">Tài liệu này không có mục lục được nhúng.</p>
      {:else if outlineStatus === 'error'}
        <p class="pdf-navigation-state" role="alert">Không thể đọc mục lục của tài liệu.</p>
      {:else}
        <nav class="pdf-outline" aria-label="Mục lục trong tài liệu">
          {#each outlineItems as item (item.id)}
            <button type="button" style={`--outline-depth:${item.depth}`} disabled={item.pageNumber === null} title={item.pageNumber === null ? 'Mục này không có đích đến trong tài liệu' : `Đi đến trang ${item.pageNumber}`} onclick={() => item.pageNumber && goToPage(item.pageNumber)}>
              <span>{item.title}</span>
              {#if item.pageNumber}<small>{item.pageNumber}</small>{:else}<small>—</small>{/if}
            </button>
          {/each}
        </nav>
      {/if}
    </aside>
  {/if}
  {#if isOfflineError}
    <div class="pdf-offline-state" role="alert">
      <div class="pdf-offline-card">
        <div class="pdf-offline-icon-wrap" aria-hidden="true">
          <svg class="pdf-offline-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>

        <div class="pdf-offline-badge">
          {localeStore.current === 'en' ? 'OFFLINE • NETWORK REQUIRED' : 'NGOẠI TUYẾN • CẦN KẾT NỐI MẠNG'}
        </div>

        <h2>
          {localeStore.current === 'en' ? 'Please Connect to the Internet' : 'Vui Lòng Kết Nối Mạng'}
        </h2>

        <p class="pdf-offline-desc">
          {#if localeStore.current === 'en'}
            The PDF book <strong>"{title}"</strong> has not been downloaded to your device yet. Please connect to Wi-Fi or mobile data to download and read.
          {:else}
            Sách PDF <strong>"{title}"</strong> chưa được tải về máy của bạn. Vui lòng kết nối Internet (Wi-Fi hoặc 4G/5G) để tải và đọc sách.
          {/if}
        </p>

        <div class="pdf-offline-tip">
          <span class="tip-icon" aria-hidden="true">💡</span>
          <span>
            {#if localeStore.current === 'en'}
              Tip: Standard books and scriptures in the app are already bundled offline and can be read anytime without an internet connection.
            {:else}
              Gợi ý: Các sách văn bản và kinh điển trong ứng dụng đã được nạp sẵn và có thể đọc hoàn toàn ngoại tuyến mà không cần mạng.
            {/if}
          </span>
        </div>

        <div class="pdf-offline-actions">
          <button
            type="button"
            class="btn-retry"
            onclick={() => {
              isOfflineError = false;
              error = '';
              documentGeneration += 1;
              retryStart();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
            </svg>
            {localeStore.current === 'en' ? 'Retry Connection' : 'Thử lại kết nối'}
          </button>

          <button
            type="button"
            class="btn-back"
            onclick={() => {
              if (onClose) onClose();
              else if (typeof history !== 'undefined') history.back();
            }}
          >
            {localeStore.current === 'en' ? '← Back to Library' : '← Quay lại tủ sách'}
          </button>
        </div>
      </div>
    </div>
  {:else}
    {#if !pageCount && !error}
      <div class="pdf-status" role="status">
        <div class="pdf-status-text">
          <span>{localeStore.current === 'en' ? 'Loading PDF…' : 'Đang tải PDF…'}</span>
          <strong>{loadingProgress}%</strong>
        </div>
        <progress class="pdf-status-progress" value={loadingProgress} max="100"></progress>
      </div>
    {/if}
    {#if error}
      <div class="pdf-error" role="alert">
        <span>{error}</span>
        <button type="button" class="pdf-error-retry-btn" onclick={() => { error = ''; documentGeneration += 1; retryStart(); }}>
          {localeStore.current === 'en' ? 'Retry' : 'Thử lại'}
        </button>
      </div>
    {/if}
    <div class="pdf-viewer" bind:this={viewer} onscroll={onScroll}>
      <header class="pdf-document-header">
        <div class="pdf-document-meta">
          <span class="pdf-document-category">{categoryIcon} {category}</span>
          {#if dateLabel}<span>{dateLabel}</span>{/if}
          <span class="pdf-document-author">{author}</span>
          {#if viewCount !== null}<span class="pdf-document-views">👁 {viewCount} lượt xem</span>{/if}
        </div>
        <h1 id="reader-title">{title}</h1>
      </header>
      <div class:spread={spreadActive} class="pdf-pages" style={`--page-aspect:${1 / pageAspectRatio}`} bind:this={pagesContainer}>
        {#each pageSpreads as spread (spread.id)}
          <div class="pdf-spread" data-canonical-page={spread.canonicalPage} aria-label={spread.pages.length > 1 ? localizeUi('Trang {0} và {1}', spread.pages[0], spread.pages[1]) : localizeUi('Trang {0}', spread.pages[0])}>
            {#each spread.pages as page (page)}
              <div class="pdf-page" data-page={page} use:observePage={page} aria-label={localizeUi('Trang {0}', page)}>
                <canvas use:pageCanvas={page}></canvas>
                <div class="pdf-text-layer textLayer" use:pageTextLayer={page}></div>
                <span>{page}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
      <div class="pdf-extras pdf-comments">
        {#if currentArticle.tags.length}
          <div class="pdf-tags" aria-label="Chủ đề bài viết">
            {#each currentArticle.tags as tag}<span>{tag}</span>{/each}
          </div>
        {/if}
        {#if externalUrl}
          <div class="pdf-action-bar">
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">Xem bài đầy đủ <span aria-hidden="true">↗</span></a>
          </div>
        {/if}
        <MostViewedArticles {currentArticle} {articles} onOpen={onOpenArticle} />
        <CommentsPanel {articleId} />
      </div>
    </div>
  {/if}
  {#if pageCount > 0 && !isOfflineError && !annotationsOpen}
    <div class="pdf-floating-pager" class:pdf-floating-pager--panel-open={bookmarkListOpen} aria-label="Đánh dấu trang và thu phóng PDF">
      {#if bookmarkListOpen}
        <section
          class="pdf-bookmark-panel"
          bind:this={bookmarkPanel}
          tabindex="-1"
          aria-label="Danh sách trang đã đánh dấu"
          use:readerPanelKeyboard={() => void toggleBookmarkList()}
        >
          <header>
            <div class="pdf-bookmark-header-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              <strong>Trang đã đánh dấu ({bookmarkPages.length})</strong>
            </div>
            <button type="button" class="pdf-bookmark-close-btn" aria-label="Đóng danh sách đánh dấu" onclick={toggleBookmarkList}>✕</button>
          </header>
          {#if bookmarkPages.length}
            <div class="pdf-bookmark-scroll" role="list">
              {#each bookmarkPages as page}
                <div class="pdf-bookmark-row" class:active-page={page === currentPage}>
                  <button type="button" class="pdf-bookmark-jump-btn" onclick={() => goToPage(page)}>
                    <span class="pdf-bookmark-page-label">Trang {page}</span>
                    {#if page === currentPage}
                      <span class="pdf-bookmark-current-tag">Đang đọc</span>
                    {/if}
                  </button>
                  <button type="button" class="pdf-bookmark-del-btn" aria-label={`Xóa đánh dấu trang ${page}`} title={`Xóa đánh dấu trang ${page}`} onclick={() => removeBookmark(page)}>✕</button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="pdf-bookmark-empty">Chưa có trang đánh dấu.<br />Nhấn 🔖 để đánh dấu trang hiện tại.</p>
          {/if}
        </section>
      {/if}

      <button
        type="button"
        class="pdf-pager-btn pdf-bookmark-btn"
        class:active={bookmarked}
        onclick={() => toggleBookmark()}
        aria-label={bookmarked ? `Bỏ đánh dấu trang ${currentPage}` : `Đánh dấu trang ${currentPage}`}
        aria-pressed={bookmarked}
        title={bookmarked ? `Bỏ đánh dấu trang ${currentPage}` : `Đánh dấu trang ${currentPage}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <button
        bind:this={bookmarkTrigger}
        type="button"
        class="pdf-pager-btn pdf-bookmark-list-btn"
        class:active={bookmarkListOpen}
        onclick={toggleBookmarkList}
        aria-label="Danh sách trang đã đánh dấu"
        aria-expanded={bookmarkListOpen}
        title="Danh sách trang đã đánh dấu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="9" y1="6" x2="20" y2="6"/>
          <line x1="9" y1="12" x2="20" y2="12"/>
          <line x1="9" y1="18" x2="20" y2="18"/>
          <path d="M4 5v14l3-2 3 2V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1z" fill={bookmarkPages.length ? "currentColor" : "none"}/>
        </svg>
        {#if bookmarkPages.length > 0}
          <span class="pdf-bookmark-badge" aria-label={`${bookmarkPages.length} trang đã đánh dấu`}>{bookmarkPages.length}</span>
        {/if}
      </button>

      <span class="pdf-pager-info sr-only" aria-live="polite">Trang {currentPage} / {pageCount}</span>

      <span class="pdf-pager-divider" aria-hidden="true"></span>
      <div class="pdf-pager-zoom-group" aria-label="Thu phóng PDF">
        <button
          type="button"
          class="pdf-zoom-btn zoom-out"
          disabled={zoom <= 0.5}
          onclick={() => setZoom(zoom - 0.1)}
          aria-label="Thu nhỏ"
          title="Thu nhỏ (−)"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
        </button>
        <button
          type="button"
          class="pdf-pager-zoom-text"
          onclick={fitWidth}
          title="Đặt lại 100% (Vừa màn hình)"
          aria-label="Tỷ lệ {Math.round(displayZoom * 100)}%, nhấn để về 100%"
        >
          {Math.round(displayZoom * 100)}%
        </button>
        <button
          type="button"
          class="pdf-zoom-btn zoom-in"
          disabled={zoom >= 4}
          onclick={() => setZoom(zoom + 0.1)}
          aria-label="Phóng to"
          title="Phóng to (+)"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </div>
  {/if}

  {#if pdfQuoteBtnPos}
    <div class="pdf-quote-floating-bar" style="top:{pdfQuoteBtnPos.top}px;left:{pdfQuoteBtnPos.left}px;">
      <button
        class="pdf-quote-floating-btn"
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => void handlePdfQuoteSave()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Lưu trích dẫn</span>
      </button>
      <button
        class="pdf-quote-floating-btn secondary"
        type="button"
        title="Sao chép đoạn văn vào bộ nhớ tạm"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => void handlePdfCopy()}
      >
        <span>📋 Sao chép</span>
      </button>
    </div>
  {/if}
</section>

<style>
  .pdf-text-layer{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;opacity:1;line-height:1;z-index:2;user-select:text;-webkit-user-select:text}
  :global(.pdf-text-layer span),:global(.pdf-text-layer br){color:transparent!important;position:absolute;white-space:pre;cursor:text;transform-origin:0 0}
  :global(.pdf-text-layer ::selection){background:rgba(212,168,75,.45)!important;color:transparent!important}
  .pdf-quote-floating-bar{position:fixed;z-index:850;display:inline-flex;align-items:center;gap:4px;padding:3px;border:1.5px solid var(--gold,#b37d22);border-radius:20px;background:var(--card,#fff);box-shadow:0 4px 18px rgba(0,0,0,.2),0 0 0 1px rgba(212,168,75,.2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:pdfQuoteBtnPop .18s cubic-bezier(.34,1.3,.64,1)}
  @keyframes pdfQuoteBtnPop{from{opacity:0;transform:scale(.88) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
  .pdf-quote-floating-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:0;border-radius:16px;background:var(--gold,#b37d22);color:#fff;font:700 var(--font-size-label) var(--font-app);cursor:pointer;user-select:none;transition:background .15s,transform .12s}
  .pdf-quote-floating-btn:hover{background:var(--brown,#8c6016);transform:scale(1.02)}
  .pdf-quote-floating-btn:active{transform:scale(.96)}
  .pdf-quote-floating-btn.secondary{background:transparent;color:var(--text,#1c1a15);padding:0 10px;font-weight:600}
  .pdf-quote-floating-btn.secondary:hover{background:var(--gold-light,rgba(179,125,34,.1));color:var(--gold,#b37d22)}
  :global([data-theme='dark']) .pdf-quote-floating-bar,:global(.bg-dark) .pdf-quote-floating-bar{background:#1e1914!important;border-color:#d4a84b!important;box-shadow:0 4px 22px rgba(0,0,0,.7),0 0 10px rgba(212,168,75,.2)!important}
  :global([data-theme='dark']) .pdf-quote-floating-btn.secondary,:global(.bg-dark) .pdf-quote-floating-btn.secondary{color:#ede8df!important}
  :global([data-theme='dark']) .pdf-quote-floating-btn.secondary:hover,:global(.bg-dark) .pdf-quote-floating-btn.secondary:hover{background:rgba(212,168,75,.2)!important;color:#d4a84b!important}
  .pdf-shell{position:relative;overflow:hidden;display:flex;min-height:0;min-width:0;flex:1;flex-direction:column;background:#fff}.pdf-controls{position:relative;z-index:2;display:flex;height:49px;overflow-x:auto;flex:0 0 auto;flex-wrap:nowrap;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--card);color:var(--text);scrollbar-width:thin}.pdf-control-group{display:flex;min-width:max-content;align-items:center;gap:5px}.pdf-control-group+.pdf-control-group{margin-left:2px;padding-left:8px;border-left:1px solid var(--border)}.pdf-page-status{min-width:200px;flex:1;justify-content:center;color:var(--muted);font-size:13px;white-space:nowrap}.pdf-controls button{display:flex;min-width:34px;height:34px;align-items:center;justify-content:center;padding:0 8px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);cursor:pointer;font:14px Arial,sans-serif;transition:background .15s,border-color .15s,transform .15s}.pdf-controls button:hover{border-color:var(--gold);background:var(--bg)}.pdf-controls button:active{transform:scale(.94)}.pdf-controls button.active{border-color:var(--gold);background:var(--gold);color:var(--on-gold)}.pdf-controls output{min-width:38px;color:var(--muted);font-size:12px;text-align:center}.pdf-zoom button:last-child{padding:0 6px;font-size:12px}.pdf-action-button{gap:4px}.pdf-action-button span:first-child{font-size:13px;line-height:1}.pdf-action-button span:last-child{font-size:var(--font-size-label);font-weight:600;line-height:1}.pdf-page-step-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:34px;height:34px;padding:0 9px;border:1.5px solid var(--gold);border-radius:8px;background:transparent;color:var(--gold);font-size:13px;font-weight:700;cursor:pointer;transition:background .15s,color .15s}.pdf-page-step-btn:hover:not(:disabled){background:var(--gold);color:#fff}.pdf-page-step-btn:disabled{border-color:var(--border);color:var(--muted);opacity:.45;cursor:not-allowed}.pdf-page-indicator{margin:0 4px;font-weight:600;font-size:13px}.pdf-floating-pager{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);margin:0;display:flex;align-items:center;gap:6px;padding:6px 12px;height:48px;min-height:48px;max-height:48px;box-sizing:border-box;border-radius:24px;background:rgba(255,255,255,.96);border:1.5px solid rgba(179,125,34,.35);box-shadow:0 6px 24px rgba(0,0,0,.15);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:960;width:max-content;max-width:calc(100vw - 24px);white-space:nowrap;user-select:none;pointer-events:auto;animation:pdfPagerIn .2s ease-out}@keyframes pdfPagerIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}:global([data-theme='dark']) .pdf-floating-pager,:global(.bg-dark) .pdf-floating-pager{background:rgba(24,20,16,.95)!important;border:1.5px solid rgba(212,168,75,.45)!important;box-shadow:0 8px 30px rgba(0,0,0,.6),0 0 10px rgba(212,168,75,.15)!important}.pdf-pager-info{font-size:13px;font-weight:700;color:#2e241c;font-variant-numeric:tabular-nums;min-width:96px;text-align:center;padding:0 2px;white-space:nowrap;flex:0 0 auto}:global([data-theme='dark']) .pdf-pager-info,:global(.bg-dark) .pdf-pager-info{color:#f5eedf!important;text-shadow:0 1px 2px rgba(0,0,0,.5)}.pdf-pager-btn,.pdf-zoom-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;min-width:36px;max-width:36px;min-height:36px;max-height:36px;padding:0;border:0;border-radius:50%;background:var(--gold,#b37d22);color:#fff!important;cursor:pointer;transition:transform .15s,background-color .15s,box-shadow .15s;flex:0 0 36px;box-sizing:border-box}.pdf-pager-btn:hover:not(:disabled),.pdf-zoom-btn:hover:not(:disabled){background:var(--brown,#8c6016);box-shadow:0 2px 10px rgba(0,0,0,.25);transform:scale(1.08)}.pdf-pager-btn:active:not(:disabled),.pdf-zoom-btn:active:not(:disabled){transform:scale(.94)}.pdf-pager-btn:disabled,.pdf-zoom-btn:disabled{background:rgba(0,0,0,.06)!important;border:1px solid rgba(0,0,0,.12)!important;color:rgba(46,36,28,.3)!important;opacity:1!important;cursor:not-allowed;transform:none!important;box-shadow:none!important}:global([data-theme='dark']) .pdf-pager-btn:disabled,:global([data-theme='dark']) .pdf-zoom-btn:disabled,:global(.bg-dark) .pdf-pager-btn:disabled,:global(.bg-dark) .pdf-zoom-btn:disabled{background:rgba(255,255,255,.08)!important;border:1px solid rgba(255,255,255,.16)!important;color:rgba(245,238,223,.35)!important}.pdf-pager-divider{display:block;width:1px;height:20px;background:rgba(179,125,34,.25);margin:0 2px;flex:0 0 1px}:global([data-theme='dark']) .pdf-pager-divider,:global(.bg-dark) .pdf-pager-divider{background:rgba(212,168,75,.35)}.pdf-pager-zoom-group{display:inline-flex;align-items:center;gap:4px;flex-shrink:0}.pdf-pager-zoom-text{display:inline-flex;align-items:center;justify-content:center;width:44px;min-width:44px;max-width:44px;height:28px;padding:0;border:1px solid transparent;border-radius:12px;background:transparent;color:#2e241c;font:700 12px var(--font-app);font-variant-numeric:tabular-nums;cursor:pointer;transition:background .15s,color .15s,border-color .15s;user-select:none;flex:0 0 44px;box-sizing:border-box}.pdf-pager-zoom-text:hover{background:rgba(179,125,34,.12);border-color:var(--gold,#b37d22);color:var(--gold,#b37d22)}:global([data-theme='dark']) .pdf-pager-zoom-text,:global(.bg-dark) .pdf-pager-zoom-text{color:#f5eedf!important}:global([data-theme='dark']) .pdf-pager-zoom-text:hover,:global(.bg-dark) .pdf-pager-zoom-text:hover{background:rgba(212,168,75,.2);border-color:rgba(212,168,75,.6);color:#d4a84b!important}@media(max-width:420px){.pdf-floating-pager{bottom:calc(72px + env(safe-area-inset-bottom,0px));height:44px;min-height:44px;max-height:44px;padding:4px 8px;gap:4px;max-width:calc(100vw - 16px)}.pdf-pager-btn,.pdf-zoom-btn{width:32px;height:32px;min-width:32px;max-width:32px;min-height:32px;max-height:32px;flex:0 0 32px}.pdf-pager-info{font-size:11.5px;min-width:82px;padding:0 2px}.pdf-pager-zoom-text{width:38px;min-width:38px;max-width:38px;font-size:11px;flex:0 0 38px}}.pdf-bookmark-btn{position:relative}.pdf-bookmark-btn.active{background:var(--gold,#b37d22);box-shadow:0 0 10px rgba(212,168,75,.6)}.pdf-bookmark-list-btn{position:relative}.pdf-bookmark-list-btn.active{background:var(--brown,#8c6016)}.pdf-bookmark-badge{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#e03131;border:1.5px solid #fff;color:#fff;font:700 10px var(--font-app);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.25);box-sizing:border-box;line-height:1}:global([data-theme='dark']) .pdf-bookmark-badge,:global(.bg-dark) .pdf-bookmark-badge{border-color:#181410;background:#e04535}.pdf-floating-pager .pdf-bookmark-panel{position:absolute;bottom:calc(100% + 12px);left:50%;transform:translateX(-50%);width:250px;max-height:280px;display:flex;flex-direction:column;border:1.5px solid rgba(179,125,34,.35);border-radius:14px;background:rgba(255,255,255,.98);box-shadow:0 12px 32px rgba(0,0,0,.2);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:60;overflow:hidden;box-sizing:border-box;animation:pdfPanelUp .2s cubic-bezier(.34,1.2,.64,1);top:auto;right:auto}:global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel,:global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel{background:rgba(26,22,18,.98)!important;border-color:rgba(212,168,75,.45)!important;box-shadow:0 12px 32px rgba(0,0,0,.7),0 0 10px rgba(212,168,75,.15)!important}.pdf-floating-pager .pdf-bookmark-panel header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border2);background:transparent;flex-shrink:0}.pdf-bookmark-header-title{display:inline-flex;align-items:center;gap:6px;color:var(--text);font-size:var(--font-size-card-title);font-weight:700}.pdf-bookmark-header-title svg{color:var(--gold,#b37d22)}.pdf-bookmark-close-btn{display:flex;align-items:center;justify-content:center;width:24px;height:24px;min-width:24px;min-height:24px!important;padding:0!important;border:0!important;border-radius:6px;background:transparent!important;color:var(--muted);cursor:pointer;font-size:12px;transition:background .15s,color .15s}.pdf-bookmark-close-btn:hover{background:var(--bg2)!important;color:var(--text)}.pdf-bookmark-scroll{overflow-y:auto;max-height:220px;display:flex;flex-direction:column}.pdf-floating-pager .pdf-bookmark-row{display:flex;align-items:center;border-bottom:1px solid var(--border2);transition:background .15s}.pdf-floating-pager .pdf-bookmark-row:last-child{border-bottom:0}.pdf-floating-pager .pdf-bookmark-row:hover{background:rgba(179,125,34,.08)}.pdf-floating-pager .pdf-bookmark-row.active-page{background:rgba(179,125,34,.14)}:global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-row:hover,:global(.bg-dark) .pdf-floating-pager .pdf-bookmark-row:hover{background:rgba(212,168,75,.12)}:global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-row.active-page,:global(.bg-dark) .pdf-floating-pager .pdf-bookmark-row.active-page{background:rgba(212,168,75,.22)}.pdf-bookmark-jump-btn{flex:1;display:flex;align-items:center;justify-content:space-between;padding:8px 12px!important;min-height:36px!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--text);font:600 var(--font-size-label) var(--font-app);cursor:pointer;text-align:left}.pdf-bookmark-page-label{font-weight:600}.pdf-bookmark-current-tag{font-size:var(--font-size-meta);font-weight:700;padding:1px 5px;border-radius:6px;background:var(--gold,#b37d22);color:#fff;line-height:1.4}.pdf-bookmark-del-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;min-width:30px;min-height:30px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--muted);cursor:pointer;font-size:12px;transition:color .15s,background .15s}.pdf-bookmark-del-btn:hover{color:#d93829;background:rgba(217,56,41,.1)!important}.pdf-bookmark-empty{margin:0;padding:16px 12px;color:var(--muted);font-size:var(--font-size-body);line-height:1.5;text-align:center}@media(max-width:420px){.pdf-floating-pager .pdf-bookmark-panel{left:50%;transform:translateX(-50%);width:min(260px,calc(100vw - 20px))}}@media(max-width:340px){.pdf-pager-zoom-text{display:none}}.pdf-bookmark-panel{position:absolute;z-index:20;top:calc(100% + 6px);right:8px;width:220px;max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:10px;background:var(--card);box-shadow:var(--shadow-lg);animation:pdfPanelUp .2s cubic-bezier(.34,1.2,.64,1)}@keyframes pdfPanelUp{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}.pdf-bookmark-panel header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border2);font-size:var(--font-size-label)}.pdf-bookmark-panel header button{min-width:28px;height:28px;padding:0;border:0}.pdf-bookmark-panel p{margin:0;padding:14px;color:var(--muted);font-size:var(--font-size-body);line-height:1.5}.pdf-bookmark-row{display:flex;align-items:center;border-bottom:1px solid var(--border2)}.pdf-bookmark-row button:first-child{flex:1;justify-content:flex-start;border:0;border-radius:0}.pdf-bookmark-row button:last-child{min-width:32px;border:0;border-radius:0;color:var(--muted)}.pdf-status,.pdf-error{padding:12px;text-align:center}.pdf-status{color:var(--muted);background:var(--card)}.pdf-error{color:#8c1c13;background:#fff1ee}.pdf-viewer{min-width:0;min-height:0;flex:1;overflow:auto;background:var(--bg,#f8f6f0);overscroll-behavior:contain;touch-action:pan-x pan-y}.pdf-document-header{box-sizing:border-box;width:min(820px,100%);margin:0 auto;padding:40px 30px 18px;background:transparent}.pdf-document-meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px;color:var(--muted);font-size:var(--font-size-meta)}.pdf-document-category{padding:4px 11px;border-radius:20px;background:var(--gold-muted);color:var(--brown);font-size:var(--font-size-meta);font-weight:700;letter-spacing:1.5px;text-transform:uppercase}.pdf-document-author{margin-left:auto;color:var(--gold);font-weight:500}.pdf-document-views{padding:3px 9px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2);color:var(--muted);font-size:11px;font-weight:500;white-space:nowrap}.pdf-document-header h1{margin:0 0 18px;color:var(--text);font-family:'Bookerly','Lora',Georgia,serif;font-size:clamp(20px,2.8vw,28px);font-weight:700;letter-spacing:-.4px;line-height:1.3;text-align:center;text-transform:uppercase}.pdf-pages{display:flex;width:min(820px,100%);min-width:0;margin:0 auto;flex-direction:column;align-items:center;gap:8px;padding:12px 0 24px;background:var(--bg2,#ede9df)}.pdf-spread{display:flex;width:100%;min-width:0;align-items:flex-start;justify-content:center;gap:8px}.pdf-page{position:relative;box-sizing:border-box;width:100%;max-width:100%;height:auto;aspect-ratio:var(--page-aspect);flex:none;background:#fff;box-shadow:0 2px 16px rgba(0,0,0,.15)}.pdf-page canvas{display:block;background-color:#fff}.pdf-page>span{position:absolute;right:7px;bottom:5px;padding:2px 5px;border-radius:4px;background:#0008;color:#fff;font:10px system-ui}.pdf-comments{box-sizing:border-box;width:min(820px,100%);margin:0 auto;padding:0 30px 72px;background:transparent;color:var(--text)}.pdf-tags{display:flex;flex-wrap:wrap;gap:7px;padding-top:22px}.pdf-tags span{padding:4px 11px;border:1px solid var(--border2);border-radius:20px;background:var(--bg2);color:var(--muted);font:var(--font-size-meta) -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Arial,sans-serif}.pdf-action-bar{display:flex;margin-top:14px}.pdf-action-bar a{display:inline-flex;min-height:38px;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid var(--border);border-radius:20px;background:var(--bg2);color:var(--text2);font:600 var(--font-size-label) -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Arial,sans-serif;text-decoration:none;transition:border-color .15s,background-color .15s,color .15s}.pdf-action-bar a:hover{border-color:var(--gold);background:var(--gold-light);color:var(--brown)}.pdf-action-bar a:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:2px}@media(max-width:768px){.pdf-controls{height:auto;padding:8px 6px}.pdf-page-status{min-width:175px}.pdf-document-header{padding:20px 16px 16px}.pdf-document-author{margin-left:0}.pdf-pages{width:100%;padding-left:0;padding-right:0}.pdf-page{width:100%;max-width:100%}.pdf-comments{padding:0 20px 100px}}@media(prefers-reduced-motion:reduce){.pdf-controls button,.pdf-action-bar a{transition:none}.pdf-controls button:active{transform:none}.pdf-bookmark-panel{animation:none}}
  .pdf-shell.annotations-open :global(.reader-tools-toggle){visibility:hidden}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;padding:0;border:0;margin:-1px;clip:rect(0,0,0,0);white-space:nowrap}
  .pdf-page-form{display:flex;align-items:center;gap:4px}
  .pdf-page-form input{box-sizing:border-box;width:64px;height:34px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font:14px var(--font-app);text-align:center}
  .mobile-label{display:none}
  .pdf-bookmark-panel{top:55px;z-index:30}
  .pdf-floating-pager--panel-open{z-index:1080}
  .pdf-bookmark-panel:focus-visible,.pdf-page-form input:focus-visible,.pdf-bookmark-panel button:focus-visible{outline:3px solid var(--gold);outline-offset:-3px}
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel,:global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel,:global(.reader-modal.bg-dark) .pdf-floating-pager .pdf-bookmark-panel{background:#1c1813!important;border-color:rgba(212,168,75,.5)!important;box-shadow:0 12px 32px rgba(0,0,0,.8),0 0 10px rgba(212,168,75,.2)!important;color:#ede8df!important}
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel header,:global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel header,:global(.reader-modal.bg-dark) .pdf-floating-pager .pdf-bookmark-panel header{border-bottom-color:rgba(255,255,255,.12)!important}
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-row,:global(.bg-dark) .pdf-floating-pager .pdf-bookmark-row,:global(.reader-modal.bg-dark) .pdf-floating-pager .pdf-bookmark-row{border-bottom-color:rgba(255,255,255,.08)!important}
  :global([data-theme='dark']) .pdf-bookmark-header-title,:global(.bg-dark) .pdf-bookmark-header-title,:global(.reader-modal.bg-dark) .pdf-bookmark-header-title,:global([data-theme='dark']) .pdf-bookmark-page-label,:global(.bg-dark) .pdf-bookmark-page-label,:global(.reader-modal.bg-dark) .pdf-bookmark-page-label{color:#f5eedf!important}
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel button,:global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel button,:global(.reader-modal.bg-dark) .pdf-floating-pager .pdf-bookmark-panel button{background:transparent!important;color:#f5eedf!important}
  :global([data-theme='dark']) .pdf-bookmark-close-btn,:global(.bg-dark) .pdf-bookmark-close-btn,:global(.reader-modal.bg-dark) .pdf-bookmark-close-btn,:global([data-theme='dark']) .pdf-bookmark-del-btn,:global(.bg-dark) .pdf-bookmark-del-btn,:global(.reader-modal.bg-dark) .pdf-bookmark-del-btn{color:#c4b5a0!important}
  :global([data-theme='dark']) .pdf-bookmark-close-btn:hover,:global(.bg-dark) .pdf-bookmark-close-btn:hover,:global(.reader-modal.bg-dark) .pdf-bookmark-close-btn:hover{background:rgba(255,255,255,.1)!important;color:#fff!important}
  :global([data-theme='dark']) .pdf-bookmark-jump-btn:hover,:global(.bg-dark) .pdf-bookmark-jump-btn:hover,:global(.reader-modal.bg-dark) .pdf-bookmark-jump-btn:hover{background:rgba(212,168,75,.16)!important;color:#d4a84b!important}
  :global([data-theme='dark']) .pdf-bookmark-empty,:global(.bg-dark) .pdf-bookmark-empty,:global(.reader-modal.bg-dark) .pdf-bookmark-empty{color:#c4b5a0!important}
  @media(max-width:768px){
    .pdf-controls{height:auto;flex-direction:column;align-items:stretch;overflow:visible;gap:8px;padding:2px 0;border:0}
    .pdf-control-group{min-width:0;flex-wrap:wrap;gap:8px;padding:9px 12px;border:1px solid var(--border2);border-radius:14px;background:var(--bg2);box-shadow:0 1px 3px rgba(0,0,0,.02)}
    .pdf-control-group+.pdf-control-group{margin:0;border-left:0}
    .pdf-controls button{min-height:38px;height:auto;gap:6px;padding:7px 12px;border-radius:10px;font-family:var(--font-app)}
    .pdf-page-status{justify-content:space-between}
    .pdf-page-form input,.pdf-reading-options select{height:38px;border-radius:10px}
    .pdf-reading-options select{max-width:none;flex:1}
    .mobile-label{display:inline}.desktop-label{display:none}
    .pdf-bookmarks{flex-direction:column;align-items:stretch}
    .pdf-bookmark-panel{position:fixed;z-index:1070;top:auto;right:0;bottom:0;left:0;margin:0 auto;box-sizing:border-box;width:100%;max-width:520px;max-height:min(78dvh,580px);border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.26)}
    .pdf-floating-pager{bottom:calc(72px + env(safe-area-inset-bottom,0px))}
    .pdf-pages{padding-bottom:calc(80px + env(safe-area-inset-bottom,0px))}
  }
  .pdf-reading-options select:focus-visible,.pdf-speech-select:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:2px}
  .pdf-reading-options select,.pdf-speech-select{height:32px;max-width:92px;padding:0 5px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font:12px var(--font-app);cursor:pointer}
  .pdf-navigation-panel{position:absolute;z-index:21;top:55px;bottom:10px;left:8px;display:flex;width:min(310px,calc(100vw - 16px));overflow:hidden;flex-direction:column;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);box-shadow:var(--shadow-lg)}
  .pdf-navigation-panel>header{display:flex;min-height:43px;align-items:center;justify-content:space-between;padding:5px 8px 5px 13px;border-bottom:1px solid var(--border2);font:600 var(--font-size-label) var(--font-app)}
  .pdf-navigation-panel>header button{display:grid;width:32px;height:32px;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--text);cursor:pointer}
  .pdf-navigation-panel>header button:focus-visible,.pdf-thumbnail-rail button:focus-visible,.pdf-outline button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:-3px}
  .pdf-thumbnail-rail{display:grid;overflow-y:auto;flex:1;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:8px;padding:10px}
  .pdf-thumbnail-rail button{display:flex;min-width:0;flex-direction:column;align-items:center;gap:5px;padding:7px;border:1px solid var(--border2);border-radius:8px;background:var(--bg2);color:var(--muted);cursor:pointer;font:11px var(--font-app)}
  .pdf-thumbnail-rail button.active{border-color:var(--gold);background:var(--gold-muted);color:var(--brown)}
  .pdf-thumbnail-canvas{display:grid;width:100%;height:122px;overflow:hidden;place-items:center;background:#d8d8d8}
  .pdf-thumbnail-canvas canvas{display:block;max-width:100%;max-height:100%;background:#fff;box-shadow:0 1px 5px #0004}
  .pdf-navigation-state{margin:0;padding:18px;color:var(--muted);font:var(--font-size-body)/1.5 var(--font-app)}
  .pdf-outline{overflow-y:auto;flex:1;padding:7px}
  .pdf-outline button{display:flex;width:100%;min-height:38px;align-items:center;gap:8px;padding:7px 9px 7px calc(9px + var(--outline-depth) * 15px);border:0;border-radius:6px;background:transparent;color:var(--text);cursor:pointer;font:var(--font-size-label)/1.35 var(--font-app);text-align:left}
  .pdf-outline button:hover:not(:disabled){background:var(--gold-muted);color:var(--brown)}
  .pdf-outline button:disabled{color:var(--muted);cursor:not-allowed;opacity:.72}
  .pdf-outline button span{min-width:0;flex:1}
  .pdf-outline button small{color:inherit;font-size:var(--font-size-meta);font-variant-numeric:tabular-nums}
  .pdf-pages.spread{width:min(1460px,100%)}
  .pdf-pages.spread .pdf-page{width:calc((100% - 8px)/2)}
  .pdf-controls button,.pdf-page>span,.pdf-tags span,.pdf-action-bar a,.pdf-document-header>h1{font-family:var(--font-app)}
  .pdf-document-header>h1{font-weight:700}
  :global([data-theme='dark']) .pdf-shell,
  :global([data-theme='dark']) .pdf-viewer,
  :global([data-theme='dark']) .pdf-document-header,
  :global([data-theme='dark']) .pdf-comments,
  :global(.bg-dark) .pdf-shell,
  :global(.bg-dark) .pdf-viewer,
  :global(.bg-dark) .pdf-document-header,
  :global(.bg-dark) .pdf-comments{background:var(--bg)}
  :global([data-theme='dark']) .pdf-pages{background:#050505}
  :global(.bg-dark) .pdf-pages{background:#050505}
  :global([data-theme='dark']) .pdf-page{background:#000}
  :global(.bg-dark) .pdf-page{background:#000}
  :global([data-theme='dark']) .pdf-page canvas,
  :global(.bg-dark) .pdf-page canvas{filter:invert(1) hue-rotate(180deg)}
  :global([data-theme='dark']) .pdf-shell.sepia .pdf-page canvas,
  :global(.bg-dark) .pdf-shell.sepia .pdf-page canvas{filter:invert(1) hue-rotate(180deg)}
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel,
  :global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel{
    background:rgba(26,22,18,.98)!important;
    border-color:rgba(212,168,75,.45)!important;
    box-shadow:0 12px 32px rgba(0,0,0,.7),0 0 10px rgba(212,168,75,.15)!important;
    color:#f5eedf!important;
  }
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-header-title,
  :global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-header-title,
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-jump-btn,
  :global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-jump-btn,
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-page-label,
  :global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-page-label{
    color:#f5eedf!important;
  }
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-empty,
  :global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-empty,
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-close-btn,
  :global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-close-btn,
  :global([data-theme='dark']) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-del-btn,
  :global(.bg-dark) .pdf-floating-pager .pdf-bookmark-panel .pdf-bookmark-del-btn{
    color:#c4b5a0!important;
  }
  :global([data-theme='dark']) .pdf-bookmark-panel,
  :global(.bg-dark) .pdf-bookmark-panel{
    background:#1e1914!important;
    border-color:rgba(212,168,75,.45)!important;
    color:#f5eedf!important;
  }
  :global([data-theme='dark']) .pdf-bookmark-panel button,
  :global(.bg-dark) .pdf-bookmark-panel button{
    background:transparent!important;
    color:#f5eedf!important;
  }
  .pdf-shell.sepia{--bg:#f4ecd8;--bg2:#eee2ca;--card:#f7efde;--text:#33271f;--text2:#403126;--muted:#675548;--border:#9b8069;--border2:#c7b39a;--gold-muted:#e1cfad;--brown:#4a3525;background:#f4ecd8;color:#33271f}
  .pdf-shell.sepia .pdf-viewer,.pdf-shell.sepia .pdf-document-header,.pdf-shell.sepia .pdf-comments{background:#f4ecd8}
  .pdf-shell.sepia .pdf-pages{background:var(--bg2,#eee2ca)}
  .pdf-shell.sepia .pdf-page{background:#f8f0df}
  .pdf-shell.sepia .pdf-page canvas,.pdf-shell.sepia .pdf-thumbnail-canvas canvas{filter:sepia(.38) saturate(.86) contrast(.96) brightness(.98)}
  .pdf-controls button:disabled{cursor:not-allowed;opacity:.48;transform:none}
  .pdf-speech-controls button:first-child{gap:4px}
  .compact-label{font-size:var(--font-size-label);font-weight:600}
  .pdf-offline-panel{position:absolute;z-index:750;top:55px;right:8px;display:flex;width:min(330px,calc(100vw - 16px));max-height:calc(100% - 65px);overflow:hidden;flex-direction:column;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);box-shadow:var(--shadow-lg)}
  .pdf-offline-panel button{display:inline-flex;min-height:44px;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);cursor:pointer;font:var(--font-size-label) var(--font-app)}
  .pdf-offline-panel button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}
  .pdf-offline-panel>header{display:flex;min-height:42px;flex:none;align-items:center;justify-content:space-between;padding:5px 7px 5px 13px;border-bottom:1px solid var(--border2);font:600 var(--font-size-label) var(--font-app)}
  .pdf-offline-panel>header button{width:44px;height:44px;flex:none;border:0}
  .pdf-offline-panel>header button:hover{background:var(--bg)}
  .pdf-offline-body{display:flex;min-height:0;overflow-y:auto;flex-direction:column;align-items:stretch;gap:10px;padding:13px;font:var(--font-size-body)/1.45 var(--font-app)}
  .pdf-offline-body p{margin:0;color:var(--text2)}
  .pdf-offline-body small{color:var(--muted);font-size:var(--font-size-meta);line-height:1.5}
  .pdf-offline-body progress{width:100%;height:8px;accent-color:var(--gold)}
  .pdf-offline-actions{display:flex;flex-wrap:wrap;gap:7px}
  .pdf-offline-body button{width:max-content;min-width:96px;padding:0 11px;border-color:var(--gold);background:var(--gold);color:var(--on-gold);font-size:var(--font-size-label)}
  .pdf-offline-body button:hover{border-color:var(--brown);background:var(--gold);color:var(--on-gold)}
  .pdf-offline-body button.pdf-offline-secondary{border-color:var(--border);background:var(--card);color:var(--text2)}
  .pdf-offline-body button.pdf-offline-secondary:hover{border-color:var(--gold);background:var(--gold-muted);color:var(--brown)}
  .pdf-capability-message{padding:7px 12px;border-bottom:1px solid #e7d4a8;background:#fff8e5;color:#674d16;font:var(--font-size-body)/1.4 var(--font-app);text-align:center}
  .pdf-capability-error{background:#fff1ee;color:#8c1c13}
  @media(max-width:768px){
    .compact-label,.pdf-action-button span:last-child{display:inline;font-size:var(--font-size-label)}
    .pdf-reading-options select,.pdf-speech-select{height:44px;max-width:none}
  }
  @media(prefers-reduced-motion:reduce){.pdf-page canvas{transition:none}}
  .primary-offline-group{order:-1}
  .pdf-offline-main-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px 0 10px;border-radius:18px;border:1.5px solid var(--gold,#b37d22);background:rgba(179,125,34,.12);color:var(--gold,#b37d22);font:700 var(--font-size-label) var(--font-app);cursor:pointer;transition:all .15s ease;white-space:nowrap}
  .pdf-offline-main-btn:hover{background:rgba(179,125,34,.22)}
  .pdf-offline-main-btn:active{transform:scale(.97)}
  .pdf-offline-main-btn.active{background:var(--gold,#b37d22);color:#fff;border-color:var(--gold,#b37d22)}
  .pdf-offline-main-btn.saving{background:rgba(179,125,34,.2);border-style:dashed}
  .offline-btn-icon{font-size:15px;line-height:1}
  .offline-btn-label{font-weight:700}
  .pdf-offline-modal-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.65);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:16px;animation:pdfFadeIn .18s ease}
  .pdf-offline-modal-card{position:relative;width:min(380px,100%);background:var(--dialog-surface-background,var(--card));color:var(--text,#1c1a15);border:1.5px solid var(--dialog-surface-border,var(--border));border-radius:20px;padding:24px 20px 20px;box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));display:flex;flex-direction:column;align-items:center;text-align:center;box-sizing:border-box;animation:pdfModalUp .24s cubic-bezier(.34,1.3,.64,1)}
  .pdf-offline-modal-icon{font-size:36px;margin-bottom:10px;line-height:1}
  .pdf-offline-modal-icon.pulse{animation:pdfPulseIcon 1s infinite alternate ease-in-out}
  @keyframes pdfFadeIn{from{opacity:0}to{opacity:1}}
  @keyframes pdfModalUp{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes pdfPulseIcon{from{transform:scale(1);opacity:.8}to{transform:scale(1.15);opacity:1}}
  .pdf-offline-modal-card h3{margin:0 0 8px;font-size:17px;font-weight:700;color:var(--text)}
  .pdf-offline-modal-desc{margin:0 0 14px;font-size:var(--font-size-body);line-height:1.5;color:var(--text2)}
  .pdf-offline-modal-sub{margin:0 0 16px;font-size:var(--font-size-body);color:var(--muted);font-weight:500;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pdf-offline-modal-size-tag{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;margin-bottom:18px;border-radius:12px;background:rgba(179,125,34,.12);color:var(--gold,#b37d22);font-size:var(--font-size-meta)}
  .pdf-dl-progress-display{width:100%;display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px}
  .pdf-dl-percent-number{font-size:34px;font-weight:800;color:var(--gold,#b37d22);font-variant-numeric:tabular-nums;line-height:1}
  .pdf-dl-progress-bar{width:100%;height:10px;border-radius:5px;accent-color:var(--gold,#b37d22)}
  .pdf-dl-bytes-info{display:flex;gap:6px;font-size:var(--font-size-meta);color:var(--muted);font-weight:600}
  .pdf-dl-error-msg{margin:0 0 14px;color:#d93829;font-size:var(--font-size-body)}
  .pdf-offline-modal-actions{display:flex;gap:10px;width:100%;justify-content:center}
  .pdf-offline-modal-actions button{flex:1;min-height:44px;border-radius:12px;font:700 var(--font-size-label) var(--font-app);cursor:pointer;transition:all .15s ease}
  .pdf-offline-modal-actions .btn-cancel{border:1px solid var(--border);background:var(--bg2,#f5f5f5);color:var(--text2,#444)}
  .pdf-offline-modal-actions .btn-cancel:hover{background:var(--bg3,#e5e5e5)}
  .pdf-offline-modal-actions .btn-confirm{border:1px solid var(--gold,#b37d22);background:var(--gold,#b37d22);color:var(--highlight-ink,#24180c)}
  .pdf-offline-modal-actions .btn-confirm:hover{filter:brightness(1.08)}
  .pdf-status{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px 16px;font-size:var(--font-size-body);color:var(--text2);background:var(--card)}
  .pdf-status-text{display:flex;align-items:center;gap:8px}
  .pdf-status-text strong{color:var(--gold,#b37d22);font-size:15px}
  .pdf-status-progress{width:min(220px,80%);height:6px;border-radius:3px;accent-color:var(--gold,#b37d22)}
  .pdf-offline-state{display:flex;align-items:center;justify-content:center;padding:32px 16px;min-height:calc(100dvh - 120px);width:100%;box-sizing:border-box;background:var(--bg,#fdfbf7)}
  .pdf-offline-card{max-width:440px;width:100%;background:var(--card,#fff);border:1.5px solid var(--border,#e6decb);border-radius:24px;padding:36px 24px 28px;box-shadow:0 16px 48px rgba(0,0,0,.08);display:flex;flex-direction:column;align-items:center;text-align:center;box-sizing:border-box;animation:pdfModalUp .3s cubic-bezier(.34,1.25,.64,1)}
  .pdf-offline-icon-wrap{width:72px;height:72px;border-radius:50%;background:rgba(179,125,34,.12);display:flex;align-items:center;justify-content:center;color:var(--gold,#b37d22);margin-bottom:18px}
  .pdf-offline-badge{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(217,56,41,.1);color:#c92a1d;font-size:var(--font-size-meta);font-weight:800;letter-spacing:.6px;margin-bottom:14px}
  .pdf-offline-card h2{margin:0 0 12px;font-size:20px;font-weight:800;color:var(--text,#261f18);line-height:1.35}
  .pdf-offline-desc{margin:0 0 20px;font-size:var(--font-size-body);line-height:1.6;color:var(--text2,#5a4d3f)}
  .pdf-offline-desc strong{color:var(--gold,#b37d22)}
  .pdf-offline-tip{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;background:rgba(179,125,34,.08);border:1px dashed rgba(179,125,34,.35);color:var(--text2,#5a4d3f);font-size:var(--font-size-meta);line-height:1.5;text-align:left;margin-bottom:24px}
  .pdf-offline-tip .tip-icon{font-size:16px;flex-shrink:0;line-height:1.2}
  .pdf-offline-actions{display:flex;flex-direction:column;gap:10px;width:100%}
  .btn-retry{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;border-radius:14px;border:none;background:linear-gradient(135deg,#d4a84b 0%,#b37d22 100%);color:#fff;font:700 var(--font-size-label) var(--font-app);cursor:pointer;box-shadow:0 4px 16px rgba(179,125,34,.3);transition:all .18s ease}
  .btn-retry:hover{filter:brightness(1.08);transform:translateY(-1px)}
  .btn-retry:active{transform:translateY(0) scale(.98)}
  .btn-back{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:42px;border-radius:14px;border:1.5px solid var(--border,#e6decb);background:transparent;color:var(--text2,#5a4d3f);font:600 var(--font-size-label) var(--font-app);cursor:pointer;transition:all .15s ease}
  .btn-back:hover{background:var(--bg2,#f5efe3);color:var(--text,#261f18)}
  .pdf-error{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;padding:12px 18px;background:#fff1ee;color:#8c1c13;font:600 var(--font-size-body) var(--font-app);border-bottom:1px solid rgba(140,28,19,.2);text-align:center}
  .pdf-error-retry-btn{padding:4px 12px;border-radius:8px;border:1px solid #8c1c13;background:#fff;color:#8c1c13;font:700 var(--font-size-label) var(--font-app);cursor:pointer}
  .pdf-error-retry-btn:hover{background:#8c1c13;color:#fff}
  :global([data-theme='dark']) .pdf-offline-state,:global(.bg-dark) .pdf-offline-state{background:#12100d}
  :global([data-theme='dark']) .pdf-offline-card,:global(.bg-dark) .pdf-offline-card{background:#1c1813;border-color:rgba(212,168,75,.35);box-shadow:0 20px 50px rgba(0,0,0,.7)}
  :global([data-theme='dark']) .pdf-offline-card h2,:global(.bg-dark) .pdf-offline-card h2{color:#f7eedf}
  :global([data-theme='dark']) .pdf-offline-desc,:global(.bg-dark) .pdf-offline-desc{color:#d1c2aa}
  :global([data-theme='dark']) .pdf-offline-tip,:global(.bg-dark) .pdf-offline-tip{background:rgba(212,168,75,.1);border-color:rgba(212,168,75,.3);color:#e5d8c3}
  :global([data-theme='dark']) .btn-back,:global(.bg-dark) .btn-back{border-color:rgba(212,168,75,.3);color:#e5d8c3}
  :global([data-theme='dark']) .btn-back:hover,:global(.bg-dark) .btn-back:hover{background:rgba(212,168,75,.15);color:#fff}
  :global([data-theme='dark']) .pdf-error,:global(.bg-dark) .pdf-error{background:#2a110f;color:#ff9d94;border-color:rgba(255,157,148,.2)}
  :global([data-theme='dark']) .pdf-error-retry-btn,:global(.bg-dark) .pdf-error-retry-btn{background:#3b1714;color:#ffb8b0;border-color:#ff9d94}
</style>
