<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { getSessionContext, GUEST_SESSION, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { decideModeration, fetchModerationQueue, ModerationApiError, suspendModerationMember } from '$lib/browser/admin-community-moderation';
  import { adminModerationUi } from '$lib/i18n/admin-community-moderation';
  import type { ModerationDecision, ModerationMember, ModerationQueueItem, ModerationQueueKind } from '$lib/contracts/community-moderation';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { AdminMember } from '../members/admin-member-types';
  import AdminMemberSuspendDialog from '../members/AdminMemberSuspendDialog.svelte';
  import AdminModerationDecisionDialog from './AdminModerationDecisionDialog.svelte';
  import '$lib/styles/admin-member-management.css';

  const queryClient = useQueryClient();
  const locale = getLocaleContext();
  const t = $derived(adminModerationUi[locale.current]);
  const keys = serverStateKeys.communityModeration;
  // Context đã có phiên SSR trước khi root đăng ký snapshot cho các browser owner.
  const sessionStore = getSessionContext();
  let session = $state(sessionStore.value);
  const principal = $derived(session.authenticated && session.user?.role === 'admin' ? session.user.id : null);
  let kind = $state<ModerationQueueKind>('comments');
  let cursors = $state<Array<string | null>>([null]);
  let page = $state(0);
  let selected = $state<ModerationQueueItem | null>(null);
  let action = $state<ModerationDecision['action'] | null>(null);
  let reason = $state('');
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let conflict = $state(false);
  let suspending = $state<AdminMember | null>(null);
  let epoch = 0;
  let mutation: AbortController | null = null;
  const queue = createQuery(() => {
    const requestedKind = kind;
    const after = cursors[page];
    return {
      queryKey: keys.page(principal ?? '', requestedKind, after),
      queryFn: ({ signal }) => fetchModerationQueue(requestedKind, after, signal),
      enabled: browser && Boolean(principal), staleTime: 30_000, retry: false,
      refetchOnWindowFocus: false, refetchOnReconnect: false,
    };
  }, () => queryClient);
  const context = $derived(selected?.kind === 'reports' ? selected.target : selected);

  function clearPrivate(next: PageSessionDTO) {
    const previous = principal;
    epoch++; mutation?.abort(); mutation = null;
    selected = null; action = null; suspending = null; reason = ''; busy = false; error = ''; notice = ''; conflict = false;
    cursors = [null]; page = 0; session = next;
    if (previous) {
      void queryClient.cancelQueries({ queryKey: keys.principal(previous) });
      queryClient.removeQueries({ queryKey: keys.principal(previous) });
    }
  }
  $effect(() => {
    if (principal && queue.error instanceof ModerationApiError && [401, 403].includes(queue.error.status)) clearPrivate(GUEST_SESSION);
  });
  onMount(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<PageSessionDTO>).detail;
      if (next?.user?.id !== session.user?.id || next?.user?.role !== session.user?.role || next?.authenticated !== session.authenticated) clearPrivate(next ?? GUEST_SESSION);
    };
    window.addEventListener(SESSION_CHANGE_EVENT, changed);
    return () => { epoch++; mutation?.abort(); window.removeEventListener(SESSION_CHANGE_EVENT, changed); };
  });
  function changeQueue(next: ModerationQueueKind) {
    if (busy) return;
    kind = next; cursors = [null]; page = 0; selected = null; notice = ''; error = '';
  }
  function changePage(next: number) {
    if (busy) return;
    if (next > page && queue.data?.nextCursor) cursors = [...cursors.slice(0, page + 1), queue.data.nextCursor];
    page = next; selected = null; notice = ''; error = '';
  }
  function open(next: ModerationDecision['action']) { action = next; reason = ''; error = ''; conflict = false; }
  function close() { if (!busy) { action = null; suspending = null; error = ''; conflict = false; } }
  function openSuspend(member: ModerationMember) {
    error = '';
    suspending = { ...member, kind: 'member', accountType: member.role === 'admin' ? 'admin' : 'member', email: null,
      username: null, suspendedAt: null, avatarUrl: null, createdAt: null, updatedAt: null };
  }
  async function reload() {
    close(); selected = null;
    await queryClient.invalidateQueries({ queryKey: keys.page(principal ?? '', kind, cursors[page]), exact: true });
  }
  async function submit(suspend = false) {
    if (busy || !principal || (!suspend && (!action || !selected))) return;
    if (action === 'reject' && !reason.trim()) { error = t.reasonRequired; return; }
    const target = action === 'hide' ? selected?.target : selected;
    if (!suspend && !target) return;
    const ticket = epoch, owner = principal, controller = new AbortController();
    mutation = controller; busy = true; error = ''; conflict = false;
    try {
      if (suspend && suspending) await suspendModerationMember(suspending.id, controller.signal);
      else if (action && target) await decideModeration(target.kind, target.id, {
        action, revision: target.revision, ...(action === 'reject' ? { reason: reason.trim() } : {}),
      }, controller.signal);
      if (ticket !== epoch || principal !== owner) return;
      notice = suspend ? t.suspended : t.saved;
      if (action === 'hide' && target) void queryClient.invalidateQueries({ queryKey: keys.kind(owner, target.kind), refetchType: 'none' });
      action = null; suspending = null; selected = null; reason = '';
      await queryClient.invalidateQueries({ queryKey: keys.kind(owner, kind) });
    } catch (cause) {
      if (ticket !== epoch || controller.signal.aborted) return;
      if (cause instanceof ModerationApiError && [401, 403].includes(cause.status)) { clearPrivate(GUEST_SESSION); return; }
      conflict = cause instanceof ModerationApiError && [404, 409].includes(cause.status);
      error = conflict ? t.conflict : t.error;
    } finally {
      if (ticket === epoch) { busy = false; mutation = null; }
    }
  }
</script>

<section class="admin-moderation" aria-labelledby="admin-moderation-title" aria-busy={busy || queue.isFetching}>
  <header><h2 id="admin-moderation-title">{t.title}</h2><p>{t.description}</p></header>
  {#if !principal}<p role="alert">{t.forbidden}</p>
  {:else}
    <nav class="admin-moderation-tabs" aria-label={t.title}>
      {#each ['comments', 'profiles', 'reports'] as value (value)}
        <button type="button" aria-pressed={kind === value} disabled={busy} onclick={() => changeQueue(value as ModerationQueueKind)}>{t[value as ModerationQueueKind]}</button>
      {/each}
    </nav>
    {#if notice}<p role="status">{notice}</p>{/if}
    {#if queue.isPending}<p role="status">{t.loading}</p>
    {:else if queue.isError}<p role="alert">{t.loadError}</p><button type="button" onclick={reload}>{t.retry}</button>
    {:else if !queue.data?.items.length}<p class="admin-moderation-empty">{t.empty}</p>
    {:else}
      <div class="admin-moderation-grid">
        <div class="admin-moderation-list">
          {#each queue.data.items as item (item.id)}
            <article class="admin-moderation-card">
              <small>{item.kind === 'reports' ? t.openReport : t.pending}</small>
              {#if item.avatarUrl}<img src={item.avatarUrl} alt="" width="34" height="34" referrerpolicy="no-referrer" />{/if}
              <h3>{item.displayName}</h3><time datetime={item.submittedAt}>{new Date(item.submittedAt).toLocaleString(locale.current === 'en' ? 'en-GB' : 'vi-VN')}</time><p>{item.content}</p>
              <button type="button" disabled={busy} onclick={() => { selected = item; error = ''; }}>{t.view}</button>
            </article>
          {/each}
        </div>
        {#if selected}
          <article class="admin-moderation-card admin-moderation-context" aria-label={t.context}>
            <h3>{t.context}</h3>
            {#if selected.kind === 'reports'}<p><strong>{t.reportReason}:</strong> {selected.reportReason ? t[selected.reportReason] : ''}</p><p>{selected.content}</p>{/if}
            {#if context}
              <h4>{context.displayName}</h4>
              {#if context.avatarUrl}<img src={context.avatarUrl} alt={context.displayName} width="64" height="64" referrerpolicy="no-referrer" />{/if}
              {#if context.kind === 'profiles'}<p>{t.submittedIdentity}</p>{/if}
              <p>{context.content}</p>
              {#if context.articleId}<p><strong>{t.article}:</strong> {context.articleTitle || context.articleId}</p>{/if}
              {#if context.parentId}<blockquote><strong>{t.parent}:</strong> {context.parentContent || t.unavailable}</blockquote>{/if}
              {#if selected.kind === 'profiles' && selected.approvedIdentity}
                <div><strong>{t.approvedIdentity}</strong><p>{selected.approvedIdentity.displayName}</p>
                  {#if selected.approvedIdentity.avatarUrl}<img src={selected.approvedIdentity.avatarUrl} alt={selected.approvedIdentity.displayName} width="64" height="64" referrerpolicy="no-referrer" />{/if}
                </div>
              {/if}
            {:else}<p>{t.unavailable}</p>{/if}
            <div class="admin-moderation-actions">
              {#if selected.kind !== 'reports'}
                <button type="button" class="primary" disabled={busy} onclick={() => open('approve')}>{t.approve}</button>
                <button type="button" disabled={busy} onclick={() => open('reject')}>{t.reject}</button>
              {:else}
                {#if context}<button type="button" disabled={busy} onclick={() => open('hide')}>{t.hide}</button>{/if}
                <button type="button" disabled={busy} onclick={() => open('resolve')}>{t.resolve}</button>
              {/if}
              {#if context?.member && !context.member.isSelf && context.member.status === 'active'}
                <button type="button" class="admin-moderation-error" disabled={busy} onclick={() => context?.member && openSuspend(context.member)}>{t.suspend}</button>
              {/if}
            </div>
          </article>
        {/if}
      </div>
    {/if}
    <nav class="admin-moderation-actions" aria-label={t.title}>
      <button type="button" disabled={busy || queue.isFetching || page === 0} onclick={() => changePage(page - 1)}>{t.previous}</button>
      <button type="button" disabled={busy || queue.isFetching || !queue.data?.nextCursor} onclick={() => changePage(page + 1)}>{t.next}</button>
    </nav>
  {/if}
</section>
{#if action && principal}<AdminModerationDecisionDialog {action} locale={locale.current} {busy} {error} {conflict} bind:reason onClose={close} onConfirm={() => void submit()} onReload={() => void reload()} />{/if}
{#if suspending && principal}<AdminMemberSuspendDialog member={suspending} targetStatus="suspended" {busy} {error} onClose={close} onConfirm={() => submit(true)} />{/if}
