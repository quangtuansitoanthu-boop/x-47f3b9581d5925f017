import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { confirmInApp, promptInApp } from '$lib/browser/app-dialog';
import { dismissTopModal, modalDialog } from '$lib/browser/modal-dialog';
import Harness from './app-dialog-harness.svelte';
import PracticeConfirmDialog from '$lib/components/practice/dialog/PracticeConfirmDialog.svelte';

const sessionMocks = vi.hoisted(() => ({
  snapshot: {
    authenticated: true,
    csrfToken: 'initial-token',
    user: { id: 'dialog-owner-a', role: 'admin' } as { id: string; role: string } | null,
  },
}));
vi.mock('$lib/stores/session.svelte', () => ({
  getBrowserSessionSnapshot: () => sessionMocks.snapshot,
  SESSION_CHANGE_EVENT: 'test:app-dialog-session-change',
}));

let component: ReturnType<typeof Harness> | undefined;
const descriptors = ['showModal', 'close'].map(name =>
  [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
const fetchSpy = vi.fn();
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };

beforeEach(async () => {
  sessionMocks.snapshot = {
    authenticated: true, csrfToken: 'initial-token', user: { id: 'dialog-owner-a', role: 'admin' },
  };
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.open = false; },
  });
  component = mount(Harness, { target: document.body });
  await settle();
  document.querySelector<HTMLButtonElement>('[data-dialog-opener]')!.focus();
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

function dialog(): HTMLDialogElement {
  return document.querySelector<HTMLDialogElement>('dialog.app-dialog')!;
}

it.each([
  ['confirm', false], ['confirm', true], ['prompt', false], ['prompt', true],
] as const)('allows forward Tab from the initial %s control (fallback: %s)', async (kind, fallback) => {
  if (fallback) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
  }
  const result = kind === 'prompt' ? promptInApp('Nhập lời nhắc', 'Nam mô') : confirmInApp('Tiếp tục?');
  await settle();
  const controls = [...dialog().querySelectorAll<HTMLElement>('input,button')];
  for (const control of controls) Object.defineProperty(control, 'getClientRects', { configurable: true, value: () => [{}] });
  expect(document.activeElement).toBe(controls[0]);
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  controls[0].dispatchEvent(event);
  // JSDOM does not perform the browser's default Tab focus movement. Model
  // that default only when the real dialog handler has not prevented it.
  if (!event.defaultPrevented) controls[1].focus();
  expect(document.activeElement).toBe(controls[1]);
  dismissTopModal();
  await expect(result).resolves.toBe(kind === 'prompt' ? null : false);
});

it.each([false, true])('enters controls from a focused section and preserves Shift-Tab wrapping (fallback: %s)', async fallback => {
  if (fallback) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
  }
  const panel = document.createElement('dialog');
  panel.innerHTML = '<section tabindex="-1" data-modal-focus><button>Đầu</button><button>Cuối</button></section>';
  document.body.append(panel);
  const owner = modalDialog(panel);
  try {
    await settle();
    const section = panel.querySelector<HTMLElement>('section')!;
    const controls = [...panel.querySelectorAll<HTMLButtonElement>('button')];
    for (const control of controls) Object.defineProperty(control, 'getClientRects', { configurable: true, value: () => [{}] });
    expect(document.activeElement).toBe(section);
    section.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(controls[0]);
    controls[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(controls[controls.length - 1]);
  } finally { owner.destroy(); panel.remove(); }
});

it.each(['confirm', 'hardware Back'] as const)('resolves %s and cleans up when native dialog methods are unavailable', async action => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
  const previousOverflow = document.body.style.overflow;
  const previousChildren = document.body.childElementCount;
  const result = confirmInApp('Xác nhận trên WebView cũ?');
  await settle();
  expect(dialog().hasAttribute('open')).toBe(true);
  expect(dialog().getAttribute('role')).toBe('dialog');
  expect(dialog().getAttribute('aria-modal')).toBe('true');
  if (action === 'confirm') dialog().querySelector<HTMLButtonElement>('button.primary')!.click();
  else expect(dismissTopModal()).toBe(true);
  await expect(result).resolves.toBe(action === 'confirm');
  await settle();
  expect(dialog()).toBeNull();
  expect(dismissTopModal()).toBe(false);
  expect(document.body.style.overflow).toBe(previousOverflow);
  expect(document.body.childElementCount).toBe(previousChildren);
  expect(document.activeElement).toBe(document.querySelector('[data-dialog-opener]'));
});

it('preserves the full-screen practice confirmation layout and its backdrop cancellation without native dialog methods', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
  const cancel = vi.fn(), confirm = vi.fn();
  const practice = mount(PracticeConfirmDialog, { target: document.body, props: {
    open: true, title: 'Rời công cụ?', description: 'Giữ nguyên công phu đã ghi.',
    cancelLabel: 'Ở lại', confirmLabel: 'Rời', onCancel: cancel, onConfirm: confirm,
  } });
  try {
    flushSync();
    const overlay = document.querySelector<HTMLDialogElement>('dialog.practice-confirm')!;
    // These are the consumer's existing full-screen flex styles; the action
    // must not replace them with a compact, relatively positioned dialog.
    Object.assign(overlay.style, { display: 'flex', position: 'fixed', inset: '0', maxHeight: 'none' });
    await settle();
    expect(overlay.style.display).toBe('flex');
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.maxHeight).toBe('none');
    overlay.click();
    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  } finally { await unmount(practice); }
});

it('keeps keyboard focus inside a fallback dialog when Array.prototype.at is unavailable', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
  const result = confirmInApp('Giữ focus trên WebView cũ?');
  await settle();
  const buttons = [...dialog().querySelectorAll<HTMLButtonElement>('button')];
  for (const button of buttons) Object.defineProperty(button, 'getClientRects', { configurable: true, value: () => [{}] });
  buttons[0].focus();
  const previousAt = Object.getOwnPropertyDescriptor(Array.prototype, 'at');
  try {
    Object.defineProperty(Array.prototype, 'at', { configurable: true, value: undefined });
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  } finally {
    if (previousAt) Object.defineProperty(Array.prototype, 'at', previousAt);
    else Reflect.deleteProperty(Array.prototype, 'at');
  }
  expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  dismissTopModal();
  await expect(result).resolves.toBe(false);
});

it.each([false, true])('resolves a confirmation from the actual %s action and restores focus', async accepted => {
  const result = confirmInApp('Xóa bản tải trên thiết bị?');
  await settle();
  expect(dialog().open).toBe(true);
  expect(dialog().getAttribute('aria-describedby')).toBe('app-dialog-message');
  expect(document.querySelector('#app-dialog-message')?.textContent).toBe('Xóa bản tải trên thiết bị?');
  const buttons = dialog().querySelectorAll<HTMLButtonElement>('button');
  expect(buttons).toHaveLength(2);
  buttons[accepted ? 1 : 0].click();
  await expect(result).resolves.toBe(accepted);
  await settle();
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(document.querySelector('[data-dialog-opener]'));
});

it('keeps Escape within the top dialog and resolves native cancellation as false', async () => {
  const underlyingEscape = vi.fn((event: KeyboardEvent) => {
    if (event.key === 'Escape') throw new Error('Underlying screen received Escape');
  });
  document.addEventListener('keydown', underlyingEscape);
  try {
    const result = confirmInApp('Đóng bản đang soạn?');
    await settle();
    dialog().querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));
    expect(underlyingEscape).not.toHaveBeenCalled();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await expect(result).resolves.toBe(false);
    await settle();
    expect(dialog()).toBeNull();
  } finally {
    document.removeEventListener('keydown', underlyingEscape);
  }
});

it('shows queued requests in order without accepting the next request from the first action', async () => {
  const first = confirmInApp('Yêu cầu thứ nhất');
  const second = confirmInApp('Yêu cầu thứ hai');
  const secondResolved = vi.fn();
  void second.then(secondResolved);
  await settle();
  expect(document.querySelectorAll('dialog.app-dialog')).toHaveLength(1);
  expect(dialog().textContent).toContain('Yêu cầu thứ nhất');
  dialog().querySelector<HTMLButtonElement>('button.primary')!.click();
  await expect(first).resolves.toBe(true);
  await settle();
  expect(secondResolved).not.toHaveBeenCalled();
  expect(document.querySelectorAll('dialog.app-dialog')).toHaveLength(1);
  expect(dialog().textContent).toContain('Yêu cầu thứ hai');
  dialog().querySelector<HTMLButtonElement>('button')!.click();
  await expect(second).resolves.toBe(false);
});

it('preserves prompt default text, returns edited text, and returns null on cancel', async () => {
  const accepted = promptInApp('Nhập liên kết', 'https://quangtu.vn/phap-thoai');
  await settle();
  const input = dialog().querySelector<HTMLInputElement>('input')!;
  expect(input.value).toBe('https://quangtu.vn/phap-thoai');
  input.value = 'https://quangtu.vn/tu-tap';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  dialog().querySelector<HTMLButtonElement>('button.primary')!.click();
  await expect(accepted).resolves.toBe('https://quangtu.vn/tu-tap');
  await settle();
  const canceled = promptInApp('Nhập liên kết khác', 'giá trị ban đầu');
  await settle();
  dialog().querySelector<HTMLButtonElement>('button')!.click();
  await expect(canceled).resolves.toBeNull();
});

it('submits an empty prompt with Enter without confusing it with cancellation', async () => {
  const result = promptInApp('Nhập liên kết', 'liên kết cũ');
  await settle();
  const input = dialog().querySelector<HTMLInputElement>('input')!;
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  await expect(result).resolves.toBe('');
  await settle();
  expect(dialog()).toBeNull();
});

it('settles active and queued requests safely when the root host unmounts', async () => {
  const confirmation = confirmInApp('Xóa dữ liệu?');
  const prompt = promptInApp('Nhập giá trị', 'chưa lưu');
  await settle();
  await unmount(component!);
  component = undefined;
  await expect(confirmation).resolves.toBe(false);
  await expect(prompt).resolves.toBeNull();
  expect(dialog()).toBeNull();
  await expect(confirmInApp('Không còn host')).resolves.toBe(false);
  await expect(promptInApp('Không còn host')).resolves.toBeNull();
});

it.each(['logout', 'account', 'role'] as const)('cancels active and queued requests when session %s changes', async mode => {
  const confirmation = confirmInApp('Xóa dữ liệu của tài khoản hiện tại?');
  const prompt = promptInApp('Nhập giá trị riêng tư', 'bản nháp');
  await settle();
  expect(dialog().open).toBe(true);
  if (mode === 'logout') {
    sessionMocks.snapshot = { authenticated: false, csrfToken: '', user: null };
  } else {
    sessionMocks.snapshot = {
      ...sessionMocks.snapshot,
      user: mode === 'account'
        ? { id: 'dialog-owner-b', role: 'admin' }
        : { id: 'dialog-owner-a', role: 'user' },
    };
  }
  window.dispatchEvent(new Event('test:app-dialog-session-change'));
  await expect(confirmation).resolves.toBe(false);
  await expect(prompt).resolves.toBeNull();
  await settle();
  expect(dialog()).toBeNull();
  const fresh = confirmInApp('Yêu cầu mới sau thay đổi tài khoản');
  await settle();
  expect(dialog().textContent).toContain('Yêu cầu mới sau thay đổi tài khoản');
  dialog().querySelector<HTMLButtonElement>('button')!.click();
  await expect(fresh).resolves.toBe(false);
});

it('preserves active and queued requests during a same-identity token refresh', async () => {
  const confirmation = confirmInApp('Yêu cầu đang xác nhận');
  const prompt = promptInApp('Yêu cầu đang xếp hàng', 'giá trị chờ');
  const resolved = vi.fn();
  void confirmation.then(resolved);
  void prompt.then(resolved);
  await settle();
  sessionMocks.snapshot = { ...sessionMocks.snapshot, csrfToken: 'refreshed-token' };
  window.dispatchEvent(new Event('test:app-dialog-session-change'));
  await settle();
  expect(resolved).not.toHaveBeenCalled();
  expect(dialog().textContent).toContain('Yêu cầu đang xác nhận');
  dialog().querySelector<HTMLButtonElement>('button.primary')!.click();
  await expect(confirmation).resolves.toBe(true);
  await settle();
  expect(dialog().querySelector<HTMLInputElement>('input')?.value).toBe('giá trị chờ');
  dialog().querySelector<HTMLButtonElement>('button')!.click();
  await expect(prompt).resolves.toBeNull();
});
