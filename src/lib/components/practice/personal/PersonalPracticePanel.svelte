<script lang="ts">
  import type { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
  import PersonalJournal from './PersonalJournal.svelte';
  import type { Snippet } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  interface Props {
    storage: ReturnType<typeof createPersonalPracticeStorage>;
    onShare?: (kind: 'repentance' | 'good_deed', content: string, nickname: string) => Promise<void>;
    onSignIn?: () => void;
    community?: Snippet;
    initialCommunity?: boolean;
  }
  let { storage, onShare, onSignIn, community, initialCommunity = false }: Props = $props();
  const locale = getLocaleContext();
  const copy = $derived(personalPracticeCopy[locale.current === 'en' ? 'en' : 'vi']);
  let active = $state<'journal' | 'community'>('journal');
  $effect(() => { active = initialCommunity ? 'community' : 'journal'; });
  let journal = $state<{ preserveDraft: () => boolean }>();
  export function preserveDraft(): boolean {
    return journal?.preserveDraft() ?? true;
  }
</script>

<section class="personal-practice">
  {#if community}
    <nav aria-label={copy.reflectionTab}>
      <button type="button" aria-pressed={active === 'journal'} onclick={() => active = 'journal'}>{copy.journal}</button>
      <button type="button" aria-pressed={active === 'community'} onclick={() => active = 'community'}>{copy.communityTab}</button>
    </nav>
  {/if}
  <div hidden={active !== 'journal'}><PersonalJournal bind:this={journal} {storage} {onShare} {onSignIn} /></div>
  {#if active === 'community' && community}{@render community()}{/if}
</section>

<style>
  .personal-practice{min-width:0;padding-bottom:env(safe-area-inset-bottom,0px)}
  nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--space-page)*.4);margin-bottom:var(--space-page)}
  button{min-width:0;min-height:44px;padding:calc(var(--space-page)*.5);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);font:700 var(--font-size-label)/1.5 var(--font-app);cursor:pointer;overflow-wrap:anywhere}
  button[aria-pressed=true]{background:var(--gold-light);border-color:var(--gold);color:var(--brown)}button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
</style>
