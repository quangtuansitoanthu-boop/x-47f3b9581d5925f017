import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import LePhatScreen from '$lib/components/practice/le-phat/LePhatScreen.svelte';
import { translations } from '$lib/i18n/translations';

const audio = vi.hoisted(() => ({ stop: vi.fn(), release: vi.fn(), request: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi', t: translations.vi }) }));
vi.mock('$lib/browser/ambient-sound', () => ({
  AMBIENT_SOUND_OPTIONS: [], getAmbientSoundLabel: () => '',
  createAmbientSoundController: () => ({ start: vi.fn(), stop: audio.stop, destroy: vi.fn() }),
}));
vi.mock('$lib/browser/wake-lock', () => ({ createWakeLockController: () => ({
  request: audio.request, release: audio.release, destroy: vi.fn(),
}) }));
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: () => ({ destroy() {} }) }));

let component: ReturnType<typeof LePhatScreen> | undefined;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Audio', class { loop = false; preload = ''; src = ''; currentTime = 0; play() { return Promise.resolve(); } pause() {} });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  expect(fetch).not.toHaveBeenCalled();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('pauses without losing the count, resumes and completes exactly once with the selected Buddha', async () => {
  const state = new SvelteMap<string, unknown>([['paused', false], ['id', 'routine-step-1']]);
  const complete = vi.fn();
  const exit = vi.fn();
  component = mount(LePhatScreen, { target: document.body, props: {
    open: true, principal: 'owner-a',
    get routinePaused() { return Boolean(state.get('paused')); },
    get routineSetup() { return { id: String(state.get('id')), phrase: 'a-di-da', count: 2 }; },
    onRoutineComplete: complete, onExitRequest: exit,
  } });
  await settle();
  const counter = () => document.querySelector<HTMLButtonElement>('.lp-fullscreen-counter')!;
  counter().click(); await settle();
  expect(counter().textContent).toContain('1');
  state.set('paused', true); await settle();
  const released = audio.release.mock.calls.length;
  counter().click(); await settle();
  expect(counter().textContent).toContain('1');
  expect(complete).not.toHaveBeenCalled();
  expect(audio.stop).toHaveBeenCalled();
  expect(released).toBeGreaterThan(0);
  state.set('paused', false); await settle();
  counter().click(); await settle();
  expect(complete).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledWith(2, expect.objectContaining({ id: 'a-di-da' }));
  expect(exit).not.toHaveBeenCalled();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
  expect(complete).toHaveBeenCalledOnce();
  state.set('id', 'routine-step-2'); await settle();
  expect(counter().textContent).toContain('0');
});

it('keeps standalone prostrations manual and does not trigger routine completion', async () => {
  const complete = vi.fn();
  component = mount(LePhatScreen, { target: document.body, props: {
    open: true, routinePaused: true, onRoutineComplete: complete, onExitRequest() {},
  } });
  await settle();
  expect(document.querySelector('.lp-fullscreen-counter')).toBeNull();
  const start = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(translations.vi.practice.startBowing));
  expect(start).toBeDefined();
  start!.click(); await settle();
  document.querySelector<HTMLButtonElement>('.lp-fullscreen-counter')!.click(); await settle();
  expect(document.querySelector('.lp-fullscreen-counter')?.textContent).toContain('1');
  expect(complete).not.toHaveBeenCalled();
});
