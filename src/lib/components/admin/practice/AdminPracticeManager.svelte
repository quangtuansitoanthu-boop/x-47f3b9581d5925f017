<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  import { BookOpen, Check, FilePenLine, HeartHandshake, Plus, RotateCcw, Trash2 } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { fetchAdminPracticeArticles } from '$lib/browser/content-catalogs';
  import { invalidateArticleState, serverStateKeys } from '$lib/browser/server-state';
  import { fetchWithSessionRefresh, getBrowserSession, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import ArticleAdminModal from '$lib/components/admin/articles/ArticleAdminModal.svelte';
  import RejectReasonModal from '$lib/components/admin/articles/RejectReasonModal.svelte';
  import type { ArticleCategory, LibraryArticle } from '$lib/components/library/article';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import { compareContentRecency } from '$lib/domain/content-recency';

  interface Props {
    initialArticles: LibraryArticle[];
    role: 'ctv' | 'admin';
    userId: string;
  }

  type ApprovalTab = 'all' | 'pending' | 'approved';
  type SortMode = 'newest' | 'title' | 'featured';
  const PRACTICE_CATEGORIES: ArticleCategory[] = ['KINH PHẬT', 'TRÌ CHÚ', 'NGHI THỨC KHÁC'];
  let { initialArticles, role, userId }: Props = $props();
  let approvalTab = $state<ApprovalTab>('all');
  let query = $state('');
  let category = $state<'all' | ArticleCategory>('all');
  let status = $state('all');
  let sort = $state<SortMode>('newest');
  let editorOpen = $state(false);
  let editingArticle = $state<LibraryArticle | null>(null);
  let rejectingArticle = $state<LibraryArticle | null>(null);
  let actionError = $state('');
  let notice = $state('');
  let mutatingId = $state<string | null>(null);
  const queryClient = useQueryClient();
  const articlesQuery = createQuery(() => ({
    queryKey: serverStateKeys.articles.adminPractice(userId),
    queryFn: async ({ signal }) => {
      const session = await getBrowserSession({ force: true });
      if (!canManageContent(session)) {
        leaveAdmin();
        throw new Error('Phiên quản trị đã hết hạn.');
      }
      return fetchAdminPracticeArticles(fetchWithSessionRefresh, signal);
    },
    initialData: initialArticles,
  }));
  const articles = $derived(articlesQuery.data ?? []);
  const loading = $derived(articlesQuery.isFetching);
  const error = $derived(actionError || (articlesQuery.error instanceof Error ? articlesQuery.error.message : ''));
  const pendingCount = $derived(articles.filter((a) => isPendingOrRejected(a)).length);
  const approvedCount = $derived(articles.filter((a) => !isPendingOrRejected(a)).length);

  const filtered = $derived.by(() => {
    return articles.filter((article) => {
      if (approvalTab === 'pending' && !isPendingOrRejected(article)) return false;
      if (approvalTab === 'approved' && isPendingOrRejected(article)) return false;
      return true;
    }).sort(compareContentRecency);
  });

  function isPendingOrRejected(article: LibraryArticle): boolean {
    const s = normalizedStatus(article);
    return s === 'Chờ duyệt' || s.startsWith('Trả lại');
  }

  function normalizedStatus(article: LibraryArticle): string {
    return article.status || 'Chưa đặt';
  }

  function contentType(article: LibraryArticle): string {
    if (article.pdfUrl) return 'PDF';
    if (article.hasTableOfContents) return `${article.volumeCount || 0} phẩm`;
    return 'Bài đơn';
  }

  function openCreate(): void {
    editingArticle = null;
    editorOpen = true;
  }

  function resetFilters(): void {
    query = '';
    category = 'all';
    status = 'all';
    sort = 'newest';
  }

  async function refreshArticles(message = ''): Promise<void> {
    actionError = '';
    try {
      const result = await articlesQuery.refetch();
      if (result.error) throw result.error;
      notice = message;
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể làm mới nội dung Tu tập.';
    }
  }

  async function approveArticle(article: LibraryArticle): Promise<void> {
    if (role !== 'admin' || mutatingId) return;
    mutatingId = article.id;
    actionError = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(article.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ trang_thai: 'Hoàn thành' }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Không thể duyệt bài viết.');
      }
      notice = `Đã duyệt bài “${article.title}”.`;
      await invalidateArticleState(queryClient);
      await refreshArticles();
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể duyệt bài viết.';
    } finally {
      mutatingId = null;
    }
  }

  async function handleConfirmReject(reason: string): Promise<void> {
    if (!rejectingArticle || role !== 'admin' || mutatingId) return;
    const target = rejectingArticle;
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
      rejectingArticle = null;
      notice = `Đã trả lại bài viết “${target.title}” cho Cộng tác viên.`;
      await invalidateArticleState(queryClient);
      await refreshArticles();
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể cập nhật bài viết.';
    } finally {
      mutatingId = null;
    }
  }

  async function deleteArticleInline(article: LibraryArticle): Promise<void> {
    if (role !== 'admin' || mutatingId) return;
    const principal = getBrowserSessionSnapshot();
    if (!await confirmInApp(`Bạn có chắc chắn muốn xóa bài viết “${article.title}”?`)) return;
    const current = getBrowserSessionSnapshot();
    if (role !== 'admin' || mutatingId || current.user?.id !== principal.user?.id || current.user?.role !== principal.user?.role) return;
    mutatingId = article.id;
    actionError = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(article.id)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Không thể xóa bài viết.');
      }
      notice = `Đã xóa “${article.title}”.`;
      await invalidateArticleState(queryClient);
      await refreshArticles();
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể xóa bài viết.';
    } finally {
      mutatingId = null;
    }
  }

  function canManageContent(session: PageSessionDTO): boolean {
    return Boolean(session.authenticated && ['ctv', 'admin'].includes(session.user?.role ?? ''));
  }

  function leaveAdmin(): void {
    queryClient.removeQueries({ queryKey: serverStateKeys.articles.adminPractice(userId) });
    actionError = 'Phiên quản trị đã hết hạn hoặc không đủ quyền.';
  }

  function savedArticle(article: LibraryArticle): void {
    editorOpen = false;
    editingArticle = null;
    notice = `Đã lưu “${article.title}”.`;
  }

  function deletedArticle(article: LibraryArticle): void {
    editorOpen = false;
    editingArticle = null;
    notice = `Đã xóa “${article.title}”.`;
  }

  onMount(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab === 'pending' || urlTab === 'approved') approvalTab = urlTab;
    const sessionChanged = (event: Event) => {
      if (!canManageContent((event as CustomEvent<PageSessionDTO>).detail)) leaveAdmin();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });
  const readOnly = $derived(isNativeAdminReadOnly(role));
</script>

<section class="admin-content-manager" aria-labelledby="admin-practice-title">
  <header class="admin-content-header">
    <div><span>Quản trị nội dung</span><h1 id="admin-practice-title">Nội dung tu tập</h1><p>Quản lý kinh, nghi thức và nội dung công phu.</p></div>
    <div class="admin-content-actions"><a href="/tu-tap">Mở trang Tu tập</a><button class="secondary" type="button" disabled={loading} onclick={() => void refreshArticles('Danh sách đã được làm mới.')}>{loading ? 'Đang tải…' : 'Làm mới'}</button>{#if !readOnly}<button type="button" onclick={openCreate}><Plus aria-hidden="true" size={16} strokeWidth={2} /> Tạo bài tu tập</button>{/if}</div>
  </header>

  <div class="admin-approval-nav" role="tablist" aria-label="Phân loại duyệt bài tu tập">
    <button
      class:active={approvalTab === 'all'}
      class="admin-approval-tab"
      type="button"
      role="tab"
      aria-selected={approvalTab === 'all'}
      onclick={() => approvalTab = 'all'}
    >
      📚 Tất cả ({articles.length})
    </button>
    <button
      class:active={approvalTab === 'pending'}
      class="admin-approval-tab admin-approval-tab--pending"
      type="button"
      role="tab"
      aria-selected={approvalTab === 'pending'}
      onclick={() => approvalTab = 'pending'}
    >
      ⏳ Chờ duyệt {#if pendingCount > 0}<span class="tab-badge-pending">{pendingCount}</span>{/if}
    </button>
    <button
      class:active={approvalTab === 'approved'}
      class="admin-approval-tab admin-approval-tab--approved"
      type="button"
      role="tab"
      aria-selected={approvalTab === 'approved'}
      onclick={() => approvalTab = 'approved'}
    >
      ✅ Đã duyệt ({approvedCount})
    </button>
  </div>

  <section class="admin-inventory" aria-labelledby="practice-inventory-title">
    <header><div><span>Kho nội dung</span><h2 id="practice-inventory-title">Danh sách bài tu tập</h2></div><strong>{filtered.length}/{articles.length}</strong></header>
    {#if error}<p class="admin-inventory-alert error" role="alert">{error} <button type="button" onclick={() => void refreshArticles()}>Thử lại</button></p>{/if}
    {#if notice}<p class="admin-inventory-alert" role="status">{notice}</p>{/if}
    {#if filtered.length === 0}
      <div class="admin-inventory-empty"><strong>Không có bài phù hợp</strong><p>Chưa có nội dung trong mục này hoặc hãy tạo nội dung mới.</p>{#if !readOnly}<button type="button" onclick={openCreate}>+ Thêm nội dung tu tập</button>{/if}</div>
    {:else}
      <div class="admin-inventory-table-wrap"><table><caption>Danh sách nội dung Tu tập</caption><thead><tr><th>Nội dung</th><th>Danh mục</th><th>Loại</th><th>Trạng thái</th><th>Ngày đăng</th><th><span class="sr-only">Hành động</span></th></tr></thead>
        <tbody>{#each filtered as article (article.id)}<tr>
          <td data-label="Nội dung"><div class="inventory-title"><span class="inventory-cover">{#if article.category === 'KINH PHẬT'}<BookOpen aria-hidden="true" size={20} strokeWidth={1.8} />{:else}<HeartHandshake aria-hidden="true" size={20} strokeWidth={1.8} />{/if}</span><div><strong>{article.title}</strong><small>{article.author || article.id}{article.tags.length ? ` · ${article.tags.slice(0, 2).join(', ')}` : ''}</small></div></div></td>
          <td data-label="Danh mục">{article.category === 'KINH PHẬT' ? 'Kinh Phật' : (article.category === 'TRÌ CHÚ' ? 'Trì chú' : 'Nghi thức khác')}</td>
          <td data-label="Loại">{contentType(article)}</td>
          <td data-label="Trạng thái"><span class:pending={normalizedStatus(article) === 'Chờ duyệt'} class:rejected={normalizedStatus(article).startsWith('Trả lại')} class:private={normalizedStatus(article) === 'Tạm dừng'} class:warning={normalizedStatus(article) === 'Đang cập nhật'} class="admin-status-badge" title={normalizedStatus(article)}>{normalizedStatus(article).startsWith('Trả lại') ? '⚠️ Cần sửa lại' : normalizedStatus(article)}</span></td>
          <td data-label="Ngày đăng">{formatVietnamDate(article.publishedAt) || '—'}</td>
          <td data-label="Hành động">
            <div class="row-actions-group">
              {#if role === 'admin' && (normalizedStatus(article) === 'Chờ duyệt' || normalizedStatus(article).startsWith('Trả lại'))}
                {#if !readOnly}<button
                  class="row-action-btn approve"
                  type="button"
                  title="Duyệt bài viết"
                  disabled={mutatingId === article.id}
                  onclick={() => approveArticle(article)}
                >
                  <Check aria-hidden="true" size={13} strokeWidth={2.4} />
                  <span>Duyệt</span>
                </button>{/if}
                {#if !readOnly}<button
                  class="row-action-btn reject"
                  type="button"
                  title="Trả lại bài viết kèm lý do cho CTV"
                  disabled={mutatingId === article.id}
                  onclick={() => rejectingArticle = article}
                >
                  <RotateCcw aria-hidden="true" size={13} strokeWidth={2} />
                  <span>Trả lại</span>
                </button>{/if}
              {/if}
              {#if !readOnly}<button
                class="row-action-btn edit"
                type="button"
                title="Chỉnh sửa"
                aria-label="Chỉnh sửa"
                disabled={mutatingId === article.id}
                onclick={() => { editingArticle = article; editorOpen = true; }}
              >
                <FilePenLine aria-hidden="true" size={13} strokeWidth={2} />
                <span>Chỉnh sửa</span>
              </button>{/if}
              {#if role === 'admin'}
                {#if !readOnly}<button
                  class="row-action-btn delete"
                  type="button"
                  title="Xóa bài"
                  aria-label="Xóa"
                  disabled={mutatingId === article.id}
                  onclick={() => deleteArticleInline(article)}
                >
                  <Trash2 aria-hidden="true" size={13} strokeWidth={2} />
                  <span>Xóa</span>
                </button>{/if}
              {/if}
            </div>
          </td>
        </tr>{/each}</tbody>
      </table></div>
    {/if}
  </section>
</section>

{#if editorOpen && !readOnly}
  <ArticleAdminModal
    article={editingArticle}
    allowedCategories={PRACTICE_CATEGORIES}
    defaultCategory="KINH PHẬT"
    {role}
    onClose={() => { editorOpen = false; editingArticle = null; }}
    onSaved={savedArticle}
    onDeleted={deletedArticle}
  />
{/if}

{#if rejectingArticle && !readOnly}
  <RejectReasonModal
    title={rejectingArticle.title}
    busy={mutatingId === rejectingArticle.id}
    onClose={() => rejectingArticle = null}
    onConfirm={handleConfirmReject}
  />
{/if}
