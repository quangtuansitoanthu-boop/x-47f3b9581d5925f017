import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import Picker from '../../../src/lib/components/layout/NativeSelectPicker.svelte';

vi.mock('../../../src/lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));

let component: ReturnType<typeof Picker> | undefined;
const descriptors = ['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

async function setup(props?: { principal?: string | null; route?: string }) {
  document.body.innerHTML = '<form><label for="sound">Âm thanh</label><fieldset><select id="sound" name="sound" required><option value="">Không phát</option><optgroup label="Tự nhiên"><option value="rain">Mưa</option><option value="disabled" disabled>Tắt</option><option value="hidden" hidden>Ẩn</option></optgroup></select></fieldset></form>';
  component = mount(Picker, { target: document.body, props });
  await settle();
  return document.querySelector('select')!;
}
async function open(select: HTMLSelectElement, mode = 'pointer') {
  const event = mode === 'pointer' ? new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
    : new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' });
  select.dispatchEvent(event);
  if (mode === 'pointer') {
    select.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
    select.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  }
  await settle(); return event;
}
async function cancel() {
  document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
  await settle();
}

it.each(['pointer', 'keyboard'])('preserves native form/validation and dispatches exactly one input/change via %s', async mode => {
  const select = await setup(); const input = vi.fn(); const change = vi.fn(); const fetch = vi.fn();
  select.addEventListener('input', input); select.addEventListener('change', change); vi.stubGlobal('fetch', fetch);
  expect(select.checkValidity()).toBe(false);
  await open(select, mode);
  expect(document.querySelector('dialog')?.open).toBe(true);
  expect(document.querySelector('h2')?.textContent).toBe('Âm thanh');
  expect(document.querySelector<HTMLButtonElement>('[data-value="disabled"]')?.disabled).toBe(true);
  expect(document.querySelector('[data-value="hidden"]')).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-value="rain"]')!.click(); await settle();
  expect(new FormData(document.querySelector('form')!).get('sound')).toBe('rain');
  expect(select.checkValidity()).toBe(true); expect(input).toHaveBeenCalledOnce(); expect(change).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled(); expect(document.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(select);
});

it('cancels without changing, submitting, fetching or losing the opener focus', async () => {
  const select = await setup(); const change = vi.fn(); const submit = vi.fn(); const fetch = vi.fn();
  select.addEventListener('change', change); document.querySelector('form')!.addEventListener('submit', submit); vi.stubGlobal('fetch', fetch);
  await open(select); await cancel();
  expect(select.value).toBe(''); expect(change).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(document.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(select);
});

it('selecting the current value leaves existing change handlers untouched', async () => {
  const select = await setup(); const change = vi.fn(); select.addEventListener('change', change);
  await open(select); document.querySelector<HTMLButtonElement>('[data-value=""]')!.click(); await settle();
  expect(change).not.toHaveBeenCalled(); expect(document.querySelector('dialog')).toBeNull();
});

it.each(['disabled', 'multiple', 'listbox', 'hidden', 'fieldset', 'inert', 'editor'])('keeps %s selects on the native fallback', async mode => {
  const select = await setup();
  if (mode === 'disabled') select.disabled = true;
  if (mode === 'multiple') select.multiple = true;
  if (mode === 'listbox') select.size = 3;
  if (mode === 'hidden') select.hidden = true;
  if (mode === 'fieldset') select.closest('fieldset')!.disabled = true;
  if (mode === 'inert') select.parentElement!.setAttribute('inert', '');
  if (mode === 'editor') select.parentElement!.classList.add('ck');
  const event = await open(select);
  expect(event.defaultPrevented).toBe(false); expect(document.querySelector('dialog')).toBeNull();
});

it.each(['principal', 'route'] as const)('closes without a change when %s changes', async key => {
  const state = new SvelteMap([['principal', 'owner-a'], ['route', '/admin']]);
  const select = await setup({ get principal() { return state.get('principal'); }, get route() { return state.get('route'); } });
  const change = vi.fn(); select.addEventListener('change', change); await open(select);
  state.set(key, key === 'principal' ? 'owner-b' : '/ca-nhan'); await settle();
  expect(document.querySelector('dialog')).toBeNull(); expect(select.value).toBe(''); expect(change).not.toHaveBeenCalled();
});

it('reflects changed options and prevents selecting a newly disabled group', async () => {
  const select = await setup(); await open(select);
  select.querySelector('option[value="rain"]')!.firstChild!.textContent = 'Mưa nhẹ'; await settle();
  expect(document.querySelector('[data-value="rain"]')?.textContent).toBe('Mưa nhẹ');
  select.querySelector('optgroup')!.disabled = true; await settle();
  expect(document.querySelector<HTMLButtonElement>('[data-value="rain"]')?.disabled).toBe(true);
});

it.each(['remove', 'fieldset', 'hidden'])('closes when the current native owner becomes unavailable: %s', async mode => {
  const select = await setup(); await open(select);
  if (mode === 'remove') select.remove();
  if (mode === 'fieldset') select.closest('fieldset')!.disabled = true;
  if (mode === 'hidden') select.parentElement!.hidden = true;
  await settle(); expect(document.querySelector('dialog')).toBeNull();
});

it('cleans up document listeners after unmount', async () => {
  const select = await setup(); await unmount(component!); component = undefined;
  const event = await open(select);
  expect(event.defaultPrevented).toBe(false); expect(document.querySelector('dialog')).toBeNull();
});

it('does not open during a pointer press or a canceled gesture, and opens only on completed activation', async () => {
  const select = await setup();
  const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
  select.dispatchEvent(down); await settle();
  expect(down.defaultPrevented).toBe(true);
  expect(document.querySelector('dialog')).toBeNull();
  select.dispatchEvent(new Event('pointercancel', { bubbles: true })); await settle();
  expect(document.querySelector('dialog')).toBeNull();
  await open(select);
  expect(document.querySelector('dialog')?.open).toBe(true);
});

it('ignores the opening compatibility click without blocking the next real option press', async () => {
  const select = await setup();
  const send = (target: Element, type: string) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, detail: type === 'click' ? 1 : 0 }));
  send(select, 'pointerdown'); send(select, 'pointerup'); await settle();
  const picker = document.querySelector('dialog')!;
  expect(picker.open).toBe(true);
  // LePhat/WebKit có thể bỏ click, hoặc retarget nó vào backdrop vừa xuất hiện.
  send(picker, 'click'); await settle();
  expect(document.querySelector('dialog')?.open).toBe(true);
  expect(select.value).toBe('');
  const option = document.querySelector<HTMLButtonElement>('[data-value="rain"]')!;
  send(option, 'pointerdown'); send(option, 'pointerup'); send(option, 'click'); await settle();
  expect(select.value).toBe('rain'); expect(document.querySelector('dialog')).toBeNull();
});

it('does not open after a drag or an outside release', async () => {
  const select = await setup();
  select.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  select.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientY: 30 }));
  select.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 })); await settle();
  expect(document.querySelector('dialog')).toBeNull();
  select.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  document.body.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 })); await settle();
  expect(document.querySelector('dialog')).toBeNull();
});
