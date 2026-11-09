<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from '@lucide/svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getBuddhaProfileUi } from '$lib/i18n/buddha-profile-ui';
  import type { BuddhaProfile } from '$lib/types/buddha-profile';

  let { buddhaId, buddhaName, onClose }: {
    buddhaId: string; buddhaName: string; onClose: () => void;
  } = $props();
  const locale = getLocaleContext();
  const c = $derived(getBuddhaProfileUi(locale.current === 'en'));
  const instanceId = $props.id();
  let profile = $state<BuddhaProfile | null>(null);
  let loading = $state(true);
  let failed = $state(false);
  let mounted = $state(false);
  let selectedSection = $state('');
  let reader = $state<HTMLElement>();
  let generation = 0;

  async function loadProfile(id: string) {
    const current = ++generation;
    loading = true;
    failed = false;
    profile = null;
    try {
      const { getBuddhaProfile } = await import('$lib/content/buddha-profiles');
      if (!mounted || current !== generation) return;
      profile = getBuddhaProfile(id);
      selectedSection = profile?.sections[0]?.id ?? '';
    } catch {
      if (!mounted || current !== generation) return;
      failed = true;
    } finally {
      if (mounted && current === generation) loading = false;
    }
  }

  onMount(() => {
    mounted = true;
    return () => { mounted = false; generation += 1; };
  });
  $effect(() => {
    const id = buddhaId;
    if (mounted) void loadProfile(id);
  });

  function goToSection(id: string) {
    selectedSection = id;
    const heading = [...(reader?.querySelectorAll<HTMLElement>('[data-profile-section]') ?? [])]
      .find(node => node.dataset.profileSection === id);
    heading?.scrollIntoView({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }
</script>

{#snippet paragraphText(text: string)}
  {#each text.split(/(\([^)]*\))/gu) as part, index (index)}{#if part.startsWith('(')}<em>{part}</em>{:else}{part}{/if}{/each}
{/snippet}

<dialog data-dialog-glass use:modalDialog class="profile-dialog buddha-profile-dialog" aria-labelledby={`${instanceId}-name`} aria-describedby={`${instanceId}-kind`} tabindex="-1" onkeydown={event => event.stopPropagation()}
  oncancel={event => { event.preventDefault(); onClose(); }} onclick={event => { if (event.target === event.currentTarget) onClose(); }}>
  <header>
    <div><p id={`${instanceId}-kind`}>{c.title}</p><h1 id={`${instanceId}-name`} tabindex="-1" data-modal-focus>{buddhaName}</h1></div>
    <button class="close" type="button" aria-label={c.close} onclick={onClose}><X size={24} aria-hidden="true" /></button>
  </header>
  {#if loading}
    <div class="state" role="status">{c.loading}</div>
  {:else if failed}
    <div class="state"><p role="alert">{c.error}</p><button type="button" onclick={() => void loadProfile(buddhaId)}>{c.retry}</button></div>
  {:else if !profile}
    <div class="state" role="status">{c.unavailable}</div>
  {:else}
    <div class="dialog-layout">
      <nav class="toc" aria-label={c.contents}>
        {#each profile.sections as section, index (section.id)}<button type="button" onclick={() => goToSection(section.id)}>{index + 1}. {c.sectionLabels[index]}</button>{/each}
      </nav>
      <label class="mobile-toc"><span class="sr-only">{c.contents}</span><select value={selectedSection} onchange={event => goToSection(event.currentTarget.value)}>
        {#each profile.sections as section, index (section.id)}<option value={section.id}>{index + 1}. {c.sectionLabels[index]}</option>{/each}
      </select></label>
      <article class="reader" bind:this={reader} lang="vi">
        {#if c.vietnameseNotice}<p class="language-notice" lang="en">{c.vietnameseNotice}</p>{/if}
        {#if profile.summary}<div class="profile-summary-box"><span class="profile-summary-icon" aria-hidden="true">🪷</span><p class="profile-summary-text">{profile.summary}</p></div>{/if}
        {#each profile.sections as section (section.id)}
          <section class="profile-section" aria-labelledby={`${instanceId}-${section.id}`}>
            <h2 id={`${instanceId}-${section.id}`} data-profile-section={section.id} tabindex="-1">{section.title}</h2>
            {#each section.paragraphs as paragraph, index (index)}<p>{@render paragraphText(paragraph)}</p>{/each}
          </section>
        {/each}
        {#if profile.references.length}<section class="refs" aria-labelledby={`${instanceId}-references`}><h2 id={`${instanceId}-references`}>{c.references}</h2>{#each profile.references as reference, index (index)}<p>{@render paragraphText(reference)}</p>{/each}</section>{/if}
      </article>
    </div>
  {/if}
</dialog>

<style>
  .profile-dialog{width:min(900px,calc(100% - 40px));height:min(820px,88dvh);max-width:none;max-height:88dvh;margin:auto;padding:0;border:1px solid var(--dialog-surface-border,var(--border));border-radius:var(--radius-feature);background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));color:var(--text);font-family:var(--font-app);overflow:hidden}
  .profile-dialog[open]{display:flex;flex-direction:column}
  .profile-dialog::backdrop{background:color-mix(in srgb,var(--video-surface) 68%,transparent)}
  header{display:flex;align-items:center;gap:var(--space-page);padding:var(--radius-card) var(--space-page);border-bottom:1px solid var(--border2);background:transparent;flex-shrink:0}
  header>div{flex:1;min-width:0}header p{margin:0 0 var(--radius-sm);color:var(--brown);font-size:12px;text-align:center}h1{margin:0;font-size:20px;font-weight:700;text-align:center;overflow-wrap:anywhere}
  h1:focus{outline:none}
  button,select{min-height:44px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:inherit;font:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .close{display:grid;place-items:center;width:44px;min-width:44px;padding:0;flex-shrink:0}
  .dialog-layout{display:grid;grid-template-columns:200px minmax(0,1fr);flex:1;min-height:0}
  .toc{padding:var(--radius-card) var(--radius-control);border-right:1px solid var(--border2);overflow:auto}.toc button{display:block;width:100%;padding:var(--radius-sm) var(--radius);border:0;background:transparent;text-align:left;font-size:13px;line-height:1.5;margin-bottom:var(--radius-sm)}.toc button:hover{background:var(--gold-light)}
  .reader{min-height:0;padding:var(--radius-sm) calc(var(--space-page) + var(--radius)) calc(var(--space-page) * 2);background:var(--bg);overflow:auto;overscroll-behavior:contain;scroll-behavior:smooth;user-select:text;-webkit-user-select:text;font-family:var(--font-reader)}
  .reader h2{margin:calc(var(--radius-control) * 2) 0 var(--radius-card);font-size:19px;font-weight:700;text-align:center;color:var(--brown-dark);scroll-margin-top:var(--radius-card)}
  .reader p{margin:var(--radius-card) 0;font-size:16px;font-weight:400;line-height:1.85;text-align:justify;overflow-wrap:anywhere}
  .reader .language-notice{font-size:13px;color:var(--text2);line-height:1.7}.refs p{font-size:14px;color:var(--text2)}
  .mobile-toc{display:none}.state{padding:var(--space-page);overflow:auto;line-height:1.7}.state p{margin:0 0 var(--radius-control)}.state button{padding:var(--radius-sm) var(--space-page)}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  @media(max-width:600px){.profile-dialog{position:fixed;inset:0;width:100%;height:100dvh;max-height:100dvh;margin:0;border:0;border-radius:0}header{padding:calc(var(--radius-control) + env(safe-area-inset-top,0px)) max(var(--radius-card),env(safe-area-inset-right,0px)) var(--radius-control) max(var(--radius-card),env(safe-area-inset-left,0px))}h1{font-size:17px}.dialog-layout{display:flex;flex-direction:column}.toc{display:none}.mobile-toc{display:block;margin:var(--radius) var(--radius-card);flex-shrink:0}.mobile-toc select{width:100%;padding:var(--radius-sm) var(--radius);font-size:14px}.reader{flex:1;padding:0 max(var(--space-page),env(safe-area-inset-right,0px)) calc(var(--space-page) * 2 + env(safe-area-inset-bottom,0px)) max(var(--space-page),env(safe-area-inset-left,0px))}.reader h2{font-size:18px;margin-top:var(--radius-card)}}
  @media(prefers-reduced-motion:reduce){.reader{scroll-behavior:auto}}
  .profile-summary-box{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;margin-bottom:18px;border:1px solid var(--border2);border-radius:12px;background:var(--gold-light);color:var(--text);line-height:1.6}
  :root[data-theme="dark"] .profile-summary-box{background:var(--bg2);border-color:var(--border2)}
  .profile-summary-icon{font-size:18px;flex-shrink:0;line-height:1.2}
  .profile-summary-text{margin:0;font-size:13.5px;font-weight:600;color:var(--brown-dark);line-height:1.55}
  :root[data-theme="dark"] .profile-summary-text{color:var(--gold2)}
  @media(max-width:600px){header p{font-size:var(--font-size-meta)}.mobile-toc select{font-size:var(--font-size-input)}}
</style>
