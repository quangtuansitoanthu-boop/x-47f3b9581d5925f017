<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { onMount, untrack } from 'svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import {
    createReadingActivityClient,
    isReadingActivityCapacityError,
    type ReadingAnnotationRecord,
    type ReadingActivitySession,
  } from '$lib/browser/reading-activity-client';
  import { createPrivateReadingPrincipalGuard } from '$lib/browser/private-reading-principal-lifecycle';
  import { fetchHomepageWithOfflinePdfs } from '$lib/browser/offline-pdf-library';
  import { quoteCardCopy } from '$lib/i18n/quote-card';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import type { LibraryArticle } from '$lib/components/library/article';
  import type { HighlightColor, ReadingContentKind } from '$lib/domain/reading/activity';
  import { getSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { matchesVietnameseSearch } from '$lib/utils/vietnamese-search';
  import QuoteCardModal from '$lib/components/reader/QuoteCardModal.svelte';

  const sessionStore = getSessionContext();
  const localeStore = getLocaleContext();
  const copy = $derived(quoteCardCopy[localeStore.current]);
  let annotations = $state<ReadingAnnotationRecord[]>([]);
  let articles = $state<LibraryArticle[]>([]);
  let completeSourceCatalog = $state(false);
  let loading = $state(true);
  let error = $state('');
  let query = $state('');
  let kind = $state<'all' | ReadingContentKind>('all');
  let color = $state<'all' | HighlightColor>('all');
  let anchor = $state<'all' | 'active' | 'orphaned'>('all');
  let editing = $state<ReadingAnnotationRecord | null>(null);
  let editingColor = $state<HighlightColor>('yellow');
  let editingNote = $state('');
  let saving = $state(false);
  let cardAnnotation = $state<ReadingAnnotationRecord | null>(null);
  let client: ReturnType<typeof createReadingActivityClient> | null = null;
  let generation = 0;
  const principalGuard = createPrivateReadingPrincipalGuard(untrack(() => sessionStore.value));

  const filtered = $derived(annotations.filter((annotation) => {
    return (kind === 'all' || annotation.contentKind === kind)
      && (color === 'all' || annotation.color === color)
      && (anchor === 'all' || annotation.anchorStatus === anchor)
      && matchesVietnameseSearch([annotation.quoteText, annotation.note, sourceTitle(annotation)], query);
  }));

  function sourceFor(annotation: ReadingAnnotationRecord): LibraryArticle | null {
    return articles.find((article) => article.id === annotation.contentId) ?? null;
  }

  function sourceTitle(annotation: ReadingAnnotationRecord): string {
    return sourceFor(annotation)?.title || (completeSourceCatalog ? copy.sourceUnavailable : copy.sourceUnverified);
  }

  function kindLabel(value: ReadingContentKind): string {
    if (value === 'pdf') return 'PDF';
    if (value === 'book' || value === 'chapter') return 'Sách';
    if (value === 'practice') return 'Tu tập';
    return 'Bài viết';
  }

  function beginEdit(annotation: ReadingAnnotationRecord): void {
    editing = annotation;
    editingColor = annotation.color;
    editingNote = annotation.note;
  }

  function dismissEdit(): void {
    if (!saving) editing = null;
  }

  function dismissBackdrop(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    const bounds = (event.currentTarget as HTMLDialogElement).getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) dismissEdit();
  }

  function clearPrivateState(): void {
    generation += 1;
    annotations = [];
    articles = [];
    completeSourceCatalog = false;
    loading = false;
    error = '';
    query = '';
    kind = 'all';
    color = 'all';
    anchor = 'all';
    editing = null;
    cardAnnotation = null;
    editingColor = 'yellow';
    editingNote = '';
    saving = false;
    window.getSelection()?.removeAllRanges();
  }

  async function load(): Promise<void> {
    if (!client || !sessionStore.value.authenticated) {
      annotations = [];
      articles = [];
      completeSourceCatalog = false;
      error = '';
      loading = false;
      return;
    }
    const request = ++generation;
    const principalToken = principalGuard.capture();
    loading = true;
    error = '';
    try {
      const role = sessionStore.value.user?.role ?? 'user';
      const [quotes, sources] = await Promise.allSettled([
        client.listAnnotations({ limit: 200 }),
        fetchHomepageWithOfflinePdfs(fetch, role, sessionStore.value.user?.id ?? null),
      ]);
      if (request !== generation || !principalGuard.isCurrent(principalToken)) return;
      annotations = quotes.status === 'fulfilled' ? quotes.value : client.cachedAnnotations();
      articles = sources.status === 'fulfilled' ? sources.value.articles : [];
      completeSourceCatalog = sources.status === 'fulfilled' && !sources.value.offline;
      if (quotes.status === 'rejected' || sources.status === 'rejected' || sources.value.offline) {
        error = 'Không thể đồng bộ trích dẫn lúc này. Đang hiển thị dữ liệu đã lưu trên thiết bị.';
      }
    } catch {
      if (request !== generation || !principalGuard.isCurrent(principalToken)) return;
      annotations = client.cachedAnnotations();
      completeSourceCatalog = false;
      error = 'Không thể đồng bộ trích dẫn lúc này. Đang hiển thị dữ liệu đã lưu trên thiết bị.';
    } finally {
      if (request === generation && principalGuard.isCurrent(principalToken)) loading = false;
    }
  }

  async function saveEdit(): Promise<void> {
    if (!client || !editing) return;
    const principalToken = principalGuard.capture();
    saving = true;
    const target = editing;
    try {
      client.enqueueAnnotationUpdate(target.id, {
        anchorStatus: target.anchorStatus,
        baseUpdatedAt: target.updatedAt,
        color: editingColor,
        contentVersion: target.contentVersion,
        locator: target.locator,
        note: editingNote,
      });
      await client.flush();
      if (!principalGuard.isCurrent(principalToken)) return;
      annotations = client.cachedAnnotations();
      editing = null;
    } catch (cause) {
      if (!principalGuard.isCurrent(principalToken)) return;
      error = isReadingActivityCapacityError(cause)
        ? 'Hàng đợi đọc ngoại tuyến đã đầy. Ghi chú chưa thay đổi; hãy kết nối để đồng bộ rồi thử lại.'
        : 'Chưa thể gửi thay đổi. Ghi chú đã được giữ an toàn trên thiết bị để thử lại.';
      annotations = client.cachedAnnotations();
      editing = null;
    } finally {
      if (principalGuard.isCurrent(principalToken)) saving = false;
    }
  }

  async function remove(annotation: ReadingAnnotationRecord): Promise<void> {
    if (!client) return;
    const principalToken = principalGuard.capture();
    if (!await confirmInApp('Xóa trích dẫn này?') || !principalGuard.isCurrent(principalToken) || !client) return;
    try {
      client.enqueueAnnotationDelete(annotation.id);
      annotations = client.cachedAnnotations();
      if (editing?.id === annotation.id) editing = null;
      await client.flush();
    } catch (cause) {
      if (!principalGuard.isCurrent(principalToken)) return;
      error = isReadingActivityCapacityError(cause)
        ? 'Hàng đợi đọc ngoại tuyến đã đầy; trích dẫn chưa bị xóa.'
        : 'Yêu cầu xóa sẽ được thử lại khi kết nối ổn định.';
    }
  }

  function requestLogin(event: MouseEvent): void {
    window.dispatchEvent(new CustomEvent('quangtu:login-required', {
      detail: { reason: 'quotes', returnFocusTo: event.currentTarget },
    }));
  }

  onMount(() => {
    client = createReadingActivityClient(fetch, localStorage);
    client.setSession(sessionStore.value);
    void load();
    const sessionChanged = (event: Event) => {
      const next = (event as CustomEvent<ReadingActivitySession>).detail;
      const principalChanged = principalGuard.transition(next);
      if (principalChanged) clearPrivateState();
      client?.setSession(next);
      void load();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      generation += 1;
      principalGuard.invalidate();
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });
</script>

<svelte:head>
  <title>Trích dẫn của tôi — Quang Từ</title>
  <meta name="description" content="Các đoạn đã tô sáng và ghi chú riêng của bạn." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="quotes-page" aria-labelledby="quotes-title">
  <header class="quotes-hero">
    <a
      href="/kinh-sach#reading-library"
      onclick={(event) => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          event.preventDefault();
          window.history.back();
        }
      }}
    >{localizeUi('← Quay lại')}</a>
    <span>KHÔNG GIAN RIÊNG TƯ</span>
    <h1 id="quotes-title">Trích dẫn của tôi</h1>
    <p>Các đoạn bạn tô sáng và suy ngẫm cá nhân chỉ hiển thị cho tài khoản của bạn.</p>
  </header>

  {#if !sessionStore.value.authenticated}
    <section class="quotes-login" aria-label="Yêu cầu đăng nhập">
      <span aria-hidden="true">🔒</span>
      <h2>Đăng nhập để xem trích dẫn</h2>
      <p>Trích dẫn từ tài khoản khác hoặc vùng đọc ẩn danh không được tự động nhập vào đây.</p>
      <button type="button" onclick={requestLogin}>Đăng nhập</button>
    </section>
  {:else}
    <section class="quotes-filters" aria-label="Lọc trích dẫn">
      <label class="quotes-search">Tìm kiếm
        <input type="search" bind:value={query} placeholder="Tìm trong trích dẫn, ghi chú…" />
      </label>
      <label>Nguồn
        <select bind:value={kind}>
          <option value="all">Tất cả</option><option value="article">Bài viết</option><option value="book">Sách</option><option value="chapter">Chương</option><option value="pdf">PDF</option><option value="practice">Tu tập</option>
        </select>
      </label>
      <label>Màu
        <select bind:value={color}><option value="all">Tất cả</option><option value="yellow">Vàng</option><option value="green">Xanh</option></select>
      </label>
      <label>Liên kết
        <select bind:value={anchor}><option value="all">Tất cả</option><option value="active">Còn khớp</option><option value="orphaned">Cần xem lại</option></select>
      </label>
    </section>

    {#if error}<p class="quotes-error" role="status">{error}</p>{/if}
    {#if loading}
      <div class="quotes-loading" role="status">Đang tải trích dẫn…</div>
    {:else if !filtered.length}
      <section class="quotes-empty">
        <span aria-hidden="true">✦</span>
        <h2>{annotations.length ? 'Không có trích dẫn phù hợp' : 'Chưa có trích dẫn nào'}</h2>
        <p>{annotations.length ? 'Hãy thay đổi bộ lọc.' : 'Trong trình đọc, chọn một đoạn văn rồi chọn màu và thêm ghi chú.'}</p>
      </section>
    {:else}
      <p class="quotes-count" aria-live="polite">{filtered.length} trích dẫn</p>
      <div class="quotes-list">
        {#each filtered as annotation (annotation.id)}
          {@const source = sourceFor(annotation)}
          <article class:orphaned={annotation.anchorStatus === 'orphaned'} style={`--quote-color:${annotation.color === 'green' ? '#9ed89a' : '#f4d76d'}`}>
            <div class="quote-meta"><span>{kindLabel(annotation.contentKind)}</span><time datetime={annotation.updatedAt}>{formatVietnamDate(annotation.updatedAt)}</time></div>
            <blockquote>{annotation.quoteText}</blockquote>
            {#if annotation.note}<p class="quote-note"><strong>Ghi chú:</strong> {annotation.note}</p>{/if}
            {#if annotation.anchorStatus === 'orphaned'}<p class="quote-orphan" role="status">⚠ Đoạn này không còn khớp với phiên bản nội dung hiện tại.</p>{/if}
            <footer>
              {#if source}<a href={`/?article=${encodeURIComponent(annotation.contentId)}&annotation=${encodeURIComponent(annotation.id)}`}>{source.title} <span aria-hidden="true">↗</span></a>{:else}<span>{sourceTitle(annotation)}</span>{/if}
              <div>
                <button class="quote-card-btn" type="button" onclick={() => (cardAnnotation = annotation)} title="Tạo ảnh chia sẻ mạng xã hội">🖼️ Tạo ảnh</button>
                <button type="button" onclick={() => beginEdit(annotation)}>Sửa</button>
                <button class="danger" type="button" onclick={() => void remove(annotation)}>Xóa</button>
              </div>
            </footer>
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</main>

{#if editing}
  <dialog use:modalDialog class="quote-dialog" data-dialog-glass aria-labelledby="quote-dialog-title"
    oncancel={(event) => { event.preventDefault(); dismissEdit(); }} onclick={dismissBackdrop}>
    <header><h2 id="quote-dialog-title" tabindex="-1" data-modal-focus>Sửa trích dẫn</h2><button type="button" aria-label="Đóng" disabled={saving} onclick={dismissEdit}>✕</button></header>
    <div class="quote-dialog-body">
      <blockquote>{editing.quoteText}</blockquote>
      <fieldset disabled={saving}><legend>Màu tô sáng</legend><label><input type="radio" bind:group={editingColor} value="yellow" /> Vàng</label><label><input type="radio" bind:group={editingColor} value="green" /> Xanh</label></fieldset>
      <label>Ghi chú<textarea bind:value={editingNote} maxlength="12000" rows="5" disabled={saving}></textarea></label>
    </div>
    <div class="dialog-actions dialog-actions-balanced"><button type="button" disabled={saving} onclick={dismissEdit}>Hủy</button><button class="primary" type="button" disabled={saving} onclick={() => void saveEdit()}>{saving ? 'Đang lưu…' : 'Lưu'}</button></div>
  </dialog>
{/if}

<QuoteCardModal
  open={Boolean(cardAnnotation)}
  quoteText={cardAnnotation?.quoteText || ''}
  sourceTitle={cardAnnotation ? sourceTitle(cardAnnotation) : ''}
  note={cardAnnotation?.note || ''}
  onClose={() => (cardAnnotation = null)}
/>

<style>
  .quotes-page{box-sizing:border-box;min-height:70vh;max-width:1000px;margin:0 auto;padding:34px 24px var(--space-page);color:var(--text);font-family:var(--font-app)}
  .quote-card-btn{color:var(--gold) !important;font-weight:700 !important}
  .quotes-hero{margin-bottom:24px}
  .quotes-hero>a{display:inline-flex;min-height:44px;align-items:center;color:var(--brown);font-size:var(--font-size-label);font-weight:700;text-decoration:none}
  .quotes-hero>span{display:block;margin-top:15px;color:var(--brown);font-size:var(--font-size-meta);font-weight:700;letter-spacing:2px}
  .quotes-hero h1{margin:5px 0 6px;font-size:clamp(28px,5vw,44px)}
  .quotes-hero p{max-width:620px;margin:0;color:var(--muted);line-height:1.6}
  .quotes-login,.quotes-empty{padding:46px 24px;border:1px dashed var(--border);border-radius:16px;background:var(--bg2);text-align:center}
  .quotes-login>span,.quotes-empty>span{font-size:38px}
  .quotes-login h2,.quotes-empty h2{margin:10px 0 5px}
  .quotes-login p,.quotes-empty p{margin:0 auto 18px;color:var(--muted);font-size:var(--font-size-body);line-height:1.6}
  .quotes-login button{min-height:42px;padding:8px 20px;border:0;border-radius:22px;background:var(--gold);color:var(--on-gold);cursor:pointer;font:700 var(--font-size-label) var(--font-app)}
  .quotes-filters{display:grid;grid-template-columns:minmax(220px,1fr) repeat(3,140px);gap:10px;margin-bottom:16px;padding:14px;border:1px solid var(--border2);border-radius:12px;background:var(--white)}
  .quotes-filters label,.quote-dialog-body>label{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:var(--font-size-label);font-weight:700;letter-spacing:.4px}
  .quotes-filters input,.quotes-filters select,.quote-dialog textarea{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:16px var(--font-app)}
  .quotes-error{padding:10px 12px;border-radius:8px;background:color-mix(in srgb,var(--red) 8%,var(--card));color:var(--danger-text);font-size:var(--font-size-meta)}
  .quotes-loading{padding:50px;color:var(--muted);text-align:center}
  .quotes-count{margin:0 0 8px;color:var(--muted);font-size:var(--font-size-meta)}
  .quotes-list{display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .quotes-list article{display:flex;min-width:0;flex-direction:column;padding:16px;border:1px solid var(--border2);border-left:6px solid var(--quote-color);border-radius:12px;background:var(--white)}
  .quotes-list article.orphaned{border-style:dashed}
  .quote-meta{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:var(--font-size-meta);text-transform:uppercase}
  .quote-meta span{color:var(--brown);font-weight:700}
  .quotes-list blockquote,.quote-dialog blockquote{margin:13px 0;color:var(--text);font-family:var(--font-reader);font-size:16px;line-height:1.65}
  .quote-note{margin:0 0 12px;padding:9px;border-radius:7px;background:var(--bg2);color:var(--text2);font-size:12px;line-height:1.55;white-space:pre-wrap}
  .quote-orphan{margin:0 0 10px;color:var(--brown);font-size:var(--font-size-meta)}
  .quotes-list footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid var(--border2);font-size:var(--font-size-meta)}
  .quotes-list footer>a{min-width:0;overflow:hidden;color:var(--brown);font-weight:700;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}
  .quotes-list footer>span{color:var(--muted)}
  .quotes-list footer>div{display:flex;flex-shrink:0;gap:4px}
  .quotes-list button{min-height:44px;padding:5px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);cursor:pointer;font:600 var(--font-size-label) var(--font-app)}
  .quotes-list button.danger{color:var(--danger-text)}
  .quote-dialog::backdrop{background:#211a12aa}
  .quote-dialog{box-sizing:border-box;width:min(480px,calc(100% - 28px));max-height:calc(100dvh - 28px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));margin:auto;padding:18px;border:1px solid var(--dialog-surface-border,var(--border));border-radius:14px;background:var(--dialog-surface-background,var(--card));color:var(--text);box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));overflow:hidden}
  .quote-dialog[open]{display:flex;flex-direction:column}
  .quote-dialog-body{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 3px}
  .quote-dialog header,.dialog-actions{flex-shrink:0}
  .quote-dialog blockquote,.quote-note,.quotes-list blockquote{overflow-wrap:anywhere}
  .quote-dialog fieldset label{display:inline-flex;min-height:44px;align-items:center;gap:6px}
  .quote-dialog :disabled{cursor:wait;opacity:.65}
  .quote-dialog header{display:flex;align-items:center;justify-content:space-between}
  .quote-dialog h2{margin:0;font-size:18px}
  .quote-dialog header button{width:44px;height:44px;border:0;background:transparent;color:inherit;cursor:pointer}
  .quote-dialog fieldset{display:flex;gap:16px;margin:0 0 12px;padding:0;border:0;font-size:var(--font-size-label)}
  .quote-dialog legend{margin-bottom:5px;font-size:var(--font-size-meta);font-weight:700}
  .quote-dialog textarea{margin-top:5px;resize:vertical}
  .dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
  .dialog-actions button{min-height:44px;padding:7px 15px;border:1px solid var(--border);border-radius:9px;background:var(--bg2);color:var(--text);cursor:pointer;font:700 var(--font-size-label) var(--font-app)}
  .dialog-actions button.primary{border-color:var(--gold);background:var(--gold);color:var(--on-gold)}
  .quotes-page button:focus-visible,.quotes-page a:focus-visible,.quotes-page input:focus-visible,.quotes-page select:focus-visible,.quote-dialog button:focus-visible,.quote-dialog textarea:focus-visible,.quote-dialog input:focus-visible,.quote-dialog h2:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}
  @media(max-width:760px){.quotes-page{padding:24px 14px var(--space-page)}
  .quotes-filters{grid-template-columns:1fr 1fr}
  .quotes-search{grid-column:1/-1}
  .quotes-list{grid-template-columns:1fr}
  .quotes-list footer{align-items:flex-start;flex-direction:column}
  .quotes-list footer>div{align-self:flex-end}
  }
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}
  }

</style>
