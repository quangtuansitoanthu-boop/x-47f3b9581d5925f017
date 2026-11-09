<script lang="ts">
  import RosarySelect from '$lib/components/practice/rosary/RosarySelect.svelte';
  import { untrack } from 'svelte';
  import { createPracticeFabController } from '$lib/browser/practice-fab-controller';
  import { MEDITATION_TRACK_OPTIONS, type MeditationTrack } from '$lib/browser/practice-audio';
  import type { PracticeFabPosition } from '$lib/browser/practice-storage';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    fabPosition: PracticeFabPosition | null;
    meditationMusicActive: boolean;
    selectedMeditationTrack: MeditationTrack | null;
    moActive: boolean;
    panelOpen: boolean;
    practiceCount: number;
    onCountChange: (delta: number) => void;
    onFabPositionSave: (position: PracticeFabPosition) => void;
    onPanelToggle: () => void;
    onSelectMeditationTrack: (track: MeditationTrack) => void;
    onStopMeditationMusic: () => void;
    onToggleMo: () => void;
  }

  let {
    fabPosition,
    meditationMusicActive,
    selectedMeditationTrack,
    moActive,
    panelOpen,
    practiceCount,
    onCountChange,
    onFabPositionSave,
    onPanelToggle,
    onSelectMeditationTrack,
    onStopMeditationMusic,
    onToggleMo
  }: Props = $props();

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.practice);

  let fab = $state<HTMLElement | null>(null);
  let musicButtonElement = $state<HTMLButtonElement | null>(null);
  let musicMenuElement = $state<HTMLElement | null>(null);
  let musicMenuOpen = $state(false);

  const menuOnLeft = $derived(
    typeof window !== 'undefined' && fabPosition ? fabPosition.x > window.innerWidth / 2 : false
  );

  function toggleMusicMenu(event: MouseEvent): void {
    event.stopPropagation();
    musicMenuOpen = !musicMenuOpen;
  }

  function handleSelectTrack(track: MeditationTrack): void {
    onSelectMeditationTrack(track);
  }

  function handleStopMusic(): void {
    onStopMeditationMusic();
  }

  function handleWindowPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (musicMenuOpen && !musicMenuElement?.closest('.rosary-select__dialog')?.contains(target) && !musicButtonElement?.contains(target)) {
      musicMenuOpen = false;
    }
    if (panelOpen && !fab?.contains(target)) {
      onPanelToggle();
    }
  }

  function handleWindowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (musicMenuOpen) {
        event.preventDefault();
        musicMenuOpen = false;
        musicButtonElement?.focus();
      } else if (panelOpen) {
        event.preventDefault();
        onPanelToggle();
      }
    }
  }

  $effect(() => {
    if (!fab) return;
    const controller = createPracticeFabController(fab, onFabPositionSave, untrack(() => fabPosition));
    return () => controller.destroy();
  });

  $effect(() => {
    if (!panelOpen) {
      musicMenuOpen = false;
    }
  });
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeyDown} />

<div
  class="tt-practice__fab ttr-fabs practice-mode"
  class:panel-open={panelOpen}
  class:menu-open={musicMenuOpen}
  bind:this={fab}
  role="group"
  aria-label={t.floatingControlsAria}
  style={fabPosition ? `left:${fabPosition.x}px;top:${fabPosition.y}px;transform:none;` : ''}
>
  <button
    class:expanded={panelOpen}
    class="tt-practice__toggle ttr-toggle-btn"
    type="button"
    aria-controls="practice-floating-panel"
    aria-expanded={panelOpen}
    aria-label={panelOpen ? t.closeControls : t.openControls}
    title={t.floatingControlsAria}
    onclick={onPanelToggle}
  >
    <svg class="ttr-toggle-svg" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="practice-hand-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#E8BC6A" />
          <stop offset="100%" stop-color="#C8963E" />
        </linearGradient>
      </defs>
      <path d="M28 38 C18 35 12 28 11 20 C10 14 13 10 16 10 C19 10 20 13 20 15 L21 28" stroke="url(#practice-hand-gradient)" stroke-width="2.5" stroke-linecap="round" />
      <path d="M16 10 C16 8 17 7 19 8 L21 12" stroke="url(#practice-hand-gradient)" stroke-width="2.2" stroke-linecap="round" />
      <path d="M19 8 C19 6 20.5 5 22 6 L23 11" stroke="url(#practice-hand-gradient)" stroke-width="2" stroke-linecap="round" />
      <path d="M22 6 C22 4 24 3.5 25 5 L25.5 10" stroke="url(#practice-hand-gradient)" stroke-width="1.9" stroke-linecap="round" />
      <path d="M28 38 C38 35 44 28 45 20 C46 14 43 10 40 10 C37 10 36 13 36 15 L35 28" stroke="url(#practice-hand-gradient)" stroke-width="2.5" stroke-linecap="round" />
      <path d="M40 10 C40 8 39 7 37 8 L35 12" stroke="url(#practice-hand-gradient)" stroke-width="2.2" stroke-linecap="round" />
      <path d="M37 8 C37 6 35.5 5 34 6 L33 11" stroke="url(#practice-hand-gradient)" stroke-width="2" stroke-linecap="round" />
      <path d="M34 6 C34 4 32 3.5 31 5 L30.5 10" stroke="url(#practice-hand-gradient)" stroke-width="1.9" stroke-linecap="round" />
      <path d="M20 28 Q22 40 28 42 Q34 40 36 28" stroke="url(#practice-hand-gradient)" stroke-width="2.5" stroke-linecap="round" fill="rgba(200,150,62,.1)" />
      <circle cx="28" cy="26" r="4" fill="rgba(232,188,106,.12)" />
    </svg>
  </button>

  <div class:open={panelOpen} class="tt-practice__panel ttr-panel" id="practice-floating-panel">
    <div class="ttr-counter-row">
      <button
        class="ttr-side-btn"
        type="button"
        aria-label="-1"
        title="-1"
        onclick={() => onCountChange(-1)}
      >−</button>
      <strong class="ttr-count-num" aria-live="polite">{practiceCount}</strong>
      <button
        class="ttr-side-btn ttr-side-btn-plus"
        type="button"
        aria-label="+1"
        title="+1"
        onclick={() => onCountChange(1)}
      >+</button>
    </div>

    <button
      class:active={moActive}
      class="ttr-action-fab"
      type="button"
      aria-label={`🪘 ${t.woodenFish}`}
      aria-pressed={moActive}
      title={t.woodenFish}
      onclick={onToggleMo}
    >
      <i class="ttr-fab-dot" aria-hidden="true"></i>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <ellipse cx="12" cy="13" rx="8" ry="5" stroke="#C8963E" stroke-width="1.8" fill="rgba(200,150,62,.1)" />
        <path d="M8 13 Q12 8 16 13" stroke="#C8963E" stroke-width="1.8" stroke-linecap="round" />
        <line x1="17" y1="7" x2="21" y2="3" stroke="#C8963E" stroke-width="2" stroke-linecap="round" />
        <circle cx="17" cy="7" r="1.5" fill="#C8963E" />
      </svg>
    </button>

    <div class="ttr-music-wrapper">
      <button
        bind:this={musicButtonElement}
        class:active={meditationMusicActive}
        class="ttr-action-fab ttr-action-music"
        type="button"
        aria-label={t.meditationMusicSelect}
        aria-expanded={musicMenuOpen}
        aria-haspopup="dialog"
        title={t.meditationMusicSelect}
        onclick={toggleMusicMenu}
      >
        <i class="ttr-fab-dot" aria-hidden="true"></i>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 18V5l12-2v13" stroke="#C8963E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="6" cy="18" r="3" stroke="#C8963E" stroke-width="1.8" fill="rgba(200,150,62,.12)" />
          <circle cx="18" cy="16" r="3" stroke="#C8963E" stroke-width="1.8" fill="rgba(200,150,62,.12)" />
        </svg>
      </button>

      {#if musicMenuOpen}
        <RosarySelect anchor={musicButtonElement ?? undefined} bind:open={musicMenuOpen} showHeader={false} label={t.meditationMusicSelect} accessibleLabel={t.meditationMusicSelect} value="" options={[]} onChange={() => {}}>
        <div
          bind:this={musicMenuElement}
          class="tt-music-menu"
          class:pos-left={menuOnLeft}
          role="group"
          aria-label={t.meditationMusicSelect}
          tabindex="-1"
        >
          <div class="tt-music-menu__header">
            <div class="tt-music-menu__title-wrap">
              <span class="tt-music-menu__icon" aria-hidden="true">🎵</span>
              <div>
                <strong class="tt-music-menu__title">{t.meditationMusicSelect}</strong>
                <small class="tt-music-menu__subtitle">{t.meditationMusicSelectSub}</small>
              </div>
            </div>
            <button
              type="button"
              class="tt-music-menu__close"
              aria-label="✕"
              onclick={() => musicMenuOpen = false}
            >✕</button>
          </div>

          <div class="tt-music-menu__list" role="menu">
            {#each MEDITATION_TRACK_OPTIONS as opt, idx}
              {@const isPlaying = meditationMusicActive && selectedMeditationTrack === opt.track}
              <button
                type="button"
                role="menuitem"
                class="tt-music-menu__item"
                class:active={isPlaying}
                onclick={() => handleSelectTrack(opt.track)}
              >
                <span class="tt-music-menu__num">{idx + 1}</span>
                <span class="tt-music-menu__item-name">{opt.label}</span>
                {#if isPlaying}
                  <span class="tt-music-bars" aria-label="Playing">
                    <span class="bar bar1"></span>
                    <span class="bar bar2"></span>
                    <span class="bar bar3"></span>
                  </span>
                {/if}
              </button>
            {/each}
          </div>

          {#if meditationMusicActive}
            <div class="tt-music-menu__footer">
              <button
                type="button"
                class="tt-music-menu__stop-btn"
                onclick={handleStopMusic}
              >
                {t.stopMeditationMusic}
              </button>
            </div>
          {/if}
        </div>
        </RosarySelect>
      {/if}
    </div>
  </div>
</div>

<style>
  .ttr-fabs{position:fixed;z-index:660;top:50%;left:12px;display:flex;align-items:center;flex-direction:column;gap:8px;cursor:grab;touch-action:none;user-select:none;transform:translateY(-50%);opacity:.5;transition:opacity .25s cubic-bezier(.4,0,.2,1)}
  .ttr-fabs.panel-open,.ttr-fabs.menu-open{opacity:1!important}
  :global(.ttr-fabs.dragging){cursor:grabbing!important;transition:none!important;opacity:1!important}:global(.ttr-fabs.dragging) .ttr-toggle-btn{animation:none;transform:scale(1.08)}
  @media(hover:hover){.ttr-fabs:hover,.ttr-fabs:focus-within{opacity:1}}
  .ttr-toggle-btn{display:flex;width:46px;height:46px;flex-shrink:0;align-items:center;justify-content:center;padding:0;border:2px solid var(--gold);border-radius:50%;outline:0;background:linear-gradient(135deg,var(--gold-light) 0%,var(--gold-muted) 100%);box-shadow:0 4px 16px rgba(200,150,62,.25);cursor:grab;animation:ttr-practice-pulse 3s ease-in-out infinite;transition:transform .2s,box-shadow .2s}
  .ttr-toggle-btn:active{cursor:grabbing}.ttr-toggle-btn.expanded{border-color:var(--brown);box-shadow:0 4px 20px rgba(200,150,62,.5);animation:none}.ttr-toggle-svg{width:28px;height:28px;pointer-events:none}
  .ttr-panel{display:flex;overflow:visible;max-height:0;align-items:center;flex-direction:column;gap:8px;opacity:0;cursor:default;transition:max-height .35s cubic-bezier(.4,0,.2,1),opacity .25s ease}.ttr-panel.open{max-height:450px;opacity:1}
  .ttr-counter-row{display:flex;align-items:center;gap:4px}.ttr-side-btn,.ttr-action-fab{display:flex;width:46px;height:46px;flex-shrink:0;align-items:center;justify-content:center;padding:0;border:1.5px solid var(--gold);border-radius:50%;outline:0;background:var(--gold-light);box-shadow:0 2px 10px rgba(200,150,62,.15);cursor:pointer;transition:background .15s,border-color .15s,box-shadow .18s,transform .15s}
  .ttr-side-btn{color:var(--brown);font:700 22px/1 var(--font-app)}.ttr-side-btn:hover,.ttr-action-fab:hover{border-color:var(--brown);background:var(--gold-muted);box-shadow:0 4px 16px rgba(200,150,62,.3)}.ttr-side-btn:active,.ttr-action-fab:active{transform:scale(.9)}
  .ttr-side-btn-plus{width:58px;height:58px;box-shadow:0 3px 12px rgba(200,150,62,.25);font-size:28px}.ttr-count-num{min-width:40px;color:var(--brown);font:700 20px/1 Lora,serif;text-align:center}
  .ttr-action-fab{position:relative}.ttr-action-fab.active{border-color:var(--brown);background:var(--gold-muted);box-shadow:0 0 14px rgba(200,150,62,.45)}.ttr-fab-dot{position:absolute;top:2px;right:2px;display:none;width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 5px rgba(200,150,62,.7)}.ttr-action-fab.active .ttr-fab-dot{display:block}
  .ttr-music-wrapper{position:relative}
  .tt-music-menu{position:absolute;z-index:700;bottom:-6px;left:calc(100% + 14px);width:260px;padding:12px;border:1.5px solid var(--border2);border-radius:16px;background:var(--bg);box-shadow:0 12px 36px rgba(0,0,0,.22);cursor:default;user-select:none;animation:tt-menu-pop .2s cubic-bezier(.16,1,.3,1)}
  .tt-music-menu.pos-left{right:calc(100% + 14px);left:auto}
  @keyframes tt-menu-pop{from{opacity:0;transform:scale(.94) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
  .tt-music-menu__header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border2)}
  .tt-music-menu__title-wrap{display:flex;align-items:center;gap:8px}
  .tt-music-menu__icon{font-size:18px}
  .tt-music-menu__title{display:block;color:var(--text);font-family:var(--font-app);font-size:var(--font-size-card-title);font-weight:700;line-height:1.2}
  .tt-music-menu__subtitle{display:block;color:var(--muted);font-size:var(--font-size-meta);line-height:1.2}
  .tt-music-menu__close{width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;transition:background .15s,color .15s}
  .tt-music-menu__close:hover{background:var(--bg2);color:var(--text)}
  .tt-music-menu__list{display:flex;flex-direction:column;gap:6px}
  .tt-music-menu__item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--text2);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:600;text-align:left;transition:all .15s}
  .tt-music-menu__item:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-light)}
  .tt-music-menu__item.active{border-color:var(--gold);background:var(--gold-light);color:var(--brown);box-shadow:0 2px 8px rgba(200,150,62,.18)}
  .tt-music-menu__num{display:grid;width:20px;height:20px;flex-shrink:0;place-items:center;border-radius:50%;background:rgba(200,150,62,.15);color:var(--gold);font-size:11px;font-weight:700}
  .tt-music-menu__item.active .tt-music-menu__num{background:var(--gold);color:#fff}
  .tt-music-menu__item-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tt-music-bars{display:inline-flex;align-items:flex-end;gap:2px;height:14px;margin-left:auto;flex-shrink:0}
  .tt-music-bars .bar{width:3px;border-radius:2px;background:var(--gold);animation:sound-wave 1s ease-in-out infinite alternate}
  .tt-music-bars .bar1{height:5px;animation-delay:.1s}
  .tt-music-bars .bar2{height:13px;animation-delay:.35s}
  .tt-music-bars .bar3{height:8px;animation-delay:.2s}
  @keyframes sound-wave{0%{height:4px}100%{height:14px}}
  .tt-music-menu__footer{margin-top:10px;padding-top:8px;border-top:1px solid var(--border2)}
  .tt-music-menu__stop-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:7px 10px;border:1px dashed var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:600;transition:all .15s}
  .tt-music-menu__stop-btn:hover{border-color:#dc3545;background:rgba(220,53,69,.08);color:#dc3545}
  button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:3px}
  :global([data-theme='dark']) .ttr-toggle-btn{border-color:rgba(200,150,62,.5);background:linear-gradient(135deg,#2a2318 0%,#3a2e1a 100%)}:global([data-theme='dark']) .ttr-side-btn,:global([data-theme='dark']) .ttr-action-fab{border-color:rgba(200,150,62,.4);background:rgba(200,150,62,.12)}:global([data-theme='dark']) .ttr-count-num{color:var(--gold2)}
  :global([data-theme='dark']) .tt-music-menu{background:#1e1a14;border-color:rgba(200,150,62,.3);box-shadow:0 12px 36px rgba(0,0,0,.6)}
  :global([data-theme='dark']) .tt-music-menu__item{border-color:rgba(200,150,62,.2);background:rgba(255,255,255,.04);color:var(--text)}
  :global([data-theme='dark']) .tt-music-menu__item.active{background:rgba(200,150,62,.2);color:var(--gold2);border-color:var(--gold)}
  @keyframes ttr-practice-pulse{0%,100%{box-shadow:0 4px 16px rgba(200,150,62,.25),0 0 0 0 rgba(200,150,62,.2)}50%{box-shadow:0 4px 20px rgba(200,150,62,.4),0 0 0 8px rgba(200,150,62,0)}}
  .ttr-toggle-btn,.ttr-side-btn,.ttr-count-num,.tt-music-menu__title{font-family:var(--font-app)}
  @media(max-width:600px){.ttr-fabs{left:6px}.tt-music-menu{width:230px}}
  @media(prefers-reduced-motion:reduce){.ttr-toggle-btn{animation:none}.ttr-panel,.ttr-side-btn,.ttr-action-fab,.tt-music-menu{transition:none}.tt-music-bars .bar{animation:none}}
</style>
