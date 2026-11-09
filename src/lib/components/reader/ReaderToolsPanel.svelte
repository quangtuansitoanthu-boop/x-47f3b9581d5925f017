<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { readerPanelKeyboard } from '$lib/browser/reader-panel-keyboard';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  let { children, open = $bindable(false), scrollElement = null }: { children: Snippet; open?: boolean; scrollElement?: HTMLElement | null } = $props();
  const id = $props.id();
  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLElement | null>(null);
  let scrollingDown = $state(false);
  let mobileTools = $state(false);

  $effect(() => {
    const target = scrollElement;
    scrollingDown = false;
    if (!target || !mobileTools) return;
    let previousY = Math.max(0, target.scrollTop);
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const y = Math.max(0, Math.min(target.scrollTop, target.scrollHeight - target.clientHeight));
      const delta = y - previousY;
      previousY = y;
      if (!delta) return;
      scrollingDown = delta > 0;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { scrollingDown = false; }, 400);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      clearTimeout(idleTimer);
    };
  });

  let toggleStyle = $state('');
  let toolsDragged = $state(false);
  let dragStart: { x: number; y: number; left: number; top: number } | null = null;
  const TOOLS_POS_KEY = 'tutam_reader_tools_pos';

  function clampToolsPosition(x: number, y: number, width = 110, height = 46) {
    const inset = 8;
    const maxLeft = Math.max(inset, window.innerWidth - width - inset);
    const maxTop = Math.max(inset, window.innerHeight - height - inset);
    const left = Math.min(maxLeft, Math.max(inset, x));
    const top = Math.min(maxTop, Math.max(inset, y));
    return { left, top };
  }

  function applySavedPosition() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(TOOLS_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        const width = trigger?.offsetWidth || 110;
        const height = trigger?.offsetHeight || 46;
        const pos = clampToolsPosition(parsed.x, parsed.y, width, height);
        toggleStyle = `left:${pos.left}px;top:${pos.top}px;right:auto;bottom:auto`;
      }
    } catch {
      // Ignore corrupt position
    }
  }

  function startDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    const button = event.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    dragStart = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    toolsDragged = false;
    button.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent) {
    if (!dragStart) return;
    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;
    if (!toolsDragged && Math.hypot(deltaX, deltaY) < 5) return;
    toolsDragged = true;
    event.preventDefault();
    const button = event.currentTarget as HTMLButtonElement;
    const width = button.offsetWidth || 110;
    const height = button.offsetHeight || 46;
    const pos = clampToolsPosition(dragStart.left + deltaX, dragStart.top + deltaY, width, height);
    toggleStyle = `left:${pos.left}px;top:${pos.top}px;right:auto;bottom:auto`;
  }

  function finishDrag(event: PointerEvent) {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
    dragStart = null;
    if (toolsDragged) {
      const rect = button.getBoundingClientRect();
      try {
        localStorage.setItem(TOOLS_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
      } catch {
        // Ignore
      }
    }
  }

  function handleClick(event: MouseEvent) {
    if (toolsDragged) {
      event.preventDefault();
      event.stopPropagation();
      toolsDragged = false;
      return;
    }
    void toggle();
  }

  async function toggle(fromPopState = false) {
    // This is a tool sheet within the current chapter, not a reading-history entry.
    // Android Back dismisses it before the outer reader via native-back-button.
    open = fromPopState ? false : !open;
    await tick();
    if (open) panel?.focus({ preventScroll: true });
    else trigger?.focus({ preventScroll: true });
  }

  function handlePopState() {
    if (open && typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      void toggle(true);
    }
  }

  onMount(() => {
    void tick().then(() => {
      applySavedPosition();
    });
    const onResize = () => {
      mobileTools = window.matchMedia('(max-width: 768px)').matches;
      if (!toggleStyle || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const pos = clampToolsPosition(rect.left, rect.top, trigger.offsetWidth, trigger.offsetHeight);
      toggleStyle = `left:${pos.left}px;top:${pos.top}px;right:auto;bottom:auto`;
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<button
  bind:this={trigger}
  class="reader-tools-toggle"
  class:dragging={toolsDragged}
  class:scroll-aware={Boolean(scrollElement)}
  class:scrolling-down={scrollingDown}
  class:open
  type="button"
  aria-expanded={open}
  aria-controls={id}
  style={toggleStyle}
  onpointerdown={startDrag}
  onpointermove={moveDrag}
  onpointerup={finishDrag}
  onpointercancel={finishDrag}
  onclick={handleClick}
>
  <span class="tools-toggle-icon" aria-hidden="true">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  </span>
  <span>{isEn ? 'Tools' : 'Công cụ'}</span>
</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="reader-tools-backdrop"
    role="presentation"
    onclick={() => void toggle()}
    aria-hidden="true"
  ></div>
{/if}

<section
  id={id}
  bind:this={panel}
  class="reader-tools-panel"
  data-dialog-glass={open || undefined}
  class:open
  aria-label={isEn ? 'Reading Tools' : 'Công cụ đọc'}
  tabindex="-1"
  use:readerPanelKeyboard={() => { if (!open || !window.matchMedia('(max-width: 768px)').matches) return false; void toggle(); }}
>
  <header>
    <div class="sheet-drag-handle" aria-hidden="true"></div>
    <div class="sheet-title-group">
      <span class="sheet-title-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </span>
      <strong>{isEn ? 'Reading Tools & Study' : 'Công cụ đọc & nghiên cứu'}</strong>
    </div>
    <button type="button" class="sheet-close-btn" aria-label={isEn ? 'Close tools' : 'Đóng công cụ'} onclick={() => void toggle()}>✕</button>
  </header>
  <div class="reader-tools-content">
    {@render children()}
  </div>
</section>

<style>
  .reader-tools-toggle,.reader-tools-backdrop,.reader-tools-panel>header{display:none}
  .reader-tools-panel,.reader-tools-content{display:contents}
  @media(max-width:768px){
    .reader-tools-toggle{
      position:fixed;
      z-index:1050;
      left:14px;
      bottom:calc(72px + env(safe-area-inset-bottom));
      display:flex;
      min-height:44px;
      height:44px;
      align-items:center;
      gap:6px;
      padding:0 13px 0 10px;
      border:1.5px solid var(--gold);
      border-radius:20px;
      background:var(--card);
      color:var(--text);
      box-shadow:0 4px 16px rgba(0,0,0,.12),0 0 0 1px rgba(212,168,75,.2);
      font:600 var(--font-size-label) var(--font-app);
      cursor:grab;
      touch-action:none;
      user-select:none;
      opacity:.92;
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      transition:opacity .18s,transform .18s,box-shadow .18s;
    }
    .tools-toggle-icon{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--gold);
    }
    .reader-tools-toggle:not(.scroll-aware):hover,
    .reader-tools-toggle:focus-visible{
      opacity:1;
      transform:translateY(-1px);
      box-shadow:0 6px 20px rgba(0,0,0,.18),0 0 0 1.5px var(--gold);
    }
    .reader-tools-toggle:active,
    .reader-tools-toggle.dragging{
      cursor:grabbing;
      opacity:1;
      transform:scale(.95);
    }
    .reader-tools-toggle.scroll-aware{min-height:44px;opacity:.6}
    .reader-tools-toggle.scroll-aware.scrolling-down{opacity:.2}
    .reader-tools-toggle.scroll-aware:is(:active,:focus-visible,.dragging,.open){opacity:1}
    .reader-tools-backdrop{
      position:fixed;
      inset:0;
      z-index:1059;
      display:block;
      background:rgba(0,0,0,.45);
      backdrop-filter:blur(4px);
      -webkit-backdrop-filter:blur(4px);
      animation:toolsBackdropIn .2s ease-out;
    }
    @keyframes toolsBackdropIn{
      from{opacity:0}
      to{opacity:1}
    }
    .reader-tools-panel{display:none}
    .reader-tools-panel.open{
      position:fixed;
      z-index:1060;
      right:0;
      bottom:0;
      left:0;
      margin:0 auto;
      width:100%;
      max-width:520px;
      display:flex;
      flex-direction:column;
      max-height:min(78dvh,580px);
      border-top:1.5px solid var(--dialog-surface-border,var(--border));
      border-left:1px solid var(--dialog-surface-border,var(--border));
      border-right:1px solid var(--dialog-surface-border,var(--border));
      border-bottom:none;
      border-radius:22px 22px 0 0;
      background:var(--dialog-surface-background,var(--card));
      color:var(--text);
      box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));
      overflow:hidden;
      animation:toolsSheetUp .25s cubic-bezier(.16,1,.3,1);
    }
    @keyframes toolsSheetUp{
      from{transform:translateY(100%);opacity:.8}
      to{transform:translateY(0);opacity:1}
    }
    .reader-tools-panel>header{
      position:relative;
      z-index:3;
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:14px 16px 10px;
      border-bottom:1px solid var(--border2);
      background:transparent;
      flex-shrink:0;
    }
    .sheet-drag-handle{
      position:absolute;
      top:5px;
      left:50%;
      transform:translateX(-50%);
      width:38px;
      height:4px;
      border-radius:2px;
      background:var(--muted);
      opacity:.35;
    }
    .sheet-title-group{
      display:flex;
      align-items:center;
      gap:7px;
      color:var(--text);
      font:700 var(--font-size-label) var(--font-app);
    }
    .sheet-title-icon{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--gold);
    }
    .reader-tools-panel>header button.sheet-close-btn{
      display:flex;
      align-items:center;
      justify-content:center;
      width:44px;
      height:44px;
      border:1px solid var(--border2);
      border-radius:50%;
      background:var(--bg2);
      color:var(--muted);
      cursor:pointer;
      font-size:12px;
      transition:background .15s,color .15s,transform .15s;
    }
    .reader-tools-panel>header button.sheet-close-btn:hover{
      background:var(--gold-light);
      color:var(--brown);
      border-color:var(--gold);
    }
    .reader-tools-panel>header button.sheet-close-btn:active{
      transform:scale(.92);
    }
    .reader-tools-content{
      display:block;
      overflow-y:auto;
      overscroll-behavior:contain;
      -webkit-overflow-scrolling:touch;
      flex:1;
      padding:12px 14px calc(14px + env(safe-area-inset-bottom,0px));
    }
    .reader-tools-toggle:focus-visible,.reader-tools-panel:focus-visible,.reader-tools-panel>header button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
  }
  @media(prefers-reduced-motion:reduce){
    .reader-tools-backdrop{animation:none}
    .reader-tools-panel.open{animation:none}
  }
</style>
