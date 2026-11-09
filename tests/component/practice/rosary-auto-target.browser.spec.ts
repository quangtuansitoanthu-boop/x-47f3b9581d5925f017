import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import RosaryScreen from '$lib/components/practice/rosary/RosaryScreen.svelte';

vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/browser/rosary-water', () => ({ createRosaryWater: () => ({ destroy() {}, setEnabled() {}, pulse() {}, invalidate() {} }) }));
vi.mock('$lib/browser/rosary-bead-controller', () => ({ createRosaryBeadController: () => ({ destroy() {}, roll() {} }) }));
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: (node: HTMLDialogElement) => { node.open = true; return { destroy() { node.open = false; } }; } }));

let component: ReturnType<typeof RosaryScreen> | undefined;
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const settle = async () => { for (let index = 0; index < 5; index++) { await Promise.resolve(); flushSync(); } };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  expect(fetch).not.toHaveBeenCalled();
  document.body.replaceChildren(); vi.unstubAllGlobals();
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
async function mountScreen(initialAuto?: { count: number; target: number; playing: boolean; completed: boolean; error: string; intervalMs?: number }) {
  const state = new SvelteMap([['autoState', initialAuto]]);
  const onAutoStart = vi.fn();
  const onAutoPause = vi.fn(); const onAutoResume = vi.fn(); const onAutoStop = vi.fn(); const onDelta = vi.fn();
  component = mount(RosaryScreen, { target: document.body, props: {
    open: true, count: 0, dailyGoal: 1000, direction: 'down', phrase: 'Nam mô A Di Đà Phật',
    progress: 0, sessionCount: 0, size: 108, soundEnabled: true,
    onDailyGoalChange() {}, onDirectionChange() {}, onDelta, onExitRequest() {},
    onPhraseChange() {}, onResetRequest() {}, onSizeChange() {}, onSoundToggle() {}, onAutoStart, onAutoPause, onAutoResume, onAutoStop,
    get autoState() { return state.get('autoState'); },
  } });
  await settle();
  return { state, onAutoStart, onAutoPause, onAutoResume, onAutoStop, onDelta };
}
async function start() {
  const { onAutoStart } = await mountScreen();
  document.querySelector<HTMLButtonElement>('.tt-rosary__options-bar button')!.click(); await settle();
  [...document.querySelectorAll<HTMLButtonElement>('.tt-rosary__modes button')].find(button => button.textContent === 'Tự động gõ mõ')!.click();
  await settle();
  return onAutoStart;
}
it('uses the existing dropdown with recitation presets through10800 while preserving108bead necklace semantics', async () => {
  await start();
  expect(document.querySelector('.tt-rosary__options-bar')?.textContent).toMatch(/Chuỗi\s+108\s+hạt/u);
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Số biến trong phiên"]');
  expect(trigger).not.toBeNull();
  expect(trigger!.textContent).toContain('108 biến');
  expect(trigger!.getAttribute('role')).toBe('combobox');
  trigger!.click(); await settle();
  const dialog = document.querySelector<HTMLDialogElement>('.rosary-select__dialog');
  expect(dialog?.open).toBe(true);
  const choices = [...dialog!.querySelectorAll<HTMLButtonElement>('.rosary-select__option')];
  expect(choices.map(button => button.dataset.value)).toEqual(['108','216','324','540','1080','2160','3240','5400','10800']);
  expect(choices.map(button => button.textContent?.trim())).toEqual([108,216,324,540,1080,2160,3240,5400,10800].map(value => `${value.toLocaleString('vi-VN')} biến`));
});
it('collapses the complete options region and preserves the automatic mode and chosen target when reopened', async () => {
  await mountScreen();
  const toggle = document.querySelector<HTMLButtonElement>('.tt-rosary__options-bar button')!;
  const region = document.querySelector<HTMLElement>('#tt-rosary-options')!;
  expect(toggle.textContent).toBe('Tùy chọn'); expect(toggle.getAttribute('aria-expanded')).toBe('false'); expect(region.hidden).toBe(true);
  expect(document.querySelector('.tt-rosary__modes')?.closest('[hidden]')).toBe(region);
  toggle.click(); await settle();
  expect(toggle.textContent).toBe('Thu gọn'); expect(toggle.getAttribute('aria-expanded')).toBe('true'); expect(region.hidden).toBe(false);
  document.querySelector<HTMLButtonElement>('.tt-rosary__modes button:nth-child(2)')!.click(); await settle();
  document.querySelector<HTMLButtonElement>('button[aria-label="Số biến trong phiên"]')!.click(); await settle();
  document.querySelector<HTMLButtonElement>('.rosary-select__option[data-value="10800"]')!.click(); await settle();
  toggle.click(); await settle();
  expect(toggle.textContent).toBe('Tùy chọn'); expect(toggle.getAttribute('aria-expanded')).toBe('false'); expect(region.hidden).toBe(true);
  for (const selector of ['.tt-rosary__modes', '.tt-rosary__auto-settings', '.tt-rosary__auto-encouragement']) {
    expect(document.querySelector(selector)?.closest('[hidden]')).toBe(region);
  }
  toggle.click(); await settle();
  expect(toggle.textContent).toBe('Thu gọn'); expect(region.hidden).toBe(false);
  expect(document.querySelector('.tt-rosary__modes button:nth-child(2)')?.getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('button[aria-label="Số biến trong phiên"]')?.textContent).toContain('10.800 biến');
});
it('folding active rhythm options never changes playback or count and leaves pause/resume controls accessible', async () => {
  const active = { count: 12, target: 10800, playing: true, completed: false, error: '' };
  const callbacks = await mountScreen(active);
  const toggle = document.querySelector<HTMLButtonElement>('.tt-rosary__options-bar button')!;
  toggle.click(); await settle(); toggle.click(); await settle();
  expect(document.querySelector<HTMLElement>('#tt-rosary-options')!.hidden).toBe(true);
  expect(callbacks.onAutoStart).not.toHaveBeenCalled(); expect(callbacks.onAutoPause).not.toHaveBeenCalled(); expect(callbacks.onAutoStop).not.toHaveBeenCalled(); expect(callbacks.onDelta).not.toHaveBeenCalled();
  const action = document.querySelector<HTMLButtonElement>('.tt-rosary__auto-actions .tt-rosary__count-button')!;
  expect(action.textContent).toBe('Tạm dừng'); expect(action.closest('[hidden]')).toBeNull(); expect(action.disabled).toBe(false);
  action.click(); await settle(); expect(callbacks.onAutoPause).toHaveBeenCalledOnce();
  callbacks.state.set('autoState', { ...active, playing: false }); await settle();
  expect(action.textContent).toBe('Tiếp tục'); expect(action.closest('[hidden]')).toBeNull();
  action.click(); await settle(); expect(callbacks.onAutoResume).toHaveBeenCalledOnce(); expect(callbacks.onAutoStop).not.toHaveBeenCalled(); expect(callbacks.onDelta).not.toHaveBeenCalled();
});
it('starts the chosen10800recitations at the existing default tempo without a data request', async () => {
  const onAutoStart = await start();
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Số biến trong phiên"]');
  expect(trigger).not.toBeNull(); trigger!.click(); await settle();
  document.querySelector<HTMLButtonElement>('.rosary-select__option[data-value="10800"]')!.click(); await settle();
  expect(trigger!.textContent).toContain('10.800 biến');
  expect(document.querySelector('.rosary-select__dialog')).toBeNull();
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Bắt đầu gõ mõ')!.click(); await settle();
  expect(onAutoStart).toHaveBeenCalledExactlyOnceWith({ intervalMs: 1000, target: 10800 });
  expect(document.querySelector<HTMLElement>('#tt-rosary-options')!.hidden).toBe(true);
  expect(document.querySelector('.tt-rosary__options-bar button')?.textContent).toBe('Tùy chọn');
  expect(document.querySelector('.tt-rosary__auto-actions')?.closest('[hidden]')).toBeNull();
  expect(document.querySelector('.tt-rosary__options-bar')?.textContent).toMatch(/Chuỗi\s+108\s+hạt/u);
});

it('allows tempo changes while paused, keeps the target locked, and resumes with the selected tempo', async () => {
  const paused = { count: 12, target: 10800, playing: false, completed: false, error: '', intervalMs: 1000 };
  const callbacks = await mountScreen(paused);
  document.querySelector<HTMLButtonElement>('.tt-rosary__options-bar button')!.click(); await settle();
  const tempo = document.querySelector<HTMLButtonElement>('button[aria-label="Tốc độ"]')!;
  const target = document.querySelector<HTMLButtonElement>('button[aria-label="Số biến trong phiên"]')!;
  expect(Boolean(document.querySelector<HTMLElement>('.tt-rosary__auto-tempo')!.inert)).toBe(false);
  expect(document.querySelector<HTMLElement>('.tt-rosary__auto-target')!.inert).toBe(true);
  expect(target.textContent).toContain('10.800 biến');
  tempo.click(); await settle();
  document.querySelector<HTMLButtonElement>('.rosary-select__option[data-value="750"]')!.click(); await settle();
  callbacks.state.set('autoState', { ...paused }); await settle();
  expect(tempo.textContent).toContain('80 nhịp/phút');
  document.querySelector<HTMLButtonElement>('.tt-rosary__auto-actions .tt-rosary__count-button')!.click(); await settle();
  expect(callbacks.onAutoResume).toHaveBeenCalledExactlyOnceWith(750);
  expect(callbacks.onAutoStart).not.toHaveBeenCalled();
  expect(callbacks.onDelta).not.toHaveBeenCalled();
  callbacks.state.set('autoState', { ...paused, playing: true, intervalMs: 750 }); await settle();
  expect(document.querySelector<HTMLElement>('.tt-rosary__auto-tempo')!.inert).toBe(true);
  expect(document.querySelector<HTMLElement>('.tt-rosary__auto-target')!.inert).toBe(true);
  callbacks.state.set('autoState', { ...paused, error: 'retry-needed' }); await settle();
  expect(document.querySelector<HTMLElement>('.tt-rosary__auto-target')!.inert).toBe(true);
});
