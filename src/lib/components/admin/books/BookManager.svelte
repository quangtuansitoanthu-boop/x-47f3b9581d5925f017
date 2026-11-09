<script module lang="ts">
  export function hasUnsavedBookWork(bookFormDirty: boolean, chapterDirty: boolean): boolean { return bookFormDirty || chapterDirty; }
  export function canChangeActiveBook(chapterUploadBusy: boolean): boolean { return !chapterUploadBusy; }
  export function resolveInitialBook<T extends { id: string }>(books: T[], selectedBookId: string): T | null { return books.find((book) => book.id === selectedBookId) ?? null; }
</script>

<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  import { Check, FilePenLine, Plus, RotateCcw, Trash2 } from '@lucide/svelte';
  import { onMount, untrack } from 'svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { fetchWithSessionRefresh, getBrowserSession, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { invalidateArticleState, serverStateKeys } from '$lib/browser/server-state';
  import ArticleAdminModal from '$lib/components/admin/articles/ArticleAdminModal.svelte';
  import type { ArticleCategory, LibraryArticle } from '$lib/components/library/article';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import ImportJsonModal from './ImportJsonModal.svelte';
  import RejectReasonModal from '$lib/components/admin/articles/RejectReasonModal.svelte';
  import { compareContentRecency } from '$lib/domain/content-recency';
  import '$lib/styles/admin-content-management.css';

  interface BookRow {
    id?: unknown; tieu_de?: unknown; tom_tat?: unknown; noi_dung?: unknown; danh_muc?: unknown;
    tags?: unknown; tac_gia?: unknown; anh_url?: unknown; noi_bat?: unknown; ngay_dang?: unknown;
    has_muc_luc?: unknown; so_tap?: unknown; trang_thai?: unknown; pdf_url?: unknown; link_ngoai?: unknown;
    created_at?: unknown; updated_at?: unknown;
  }
  interface Session { authenticated: boolean; user: null | { id: string; role: string }; }
  interface Props { books: BookRow[]; session: Session; selectedBookId?: string; initialMode?: 'create' | 'import' | null; }
  type ApprovalTab = 'all' | 'pending' | 'approved';
  type SortMode = 'newest' | 'title' | 'featured';
  const CATEGORIES = new Set<ArticleCategory>(['CHUYỆN NHÂN QUẢ', 'SÁCH KHUYẾN THIỆN', 'KINH PHẬT', 'TRÌ CHÚ', 'NGHI THỨC KHÁC', 'KHÁC']);

  let { books: initialBooks, session, selectedBookId = '', initialMode = null }: Props = $props();
  let approvalTab = $state<ApprovalTab>('all');
  let query = $state('');
  let category = $state<'all' | ArticleCategory>('all');
  let status = $state('all');
  let sort = $state<SortMode>('newest');
  let editing = $state<LibraryArticle | null>(null);
  let editorOpen = $state(false);
  let importOpen = $state(false);
  let rejectingBook = $state<LibraryArticle | null>(null);
  let actionError = $state('');
  let notice = $state('');
  let mutatingId = $state<string | null>(null);
  const queryClient = useQueryClient();
  const booksQuery = createQuery(() => ({
    queryKey: serverStateKeys.articles.admin(session.user?.id ?? 'anonymous'),
    queryFn: async ({ signal }) => {
      const browserSession = await getBrowserSession({ force: true });
      if (!canManageContent(browserSession)) {
        leaveAdmin();
        throw new Error('Phiên quản trị đã hết hạn.');
      }
      const response = await fetchWithSessionRefresh('/api/articles?select=*&order=created_at.desc&limit=500', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error('Không thể tải lại danh sách sách.');
      const rows = await response.json();
      return Array.isArray(rows) ? rows.map(mapBook).filter((book) => book.id && book.title) : [];
    },
    initialData: untrack(() => initialBooks.map(mapBook).filter((book) => book.id && book.title)),
  }));
  const books = $derived(booksQuery.data ?? []);
  const loading = $derived(booksQuery.isFetching);
  const error = $derived(actionError || (booksQuery.error instanceof Error ? booksQuery.error.message : ''));
  const role = $derived(session.user?.role === 'admin' ? 'admin' as const : 'ctv' as const);
  const readOnly = $derived(isNativeAdminReadOnly(role));
  const categories = $derived([...new Set(books.map((book) => book.category))].sort((a, b) => a.localeCompare(b, 'vi')));
  const pendingCount = $derived(books.filter((b) => isPendingOrRejected(b)).length);
  const approvedCount = $derived(books.filter((b) => !isPendingOrRejected(b)).length);
  const filtered = $derived.by(() => {
    return books.filter((book) => {
      if (approvalTab === 'pending' && !isPendingOrRejected(book)) return false;
      if (approvalTab === 'approved' && isPendingOrRejected(book)) return false;
      if (category !== 'all' && book.category !== category) return false;
      return true;
    }).sort(compareContentRecency);
  });

  function isPendingOrRejected(book: LibraryArticle): boolean {
    const s = normalizedStatus(book);
    return s === 'Chờ duyệt' || s.startsWith('Trả lại');
  }

  function mapBook(row: BookRow): LibraryArticle {
    let rawCategory = String(row.danh_muc ?? '').trim().toUpperCase();
    if (rawCategory === 'CÁC NGHI THỨC') rawCategory = 'NGHI THỨC KHÁC';
    const mappedCategory = CATEGORIES.has(rawCategory as ArticleCategory) ? rawCategory as ArticleCategory : 'KHÁC';
    return {
      id: String(row.id ?? ''), title: String(row.tieu_de ?? ''), summary: String(row.tom_tat ?? ''), content: String(row.noi_dung ?? ''),
      category: mappedCategory, tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean), author: String(row.tac_gia ?? 'Quang Từ'),
      imageUrl: String(row.anh_url ?? ''), featured: Number(row.noi_bat ?? 0) > 0, publishedAt: String(row.ngay_dang ?? ''),
      hasTableOfContents: Boolean(row.has_muc_luc), volumeCount: Number(row.so_tap ?? 0), status: String(row.trang_thai ?? ''),
      pdfUrl: String(row.pdf_url ?? ''), externalUrl: String(row.link_ngoai ?? ''),
      createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
    };
  }
  function resetFilters(): void { query = ''; category = 'all'; status = 'all'; sort = 'newest'; }
  function normalizedStatus(book: LibraryArticle): string { return book.status || 'Chưa đặt'; }
  // A book with a table of contents is listed by its chapters even if a
  // pdf_url is still recorded, matching how the reader presents it.
  function contentType(book: LibraryArticle): string { if (book.hasTableOfContents) return `${book.volumeCount || 0} phẩm`; if (book.pdfUrl) return 'PDF'; return 'Bài đơn'; }
  function openEditor(book: LibraryArticle | null): void { if (readOnly) return; editing = book; editorOpen = true; }
  function savedBook(book: LibraryArticle): void { editorOpen = false; editing = null; notice = `Đã lưu “${book.title}”.`; }
  function deletedBook(book: LibraryArticle): void { editorOpen = false; editing = null; notice = `Đã xoá “${book.title}”.`; }

  async function refreshBooks(message = ''): Promise<void> {
    actionError = '';
    try {
      const result = await booksQuery.refetch();
      if (result.error) throw result.error;
      notice = message;
    } catch (cause) { actionError = cause instanceof Error ? cause.message : 'Không thể tải lại danh sách sách.'; }
  }

  async function approveBook(book: LibraryArticle): Promise<void> {
    if (role !== 'admin' || mutatingId) return;
    mutatingId = book.id;
    actionError = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(book.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ trang_thai: 'Hoàn thành' }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Không thể duyệt bài viết.');
      }
      notice = `Đã duyệt bài “${book.title}”.`;
      await invalidateArticleState(queryClient);
      await refreshBooks();
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể duyệt bài viết.';
    } finally {
      mutatingId = null;
    }
  }

  async function handleConfirmReject(reason: string): Promise<void> {
    if (!rejectingBook || role !== 'admin' || mutatingId) return;
    const target = rejectingBook;
    mutatingId = target.id;
    actionError = '';
    const newStatus = reason ? `Trả lại: ${reason}` : 'Trả lại';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(target.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ trang_thai: newStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Không thể cập nhật bài viết.');
      }
      rejectingBook = null;
      notice = `Đã trả lại bài viết “${target.title}” cho Cộng tác viên.`;
      await invalidateArticleState(queryClient);
      await refreshBooks();
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể cập nhật bài viết.';
    } finally {
      mutatingId = null;
    }
  }

  async function deleteBookInline(book: LibraryArticle): Promise<void> {
    if (role !== 'admin' || mutatingId) return;
    const principal = getBrowserSessionSnapshot();
    if (!await confirmInApp(`Bạn có chắc chắn muốn xóa bài viết “${book.title}”?`)) return;
    const current = getBrowserSessionSnapshot();
    if (role !== 'admin' || mutatingId || current.user?.id !== principal.user?.id || current.user?.role !== principal.user?.role) return;
    mutatingId = book.id;
    actionError = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(book.id)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Không thể xóa bài viết.');
      }
      notice = `Đã xóa “${book.title}”.`;
      await invalidateArticleState(queryClient);
      await refreshBooks();
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể xóa bài viết.';
    } finally {
      mutatingId = null;
    }
  }

  function canManageContent(current: PageSessionDTO): boolean { return Boolean(current.authenticated && ['ctv', 'admin'].includes(current.user?.role ?? '')); }
  function leaveAdmin(): void { queryClient.removeQueries({ queryKey: serverStateKeys.articles.admin(session.user?.id ?? 'anonymous') }); }

  onMount(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab === 'pending' || urlTab === 'approved') approvalTab = urlTab;
    const selected = resolveInitialBook(books, selectedBookId);
    if (selected) openEditor(selected);
    else if (initialMode === 'create') openEditor(null);
    else if (!readOnly && initialMode === 'import') importOpen = true;
    const sessionChanged = (event: Event) => { if (!canManageContent((event as CustomEvent<PageSessionDTO>).detail)) leaveAdmin(); };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
  });
</script>

<section class="admin-content-manager" aria-labelledby="admin-books-title">
  <header class="admin-content-header"><div><span>Quản trị nội dung</span><h1 id="admin-books-title">Sách &amp; bài viết</h1><p>Chọn một nội dung để mở trình biên tập đầy đủ và quản lý mục lục.</p></div><div class="admin-content-actions">{#if !readOnly}<button type="button" onclick={() => openEditor(null)}><Plus aria-hidden="true" size={16} strokeWidth={2} /> Thêm bài viết</button>{/if}</div></header>

  <div class="admin-approval-nav" role="tablist" aria-label="Phân loại duyệt bài">
    <button
      class:active={approvalTab === 'all'}
      class="admin-approval-tab"
      type="button"
      role="tab"
      aria-selected={approvalTab === 'all'}
      onclick={() => approvalTab = 'all'}
    >
      📚 Tất cả bài viết ({books.length})
    </button>
    <button
      class:active={approvalTab === 'pending'}
      class="admin-approval-tab admin-approval-tab--pending"
      type="button"
      role="tab"
      aria-selected={approvalTab === 'pending'}
      onclick={() => approvalTab = 'pending'}
    >
      ⏳ Bài viết chờ duyệt {#if pendingCount > 0}<span class="tab-badge-pending">{pendingCount}</span>{/if}
    </button>
    <button
      class:active={approvalTab === 'approved'}
      class="admin-approval-tab admin-approval-tab--approved"
      type="button"
      role="tab"
      aria-selected={approvalTab === 'approved'}
      onclick={() => approvalTab = 'approved'}
    >
      ✅ Bài viết đã duyệt ({approvedCount})
    </button>
  </div>

  <section class="admin-inventory" aria-labelledby="books-list-title">
    <header><div><span>Kho nội dung</span><h2 id="books-list-title">Danh sách sách &amp; bài viết</h2></div><strong>{filtered.length}/{books.length}</strong></header>
    {#if error}<p class="admin-inventory-alert error" role="alert">{error} <button type="button" onclick={() => void refreshBooks()}>Thử lại</button></p>{/if}{#if notice}<p class="admin-inventory-alert" role="status">{notice}</p>{/if}
    {#if filtered.length === 0}<div class="admin-inventory-empty"><strong>Không có nội dung phù hợp</strong><p>Chưa có bài viết trong danh mục này hoặc hãy tạo bài viết mới.</p>{#if !readOnly}<button type="button" onclick={() => openEditor(null)}>+ Viết bài mới</button>{/if}</div>{:else}<div class="admin-inventory-table-wrap"><table><caption>Danh sách sách và bài viết</caption><thead><tr><th>Nội dung</th><th>Danh mục</th><th>Loại</th><th>Trạng thái</th><th>Ngày đăng</th><th><span class="sr-only">Hành động</span></th></tr></thead><tbody>{#each filtered as book (book.id)}<tr><td data-label="Nội dung"><div class="inventory-title"><span class="inventory-cover">{#if book.imageUrl}<img src={book.imageUrl.split('#')[0]} alt="" width="42" height="42" loading="lazy" />{:else}S{/if}</span><div><strong>{book.title}</strong><small>{book.author || book.id}{book.tags.length ? ` · ${book.tags.slice(0, 2).join(', ')}` : ''}</small></div></div></td><td data-label="Danh mục">{book.category}</td><td data-label="Loại">{contentType(book)}</td><td data-label="Trạng thái"><span class:pending={normalizedStatus(book) === 'Chờ duyệt'} class:rejected={normalizedStatus(book).startsWith('Trả lại')} class:private={normalizedStatus(book) === 'Tạm dừng'} class:warning={normalizedStatus(book) === 'Đang cập nhật'} class="admin-status-badge" title={normalizedStatus(book)}>{normalizedStatus(book).startsWith('Trả lại') ? '⚠️ Cần sửa lại' : normalizedStatus(book)}</span></td><td data-label="Ngày đăng">{formatVietnamDate(book.publishedAt) || '—'}</td>          <td data-label="Hành động">
            <div class="row-actions-group">
              {#if role === 'admin' && (normalizedStatus(book) === 'Chờ duyệt' || normalizedStatus(book).startsWith('Trả lại'))}
                {#if !readOnly}<button
                  class="row-action-btn approve"
                  type="button"
                  title="Duyệt và xuất bản bài viết"
                  disabled={mutatingId === book.id}
                  onclick={() => approveBook(book)}
                >
                  <Check aria-hidden="true" size={13} strokeWidth={2.4} />
                  <span>Duyệt</span>
                </button>{/if}
                {#if !readOnly}<button
                  class="row-action-btn reject"
                  type="button"
                  title="Trả lại bài viết kèm lý do cho CTV"
                  disabled={mutatingId === book.id}
                  onclick={() => rejectingBook = book}
                >
                  <RotateCcw aria-hidden="true" size={13} strokeWidth={2} />
                  <span>Trả lại</span>
                </button>{/if}
              {/if}
              {#if !readOnly}<button
                class="row-action-btn edit"
                type="button"
                title="Chỉnh sửa nội dung"
                aria-label="Chỉnh sửa"
                disabled={mutatingId === book.id}
                onclick={() => openEditor(book)}
              >
                <FilePenLine aria-hidden="true" size={13} strokeWidth={2} />
                <span>Chỉnh sửa</span>
              </button>{/if}
              {#if role === 'admin'}
                {#if !readOnly}<button
                  class="row-action-btn delete"
                  type="button"
                  title="Xóa bài viết"
                  aria-label="Xóa"
                  disabled={mutatingId === book.id}
                  onclick={() => deleteBookInline(book)}
                >
                  <Trash2 aria-hidden="true" size={13} strokeWidth={2} />
                  <span>Xóa</span>
                </button>{/if}
              {/if}
            </div>
          </td></tr>{/each}</tbody></table></div>{/if}
  </section>
</section>

{#if editorOpen && !readOnly}<ArticleAdminModal article={editing} {role} onClose={() => { editorOpen = false; editing = null; }} onSaved={savedBook} onDeleted={deletedBook} />{/if}
{#if importOpen && !readOnly}<ImportJsonModal onClose={() => importOpen = false} onImported={() => refreshBooks('Đã cập nhật danh sách sau khi import.')} />{/if}
{#if rejectingBook && !readOnly}
  <RejectReasonModal
    title={rejectingBook.title}
    busy={mutatingId === rejectingBook.id}
    onClose={() => rejectingBook = null}
    onConfirm={handleConfirmReject}
  />
{/if}
