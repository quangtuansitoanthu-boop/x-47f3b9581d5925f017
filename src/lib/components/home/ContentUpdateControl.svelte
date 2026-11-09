<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { useQueryClient } from '@tanstack/svelte-query';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { checkContentUpdates, downloadContentUpdates, ContentUpdateUnavailableError, type ContentUpdatePlan, type ContentUpdateProgress, type ContentUpdateResult } from '$lib/browser/content-update-client';
  import { applyManualCatalogState } from '$lib/browser/content-catalogs';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { contentUpdateText } from '$lib/i18n/content-updates';
  import { getSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import type { PdfTransitionContext } from '$lib/browser/pdf-book-transition';
  import type { ContentGroup } from '$lib/contracts/content-updates';

  const sessionStore = getSessionContext();
  const locale = getLocaleContext();
  const t = $derived(contentUpdateText[locale.current]);
  const queryClient = useQueryClient();
  const groups: ContentGroup[] = ['book', 'scripture', 'ritual', 'pdf', 'talk'];
  let phase = $state<'idle' | 'checking' | 'ready' | 'downloading' | 'done' | 'error'>('idle');
  let open = $state(false);
  let plan = $state<ContentUpdatePlan | null>(null);
  let progress = $state<ContentUpdateProgress>({ completed: 0, total: 0, title: '' });
  let result = $state<ContentUpdateResult | null>(null);
  let controller: AbortController | null = null;
  let disposed = false;
  let generation = 0;
  let transitionContext: PdfTransitionContext | undefined;
  const identity = () => `${sessionStore.value.authenticated ? sessionStore.value.user?.id ?? '' : 'anonymous'}:${sessionStore.value.user?.role ?? 'guest'}`;
  let previousIdentity = untrack(identity);
  const needsUpdate = $derived(Boolean(plan && (plan.items.length || plan.pdfTransitions?.length)));
  function handlePrincipalTransition() {
    const current = identity();
    if (current !== previousIdentity) { previousIdentity = current; close(); plan = null; result = null; }
  }
  $effect(handlePrincipalTransition);
  onMount(() => {
    // Observe synchronous identity changes too: A→B→A may be batched into one render.
    window.addEventListener(SESSION_CHANGE_EVENT, handlePrincipalTransition);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, handlePrincipalTransition);
  });
  function contextForTask(): PdfTransitionContext {
    const currentIdentity = identity(), taskGeneration = ++generation;
    return { principalId: sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null,
      isCurrent: () => !disposed && generation === taskGeneration && identity() === currentIdentity };
  }
  let serverUnavailable = $state(false);
  const busy = $derived(phase === 'checking' || phase === 'downloading');
  const size = $derived(plan ? new Intl.NumberFormat(locale.current === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: plan.bytes < 1000 ? 6 : 3 }).format(plan.bytes / 1_000_000) : '');

  async function check() {
    if (busy) return;
    controller?.abort();
    const task = new AbortController();
    controller = task;
    const taskContext = contextForTask();
    transitionContext = taskContext;
    phase = 'checking'; open = true; plan = null; result = null; serverUnavailable = false;
    try {
      const next = await checkContentUpdates(task.signal, fetch, taskContext);
      if (disposed || task.signal.aborted || !taskContext.isCurrent()) return;
      plan = next; phase = 'ready';
    } catch (error) {
      if (!disposed && !task.signal.aborted) { serverUnavailable = error instanceof ContentUpdateUnavailableError; phase = 'error'; }
    }
  }
  async function download() {
    if (!plan || busy || !transitionContext?.isCurrent()) return;
    const taskContext = transitionContext;
    const task = new AbortController();
    controller = task;
    phase = 'downloading';
    progress = { completed: 0, total: plan.items.length, title: '' };
    try {
      const outcome = await downloadContentUpdates(plan, task.signal, next => { if (!disposed && taskContext.isCurrent()) progress = next; }, fetch, taskContext);
      if (!disposed && !task.signal.aborted && taskContext.isCurrent()) { result = outcome; phase = 'done'; }
    } catch {
      if (!disposed && !task.signal.aborted) phase = 'error';
    } finally {
      if (!disposed && taskContext.isCurrent()) await applyManualCatalogState(queryClient);
    }
  }
  function close() { generation += 1; controller?.abort(); transitionContext = undefined; open = false; phase = 'idle'; }
  onDestroy(() => { disposed = true; generation += 1; controller?.abort(); });
</script>

<section id="content-updates" class="content-update-card" aria-labelledby="content-update-title">
  <div class="content-update-copy">
    <h2 id="content-update-title">{t.title}</h2>
    <p>{t.hint}</p>
  </div>
  <button class="primary" type="button" onclick={check} aria-disabled={busy} aria-haspopup="dialog"><span aria-hidden="true">↻</span>{t.title}</button>
  <small>{t.manual}</small>
</section>

{#if open}
  <dialog data-dialog-glass use:modalDialog aria-labelledby="content-update-dialog-title" oncancel={(event) => { event.preventDefault(); close(); }}>
    <h2 id="content-update-dialog-title" tabindex="-1" data-modal-focus>{phase === 'checking' ? t.checking : phase === 'downloading' ? t.downloading : phase === 'error' ? t.failed : t.ready}</h2>
    <div aria-live="polite">
      {#if phase === 'checking'}
        <p role="status">{t.checking}</p>
      {:else if phase === 'error'}
        <p class="error" role="alert">{serverUnavailable ? t.serverUnavailable : t.error}</p>
      {:else if phase === 'downloading'}
        <p>{progress.completed} / {progress.total} · {progress.title}</p>
        <progress max={progress.total || 1} value={progress.completed}></progress>
      {:else if phase === 'done' && result}
        <p>{t.completed}: <strong>{result.completed}</strong></p>
        {#if result.pdfRemoved?.length}<p class="success">{t.pdfRemoved} <strong>{result.pdfRemoved.length}</strong></p>{/if}
        {#if result.pdfRetained?.length}<section class="notice"><h3>{t.pdfCleanupTitle}</h3><p>{t.pdfCleanupFailed}</p><ul>{#each result.pdfRetained as title, index (`kept:${index}:${title}`)}<li>{title}</li>{/each}</ul></section>{/if}
        {#if result.failed.length}
          <p class="error">{t.failedItems}: {result.failed.length}</p>
          <ul>{#each result.failed as title, index (`${index}:${title}`)}<li>{title}</li>{/each}</ul>
          <p>{t.partial}</p>
        {/if}
      {:else if plan && needsUpdate}
        {#if plan.items.length}<p class="size">{t.size}: <strong>≈ {size} MB</strong></p>{:else}<p>{t.pdfAlreadyReady}</p>{/if}
        <ul>{#each groups as group (group)}
          {@const count = plan.items.filter(item => item.group === group).length}
          {#if count}<li><span>{t[group]}</span><strong>{count}</strong></li>{/if}
        {/each}</ul>
        {#if plan.pdfTransitions?.length}
          <section class="notice replacement-notice"><h3>{t.pdfReplaceTitle}</h3>
            <ul>{#each plan.pdfTransitions as transition (transition.record.key)}<li class="book-name">{transition.item.row.tieu_de}</li>{/each}</ul>
            <p>{t.pdfReplaceNotice}</p><p class="secondary">{t.pdfPositions}</p>
          </section><p>{t.pdfFailureKeeps}</p>
        {/if}
        <p>{t.policy}</p>
        <small>{t.approx}</small>
        {#if plan.unknownImages}<p class="notice">{t.unknown}</p>{/if}
      {:else}<p>{t.empty}</p>{/if}
    </div>
    <footer class:dialog-actions-balanced={(phase === 'ready' && needsUpdate) || phase === 'error' || (phase === 'done' && Boolean(result?.failed.length || result?.pdfRetained?.length))}>
      <button type="button" onclick={close}>{phase === 'downloading' ? t.cancel : phase === 'ready' && needsUpdate ? t.later : t.close}</button>
      {#if phase === 'ready' && needsUpdate}<button class="primary" type="button" onclick={download}>{plan?.pdfTransitions?.length ? t.pdfReplaceAction : t.download}</button>
      {:else if phase === 'error' || (phase === 'done' && (result?.failed.length || result?.pdfRetained?.length))}<button class="primary" type="button" onclick={check}>{t.retry}</button>{/if}
    </footer>
  </dialog>
{/if}

<style>
  .content-update-card{display:grid;gap:calc(var(--space-page)*.6);width:100%;min-width:0;box-sizing:border-box;padding:var(--space-page);border:1px solid var(--border);border-radius:var(--radius-card);background:var(--card);color:var(--text);text-align:start}
  .content-update-copy{display:grid;gap:calc(var(--space-page)*.3);min-width:0}
  h2{margin:0;font:inherit;font-weight:700;font-size: var(--font-size-card-title);color:var(--text)}
  p{line-height:1.6;color:var(--text2);overflow-wrap:anywhere}
  .content-update-copy p{margin:0;font-size: var(--font-size-body);line-height:1.6;text-align:justify;text-align-last:start}
  button{min-height:44px;padding:calc(var(--space-page)/2) var(--space-page);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:var(--text);font:inherit;font-weight:600;cursor:pointer}
  button:disabled{opacity:.65;cursor:wait}
  button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .primary{background:var(--gold);color:var(--on-gold);border-color:var(--gold)}
  .content-update-card>button{display:flex;align-items:center;justify-content:center;gap:calc(var(--space-page)*.4);width:100%;box-sizing:border-box}
  .content-update-card>small{margin:0;font-size: var(--font-size-meta);line-height:1.5}
  small{display:block;color:var(--muted);font-size:var(--font-size-meta);line-height:1.5;margin-top:calc(var(--space-page)/2)}
  dialog{inset:0;margin:auto;width:min(var(--practice-dialog-width),calc(100% - 2 * var(--space-page)));max-height:min(var(--practice-dialog-height),calc(100dvh - 2 * var(--space-page)));box-sizing:border-box;padding:var(--space-page);border:1px solid var(--dialog-surface-border,var(--border));border-radius:var(--radius-card);background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));color:var(--text);font-family:var(--font-app);overflow:auto}
  dialog::backdrop{background:var(--practice-dialog-backdrop)}
  footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:calc(var(--space-page)/2);margin-top:var(--space-page)}
  .size strong{color:var(--text);white-space:nowrap}
  ul{padding-left:var(--space-page);line-height:1.8;overflow-wrap:anywhere}
  li{display:flex;justify-content:space-between;align-items:baseline;gap:calc(var(--space-page)/2)}
  li strong{flex-shrink:0}
  .error{color:var(--danger-text)}
  .notice{padding:calc(var(--space-page)/2);background:var(--gold-muted);border-radius:var(--radius-sm)}
  .replacement-notice{background:var(--gold-light);border-inline-start:3px solid var(--gold)}
  .notice h3{margin:0 0 calc(var(--space-page)*.4);font-size:var(--font-size-body);color:var(--brown-dark)}
  .notice p:last-child{margin-bottom:0}.secondary{font-size:var(--font-size-meta)}.book-name{font-weight:700;color:var(--text)}.success{font-weight:700;color:var(--green-ok)}
  progress{width:100%;accent-color:var(--gold)}
  @media(min-width:640px){
    .content-update-card{grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:var(--space-page)}
    .content-update-card>button{width:auto;min-width:calc(var(--space-page)*11)}
    .content-update-card>small{grid-column:1/-1}
  }
</style>
