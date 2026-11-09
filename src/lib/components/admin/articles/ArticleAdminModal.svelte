<script lang="ts">
  import { createBrowserId } from '$lib/browser/random-id';
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import {
    CheckCircle,
    FilePenLine,
    FilePlus,
    FileText,
    FileUp,
    Image,
    ListTree,
    NotebookPen,
    PenLine,
    RotateCcw,
    Save,
    Trash2,
    X,
  } from '@lucide/svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { encodeMediaFileNameHeader } from '$lib/browser/media-upload';
  import { invalidateArticleState } from '$lib/browser/server-state';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import type { ArticleCategory, LibraryArticle } from '$lib/components/library/article';
  import { encodeBookCoverAsset, formatBookCoverPosition, parseBookCoverAsset } from '$lib/components/admin/books/book-form-helpers';
  import ChapterEditor from '$lib/components/admin/books/ChapterEditor.svelte';
  import ArticleContentEditor from './ArticleContentEditor.svelte';
  import RejectReasonModal from './RejectReasonModal.svelte';
  import ArticlePdfPreview from './ArticlePdfPreview.svelte';
  import './article-admin-modal.css';

  interface Props {
    article?: LibraryArticle | null;
    allowedCategories?: ArticleCategory[];
    defaultCategory?: ArticleCategory;
    role: 'ctv' | 'admin';
    onClose: () => void;
    onSaved?: (article: LibraryArticle) => void | Promise<void>;
    onDeleted?: (article: LibraryArticle) => void | Promise<void>;
  }

  let {
    article = null,
    allowedCategories,
    defaultCategory = 'SÁCH KHUYẾN THIỆN',
    role,
    onClose,
    onSaved = () => {},
    onDeleted = () => {}
  }: Props = $props();
  const allCategories: Array<{ value: ArticleCategory; label: string }> = [
    { value: 'CHUYỆN NHÂN QUẢ', label: 'CHUYỆN NHÂN QUẢ' },
    { value: 'SÁCH KHUYẾN THIỆN', label: 'SÁCH KHUYẾN THIỆN' },
    { value: 'KINH PHẬT', label: 'KINH PHẬT' },
    { value: 'TRÌ CHÚ', label: 'TRÌ CHÚ' },
    { value: 'NGHI THỨC KHÁC', label: 'NGHI THỨC KHÁC' },
    { value: 'KHÁC', label: 'KHÁC' }
  ];
  const { categoryOptions, initialCategory } = (() => {
    const options = allowedCategories?.length
      ? allCategories.filter((option) => allowedCategories.includes(option.value))
      : allCategories;
    const articleCat = article?.category === 'CÁC NGHI THỨC' ? 'NGHI THỨC KHÁC' : article?.category;
    const selected = options.some((option) => option.value === articleCat)
      ? (articleCat as ArticleCategory)
      : options.some((option) => option.value === defaultCategory)
        ? defaultCategory
        : options[0]?.value ?? 'SÁCH KHUYẾN THIỆN';
    return { categoryOptions: options, initialCategory: selected };
  })();
  const initial = (() => {
    const cover = parseBookCoverAsset(article?.imageUrl || '');
    return {
      title: article?.title || '', category: initialCategory,
      summary: article?.summary || '', content: article?.content || '', tags: article?.tags.join(', ') || '',
      author: article?.author || 'Quang Từ', coverUrl: cover.url, coverPosition: cover.position,
      pdfUrl: article?.pdfUrl || '', externalUrl: article?.externalUrl || '', featured: article?.featured ? 1 : 0,
      status: role === 'ctv' ? 'Chờ duyệt' : (article?.status || 'Đang cập nhật'), tocEnabled: Boolean(article?.hasTableOfContents),
      pdfEnabled: Boolean(article?.pdfUrl), volumeCount: article?.volumeCount || 0,
      articleId: article?.id || `book_${Date.now()}_${createBrowserId().slice(0, 8)}`
    };
  })();
  let title = $state(initial.title);
  let category = $state<ArticleCategory>(initial.category as ArticleCategory);
  let summary = $state(initial.summary);
  let content = $state(initial.content);
  let tags = $state(initial.tags);
  let author = $state(initial.author);
  let coverUrl = $state(initial.coverUrl);
  let coverPosition = $state(initial.coverPosition);
  let pdfUrl = $state(initial.pdfUrl);
  let externalUrl = $state(initial.externalUrl);
  let featured = $state(initial.featured);
  let status = $state(initial.status);
  let tocEnabled = $state(initial.tocEnabled);
  let pdfEnabled = $state(initial.pdfEnabled);
  let volumeCount = $state(initial.volumeCount);
  let articleId = $state(initial.articleId);
  let busy = $state(false);
  let uploadKind = $state<'covers' | 'pdfs' | 'images' | null>(null);
  let error = $state('');
  let notice = $state('');
  let chapterDirty = $state(false);
  let chapterUploadBusy = $state(false);
  let chapterSaveBusy = $state(false);
  let saveChapters = $state<(() => Promise<boolean>) | null>(null);
  let dialog = $state<HTMLElement | null>(null);
  let form = $state<HTMLFormElement | null>(null);
  let titleInput = $state<HTMLInputElement | null>(null);
  let leftColumnPercent = $state(30);
  let dividerCleanup: (() => void) | null = null;
  let coverPreview = $state<HTMLElement | null>(null);
  let coverDragCleanup: (() => void) | null = null;
  let initialSnapshot = '';
  let approvedNavigation: string | null = null;
  let navigationConfirmationPending = false;
  let mounted = true;
  let rejectModalOpen = $state(false);

  const queryClient = useQueryClient();
  const saveArticleMutation = createMutation(() => ({
    mutationFn: async ({ id, body, editing }: { id: string; body: Record<string, unknown>; editing: boolean }) => {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(editing ? `/api/articles/${encodeURIComponent(id)}` : '/api/articles', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || 'Không thể lưu bài viết.');
      return Array.isArray(payload) ? payload[0] : payload;
    },
    onSuccess: () => invalidateArticleState(queryClient),
  }));
  const deleteArticleMutation = createMutation(() => ({
    mutationFn: async (target: LibraryArticle) => {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || 'Không thể xóa bài viết.');
    },
    onSuccess: () => invalidateArticleState(queryClient),
  }));
  const snapshot = $derived(JSON.stringify({ title, category, summary, content, tags, author, coverUrl, coverPosition, pdfUrl, externalUrl, featured, status, tocEnabled, pdfEnabled }));
  const dirty = $derived(Boolean(initialSnapshot) && snapshot !== initialSnapshot || chapterDirty);
  const workActive = $derived(Boolean(busy || chapterUploadBusy || chapterSaveBusy || uploadKind));

  beforeNavigate((navigation) => {
    if (workActive) {
      navigation.cancel();
      return;
    }
    // Việc rời tài liệu do trình duyệt xử lý vẫn dùng beforeunload để giữ bản nháp.
    if (navigation.willUnload) return;
    const destination = navigation.to?.url.href;
    if (approvedNavigation === destination) {
      approvedNavigation = null;
      onClose();
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    navigation.cancel();
    if (!destination || navigationConfirmationPending) return;
    navigationConfirmationPending = true;
    const principal = getBrowserSessionSnapshot();
    void (async () => {
      try {
        if (!await confirmInApp('Bạn có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?')) return;
        const current = getBrowserSessionSnapshot();
        if (!mounted || workActive || current.user?.id !== principal.user?.id || current.user?.role !== principal.user?.role) return;
        approvedNavigation = destination;
        await goto(destination);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Không thể chuyển trang.';
      } finally {
        approvedNavigation = null;
        navigationConfirmationPending = false;
      }
    })();
  });

  async function safeClose(): Promise<void> {
    if (workActive) return;
    const principal = getBrowserSessionSnapshot();
    if (dirty && !await confirmInApp('Bạn có thay đổi chưa lưu. Đóng và bỏ các thay đổi này?')) return;
    const current = getBrowserSessionSnapshot();
    if (!mounted || workActive || current.user?.id !== principal.user?.id || current.user?.role !== principal.user?.role) return;
    onClose();
  }

  function assetFileName(url: string): string {
    const raw = url.split('?')[0]?.split('/').pop() || url;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function clearPdf(): void {
    pdfUrl = '';
  }

  function startDividerResize(event: PointerEvent): void {
    if (!form) return;
    dividerCleanup?.();
    event.preventDefault();
    const bounds = form.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const move = (pointerEvent: PointerEvent) => {
      const next = ((pointerEvent.clientX - bounds.left) / bounds.width) * 100;
      leftColumnPercent = Math.min(48, Math.max(24, next));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      dividerCleanup = null;
    };
    dividerCleanup = stop;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
  }

  function resizeDividerWithKeyboard(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    leftColumnPercent = Math.min(48, Math.max(24, leftColumnPercent + direction));
  }

  function startCoverPositionDrag(event: PointerEvent): void {
    if (!coverPreview || !coverUrl || event.button !== 0) return;
    event.preventDefault();
    coverDragCleanup?.();
    coverPreview.setPointerCapture?.(event.pointerId);
    const bounds = coverPreview.getBoundingClientRect();
    const update = (pointerEvent: PointerEvent) => {
      coverPosition = formatBookCoverPosition(pointerEvent.clientX, pointerEvent.clientY, bounds);
    };
    const stop = () => {
      window.removeEventListener('pointermove', update);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      coverDragCleanup = null;
    };
    coverDragCleanup = stop;
    window.addEventListener('pointermove', update);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    update(event);
  }

  async function upload(file: File, folder: 'covers' | 'pdfs' | 'content'): Promise<string> {
    const csrf = await requireBrowserCsrf();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    const encoded = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
    const response = await fetchWithSessionRefresh('/api/media', {
      method: 'POST',
      headers: {
        'content-type': file.type,
        'x-content-sha256': encoded,
        'x-csrf-token': csrf,
        'x-file-name': encodeMediaFileNameHeader(file.name),
        'x-media-prefix': folder,
        'idempotency-key': createBrowserId()
      },
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || 'Tải tệp thất bại.');
    return String(payload.url || payload.objectKey || '');
  }

  async function uploadSelectedFile(file: File, folder: 'covers' | 'pdfs'): Promise<void> {
    if (uploadKind) return;
    if (folder === 'pdfs' && file.type !== 'application/pdf') {
      error = 'Vui lòng chọn đúng file PDF.';
      return;
    }
    if (folder === 'covers' && !file.type.startsWith('image/')) {
      error = 'Vui lòng chọn đúng file ảnh.';
      return;
    }
    uploadKind = folder;
    error = '';
    try {
      const url = await upload(file, folder);
      if (folder === 'covers') coverUrl = url;
      else { pdfUrl = url; pdfEnabled = true; }
      notice = 'Tệp đã tải lên an toàn.';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Tải tệp thất bại.';
    } finally {
      uploadKind = null;
    }
  }

  async function selectFile(event: Event, folder: 'covers' | 'pdfs'): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await uploadSelectedFile(file, folder);
  }

  function dragOverFile(event: DragEvent): void {
    if (uploadKind) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function dropFile(event: DragEvent, folder: 'covers' | 'pdfs'): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file || uploadKind) return;
    void uploadSelectedFile(file, folder);
  }

  function mapSaved(row: Record<string, unknown>, id: string): LibraryArticle {
    return {
      id: String(row.id ?? id),
      title: String(row.tieu_de ?? title),
      summary: String(row.tom_tat ?? summary),
      content: String(row.noi_dung ?? content),
      category: String(row.danh_muc ?? category) as ArticleCategory,
      tags: String(row.tags ?? tags).split(',').map((tag) => tag.trim()).filter(Boolean),
      author: String(row.tac_gia ?? author),
      imageUrl: String(row.anh_url ?? encodeBookCoverAsset(coverUrl, coverPosition)),
      featured: Number(row.noi_bat ?? featured) > 0,
      publishedAt: String(row.ngay_dang ?? article?.publishedAt ?? new Date().toISOString()),
      hasTableOfContents: Boolean(row.has_muc_luc ?? tocEnabled),
      volumeCount: Number(row.so_tap ?? volumeCount),
      status: String(row.trang_thai ?? status),
      pdfUrl: String(row.pdf_url ?? (pdfEnabled ? pdfUrl : '')),
      externalUrl: String(row.link_ngoai ?? externalUrl),
      viewCount: article?.viewCount ?? 0,
      createdAt: String(row.created_at ?? article?.createdAt ?? new Date().toISOString()),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    };
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim()) { error = 'Vui lòng nhập tiêu đề bài viết.'; return; }
    busy = true;
    error = '';
    notice = '';
    const id = articleId;
    const body = {
      id,
      tieu_de: title.trim(),
      tom_tat: summary,
      noi_dung: content,
      danh_muc: category,
      tags,
      tac_gia: author,
      anh_url: encodeBookCoverAsset(coverUrl, coverPosition),
      pdf_url: pdfEnabled ? pdfUrl : '',
      link_ngoai: externalUrl,
      noi_bat: featured,
      trang_thai: status,
      has_muc_luc: tocEnabled,
      so_tap: volumeCount,
      ngay_dang: article?.publishedAt || new Date().toISOString(),
      created_at: article?.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    try {
      const row = await saveArticleMutation.mutateAsync({ id, body, editing: Boolean(article) });
      // Re-sending an unchanged table of contents can mean megabytes of chapter
      // text on every save, which reads as a hang on a phone. Only save it when
      // the chapter draft actually changed.
      if (tocEnabled && chapterDirty && saveChapters) {
        if (!(await saveChapters())) {
          throw new Error('Đã lưu bài viết nhưng chưa lưu được danh sách phẩm. Vui lòng kiểm tra lại danh sách phẩm.');
        }
      }
      notice = 'Đã lưu bài viết.';
      initialSnapshot = snapshot;
      await onSaved(mapSaved(row || {}, id));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Không thể lưu bài viết.';
    } finally {
      busy = false;
    }
  }

  function getRejectReason(rawStatus: string): string {
    if (!rawStatus.startsWith('Trả lại')) return '';
    if (rawStatus.startsWith('Trả lại:')) return rawStatus.slice('Trả lại:'.length).trim();
    return '';
  }

  function approveAndPublish(): void {
    status = 'Hoàn thành';
    queueMicrotask(() => {
      form?.requestSubmit();
    });
  }

  async function handleAdminReject(reason: string): Promise<void> {
    if (!article || role !== 'admin') return;
    busy = true;
    error = '';
    const newStatus = reason ? `Trả lại: ${reason}` : 'Trả lại';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(article.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ trang_thai: newStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Không thể trả lại bài viết.');
      }
      rejectModalOpen = false;
      status = newStatus;
      notice = 'Đã trả lại bài viết cho Cộng tác viên.';
      await onSaved(mapSaved({ ...article, trang_thai: newStatus }, article.id));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Không thể trả lại bài viết.';
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    const target = article;
    const principal = getBrowserSessionSnapshot();
    if (!target || role !== 'admin' || workActive) return;
    if (!await confirmInApp(`Xóa “${target.title}”?`)) return;
    const current = getBrowserSessionSnapshot();
    if (!mounted || workActive || article?.id !== target.id || role !== 'admin' || current.user?.id !== principal.user?.id || current.user?.role !== principal.user?.role) return;
    busy = true;
    error = '';
    try {
      await deleteArticleMutation.mutateAsync(article);
      await onDeleted(article);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Không thể xóa bài viết.';
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    initialSnapshot = snapshot;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    releaseBodyScroll ??= acquireScrollLock();
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!dirty && !workActive) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const keydown = (event: KeyboardEvent) => {
      // Hộp thoại trả lại tự giữ focus và xử lý Escape khi đang mở.
      if (rejectModalOpen) return;
      if (event.key === 'Escape') { safeClose(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keydown);
    queueMicrotask(() => titleInput?.focus({ preventScroll: true }));
    return () => {
      dividerCleanup?.();
      coverDragCleanup?.();
      releaseBodyScroll?.(); releaseBodyScroll = null;
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keydown);
      previousFocus?.focus({ preventScroll: true });
    };
  });
</script>

<div class="article-admin-overlay" role="presentation">
  <div class="article-admin-modal" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="article-admin-title" bind:this={dialog}>
    <header class="article-admin-header">
      <div><h2 id="article-admin-title">{#if article}<FilePenLine aria-hidden="true" size={18} strokeWidth={1.9} /> Sửa bài viết{:else}<FilePlus aria-hidden="true" size={18} strokeWidth={1.9} /> Thêm bài viết mới{/if}</h2><p>Bài viết sẽ lưu trực tiếp lên hệ thống</p></div>
      <button type="button" class="article-admin-close" aria-label="Đóng" onclick={safeClose}><X aria-hidden="true" size={20} strokeWidth={2} /></button>
    </header>

    <form
      class="article-admin-form"
      style={`--article-admin-left:${leftColumnPercent}%`}
      bind:this={form}
      onsubmit={save}
    >
      <div class="article-admin-body">
        <div class="article-admin-left">
        {#if article?.status?.startsWith('Trả lại')}
          <div class="article-rejected-banner" role="alert">
            <div class="banner-header">
              <RotateCcw aria-hidden="true" size={15} strokeWidth={2.4} />
              <strong>Bài viết đã được Quản trị viên trả lại yêu cầu chỉnh sửa</strong>
            </div>
            {#if getRejectReason(article.status)}
              <p class="banner-reason"><strong>Lý do:</strong> {getRejectReason(article.status)}</p>
            {/if}
            <p class="banner-hint">Vui lòng hoàn thiện nội dung theo góp ý trên, sau đó bấm <strong>“Lưu bài viết”</strong> để gửi lại cho Quản trị viên duyệt.</p>
          </div>
        {/if}
        <h3><NotebookPen aria-hidden="true" size={15} strokeWidth={1.9} /> THÔNG TIN BÀI VIẾT</h3>
        <div class="article-admin-field">
          <label for="article-title">Tiêu đề bài viết <span class="required">*</span></label>
          <input id="article-title" bind:this={titleInput} bind:value={title} required maxlength="500" />
        </div>
        <div class="article-admin-field article-category-field">
          <label for="article-category">Danh mục <span class="required">*</span></label>
          <select id="article-category" bind:value={category}>
            {#each categoryOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>

        <button class:enabled={tocEnabled} class="article-admin-switch-row" type="button" onclick={() => tocEnabled = !tocEnabled}>
          <span><ListTree aria-hidden="true" size={20} strokeWidth={1.8} /></span><span><strong>Mục lục / Danh sách phẩm</strong><small>Dành cho sách, truyện nhiều phẩm hoặc nội dung dài</small></span><i aria-hidden="true"></i>
        </button>
        {#if tocEnabled}
          <ChapterEditor
            bookId={articleId}
            variant="inline"
            onDirtyChange={(value) => chapterDirty = value}
            onUploadBusy={(value) => chapterUploadBusy = value}
            onSaveBusy={(value) => chapterSaveBusy = value}
            onSaveReady={(handler) => saveChapters = handler}
            onSaved={(count) => { volumeCount = count; tocEnabled = count > 0; }}
          />
        {/if}
        <button class:enabled={pdfEnabled} class="article-admin-switch-row" type="button" onclick={() => pdfEnabled = !pdfEnabled}>
          <span><FileText aria-hidden="true" size={20} strokeWidth={1.8} /></span><span><strong>Upload file PDF</strong><small>Bài viết hiển thị dưới dạng PDF viewer</small></span><i aria-hidden="true"></i>
        </button>
        {#if pdfEnabled}
          <label class="article-upload-zone article-pdf-upload" ondragover={dragOverFile} ondrop={(event) => dropFile(event, 'pdfs')}>
            <FileUp aria-hidden="true" size={32} strokeWidth={1.5} />
            <span>{uploadKind === 'pdfs' ? 'Đang tải PDF…' : 'Click hoặc kéo thả file PDF'}</span>
            <small>Tối đa 50MB • PDF</small>
            <input type="file" accept="application/pdf" disabled={Boolean(uploadKind)} onchange={(event) => void selectFile(event, 'pdfs')} />
          </label>
          {#if pdfUrl}
            <div class="article-current-file">
              <FileText aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{assetFileName(pdfUrl)}</span>
              <button type="button" aria-label="Xóa file PDF" title="Xóa" onclick={clearPdf}><X aria-hidden="true" size={16} strokeWidth={2} /></button>
            </div>
          {/if}
          <label class="article-inline-field" for="article-pdf-url"><span>hoặc dán URL</span><input id="article-pdf-url" bind:value={pdfUrl} type="text" placeholder="https://...file.pdf" /></label>
        {/if}

        <div class="article-admin-field article-status-field">
          <label for="article-status">Trạng thái</label>
          {#if role === 'ctv'}
            <div class="article-status-ctv-box">
              <span class="admin-status-badge pending">Chờ duyệt</span>
              <small>Bài viết của Cộng tác viên sẽ được lưu ở trạng thái Chờ duyệt để Quản trị viên duyệt trước khi phát hành.</small>
            </div>
          {:else}
            <select id="article-status" bind:value={status}>
              <option>Đang cập nhật</option>
              <option>Hoàn thành</option>
              <option>Tạm dừng</option>
              <option>Chờ duyệt</option>
            </select>
          {/if}
        </div>
        <div class="article-admin-field article-cover-field">
          <label for="article-cover-url">Ảnh đại diện</label>
          <label class="article-upload-zone article-cover-upload" ondragover={dragOverFile} ondrop={(event) => dropFile(event, 'covers')}>
            <Image aria-hidden="true" size={28} strokeWidth={1.5} />
            <span>{uploadKind === 'covers' ? 'Đang tải ảnh…' : 'Click hoặc kéo thả ảnh'}</span>
            <small>JPG, PNG, WEBP — tối đa 5MB</small>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={Boolean(uploadKind)} onchange={(event) => void selectFile(event, 'covers')} />
          </label>
          <label class="article-inline-field" for="article-cover-url"><span>hoặc</span><input id="article-cover-url" bind:value={coverUrl} type="text" placeholder="Dán URL ảnh trực tiếp..." /></label>
          <label class="article-inline-field" for="article-cover-position"><span>Vị trí ảnh</span><input id="article-cover-position" bind:value={coverPosition} placeholder="Ví dụ: center, top, center 20%" /></label>
          {#if coverUrl}
            <button
              type="button"
              class="article-cover-preview-wrap"
              bind:this={coverPreview}
              aria-label="Kéo để chỉnh vị trí ảnh đại diện"
              onpointerdown={startCoverPositionDrag}
              onclick={(event) => { if (event.detail === 0) coverPosition = '50% 50%'; }}
            >
              <img class="article-cover-preview" src={coverUrl} style:object-position={coverPosition} draggable="false" alt="Xem trước ảnh bìa" />
              <span>Kéo ảnh để chỉnh vị trí</span>
            </button>
          {/if}
        </div>
        <div class="article-admin-field"><label for="article-summary">Tóm tắt <span class="required">*</span></label><textarea id="article-summary" bind:value={summary} rows="3" required></textarea></div>
        <div class="article-admin-two"><div class="article-admin-field"><label for="article-tags">Tags (cách nhau bởi dấu phẩy)</label><input id="article-tags" bind:value={tags} /></div><div class="article-admin-field"><label for="article-author">Tác giả</label><input id="article-author" bind:value={author} /></div></div>
        <div class="article-admin-two"><div class="article-admin-field"><label for="article-source">Link bài viết gốc (nếu có)</label><input id="article-source" bind:value={externalUrl} type="text" /></div><div class="article-admin-field"><label for="article-featured">Độ nổi bật (0–10)</label><input id="article-featured" bind:value={featured} type="number" min="0" max="10" /></div></div>
        </div>

        <button type="button" class="article-admin-divider" aria-label={`Điều chỉnh độ rộng hai cột, ${Math.round(leftColumnPercent)} phần trăm`} data-value={Math.round(leftColumnPercent)} onkeydown={resizeDividerWithKeyboard} onpointerdown={startDividerResize}><i></i></button>

        <div class="article-admin-right">
          <h3><PenLine aria-hidden="true" size={15} strokeWidth={1.9} /> NỘI DUNG CHI TIẾT</h3>
          {#if pdfEnabled}
            {#key pdfUrl}
              <ArticlePdfPreview url={pdfUrl} {title} />
            {/key}
          {:else if tocEnabled}
            <div class="article-admin-pdf-blank" aria-label="Nội dung được cung cấp bởi file PDF"></div>
          {:else}
            <div class="article-admin-editor-field">
              <label for="article-content-editor">Nội dung chi tiết <span class="required">*</span></label>
              <ArticleContentEditor
                {content}
                imageBusy={uploadKind === 'images'}
                onChange={(value) => content = value}
                uploadImage={(file) => upload(file, 'content')}
                onImageBusy={(value) => uploadKind = value ? 'images' : null}
                onError={(message) => error = message}
              />
            </div>
          {/if}
        </div>
      </div>

      <footer class="article-admin-footer">
        <div>{#if error}<p class="error" role="alert">{error}</p>{/if}{#if notice}<p class="notice" role="status">{notice}</p>{/if}</div>
        {#if article && role === 'admin'}<button class="danger" type="button" disabled={busy || chapterUploadBusy || chapterSaveBusy || Boolean(uploadKind)} onclick={() => void remove()}><Trash2 aria-hidden="true" size={15} strokeWidth={2} /> Xóa</button>{/if}
        <button class="secondary" type="button" disabled={busy || chapterUploadBusy || chapterSaveBusy || Boolean(uploadKind)} onclick={safeClose}>Hủy</button>
        {#if role === 'admin' && (status === 'Chờ duyệt' || status.startsWith('Trả lại'))}
          <button class="reject-btn" type="button" disabled={busy || chapterUploadBusy || chapterSaveBusy || Boolean(uploadKind)} onclick={() => rejectModalOpen = true}>
            <RotateCcw aria-hidden="true" size={14} strokeWidth={2} />
            <span>Trả lại cho CTV</span>
          </button>
          <button class="approve-btn" type="button" disabled={busy || chapterUploadBusy || chapterSaveBusy || Boolean(uploadKind)} onclick={approveAndPublish}>
            <CheckCircle aria-hidden="true" size={14} strokeWidth={2} />
            <span>Duyệt &amp; Phát hành</span>
          </button>
        {/if}
        <button class="primary" type="submit" disabled={busy || chapterUploadBusy || chapterSaveBusy || Boolean(uploadKind)}>
          {#if chapterSaveBusy}
            <span>Đang lưu mục lục…</span>
          {:else if busy}
            <span>Đang lưu…</span>
          {:else if uploadKind}
            <span>Đang tải tệp…</span>
          {:else}
            <Save aria-hidden="true" size={14} strokeWidth={2} />
            <span>Lưu bài viết</span>
          {/if}
        </button>
      </footer>
    </form>
  </div>
</div>

{#if rejectModalOpen && article}
  <RejectReasonModal
    title={article.title}
    {busy}
    onClose={() => rejectModalOpen = false}
    onConfirm={handleAdminReject}
  />
{/if}
