<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  const localeStore = getLocaleContext();
  const label = (vi: string, en: string) => localeStore.current === 'en' ? en : vi;
  import { tick } from 'svelte';

  interface Props {
    trackTitle: string;
    positionSeconds: number;
    visible: boolean;
    onStartOver: () => void;
    onResume: () => void;
    onClose: () => void;
  }

  let { trackTitle, positionSeconds, visible, onStartOver, onResume, onClose }: Props = $props();
  let dialog = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!visible) return;
    void tick().then(() => dialog?.focus({ preventScroll: true }));
  });

  function formatTime(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainder = safeSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
      : `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function trapFocus(event: KeyboardEvent): void {
    if (!visible || event.key !== 'Tab' || !dialog) return;
    const items = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div class:show={visible} class="pt-resume-dialog" data-dialog-glass role="dialog" aria-label={label("Tiếp tục nghe pháp thoại", "Resume Dharma audio")} aria-live="polite" tabindex="-1" bind:this={dialog} onkeydown={trapFocus}>
  <button class="pt-resume-close" type="button" onclick={onClose} aria-label={label("Đóng đề nghị nghe tiếp", "Close resume prompt")}>×</button>
  <p class="pt-resume-dialog-text">
    🎵 {label('Đang nghe dở:', 'Previously playing:')} <strong>{trackTitle}</strong><br />
    ⏱ {label('Đến phút', 'Stopped at')} <strong>{formatTime(positionSeconds)}</strong>. {label('Bạn có muốn nghe tiếp không?', 'Would you like to continue?')}
  </p>
  <div class="pt-resume-dialog-btns dialog-actions-balanced">
    <button class="pt-resume-btn-no" type="button" onclick={onStartOver}>{label("Không, nghe từ đầu", "Start from beginning")}</button>
    <button class="pt-resume-btn-yes" type="button" onclick={onResume}>{label("Có, nghe tiếp ▶", "Resume ▶")}</button>
  </div>
</div>

<style>
  .pt-resume-dialog{position:fixed;z-index:610;bottom:90px;left:50%;width:calc(100vw - 40px);min-width:260px;max-width:340px;padding:14px 18px;border:1.5px solid var(--dialog-surface-border,var(--border));border-radius:16px;background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));opacity:0;pointer-events:none;transform:translate(-50%,20px);transition:opacity .28s,transform .28s}
  .pt-resume-dialog.show{opacity:1;pointer-events:auto;transform:translate(-50%,0)}
  :global([data-theme="dark"]) .pt-resume-dialog{background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl))}
  .pt-resume-close{position:absolute;top:6px;right:8px;display:flex;width:28px;height:28px;align-items:center;justify-content:center;padding:4px;border:0;border-radius:50%;background:none;color:var(--muted);cursor:pointer;font:inherit;font-size:20px;line-height:1;transition:background .15s,color .15s}
  .pt-resume-close:hover{background:var(--bg2);color:var(--text)}
  .pt-resume-close:focus-visible,.pt-resume-btn-no:focus-visible,.pt-resume-btn-yes:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:2px}
  .pt-resume-dialog-text{margin:0 0 12px;color:var(--text);font-size:var(--font-size-body);line-height:1.55}
  .pt-resume-dialog-text strong{color:var(--brown)}
  :global([data-theme="dark"]) .pt-resume-dialog-text strong{color:var(--gold2)}
  .pt-resume-dialog-btns{display:flex;justify-content:flex-end;gap:8px}
  .pt-resume-btn-no,.pt-resume-btn-yes{padding:6px 16px;border-radius:20px;cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:700;transition:background .15s,border-color .15s,color .15s}
  .pt-resume-btn-no{border:1.5px solid var(--border);background:none;color:var(--muted)}
  .pt-resume-btn-no:hover{background:var(--bg3)}
  .pt-resume-btn-yes{border:0;background:var(--gold);color:#fff}
  .pt-resume-btn-yes:hover{background:var(--brown2)}
  @media(max-width:768px){.pt-resume-dialog{top:50%;bottom:auto;transform:translate(-50%,calc(-50% + 20px))}.pt-resume-dialog.show{transform:translate(-50%,-50%)}}
  @media(prefers-reduced-motion:reduce){.pt-resume-dialog{transition:none}}
</style>
