<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { useQueryClient } from '@tanstack/svelte-query';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { blockedUsersCopy } from '$lib/i18n/blocked-users';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityBlockedProfile, type CommunityBlocksChangedDetail } from '$lib/contracts/community-moderation';

  let { principalId }: { principalId: string } = $props();
  type BlockedPage = { items: CommunityBlockedProfile[]; nextCursor: string | null };
  const client = useQueryClient();
  const locale = getLocaleContext();
  const t = $derived(blockedUsersCopy[locale.current === 'en' ? 'en' : 'vi']);
  let open = $state(false), loaded = $state(false), loading = $state(false), busy = $state(false), online = $state(true);
  let items = $state<CommunityBlockedProfile[]>([]), nextCursor = $state<string | null>(null);
  let selected = $state<CommunityBlockedProfile | null>(null);
  let error = $state(''), actionError = $state(''), notice = $state('');
  let activePrincipal = '', generation = 0, alive = true;
  let listRequest: AbortController | null = null, mutation: AbortController | null = null;
  const removed = new Set<string>();
  const key = (id: string) => serverStateKeys.communityBlocks.list(id);
  function current(id: string, version: number): boolean {
    const session = getBrowserSessionSnapshot();
    return alive && version === generation && principalId === id && session.authenticated && session.user?.id === id;
  }
  function reset(next: string) {
    generation += 1; listRequest?.abort(); mutation?.abort(); listRequest = mutation = null;
    if (activePrincipal && activePrincipal !== next) client.removeQueries({ queryKey: key(activePrincipal), exact: true });
    activePrincipal = next; open = loaded = loading = busy = false; items = []; nextCursor = null;
    selected = null; error = actionError = notice = ''; removed.clear();
  }
  $effect(() => { const id = principalId; if (id !== activePrincipal) reset(id); });

  async function load(after: string | null = null) {
    if (loading) return;
    const id = principalId, version = generation;
    if (!current(id, version)) return;
    if (!online) { error = t.offline; return; }
    const request = new AbortController(); listRequest = request; loading = true; error = '';
    try {
      const response = await fetchWithSessionRefresh(`/api/community/blocks${after ? `?after=${encodeURIComponent(after)}` : ''}`, { credentials: 'include', signal: request.signal });
      const result = await response.json() as BlockedPage;
      if (!current(id, version) || request.signal.aborted) return;
      if (!response.ok || !Array.isArray(result.items)) { error = response.status === 401 ? t.login : t.loadFailed; return; }
      const merged = new Map((after ? items : []).map(item => [item.authorId, item]));
      for (const item of result.items) if (!removed.has(item.authorId)) merged.set(item.authorId, item);
      items = [...merged.values()]; nextCursor = typeof result.nextCursor === 'string' ? result.nextCursor : null;
      loaded = true; client.setQueryData<BlockedPage>(key(id), { items, nextCursor });
    } catch { if (current(id, version) && !request.signal.aborted) error = t.loadFailed; }
    finally { if (current(id, version) && listRequest === request) { loading = false; listRequest = null; } }
  }
  function toggle() {
    open = !open;
    if (!open) return;
    if (client.getQueryState(key(principalId))?.isInvalidated) loaded = false;
    if (!loaded) {
      const cached = client.getQueryState(key(principalId))?.isInvalidated ? undefined : client.getQueryData<BlockedPage>(key(principalId));
      if (cached) { items = cached.items; nextCursor = cached.nextCursor; loaded = true; }
      else void load();
    }
  }
  function closeConfirmation() { if (!busy) { selected = null; actionError = ''; } }
  function projectCache(id: string) {
    const invalidated = client.getQueryState(key(id))?.isInvalidated;
    client.setQueryData<BlockedPage>(key(id), { items, nextCursor });
    if (invalidated) void client.invalidateQueries({ queryKey: key(id), exact: true, refetchType: 'none' });
  }
  async function unblock() {
    if (busy || !selected) return;
    const id = principalId, version = generation, authorId = selected.authorId;
    if (!current(id, version)) { reset(''); return; }
    if (!online) { actionError = t.offline; return; }
    const request = new AbortController(); mutation = request; busy = true; actionError = '';
    try {
      const csrf = await requireBrowserCsrf();
      if (!current(id, version) || request.signal.aborted) return;
      const response = await fetchWithSessionRefresh(`/api/community/blocks/${encodeURIComponent(authorId)}`, {
        method: 'DELETE', credentials: 'include', signal: request.signal, headers: { 'x-csrf-token': csrf },
      });
      const result = await response.json();
      if (!current(id, version) || request.signal.aborted) return;
      if (!response.ok || result.blocked !== false) { actionError = response.status === 401 ? t.login : t.failed; return; }
      removed.add(authorId); items = items.filter(item => item.authorId !== authorId);
      projectCache(id); selected = null; notice = t.success;
      void client.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(id), exact: true, refetchType: 'none' });
      window.dispatchEvent(new CustomEvent<CommunityBlocksChangedDetail>(COMMUNITY_BLOCKS_CHANGED_EVENT, { detail: { principalId: id, authorId, blocked: false } }));
    } catch { if (current(id, version) && !request.signal.aborted) actionError = t.failed; }
    finally { if (current(id, version) && mutation === request) { busy = false; mutation = null; } }
  }
  onMount(() => {
    const network = () => { online = navigator.onLine; };
    const sessionChanged = () => {
      const session = getBrowserSessionSnapshot();
      const next = session.authenticated ? session.user?.id ?? '' : '';
      if (next !== activePrincipal) reset(next);
    };
    const blocksChanged = (event: Event) => {
      const detail = (event as CustomEvent<CommunityBlocksChangedDetail>).detail;
      if (detail?.principalId !== principalId || !current(principalId, generation)) return;
      if (detail.blocked) {
        removed.delete(detail.authorId); listRequest?.abort(); listRequest = null; loading = false;
        void client.invalidateQueries({ queryKey: key(principalId), exact: true, refetchType: 'none' });
      } else {
        removed.add(detail.authorId); items = items.filter(item => item.authorId !== detail.authorId);
        if (loaded) projectCache(principalId);
      }
    };
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged); window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);
    return () => {
      window.removeEventListener('online', network); window.removeEventListener('offline', network);
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged); window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);
    };
  });
  onDestroy(() => { alive = false; generation += 1; listRequest?.abort(); mutation?.abort(); });
</script>

<section class="blocked-users" aria-label={t.title}>
  <button class="entry" type="button" aria-expanded={open} aria-controls="blocked-users-list" onclick={toggle}>{t.title}</button>
  <p class="description">{t.description}</p>
  {#if open}
    <div id="blocked-users-list" aria-busy={loading}>
      <p>{t.scope}</p>
      {#if !online}<p role="status">{t.offline}</p>{/if}
      {#if loading}<p role="status">{t.loading}</p>{/if}
      {#if error}<p role="alert">{error}</p><button type="button" disabled={loading || !online} onclick={() => void load(loaded ? nextCursor : null)}>{t.retry}</button>{/if}
      {#if loaded && !items.length}<p>{t.empty}</p>{/if}
      <ul>{#each items as item (item.authorId)}
        <li><span class="avatar" aria-hidden="true">{(item.displayName || t.unknown).slice(0, 1)}</span><strong>{item.displayName || t.unknown}</strong><button type="button" disabled={busy || !online} onclick={() => { selected = item; actionError = ''; notice = ''; }}>{t.unblock}</button></li>
      {/each}</ul>
      {#if nextCursor}<button type="button" disabled={loading || !online} onclick={() => void load(nextCursor)}>{t.more}</button>{/if}
      {#if notice}<p role="status">{notice}</p>{/if}
    </div>
  {/if}
</section>
{#if selected}
  <dialog class="unblock-dialog" data-dialog-glass use:modalDialog aria-labelledby="unblock-title" oncancel={event => { event.preventDefault(); closeConfirmation(); }}>
    <h3 id="unblock-title">{t.confirmTitle}</h3><p class="identity">{selected.displayName || t.unknown}</p><p>{t.confirmDescription}</p>
    {#if actionError}<p role="alert">{actionError}</p>{/if}
    {#if !online}<p role="status">{t.offline}</p>{/if}
    <div class="actions dialog-actions-balanced"><button type="button" data-modal-focus disabled={busy} onclick={closeConfirmation}>{t.cancel}</button><button class="primary" type="button" disabled={busy || !online} onclick={() => void unblock()}>{busy ? t.busy : t.confirm}</button></div>
  </dialog>
{/if}

<style>
  .blocked-users{margin-top:var(--space-page);padding-top:var(--space-page);border-top:1px solid var(--border);font-family:var(--font-app);color:var(--text)}
  button{min-width:44px;min-height:44px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);font:inherit;cursor:pointer}button:disabled{opacity:.6;cursor:default}button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.entry{font-weight:700}.description{font-size:var(--font-size-meta);color:var(--muted)}p{line-height:1.6;overflow-wrap:anywhere}ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border2)}li strong{flex:1;min-width:0;overflow-wrap:anywhere;font-size:var(--font-size-body)}.avatar{display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border-radius:50%;background:var(--gold-light);color:var(--brown);font-weight:700}
  .unblock-dialog{box-sizing:border-box;width:min(400px,calc(100% - 2 * var(--space-page)));max-height:calc(100dvh - 2 * var(--space-page) - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;padding:var(--space-page);border:1px solid var(--dialog-surface-border);border-radius:var(--radius-card);background:var(--dialog-surface-background);box-shadow:var(--dialog-surface-shadow);color:var(--text);font-family:var(--font-app)}.unblock-dialog::backdrop{background:var(--practice-dialog-backdrop)}h3{margin:0 0 12px;font-size:var(--font-size-section-title)}.identity{font-weight:700}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:var(--space-page)}button.primary{background:var(--gold);border-color:var(--gold);color:var(--on-gold)}[role=alert]{color:var(--danger-text)}
</style>
