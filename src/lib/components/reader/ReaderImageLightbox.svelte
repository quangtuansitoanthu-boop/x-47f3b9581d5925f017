<script lang="ts">
  import { onMount, tick } from 'svelte';

  interface Props {
    source: string;
    alt: string;
    onClose: () => void;
  }

  let { source, alt, onClose }: Props = $props();
  let dialog = $state<HTMLElement | null>(null);
  let closeButton = $state<HTMLButtonElement | null>(null);

  function focusableItems(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  }

  function trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !dialog) return;
    const items = focusableItems(dialog);
    if (!items.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    void tick().then(() => closeButton?.focus());
  });
</script>

<div
  class="reader-lightbox"
  role="presentation"
  onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}
>
  <div
    class="reader-lightbox__dialog"
    role="dialog"
    aria-modal="true"
    aria-label={alt ? `Xem ảnh: ${alt}` : 'Xem ảnh minh họa'}
    tabindex="-1"
    bind:this={dialog}
    onkeydown={trapFocus}
  >
    <button class="reader-lightbox__close" type="button" aria-label="Đóng ảnh" bind:this={closeButton} onclick={onClose}>✕</button>
    <img src={source} {alt} />
  </div>
</div>

<style>
  .reader-lightbox{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.92);cursor:zoom-out;animation:lightboxFade .18s ease-out;overscroll-behavior:contain}
  .reader-lightbox__dialog{position:relative;display:grid;max-width:92vw;max-height:88dvh;place-items:center;outline:none;cursor:default}
  .reader-lightbox img{display:block;max-width:92vw;max-height:88dvh;border-radius:8px;object-fit:contain;animation:lightboxImageIn .24s cubic-bezier(.34,1.2,.64,1)}
  .reader-lightbox__close{position:absolute;z-index:1;top:-18px;right:-18px;display:grid;width:44px;height:44px;place-items:center;padding:0;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(20,18,14,.82);color:#fff;cursor:pointer;font:inherit;font-size:18px;line-height:1;transition:background-color .15s,transform .15s}
  .reader-lightbox__close:hover{background:var(--gold);transform:scale(1.06)}
  .reader-lightbox__close:focus-visible{outline:3px solid #fff;outline-offset:3px}
  @keyframes lightboxFade{from{opacity:0}to{opacity:1}}
  @keyframes lightboxImageIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
  @media(max-width:600px){.reader-lightbox{padding:12px}.reader-lightbox__close{top:8px;right:8px}.reader-lightbox img{max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px)}}
  @media(prefers-reduced-motion:reduce){.reader-lightbox,.reader-lightbox img,.reader-lightbox__close{animation:none;transition:none}}
</style>
