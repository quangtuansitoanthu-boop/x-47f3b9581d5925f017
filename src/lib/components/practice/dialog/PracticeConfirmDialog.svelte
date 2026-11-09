<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import { tick, type Snippet } from 'svelte';

  interface Props {
    cancelLabel: string;
    confirmLabel: string;
    description: string;
    icon?: string;
    open: boolean;
    returnFocusTo?: HTMLElement | null;
    title: string;
    practiceTheme?: string;
    children?: Snippet;
    hideTitle?: boolean;
    showCancel?: boolean;
    busy?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    cancelLabel,
    confirmLabel,
    description,
    icon = '',
    open,
    returnFocusTo = null,
    title,
    practiceTheme = 'KINH PHẬT',
    children,
    hideTitle = false,
    showCancel = true,
    busy = false,
    onCancel,
    onConfirm
  }: Props = $props();

  let cancelButton = $state<HTMLButtonElement>();
  let confirmButton = $state<HTMLButtonElement>();

  $effect(() => {
    if (!open) return;
    const previousFocus = returnFocusTo
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    releaseBodyScroll ??= acquireScrollLock();
    const focusCancel = showCancel;
    void tick().then(() => (focusCancel ? cancelButton : confirmButton)?.focus());
    return () => {
      releaseBodyScroll?.(); releaseBodyScroll = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (busy && event.key === 'Escape') { event.preventDefault(); return; }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === cancelButton) {
      event.preventDefault();
      confirmButton?.focus();
    } else if (!event.shiftKey && document.activeElement === confirmButton) {
      event.preventDefault();
      cancelButton?.focus();
    }
  }
</script>

{#if open}
  <dialog
    use:modalDialog
    class="practice-confirm"
    aria-labelledby={hideTitle ? undefined : 'practice-confirm-title'}
    aria-label={hideTitle ? title : undefined}
    aria-describedby="practice-confirm-description"
    oncancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    onclick={(event) => !busy && event.currentTarget === event.target && onCancel()}
    onkeydown={handleKeydown}
  >
    <div
      class="practice-confirm__dialog practice-theme"
      data-practice={practiceTheme}
    >
      {#if icon}<div class="practice-confirm__icon" aria-hidden="true">{icon}</div>{/if}
      {#if !hideTitle}<h2 id="practice-confirm-title">{title}</h2>{/if}
      <p id="practice-confirm-description">{description}</p>
      {@render children?.()}
      <div class="practice-confirm__actions" class:dialog-actions-balanced={showCancel}>
        {#if showCancel}<button bind:this={cancelButton} type="button" disabled={busy} onclick={onCancel}>{cancelLabel}</button>{/if}
        <button bind:this={confirmButton} type="button" disabled={busy} class="practice-confirm__primary" onclick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .practice-confirm{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;height:100dvh;max-width:none;max-height:none;margin:0;border:0;padding:max(var(--space-page),env(safe-area-inset-top,0px)) max(var(--space-page),env(safe-area-inset-right,0px)) max(var(--space-page),env(safe-area-inset-bottom,0px)) max(var(--space-page),env(safe-area-inset-left,0px));background:transparent;animation:confirm-fade .2s ease}
  .practice-confirm::backdrop{background:var(--practice-dialog-backdrop)}
  .practice-confirm__dialog{width:100%;max-width:340px;max-height:calc(100dvh - 40px);overflow-y:auto;padding:28px 24px 22px;border-radius:20px;background:var(--bg);box-shadow:0 20px 60px rgba(0,0,0,.4);color:var(--text);text-align:center;animation:confirm-rise .2s ease}
  .practice-confirm__icon{margin-bottom:12px;font-size:40px}
  h2{margin:0 0 8px;color:var(--text);font-family:var(--font-app);font-size:var(--font-size-section-title);font-weight:700}
  p{margin:0 0 22px;color:var(--muted);font-size:var(--font-size-body);line-height:1.6;white-space:pre-line}
  .practice-confirm__actions{display:flex;gap:10px}
  button{min-width:0;min-height:44px;flex:1;padding:11px;border:1.5px solid var(--border);border-radius:12px;background:var(--bg2);color:var(--text2);font-family:inherit;font-size:var(--font-size-label);cursor:pointer;transition:border-color .15s,opacity .15s}
  button:hover{border-color:var(--gold)}
  button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}
  .practice-confirm__primary{border:0;background:linear-gradient(135deg,var(--gold) 0%,#b8843a 100%);box-shadow:0 3px 12px rgba(200,150,62,.35);color:#24180c;font-weight:700}
  .practice-confirm__primary:hover{opacity:.9}
  @keyframes confirm-fade{from{opacity:0}to{opacity:1}}
  @keyframes confirm-rise{from{transform:translateY(10px) scale(.97)}to{transform:translateY(0) scale(1)}}
  h2{font-family:var(--font-app)}
  @media(prefers-reduced-motion:reduce){.practice-confirm,.practice-confirm__dialog{animation:none}button{transition:none}}

  button{min-height:44px}
  .practice-confirm__dialog{max-width:var(--dialog-compact-width);padding:var(--radius-card);border:1px solid var(--dialog-glass-border);border-radius:var(--dialog-corner);background:var(--dialog-glass-background);-webkit-backdrop-filter:var(--dialog-glass-filter);backdrop-filter:var(--dialog-glass-filter);box-shadow:var(--dialog-glass-shadow)}
  h2{font-size:var(--font-size-dialog-title);margin-bottom:var(--radius)}
  p{margin-bottom:var(--radius);font-size:var(--font-size-label);color:var(--text2);line-height:1.5}
  .practice-confirm__actions{margin-top:var(--dialog-action-space);gap:var(--dialog-action-gap)}
  button{padding:var(--radius);background:color-mix(in srgb,var(--card) 60%,transparent);border-radius:var(--radius);box-shadow:var(--glass-button-shadow)}
  button:disabled{opacity:.6;cursor:wait}
  .practice-confirm__icon{font-size:var(--font-size-dialog-count);margin-bottom:var(--radius)}
  .practice-confirm__primary{background:var(--gold);color:var(--on-gold);box-shadow:var(--glass-button-shadow)}
  @supports not (backdrop-filter:blur(1px)){.practice-confirm__dialog{background:var(--card)}}
  @supports not (background:color-mix(in srgb,currentColor,transparent)){.practice-confirm__dialog{background:var(--card);border-color:var(--border)}}
  @media(prefers-reduced-transparency:reduce){.practice-confirm__dialog{background:var(--card);-webkit-backdrop-filter:none;backdrop-filter:none}}

</style>
