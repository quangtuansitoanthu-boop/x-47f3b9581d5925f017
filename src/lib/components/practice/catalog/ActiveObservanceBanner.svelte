<script lang="ts">
  import { onMount } from 'svelte';
  import { ShieldCheck } from '@lucide/svelte';
  import { loadPreceptCompanion, PRECEPT_COMPANION_KEY } from '$lib/browser/precept-companion-storage';
  import type { EightSession } from '$lib/domain/practice/precept-companion';
  import { getPreceptPracticeCopy } from '$lib/i18n/precept-practice-ui';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  let { onOpen }: { onOpen: () => void } = $props();
  const locale = getLocaleContext();
  const c = $derived(getPreceptPracticeCopy(locale.current === 'en'));
  let session = $state<EightSession | null>(null);
  let elapsed = $state(false);

  onMount(() => {
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    function load() {
      clearTimeout(expiryTimer);
      const result = loadPreceptCompanion();
      session = result.state.sessions.find(row => row.status === 'active') ?? null;
      const remaining = session ? Date.parse(session.endsAt) - Date.now() : 0;
      elapsed = session !== null && remaining <= 0;
      // Không polling; chỉ cập nhật khi phiên vừa chạm mốc kết thúc.
      if (session && remaining > 0) expiryTimer = setTimeout(load, Math.min(remaining, 2_147_483_647));
    }
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === PRECEPT_COMPANION_KEY || event.key === null) load();
    };
    load();
    window.addEventListener('focus', load);
    window.addEventListener('storage', onStorage);
    window.addEventListener('tutam:precept-companion-saved', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(expiryTimer);
      window.removeEventListener('focus', load);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('tutam:precept-companion-saved', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
</script>

{#if session}
  <aside class="observance-banner" aria-label={elapsed ? c.eightBannerElapsedTitle : c.eightBannerActiveTitle}>
    <ShieldCheck aria-hidden="true" />
    <div>
      <strong>{elapsed ? c.eightBannerElapsedTitle : c.eightBannerActiveTitle}</strong>
      <p>{elapsed ? c.eightBannerElapsedBody : c.eightBannerActiveBody}</p>
    </div>
    <button type="button" onclick={onOpen}>{c.eightBannerOpen} <span aria-hidden="true">→</span></button>
  </aside>
{/if}

<style>
  .observance-banner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: calc(var(--space-page) / 2);
    margin-block: calc(var(--space-page) / 2);
    padding: calc(var(--space-page) / 2);
    border: 1px solid var(--gold);
    border-radius: var(--radius-control);
    background: var(--gold-light);
    color: var(--text);
  }
  .observance-banner :global(svg) { width: var(--space-page); height: var(--space-page); align-self: start; color: var(--gold); }
  .observance-banner > div { min-width: 0; }
  strong { display: block; font-size:var(--font-size-card-title); line-height: 1.5; }
  p { margin: var(--radius-sm) 0 0; color: var(--text2); font-size:var(--font-size-body); line-height: 1.5; }
  button {
    min-height: 44px;
    min-width: 44px;
    padding: var(--radius-sm) calc(var(--space-page) / 2);
    border: 1px solid var(--gold);
    border-radius: var(--radius-control);
    background: var(--gold);
    color: var(--on-gold);
    font: inherit;
    font-size:var(--font-size-label);
    font-weight: 600;
    cursor: pointer;
  }
  @media (max-width: 640px) {
    .observance-banner { grid-template-columns: auto minmax(0, 1fr); }
    button { grid-column: 2; justify-self: start; max-width: 100%; }
  }
</style>
