import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { dismissTopModal, modalDialog } from '../../src/lib/browser/modal-dialog';

afterEach(() => vi.unstubAllGlobals());

it('Android Back dismisses the top native modal before the underlying screen', async () => {
  class Element extends EventTarget {
    isConnected = true;
    open = false;
    focus = vi.fn();
    contains = () => false;
    querySelector = () => null;
    showModal = () => { this.open = true; };
    close = () => { this.open = false; };
  }
  vi.stubGlobal('HTMLElement', Element);
  const previous = new Element();
  vi.stubGlobal('document', { activeElement: previous, body: { style: { overflow: 'auto' } }, querySelector: () => null });
  const first = new Element(); const second = new Element();
  const a = modalDialog(first as unknown as HTMLDialogElement);
  await tick();
  const b = modalDialog(second as unknown as HTMLDialogElement);
  await tick();
  const cancel = vi.fn((event: Event) => event.preventDefault());
  second.addEventListener('cancel', cancel);
  expect(dismissTopModal()).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(first.open).toBe(true);
  b.destroy();
  expect(dismissTopModal()).toBe(true);
  expect(first.open).toBe(false);
  a.destroy();
  expect(dismissTopModal()).toBe(false);
  expect(document.body.style.overflow).toBe('auto');
});

it('returns focus inside the parent modal without stealing it from a successor', async () => {
  class Element extends EventTarget {
    isConnected = true;
    open = false;
    parent: Element | null = null;
    focus = vi.fn();
    querySelector = () => null;
    contains = (node: Element): boolean => node === this || node.parent === this;
    showModal = () => { this.open = true; };
    close = () => { this.open = false; };
  }
  vi.stubGlobal('HTMLElement', Element);
  const previous = new Element();
  const parent = new Element();
  const opener = new Element(); opener.parent = parent;
  const doc = { activeElement: previous, body: { style: { overflow:'auto' } }, querySelector: () => parent.open ? parent : null };
  vi.stubGlobal('document', doc);
  const a=modalDialog(parent as unknown as HTMLDialogElement); await tick();
  doc.activeElement=opener;
  const child=new Element(); const b=modalDialog(child as unknown as HTMLDialogElement); await tick();
  b.destroy();
  expect(opener.focus).toHaveBeenCalledTimes(1);
  opener.focus.mockClear();
  doc.activeElement=opener;
  const child2=new Element(); const c=modalDialog(child2 as unknown as HTMLDialogElement); await tick();
  const successor=new Element(); const d=modalDialog(successor as unknown as HTMLDialogElement); await tick();
  c.destroy();
  expect(opener.focus).not.toHaveBeenCalled();
  expect(successor.open).toBe(true);
  d.destroy(); a.destroy();
});
