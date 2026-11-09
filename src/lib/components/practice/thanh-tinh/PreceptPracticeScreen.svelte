<script lang="ts">
  import { ArrowLeft, X } from '@lucide/svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getPreceptPracticeCopy } from '$lib/i18n/precept-practice-ui';
  import PreceptsPanel from './PreceptsPanel.svelte';
  import EightPreceptsPanel from './EightPreceptsPanel.svelte';

  let { open, mode = 'daily', onClose, onOpenAbstinence, onOpenActivity, resumeReflection = false, resumeTestingPrincipal = null, testingConductConfirmed = false, testingConductAnswer }: {
    open: boolean; mode?: 'daily' | 'eight'; onClose: () => void; onOpenAbstinence: (options: { sessionId: string; principal: string | null }) => void;
    resumeReflection?: boolean;
    resumeTestingPrincipal?: string | null; testingConductConfirmed?: boolean;
    testingConductAnswer?: 'kept' | 'review';
    onOpenActivity?: (target: 'books' | 'talks' | 'practice') => void;
  } = $props();
  const locale = getLocaleContext();
  const c = $derived(getPreceptPracticeCopy(locale.current === 'en'));
  let eightView = $state<'prepare' | 'rite' | 'active' | 'reflection' | 'ended'>('prepare');
  let dailyPanel = $state<{ handleBack: () => boolean }>();
  export function handleBack(): boolean {
    if (mode !== 'eight') return dailyPanel?.handleBack() ?? false;
    if (eightView === 'rite') { eightView = 'prepare'; return true; }
    if (eightView === 'reflection') { eightView = 'active'; return true; }
    return false;
  }
  function back() { if (!handleBack()) onClose(); }

</script>

{#if open}
  <dialog use:modalDialog class="thanh-tinh-overlay precept-practice-screen" data-testid="precept-practice-screen" aria-labelledby="precept-practice-title" oncancel={(event) => { event.preventDefault(); back(); }}>
    <header>
      <button class="btn-back icon-button" aria-label={c.back} onclick={back}><ArrowLeft size={22} /></button>
      <h1 id="precept-practice-title" tabindex="-1" data-modal-focus>{mode === 'eight' ? c.tabEight : c.featureTitle}</h1>
      <button class="icon-button" aria-label={c.close} onclick={onClose}><X size={22} /></button>
    </header>
    <main>
      {#if mode === 'eight'}
        <EightPreceptsPanel bind:view={eightView} {onOpenActivity} onReturnToPractice={onClose} />
      {:else}
        <PreceptsPanel bind:this={dailyPanel} {onOpenAbstinence} {resumeReflection} {resumeTestingPrincipal} {testingConductConfirmed} {testingConductAnswer} onReturnToPractice={onClose} />
      {/if}
    </main>
  </dialog>
{/if}

<style>
  .precept-practice-screen { position: fixed; inset: 0; margin: 0; width: 100%; height: 100dvh; max-width: none; max-height: none; border: 0; padding: 0; background: var(--bg); color: var(--text); font-family: var(--font-app); overflow: auto; }
  header { display: flex; align-items: center; gap: var(--radius-sm); position: sticky; top: 0; z-index: 1; background: var(--bg); border-bottom: 1px solid var(--border); padding: max(var(--radius-sm), env(safe-area-inset-top)) var(--radius-sm) var(--radius-sm); }
  h1 { flex: 1; min-width: 0; margin: 0; font-size: inherit; text-align: center; font-weight: 700; }
  button { font: inherit; color: inherit; cursor: pointer; }
  .icon-button { min-width: 44px; min-height: 44px; display: grid; place-items: center; border: 0; background: transparent; border-radius: var(--radius-control); }
  main { max-width: var(--practice-dialog-width); margin: auto; padding: var(--space-page); padding-bottom: max(var(--space-page), env(safe-area-inset-bottom)); }
  button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
</style>


