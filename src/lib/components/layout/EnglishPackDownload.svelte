<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { downloadEnglishPack } from '$lib/browser/english-pack';

  const locale = getLocaleContext();
  let mounted = $state(false);
  let busy = $state(false);
  let done = $state(0);
  let total = $state(0);
  let error = $state(false);
  let complete = $state(false);
  let paused = $state(false);
  let controller: AbortController | null = null;
  onMount(() => {
    mounted = true;
    return () => { mounted = false; controller?.abort(); controller = null; };
  });

  async function start() {
    if (!mounted || busy) return;
    busy = true;
    paused = false;
    const activeController = new AbortController();
    controller = activeController;
    const signal = activeController.signal;
    error = false;
    try {
      await downloadEnglishPack((count, size) => {
        if (mounted && controller === activeController && !signal.aborted) { done = count; total = size; }
      }, signal);
      if (mounted && controller === activeController) {
        if (!signal.aborted) complete = true;
        else if (locale.current === 'en') paused = true;
      }
    } catch {
      if (mounted && controller === activeController) {
        if (!signal.aborted) error = true;
        else if (locale.current === 'en') paused = true;
      }
    } finally {
      if (mounted && controller === activeController) { busy = false; controller = null; }
    }
  }

  $effect(() => {
    if (locale.current !== 'en') controller?.abort();
    if (mounted && locale.current === 'en' && !complete) {
      // Run once on entering English; errors wait for an explicit retry.
      untrack(() => { void start(); });
    }
  });
</script>

{#if locale.current === 'en' && (busy || error || paused)}
  <aside class="english-download" aria-live="polite">
    {#if busy}
      <span>Downloading English books… {done}/{total}</span>
      <button type="button" onclick={() => { paused = true; controller?.abort(); }}>Pause</button>
    {:else}
      <span>{paused ? 'English download paused.' : 'English download interrupted. Check storage and connection.'}</span>
      <button type="button" onclick={start}>Retry</button>
    {/if}
  </aside>
{/if}

<style>
  .english-download { position: relative; margin: 8px auto; width: calc(100% - 24px); max-width: 56rem; padding: 8px 12px; border: 1px solid var(--border2); border-radius: 14px; background: var(--bg2, #f6f1e7); color: var(--text, #48392a); display: flex; align-items: center; gap: 12px; font-family: inherit; font-size: 13px; line-height: 1.4; }
  span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  button { flex-shrink: 0; min-height: 44px; padding: 8px 12px; border: 1px solid var(--border2); border-radius: 10px; background: var(--card, #fff); color: var(--gold2, #84602c); font: inherit; font-weight: 700; cursor: pointer; }
</style>
