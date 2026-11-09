<script lang="ts">
  import { getContext, onMount, tick, untrack } from 'svelte';
  import { fetchWithSessionRefresh, getBrowserSession, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import { SESSION_CONTEXT, SESSION_CHANGE_EVENT, getBrowserSessionSnapshot, type SessionStore } from '$lib/stores/session.svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { commentTranslations } from '$lib/i18n/comment-translations';
  import CommunitySafetyDialog, { type CommunitySafetyTarget } from './CommunitySafetyDialog.svelte';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityModerationStatus } from '$lib/contracts/community-moderation';

  const localeStore = getLocaleContext();
  const t = $derived(commentTranslations[localeStore.current]);

  interface Comment {
    id: string | number;
    ten: string;
    email?: string;
    noi_dung: string;
    tao_luc: string;
    parent_id?: number | null;
    role?: 'admin' | 'ctv' | 'user' | null;
    authorId?: string | null;
    isOwnProfile?: boolean;
    moderationStatus?: CommunityModerationStatus;
    moderationReason?: string | null;
  }

  interface Props {
    articleId: string;
    session?: PageSessionDTO | { authenticated: boolean; user?: { id?: string; email?: string; displayName?: string; role?: string } | null } | null;
  }

  let { articleId, session: propSession = null }: Props = $props();
  const contextStore = getContext<SessionStore | undefined>(SESSION_CONTEXT);
  let browserSession = $state<PageSessionDTO | null>(untrack(() => getBrowserSessionSnapshot()));

  const activeSession = $derived(
    propSession || (contextStore ? contextStore.value : null) || browserSession
  );
  const isAuthenticated = $derived(
    Boolean(activeSession?.authenticated && activeSession?.user)
  );
  const principalId = $derived(isAuthenticated && activeSession?.user?.id ? String(activeSession.user.id) : null);
  const browserPrincipal = () => {
    const session = getBrowserSessionSnapshot();
    return session.authenticated && session.user?.id ? String(session.user.id) : null;
  };
  const currentUserName = $derived(
    activeSession?.user?.displayName || ''
  );
  const currentAuthorDisplay = $derived(
    currentUserName || t.member
  );

  let comments = $state<Comment[]>([]);
  let nextCursor = $state('');
  let online = $state(true);
  let replyingTo = $state<Comment | null>(null);
  let menuId = $state<string | null>(null);
  let menuTrigger: HTMLButtonElement | null = null;
  let safety = $state<{ target: CommunitySafetyTarget; mode: 'report' | 'block' } | null>(null);
  let hiddenAuthors = new Set<string>();
  let hiddenAuthorsPrincipal = untrack(() => principalId);
  let cacheWrites: Promise<void> = Promise.resolve();
  function safetyAction(comment: Comment, mode: 'report' | 'block') {
    safety = { target: { type: 'comment', id: String(comment.id), authorId: comment.authorId, displayName: comment.ten }, mode };
  }
  function closeSafety() {
    safety = null; menuId = null;
    void tick().then(() => { if (menuTrigger?.isConnected) menuTrigger.focus({ preventScroll: true }); else trigger?.focus({ preventScroll: true }); });
  }
  function menuKeys(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); menuId = null;
    void tick().then(() => menuTrigger?.focus({ preventScroll: true }));
  }
  function cachePath(id: string, principal: string | null) {
    return `/offline-comments/${encodeURIComponent(principal ?? 'anonymous')}/${encodeURIComponent(id)}`;
  }
  function hideBlockedAuthor(authorId: string) {
    hiddenAuthors.add(authorId);
    comments = comments.filter(comment => comment.authorId !== authorId);
    if (replyingTo?.authorId === authorId) replyingTo = null;
    void saveComments(cachePath(articleId, principalId), comments);
  }
  const threadedComments = $derived.by(() => {
    const ids = new Set(comments.map((comment) => Number(comment.id)));
    const replies = new Map<number, Comment[]>();
    for (const comment of comments) {
      if (comment.parent_id) {
        const group = replies.get(comment.parent_id) ?? [];
        group.push(comment);
        replies.set(comment.parent_id, group);
      }
    }
    return comments.filter((comment) => !comment.parent_id || !ids.has(comment.parent_id))
      .flatMap((root) => [root, ...(replies.get(Number(root.id)) ?? [])]);
  });
  function roleLabel(role?: string | null): string {
    return role === 'admin' ? t.admin : role === 'ctv' ? t.contributor : t.member;
  }
  function reply(comment: Comment): void {
    if (!isAuthenticated) { triggerLoginModal(); return; }
    replyingTo = comment;
    void openForm();
  }
  let loading = $state(true);
  let open = $state(false);
  let sending = $state(false);
  let error = $state('');
  let name = $state('');
  let phone = $state('');
  let email = $state('');
  let content = $state('');
  let trigger = $state<HTMLButtonElement | null>(null);
  let contentInput = $state<HTMLTextAreaElement | null>(null);
  let nameInput = $state<HTMLInputElement | null>(null);
  let notice = $state('');
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let fabStyle = $state('');
  let fabDragged = false;
  let dragStart: { x: number; y: number; left: number; top: number } | null = null;
  const COMMENTS_POS_KEY = 'tutam_reader_comments_pos';

  function clampCommentsFabPosition(x: number, y: number, width = 50, height = 50) {
    const inset = 8;
    const maxLeft = Math.max(inset, window.innerWidth - width - inset);
    const maxTop = Math.max(inset, window.innerHeight - height - inset);
    const left = Math.min(maxLeft, Math.max(inset, x));
    const top = Math.min(maxTop, Math.max(inset, y));
    return { left, top };
  }

  function applySavedCommentsPosition() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(COMMENTS_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        const width = trigger?.offsetWidth || 50;
        const height = trigger?.offsetHeight || 50;
        const pos = clampCommentsFabPosition(parsed.x, parsed.y, width, height);
        fabStyle = `left:${pos.left}px;top:${pos.top}px;right:auto;bottom:auto`;
      }
    } catch {
      // Ignore corrupt position
    }
  }
  let commentsRequest: AbortController | null = null;
  let submitRequest: AbortController | null = null;
  let commentsGeneration = 0;
  let submitGeneration = 0;

  async function savedComments(path: string): Promise<Comment[]> {
    try {
      const saved = await caches.open('tutam-public-comments-v2').then(cache => cache.match(path));
      const rows = saved ? await saved.json() : [];
      return Array.isArray(rows) ? rows.filter(row => !row.authorId || !hiddenAuthors.has(row.authorId)) : [];
    } catch { return []; }
  }

  async function saveComments(path: string, rows: Comment[]): Promise<void> {
    const blocked = hiddenAuthors;
    const operation = cacheWrites.catch(() => undefined).then(async () => {
      const publicRows = rows.filter(row => (!row.moderationStatus || row.moderationStatus === 'approved') && (!row.authorId || !blocked.has(row.authorId)))
        .map(({ id, ten, noi_dung, tao_luc, parent_id, role, authorId, isOwnProfile }) => ({ id, ten, noi_dung, tao_luc, parent_id, role, authorId, isOwnProfile, moderationStatus: 'approved' }));
      await (await caches.open('tutam-public-comments-v2')).put(path, new Response(JSON.stringify(publicRows), { headers: { 'content-type': 'application/json' } }));
    });
    cacheWrites = operation;
    await operation.catch(() => undefined); // Storage failure must not prevent reporting or blocking.
  }

  function initials(value: string): string {
    return value.trim().split(/\s+/u).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase() || '?';
  }

  function relativeTime(value: string): string {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const difference = Math.max(0, Date.now() - timestamp);
    if (difference < 60_000) return t.justNow;
    if (difference < 86_400_000) {
      const unit = difference < 3_600_000 ? 'minute' : 'hour';
      const count = Math.floor(difference / (unit === 'minute' ? 60_000 : 3_600_000));
      return new Intl.RelativeTimeFormat(localeStore.current).format(-count, unit);
    }
    return formatVietnamDate(value, localeStore.current);
  }

  function showNotice(message: string) {
    notice = message;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; noticeTimer = null; }, 3000);
  }

  async function load(requestedArticleId: string, append = false) {
    const requestedPrincipal = principalId;
    const generation = ++commentsGeneration;
    commentsRequest?.abort();
    const controller = new AbortController();
    commentsRequest = controller;
    if (!append) { comments = []; nextCursor = ''; }
    error = '';
    loading = true;
    try {
      const path = cachePath(requestedArticleId, requestedPrincipal);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const rows = await savedComments(path);
        if (generation === commentsGeneration && requestedArticleId === articleId) { comments = Array.isArray(rows) ? rows : []; nextCursor = ''; }
        return;
      }
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(requestedArticleId)}/comments?includeOwn=1${append && nextCursor ? `&after=${encodeURIComponent(nextCursor)}` : ''}`, {
        signal: controller.signal
      });
      const result = response.ok ? await response.json() : [];
      if (generation === commentsGeneration && requestedArticleId === articleId) {
        const incoming: Comment[] = Array.isArray(result) ? result.filter(row => !row.authorId || !hiddenAuthors.has(row.authorId)) : [];
        comments = append ? [...new Map([...comments, ...incoming].map(row => [row.id, row])).values()] : incoming;
        nextCursor = response.headers.get('X-Next-Cursor') || '';
        if (!response.ok) error = t.loadFailed;
        else {
          void saveComments(path, comments);
        }
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError') && generation === commentsGeneration) {
        const saved = !append ? await savedComments(cachePath(requestedArticleId, requestedPrincipal)) : null;
        if (generation !== commentsGeneration || requestedArticleId !== articleId) return;
        if (saved) comments = saved;
        error = t.loadFailed;
      }
    } finally {
      if (generation === commentsGeneration) {
        loading = false;
        commentsRequest = null;
      }
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (sending) return;
    error = '';
    if (!isAuthenticated) {
      error = t.loginRequired;
      return;
    }
    if (!online) { error = t.offlineNotice; return; }
    sending = true;
    const submittedArticleId = articleId;
    const submittedPrincipal = principalId;
    const submittedContent = content;
    const submittedParent = replyingTo ? Number(replyingTo.id) : null;
    const generation = ++submitGeneration;
    const request = new AbortController(); submitRequest = request;
    try {
      const csrfToken = await requireBrowserCsrf();
      if (generation !== submitGeneration || submittedArticleId !== articleId || submittedPrincipal !== browserPrincipal()) return;
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(submittedArticleId)}/comments`, {
        method: 'POST',
        signal: request.signal,
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ noi_dung: submittedContent, parent_id: submittedParent })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(localeStore.current === 'en' ? t.sendFailed : result?.error?.message || t.sendFailed);
      if (generation !== submitGeneration || submittedArticleId !== articleId || submittedPrincipal !== browserPrincipal()) return;
      comments = [...comments, result];
      name = ''; phone = ''; email = ''; content = '';
      closeForm(true);
      showNotice(t.sent);
    } catch (cause) {
      if (generation === submitGeneration && submittedArticleId === articleId) {
        error = localeStore.current === 'en' ? t.sendFailed : cause instanceof Error ? cause.message : t.sendFailed;
      }
    } finally {
      if (generation === submitGeneration) { sending = false; submitRequest = null; }
    }
  }

  function triggerLoginModal() {
    closeForm(false);
    window.dispatchEvent(new CustomEvent('quangtu:login-required'));
  }

  async function openForm() {
    open = true;
    await tick();
    if (isAuthenticated) {
      contentInput?.focus();
    }
  }

  function closeForm(restoreFocus = false) {
    open = false;
    replyingTo = null;
    error = '';
    if (restoreFocus) tick().then(() => trigger?.focus());
  }

  function startFabDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    const button = event.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    dragStart = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    fabDragged = false;
    button.setPointerCapture(event.pointerId);
  }

  function moveFab(event: PointerEvent) {
    if (!dragStart) return;
    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;
    if (!fabDragged && Math.hypot(deltaX, deltaY) < 5) return;
    fabDragged = true;
    event.preventDefault();
    const button = event.currentTarget as HTMLButtonElement;
    const left = Math.min(innerWidth - button.offsetWidth - 8, Math.max(8, dragStart.left + deltaX));
    const top = Math.min(innerHeight - button.offsetHeight - 8, Math.max(8, dragStart.top + deltaY));
    fabStyle = `left:${left}px;top:${top}px;right:auto;bottom:auto`;
  }

  function finishFabDrag(event: PointerEvent) {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    dragStart = null;
    if (fabDragged) {
      const rect = button.getBoundingClientRect();
      try {
        localStorage.setItem(COMMENTS_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
      } catch {
        // Ignore
      }
    }
  }

  function activateFab(event: MouseEvent) {
    if (fabDragged) { event.preventDefault(); fabDragged = false; return; }
    void openForm();
  }

  $effect(() => {
    const requestedArticleId = articleId;
    principalId;
    if (hiddenAuthorsPrincipal !== principalId) { hiddenAuthors = new Set(); hiddenAuthorsPrincipal = principalId; }
    replyingTo = null;
    safety = null; menuId = null;
    submitGeneration++; submitRequest?.abort(); sending = false;
    content = '';
    void load(requestedArticleId);
    return () => { commentsGeneration++; commentsRequest?.abort(); };
  });

  onMount(() => {
    let disposed = false;
    const networkChanged = () => { online = navigator.onLine; if (online) void load(articleId); };
    online = navigator.onLine;
    window.addEventListener('online', networkChanged);
    window.addEventListener('offline', networkChanged);
    void tick().then(() => {
      applySavedCommentsPosition();
    });

    const initialPrincipal = browserPrincipal();
    void getBrowserSession().then((session) => {
      if (!disposed && initialPrincipal === browserPrincipal()) browserSession = session;
    }).catch(() => null);
    const sessionChanged = (event: Event) => { browserSession = (event as CustomEvent<PageSessionDTO>).detail; };
    const blocksChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ principalId: string; authorId: string; blocked: boolean }>).detail;
      if (detail?.blocked === true && detail.principalId === principalId && detail.principalId === browserPrincipal()) hideBlockedAuthor(detail.authorId);
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);

    const onResize = () => {
      if (!fabStyle || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const pos = clampCommentsFabPosition(rect.left, rect.top, trigger.offsetWidth || 50, trigger.offsetHeight || 50);
      fabStyle = `left:${pos.left}px;top:${pos.top}px;right:auto;bottom:auto`;
    };
    window.addEventListener('resize', onResize);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open && !safety) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeForm(true);
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => {
      disposed = true;
      window.removeEventListener('online', networkChanged);
      window.removeEventListener('offline', networkChanged);
      commentsGeneration++;
      submitGeneration++;
      commentsRequest?.abort();
      submitRequest?.abort();
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
      window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('resize', onResize);
      if (noticeTimer) clearTimeout(noticeTimer);
    };
  });
</script>

<section class="comments" aria-labelledby="comments-title">
  <header>
    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <h3 id="comments-title">{t.title}</h3>
    <span>{comments.length}</span>
  </header>

  {#if loading && !comments.length}
    <p>{t.loading}</p>
  {:else if !comments.length}
    <p>{online ? t.empty : t.offlineNotice}</p>
  {:else}
    <div class="comments__list">
      {#each threadedComments as comment (comment.id)}
        <article class:comment-reply={Boolean(comment.parent_id)}>
          <div class="comment-identity">
            <span class="comment-avatar" aria-hidden="true">{initials(comment.ten)}</span>
            <span>
              <strong>{comment.ten}</strong>
              {#if comment.role}<span class="comment-role" class:staff={comment.role !== 'user'}>{roleLabel(comment.role)}</span>{/if}
              <time datetime={comment.tao_luc}>{relativeTime(comment.tao_luc)}</time>
            </span>
            {#if !comment.isOwnProfile && (!comment.moderationStatus || comment.moderationStatus === 'approved')}
              <button class="comment-options" type="button" aria-label={`${t.options} ${comment.id}`} aria-expanded={menuId === String(comment.id)} onkeydown={menuKeys} onclick={event => { menuTrigger = event.currentTarget; menuId = menuId === String(comment.id) ? null : String(comment.id); }}>⋯</button>
            {/if}
          </div>
          <p>{comment.noi_dung}</p>
          {#if comment.moderationStatus === 'pending'}<p class="moderation-status" role="status">{t.pending}</p>
          {:else if comment.moderationStatus === 'rejected'}<p class="moderation-status">{t.rejected}{#if comment.moderationReason}: {comment.moderationReason}{/if}</p>{/if}
          {#if menuId === String(comment.id)}
            <div class="comment-menu">
              <button type="button" onkeydown={menuKeys} onclick={() => safetyAction(comment, 'report')}>{t.report}</button>
              {#if comment.authorId}<button type="button" onkeydown={menuKeys} onclick={() => safetyAction(comment, 'block')}>{t.block}</button>{/if}
            </div>
          {/if}
          {#if !comment.moderationStatus || comment.moderationStatus === 'approved'}<button class="comment-reply-button" type="button" onclick={() => reply(comment)} aria-label={`${t.reply} ${comment.ten}`}>{t.reply}</button>{/if}
        </article>
      {/each}
    </div>
  {/if}

  {#if nextCursor}<button type="button" disabled={loading} onclick={() => load(articleId, true)}>{loading ? t.loading : t.loadMore}</button>{/if}
  <p class="moderation-hint">{t.moderationHint}</p>
  {#if error && !open}<p role="alert">{error}</p>{/if}

  <button
    class="comments__fab"
    class:open
    type="button"
    aria-label={t.write}
    aria-expanded={open}
    style={fabStyle}
    onclick={activateFab}
    onpointerdown={startFabDrag}
    onpointermove={moveFab}
    onpointerup={finishFabDrag}
    onpointercancel={finishFabDrag}
    bind:this={trigger}
  >
    <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
  </button>

  <form class="comment-form-panel" class:open aria-label={t.send} aria-hidden={!open} inert={!open} onsubmit={submit}>
    <div class="comment-form-header">
      <strong>✏️ {t.title}</strong>
      <button class="comment-form-close" type="button" aria-label={t.close} onclick={() => closeForm(true)}>×</button>
    </div>

    <div class="comment-form-body">
      {#if isAuthenticated}
        <div class="cf-user-badge">
          <span class="cf-user-avatar" aria-hidden="true">{initials(currentAuthorDisplay)}</span>
          <div class="cf-user-info">
            <span class="cf-user-label">{t.commentAs}</span>
            <strong class="cf-user-name">{currentAuthorDisplay}</strong>
          </div>
          <span class="cf-user-tag">{roleLabel(activeSession?.user?.role)}</span>
        </div>
        <div class="cf-row-2" style="display:none"></div>

        {#if replyingTo}<p class="reply-context">{t.replyingTo} <strong>{replyingTo.ten}</strong><button type="button" onclick={() => replyingTo = null}>{t.cancelReply}</button></p>{/if}
        <label class="cf-row">
          {t.content} <span class="cf-req">*</span>
          <textarea
            class="cf-input cf-textarea"
            bind:this={contentInput}
            bind:value={content}
            required
            maxlength="1000"
            rows="4"
            placeholder={t.placeholder}
          ></textarea>
          <span class="cf-char-count">{content.length}/1000</span>
        </label>

        <div class="comments__error" role="alert">{error}</div>

        <div class="cf-actions">
          <button class="cf-btn-cancel" type="button" onclick={() => closeForm(true)}>{t.cancel}</button>
          <button class="cf-btn-submit" type="submit" disabled={sending || !online}>
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            {sending ? t.sending : t.send}
          </button>
        </div>
      {:else}
        <div class="cf-login-prompt">
          <div class="cf-login-icon" aria-hidden="true">🔒</div>
          <h4>{t.loginTitle}</h4>
          <p>{t.loginDescription}</p>
          <button type="button" class="cf-btn-login" onclick={triggerLoginModal}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span>{t.chooseLogin}</span>
          </button>
        </div>
      {/if}
    </div>
  </form>

  {#if notice}
    <div class="comments__notice" role="status" aria-live="polite">{notice}</div>
  {/if}
  {#if safety}
    <CommunitySafetyDialog target={safety.target} mode={safety.mode} {principalId} onClose={closeSafety} onReported={() => showNotice(t.reported)} onBlocked={() => showNotice(t.blocked)} />
  {/if}
</section>

<style>
  .comment-options{margin-left:auto;align-self:flex-start;min-width:44px;min-height:44px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);font:inherit;cursor:pointer}
  .comment-menu{display:grid;gap:4px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg2)}
  .comment-menu button{min-height:44px;padding:8px 12px;text-align:left;border:0;border-radius:var(--radius);background:transparent;color:var(--text);font:inherit;cursor:pointer}
  .comment-options:focus-visible,.comment-menu button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.moderation-status,.moderation-hint{color:var(--text2);font-size:var(--font-size-meta);line-height:1.6}
  .comments__list article.comment-reply{margin-left:24px;padding-left:12px;border-left:1px solid var(--border2)}
  .comment-role{display:inline-block;font-size:11px;color:var(--text2);background:var(--bg3);padding:2px 8px;border-radius:8px}
  .comment-role.staff{color:var(--text);font-weight:700}
  .comment-reply-button,.reply-context button{min-height:44px;padding:8px 12px;border:0;background:transparent;color:var(--text2);font:inherit;cursor:pointer}
  .comment-reply-button:hover,.reply-context button:hover{text-decoration:underline}
  .comment-reply-button:focus-visible,.reply-context button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .reply-context{font-size:13px;color:var(--text2)}
  .comments{margin-top:36px;padding-top:24px;border-top:2px solid var(--border2);font-family:var(--font-app)}
  header{display:flex;align-items:center;gap:8px;margin-bottom:18px}
  header>svg{flex-shrink:0;color:var(--gold)}
  h3{margin:0;font-size:16px}
  header span{min-width:22px;padding:1px 8px;border-radius:20px;background:var(--gold);color:#fff;font-size:11px;font-weight:700;text-align:center}
  .comments>p{color:var(--muted);font-size:13px}
  .comments__list article{padding:12px 0;border-bottom:1px solid var(--border2)}
  .comment-identity{display:flex;align-items:center;gap:10px}
  .comment-avatar{display:grid;width:34px;height:34px;flex:0 0 auto;place-items:center;border-radius:50%;background:var(--gold-muted);color:var(--brown);font-size:11px;font-weight:800}
  .comment-identity strong,.comment-identity time{display:block}
  .comment-identity time{margin-top:2px;color:var(--muted);font-size:10px}
  article p{margin:7px 0 0 44px;color:var(--text2);font-size:13px}
  .comments__fab{position:fixed;right:16px;bottom:80px;z-index:740;display:flex;width:50px;height:50px;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:var(--gold);box-shadow:0 4px 18px rgba(200,150,62,.45);color:#fff;cursor:grab;touch-action:none;user-select:none;opacity:0.8;transition:transform .18s,box-shadow .18s,opacity .18s}
  .comments__fab:hover,.comments__fab:active,.comments__fab:focus-visible{opacity:1;transform:translateY(-2px);box-shadow:0 8px 24px rgba(200,150,62,.55)}
  .comments__fab:active{cursor:grabbing}
  .comments__fab.open{opacity:0;pointer-events:none}
  .comments__notice{position:fixed;z-index:9999;bottom:92px;left:50%;max-width:calc(100vw - 32px);padding:10px 18px;border-radius:22px;background:var(--brown-dark);box-shadow:var(--shadow-lg);color:#fff;font-size:13px;font-weight:700;transform:translateX(-50%);animation:commentNoticeIn .25s ease-out}
  @keyframes commentNoticeIn{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}
  .comment-form-panel{position:fixed;left:0;right:0;bottom:0;z-index:741;max-height:90dvh;overflow-y:auto;margin:0;padding:0;border:0;border-top:2px solid var(--gold);border-radius:0;background:var(--card);box-shadow:0 -8px 32px rgba(0,0,0,.15);color:var(--text);transform:translateY(100%);visibility:hidden;pointer-events:none;transition:transform .3s cubic-bezier(.34,1.1,.64,1),visibility 0s .3s}
  .comment-form-panel.open{transform:translateY(0);visibility:visible;pointer-events:auto;transition:transform .3s cubic-bezier(.34,1.1,.64,1),visibility 0s}
  .comment-form-header{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:14px 18px 10px;border-bottom:1px solid var(--border2);background:var(--card);font-size:15px;font-weight:700}
  .comment-form-close{position:relative;display:flex;width:28px;height:28px;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:var(--bg3);color:var(--muted);cursor:pointer;font:inherit;font-size:14px}
  .comment-form-close::before{position:absolute;inset:-8px;content:''}
  .comment-form-body{padding:14px 18px 20px}
  .cf-row{display:block;margin:0 0 12px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase}
  .cf-req{color:var(--gold)}
  .cf-row-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
  .cf-input{box-sizing:border-box;width:100%;margin-top:5px;padding:9px 12px;border:1.5px solid var(--border2);border-radius:8px;background:var(--bg2);color:var(--text);font:inherit;font-size:16px;outline:none;text-transform:none;transition:border-color .18s}
  .cf-input:focus{border-color:var(--gold)}
  .cf-textarea{min-height:90px;resize:vertical}
  .cf-char-count{display:block;margin-top:3px;color:var(--muted);font-size:11px;font-weight:400;letter-spacing:0;text-align:right;text-transform:none}
  .comments__error{min-height:18px;margin-bottom:8px;color:var(--red);font-size:13px}
  .cf-actions{display:flex;justify-content:flex-end;gap:10px}
  .cf-btn-cancel,.cf-btn-submit{min-height:38px;padding:9px 20px;border-radius:22px;cursor:pointer;font:inherit;font-size:13px;font-weight:600}
  .cf-btn-cancel{border:1.5px solid var(--border2);background:var(--bg3);color:var(--text2)}
  .cf-btn-submit{display:flex;align-items:center;gap:6px;border:0;background:var(--gold);color:#fff;font-weight:700}
  .cf-btn-submit:disabled{cursor:not-allowed;opacity:.6}

  /* Logged-in user badge */
  .cf-user-badge{display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:16px;background:var(--bg2);border:1px solid var(--border2);border-radius:10px}
  .cf-user-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--gold);color:#fff;font-size:11px;font-weight:800}
  .cf-user-info{flex:1;min-width:0}
  .cf-user-label{display:block;color:var(--muted);font-size:11px}
  .cf-user-name{display:block;color:var(--text);font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cf-user-tag{padding:2px 8px;border-radius:12px;background:var(--gold-muted);color:var(--gold);font-size:10px;font-weight:700}

  /* Login prompt */
  .cf-login-prompt{padding:20px 16px;text-align:center}
  .cf-login-icon{font-size:32px;margin-bottom:8px}
  .cf-login-prompt h4{margin:0 0 6px;font-size:16px;color:var(--text)}
  .cf-login-prompt p{margin:0 0 16px;color:var(--text2);font-size:13px;line-height:1.5}
  .cf-btn-login{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:10px 22px;border:1.5px solid var(--border2);border-radius:24px;background:var(--card);color:var(--text);font:inherit;font-size:13px;font-weight:700;cursor:pointer;box-shadow:var(--shadow-sm);transition:all .15s ease}
  .cf-btn-login:hover{border-color:var(--gold);background:var(--bg2);transform:translateY(-1px);box-shadow:var(--shadow-md)}

  @media(max-width:600px){
    .comments__fab{right:14px;bottom:calc(72px + env(safe-area-inset-bottom));width:46px;height:46px}
    .comment-form-panel{bottom:calc(72px + env(safe-area-inset-bottom));max-height:calc(85dvh - 72px - env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);border-radius:14px 14px 0 0}
    .cf-actions{position:sticky;bottom:0;padding:10px 0 4px;border-top:1px solid var(--border2);background:var(--card)}
  }
  @media(prefers-reduced-motion:reduce){.comment-form-panel,.comments__notice{transition:none;animation:none}}
  .comment-form-panel{line-height:normal}
  .cf-input{font-family:inherit;font-size:14px;font-weight:400;line-height:normal}
  @media(max-width:600px){.cf-input{font-size:16px}}
</style>
