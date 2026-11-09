import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DailyRoutineEditor from '$lib/components/practice/personal/DailyRoutineEditor.svelte';
import { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
import { ROSARY_PHRASES } from '$lib/domain/practice/guided-sessions';

vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
let component: ReturnType<typeof DailyRoutineEditor> | undefined;
const settle = async () => { for (let index = 0; index < 5; index++) { await Promise.resolve(); flushSync(); } };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === label)!;
function change(input: HTMLInputElement, value: string) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); flushSync(); }
beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; expect(fetch).not.toHaveBeenCalled(); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals();
});
async function setup() {
  const owner = createPersonalPracticeStorage(localStorage, 'editor-validation');
  const save = vi.spyOn(owner, 'saveRoutine'); const run = vi.fn();
  component = mount(DailyRoutineEditor, { target: document.body, props: {
    storage: owner, onRun: run,
    dedicationTemplates: [{ id: 'local-test', title: 'HỒI HƯỚNG', text: 'HỒI HƯỚNG\nNguyện đem công đức này.' }],
  } });
  await settle(); button('Tạo thời khóa mới').click(); await settle();
  const phrase = [...document.querySelectorAll<HTMLLabelElement>('label')].find(node => node.textContent?.includes('Danh hiệu / nội dung hành trì'))!.querySelector<HTMLInputElement>('input')!;
  return { owner, save, run, phrase };
}
it('blocks an unsupported121character custom recitation before either saving or starting', async () => {
  const { save, run, phrase } = await setup(); change(phrase, 'A'.repeat(121));
  button('Lưu thời khóa').click(); await settle();
  expect(save).not.toHaveBeenCalled(); expect(document.querySelector('[role="status"]')?.textContent).toContain('120');
  button('Bắt đầu thời khóa').click(); await settle();
  expect(save).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it('preserves long canonical recitations and trims surrounding whitespace before saving', async () => {
  const { owner, save, phrase } = await setup();
  const canonical = ROSARY_PHRASES.find(item => item.length > 120)!;
  expect(canonical).toBeDefined(); change(phrase, `  ${canonical}  `);
  button('Lưu thời khóa').click(); await settle();
  expect(save).toHaveBeenCalledOnce();
  expect(owner.getRoutines()[0].steps.find(step => step.kind === 'rosary')).toMatchObject({ phrase: canonical });
});
it('accepts a120character custom recitation without truncating its wording', async () => {
  const { owner, phrase } = await setup(); const text = 'A'.repeat(120); change(phrase, ` ${text} `);
  button('Lưu thời khóa').click(); await settle();
  expect(owner.getRoutines()[0].steps.find(step => step.kind === 'rosary')).toMatchObject({ phrase: text });
});
