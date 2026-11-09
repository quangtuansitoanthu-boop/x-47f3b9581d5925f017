<script module lang="ts">
  export interface CommunitySafetyTarget {
    type: 'comment' | 'profile';
    id: string;
    authorId?: string | null;
    displayName: string;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { commentTranslations } from '$lib/i18n/comment-translations';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, COMMUNITY_REPORT_REASONS, type CommunityReportInput, type CommunityReportReason } from '$lib/contracts/community-moderation';

  let { target, mode, principalId, onClose, onBlocked = () => {}, onReported = () => {} }: {
    target: CommunitySafetyTarget; mode: 'report' | 'block'; onClose: () => void;
    principalId?: string | null;
    onBlocked?: (authorId: string) => void; onReported?: () => void;
  } = $props();
  const locale = getLocaleContext();
  const t = $derived(commentTranslations[locale.current]);
  const principal = () => {
    const session = getBrowserSessionSnapshot();
    return session.authenticated && session.user?.id ? String(session.user.id) : null;
  };
  const initialPrincipal = untrack(() => principalId === undefined ? principal() : principalId);
  let reason = $state<CommunityReportReason>('offensive');
  let details = $state('');
  let busy = $state(false);
  let error = $state('');
  let online = $state(true);
  let alive = true;
  let controller: AbortController | null = null;
  const current = () => alive && initialPrincipal === principal();
  $effect(() => { if (principalId !== undefined && principalId !== initialPrincipal) onClose(); });

  onMount(() => {
    const networkChanged = () => { online = navigator.onLine; };
    const sessionChanged = () => { if (!current()) { controller?.abort(); onClose(); } };
    networkChanged();
    window.addEventListener('online', networkChanged);
    window.addEventListener('offline', networkChanged);
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      window.removeEventListener('online', networkChanged);
      window.removeEventListener('offline', networkChanged);
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });
  onDestroy(() => { alive = false; controller?.abort(); });

  function login() {
    onClose();
    window.dispatchEvent(new CustomEvent('quangtu:login-required'));
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';
    if (!initialPrincipal) { error = t.safetyLogin; return; }
    if (!online) { error = t.safetyOffline; return; }
    if (!current()) { onClose(); return; }
    if (mode === 'block' && !target.authorId) return;
    busy = true;
    const request = new AbortController(); controller = request;
    try {
      const csrfToken = await requireBrowserCsrf();
      if (!current() || request.signal.aborted) return;
      const input: CommunityReportInput = { targetType: target.type, targetId: target.id, reason, details: details.trim() };
      const response = await fetchWithSessionRefresh(mode === 'report' ? '/api/community/reports' : `/api/community/blocks/${encodeURIComponent(target.authorId!)}`, {
        method: mode === 'report' ? 'POST' : 'PUT', credentials: 'include', signal: request.signal,
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify(mode === 'report' ? input : {}),
      });
      const result = await response.json();
      if (!current() || request.signal.aborted) return;
      if (!response.ok || (mode === 'report' ? result.reported !== true : result.blocked !== true)) {
        error = response.status === 401 ? t.safetyLogin : t.safetyFailed;
        return;
      }
      if (mode === 'block') {
        window.dispatchEvent(new CustomEvent(COMMUNITY_BLOCKS_CHANGED_EVENT, {
          detail: { principalId: initialPrincipal, authorId: target.authorId!, blocked: true },
        }));
        onBlocked(target.authorId!);
      } else onReported();
      onClose();
    } catch {
      if (current() && !request.signal.aborted) error = t.safetyFailed;
    } finally {
      if (current() && controller === request) { busy = false; controller = null; }
    }
  }
</script>

<dialog class="community-safety" data-dialog-glass use:modalDialog aria-labelledby="community-safety-title" oncancel={event => { event.preventDefault(); onClose(); }}>
  <form onsubmit={submit}>
    <h3 id="community-safety-title" tabindex="-1" data-modal-focus>{mode === 'block' ? t.blockTitle : target.type === 'profile' ? t.profileReportTitle : t.reportTitle}</h3>
    <p class="identity">{target.displayName}</p>
    {#if mode === 'report'}
      <p>{t.reportPrivacy}</p>
      <label for="community-report-reason">{t.reason}</label>
      <select id="community-report-reason" bind:value={reason} disabled={busy}>{#each COMMUNITY_REPORT_REASONS as value (value)}<option value={value}>{t[value]}</option>{/each}</select>
      <label for="community-report-details">{t.details}</label>
      <textarea id="community-report-details" bind:value={details} maxlength="1000" rows="4" disabled={busy}></textarea>
    {:else}<p>{t.blockDescription}</p>{/if}
    {#if !online}<p role="status">{t.safetyOffline}</p>{/if}
    {#if !initialPrincipal}<p role="status">{t.safetyLogin}</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    <div class="actions dialog-actions-balanced">
      <button type="button" onclick={onClose}>{t.cancel}</button>
      {#if !initialPrincipal}<button type="button" class="primary" onclick={login}>{t.chooseLogin}</button>
      {:else}<button type="submit" class="primary" disabled={busy || !online || (mode === 'block' && !target.authorId)}>{busy ? t.sending : mode === 'block' ? t.block : t.reportSend}</button>{/if}
    </div>
  </form>
</dialog>

<style>
  .community-safety{box-sizing:border-box;width:min(400px,calc(100% - 2 * var(--space-page)));max-height:calc(100dvh - 2 * var(--space-page) - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;padding:var(--space-page);border:1px solid var(--dialog-surface-border);border-radius:var(--radius-card);background:var(--dialog-surface-background);box-shadow:var(--dialog-surface-shadow);color:var(--text);font-family:var(--font-app)}
  .community-safety::backdrop{background:var(--practice-dialog-backdrop)}
  h3,p{margin:0 0 12px}h3{font-size:var(--font-size-section-title)}p{line-height:1.6;color:var(--text2)}.identity{font-weight:700;overflow-wrap:anywhere}
  label{display:block;margin:12px 0 6px}select,textarea{box-sizing:border-box;width:100%;min-height:44px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);color:var(--text);font:inherit}textarea{resize:vertical}
  .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:var(--space-page)}button{min-width:44px;min-height:44px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);font:inherit;cursor:pointer}button.primary{background:var(--gold);border-color:var(--gold);color:var(--on-gold)}button:disabled{opacity:.6;cursor:default}
  :is(button,select,textarea):focus-visible{outline:3px solid var(--gold);outline-offset:2px}[role=alert]{color:var(--danger-text)}
</style>
