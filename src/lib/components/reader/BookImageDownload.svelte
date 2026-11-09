<script lang="ts">
  import { onMount } from 'svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { cachedMissionImageCount, downloadMissionImages, hasMissionImageChoice, rememberMissionImageChoice,
    readMissionImageUrls, revokeMissionImageUrls, missionImageCount, missionImageBytes } from '$lib/browser/mission-book-images';
  let { sources, onImages }: { sources: string[]; onImages: (urls: Map<string, string>) => void } = $props();
  const locale = getLocaleContext();
  const t = $derived(locale.t.reader);
  let ready = $state(false), prompt = $state(false), busy = $state(false), failed = $state(false);
  let count = $state(0), revision = $state(0);
  let controller: AbortController | null = null;
  let disposed = false;
  const size = (missionImageBytes / 1_000_000).toFixed(1);
  function skip(): void { rememberMissionImageChoice(); controller?.abort(); prompt = false; }
  async function download(): Promise<void> {
    if (busy) return;
    rememberMissionImageChoice(); busy = true; failed = false;
    const operation = new AbortController(); controller = operation;
    try {
      await downloadMissionImages(operation.signal, value => { if (!disposed) count = value; });
      if (!disposed) { revision++; prompt = false; }
    } catch { if (!disposed && !operation.signal.aborted) failed = true; }
    finally { if (!disposed) { busy = false; revision++; } if (controller === operation) controller = null; }
  }
  onMount(() => {
    void cachedMissionImageCount().then(value => {
      if (disposed) return;
      count = value; prompt = value < missionImageCount && !hasMissionImageChoice(); ready = true;
    }).catch(() => { if (!disposed) { ready = true; failed = true; prompt = !hasMissionImageChoice(); } });
    return () => { disposed = true; controller?.abort(); };
  });
  $effect(() => {
    const paths = sources;
    revision;
    if (!ready) return;
    let stale = false;
    let current = new Map<string, string>();
    onImages(current);
    void readMissionImageUrls(paths).then(urls => {
      if (stale) { revokeMissionImageUrls(urls); return; }
      current = urls; onImages(urls);
    }).catch(() => { if (!stale) failed = true; });
    return () => { stale = true; revokeMissionImageUrls(current); };
  });
</script>

{#if ready && count < missionImageCount}
  <div class="book-image-action">
    <button type="button" onclick={() => prompt = true}>{t.bookImagesTitle}</button>
    {#if busy}<span role="status">{count}/{missionImageCount}</span>{/if}
  </div>
{/if}
{#if prompt}
  <dialog data-dialog-glass use:modalDialog aria-labelledby="book-images-title" oncancel={(event) => { event.preventDefault(); skip(); }} onkeydown={(event) => event.stopPropagation()}>
    <h2 id="book-images-title">{t.bookImagesTitle}</h2>
    <p>{t.bookImagesDescription} ({size} MB)</p>
    {#if busy}<p role="status">{t.downloading} {count}/{missionImageCount}</p>{/if}
    {#if failed}<p role="alert">{t.bookImagesError}</p>{/if}
    <div class="actions dialog-actions-balanced">
      <button type="button" data-modal-focus onclick={skip}>{t.bookImagesSkip}</button>
      <button type="button" disabled={busy} onclick={() => void download()}>{t.bookImagesDownload}</button>
    </div>
  </dialog>
{/if}

<style>
  .book-image-action{display:flex;align-items:center;gap:calc(var(--space-page) / 2);padding:0 var(--space-page);flex-shrink:0}
  dialog{margin:auto;width:min(calc(100% - var(--space-page)),32em);box-sizing:border-box;max-height:calc(100dvh - var(--space-page));overflow:auto;padding:var(--space-page);border:1px solid var(--dialog-surface-border,var(--border));border-radius:var(--radius-card);background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));color:var(--text);font-family:var(--font-app)}
  dialog::backdrop{background:var(--practice-dialog-backdrop)}
  h2{font:inherit;font-weight:700;margin:0 0 calc(var(--space-page) / 2)}
  p{line-height:1.6;color:var(--text2)}
  .actions{display:flex;flex-wrap:wrap;gap:calc(var(--space-page) / 2)}
  button{min-height:44px;min-width:44px;padding:calc(var(--space-page) / 2);border:1px solid var(--border);border-radius:var(--radius-control);font:inherit;background:var(--bg2);color:var(--text);cursor:pointer}
  button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  button:disabled{opacity:.6;cursor:progress}
  [role='alert']{color:var(--danger-text)}
</style>
