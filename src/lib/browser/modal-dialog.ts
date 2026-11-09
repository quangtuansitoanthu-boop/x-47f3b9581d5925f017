import { tick } from 'svelte';
import { acquireScrollLock } from './scroll-lock';


const modalStack: HTMLDialogElement[] = [];
const topModal = () => [...modalStack].reverse().find(item => item.isConnected && (item.open || item.hasAttribute?.('open')));
function closeModal(dialog: HTMLDialogElement) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

/** Use the same cancellation semantics for hardware Back as for Escape. */
export function dismissTopModal(): boolean {
  const dialog = topModal();
  if (!dialog) return false;
  if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) closeModal(dialog);
  return true;
}

/** Native top-layer modality, with keyboard boundaries and teardown-safe focus. */
export function modalDialog(dialog: HTMLDialogElement) {
  let disposed = false;
  let opened = false;
  let releaseScroll: (() => void) | undefined;
  let returnFocus: HTMLElement | null = null;
  let fallback = false;
  let releaseFallback: (() => void) | undefined;

  function containFocus(event: FocusEvent): void {
    if (topModal() === dialog && event.target instanceof Node && !dialog.contains(event.target)) {
      (dialog.querySelector<HTMLElement>('[data-modal-focus]') ?? dialog).focus({ preventScroll: true });
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (fallback && event.key === 'Escape' && topModal() === dialog) {
      event.preventDefault(); event.stopPropagation();
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) closeModal(dialog);
      return;
    }
    if (event.key !== 'Tab' || event.defaultPrevented || topModal() !== dialog) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
    )].filter((element) => element.getClientRects().length && !element.closest('[inert]'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    const atStart = active === dialog || (active instanceof HTMLElement && active.hasAttribute('data-modal-focus') && !controls.includes(active));
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
    } else if (event.shiftKey && (active === first || atStart || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || atStart || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  // Let the preceding chooser finish restoring focus before opening its successor.
  void tick().then(() => {
    if (disposed || !dialog.isConnected) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fallback = typeof dialog.showModal !== 'function' || typeof dialog.close !== 'function';
    if (!fallback) dialog.showModal();
    else {
      // iOS 14–15.3 has no native dialog API. Keep the same dialog content and
      // place it above route stacking contexts without installing another owner.
      const anchor = document.createComment('modal-position');
      dialog.before(anchor);
      const layer = document.createElement('div');
      Object.assign(layer.style, { position: 'fixed', inset: '0', display: 'grid', placeItems: 'center',
        overflow: 'auto', zIndex: String(2147483000 + modalStack.length), background: 'var(--practice-dialog-backdrop)' });
      const previous = ['role', 'aria-modal', 'tabindex', 'style'].map(name => [name, dialog.getAttribute(name)] as const);
      dialog.setAttribute('open', '');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('tabindex', '-1');
      document.body.append(layer);
      layer.append(dialog);
      const layout = getComputedStyle(dialog);
      // Full-screen consumers own their flex/grid layout, fixed positioning and
      // clickable backdrop. Only supply missing defaults for a compact dialog.
      if (!layout.display || layout.display === 'none' || layout.display === 'inline') dialog.style.display = 'block';
      if (layout.position !== 'fixed' && layout.position !== 'absolute'
        && !dialog.style.maxHeight && (!layout.maxHeight || layout.maxHeight === 'none')) {
        dialog.style.maxHeight = 'calc(100vh - var(--space-page) * 2 - env(safe-area-inset-top) - env(safe-area-inset-bottom))';
      }
      document.addEventListener('focusin', containFocus, true);
      releaseFallback = () => {
        document.removeEventListener('focusin', containFocus, true);
        // Không đưa trở lại DOM dialog đã bị Svelte gỡ khi đóng nhánh {#if}.
        if (anchor.isConnected && dialog.isConnected) anchor.replaceWith(dialog);
        else { anchor.remove(); dialog.remove(); }
        layer.remove();
        for (const [name, value] of previous) {
          if (value === null) dialog.removeAttribute(name);
          else dialog.setAttribute(name, value);
        }
      };
    }
    modalStack.push(dialog);
    opened = true;
    releaseScroll = acquireScrollLock();
    dialog.addEventListener('keydown', keydown);
    (dialog.querySelector<HTMLElement>('[data-modal-focus]') ?? dialog).focus({ preventScroll: true });
  });

  return {
    destroy(): void {
      disposed = true;
      if (!opened) return;
      const index = modalStack.indexOf(dialog);
      if (index !== -1) modalStack.splice(index, 1);
      dialog.removeEventListener('keydown', keydown);
      closeModal(dialog);
      releaseFallback?.();
      releaseScroll?.();
      // Do not steal focus from a successor opened during the same update.
      const activeDialog = topModal();
      if (returnFocus?.isConnected && (!activeDialog || activeDialog.contains(returnFocus))) {
        returnFocus.focus({ preventScroll: true });
      }
    },
  };
}
