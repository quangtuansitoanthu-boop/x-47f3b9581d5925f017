// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './copying-editor-harness.svelte';
import { setRichCopySelection, richCopySelection, richCopyText } from '../../../src/lib/browser/copying-rich-text';

import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import ts from 'typescript';

let instance: ReturnType<typeof Harness> | undefined;
afterEach(async () => { if (instance) await unmount(instance); instance = undefined; document.body.replaceChildren(); });
function setup(props = {}) {
  instance = mount(Harness, { target: document.body, props }); flushSync();
  const editor = document.getElementById('copy-text')!; editor.focus();
  return { editor, text: () => instance!.text() };
}
function paste(editor: HTMLElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? text : '<img src=x>' } });
  editor.dispatchEvent(event); flushSync(); return event;
}
// jsdom does not perform the browser's default contenteditable mutation.
function edit(editor: HTMLElement, inputType: string, data: string | null = null) {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  editor.dispatchEvent(event);
  if (!event.defaultPrevented) {
    const text = editor.textContent ?? '';
    let [start, end] = richCopySelection(editor) ?? [text.length, text.length];
    if (inputType === 'deleteContentBackward' && start === end) start = Math.max(0, start - 1);
    if (inputType === 'deleteContentForward' && start === end) end = Math.min(text.length, end + 1);
    editor.textContent = text.slice(0, start) + (data ?? '') + text.slice(end);
    setRichCopySelection(editor, start + (data?.length ?? 0), start + (data?.length ?? 0));
    editor.dispatchEvent(new InputEvent('input', { inputType, data, bubbles: true }));
  }
  flushSync();
}
const traceRuns = [{ text: 'ABCDEF', bold: false, align: 'left' as const, line: 0 }];
it.each(['X', 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH\n' + 'Con thàmh tâm đảnh lễ chư Phật. '.repeat(4)])('aligns restored imperfect draft %j and caret corrections with the ghost without forcing its spelling', async initial => {
  const heading = 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH\n';
  const view = setup({ initial, showGhost: true, ghostRuns: [
    { text: heading, bold: false, align: 'center', line: 0 },
    { text: 'Con thành tâm đảnh lễ chư Phật. '.repeat(16), bold: false, align: 'justify', line: 1 },
  ] });
  const css = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8').split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const check = async (expectedText: string) => {
      expect(view.text()).toBe(expectedText);
      expect(richCopyText(view.editor)).toBe(expectedText);
      expect(view.editor.textContent).toBe(expectedText);
      await page.setContent(`<style>${css}</style>${document.querySelector('.rich-copy-container')!.outerHTML}`);
      for (const width of [300, 700]) {
        const displacement = await page.evaluate(({ width, length }) => {
          const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
          container.style.cssText += `;width:${width}px;height:180px`;
          const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
          const glyphs = (root: HTMLElement) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rects: DOMRect[] = [];
            let node: Node | null;
            while ((node = walker.nextNode()) && rects.length < length) for (let offset = 0; offset < (node.textContent?.length ?? 0) && rects.length < length; offset++) {
              const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1);
              rects.push(range.getBoundingClientRect());
            }
            return rects;
          };
          let maximum = 0;
          for (const scroll of [0, 60]) {
            ink.scrollTop = scroll; ghost.scrollTop = ink.scrollTop;
            const actual = glyphs(ink), expected = glyphs(ghost);
            for (let index = 0; index < actual.length; index++) maximum = Math.max(maximum, Math.abs(actual[index].x - expected[index].x), Math.abs(actual[index].y - expected[index].y));
          }
          return maximum;
        }, { width, length: expectedText.length });
        expect(displacement).toBeLessThanOrEqual(0.5);
      }
    };
    await check(initial);
    setRichCopySelection(view.editor, 1, 1);
    edit(view.editor, 'insertText', '?');
    expect(richCopySelection(view.editor)).toEqual([2, 2]);
    await check(initial.slice(0, 1) + '?' + initial.slice(1));
    setRichCopySelection(view.editor, view.text().length, view.text().length);
    edit(view.editor, 'insertText', '!');
    await check(initial.slice(0, 1) + '?' + initial.slice(1) + '!');
  } finally { await browser.close(); }
});
it.each(['lời', 'lời'.normalize('NFD')])('preserves committed Vietnamese IME text %j and aligns its ghost at narrow and wide wraps', async committed => {
  const view = setup({ showGhost: true, ghostRuns: [
    { text: 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', bold: false, align: 'center', line: 0 },
    { text: '\nCon thành tâm đảnh lễ chư Phật.', bold: false, align: 'left', line: 1 },
  ] });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = committed;
  setRichCopySelection(view.editor, committed.length, committed.length);
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: committed, bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: committed, bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe(committed);
  expect(richCopyText(view.editor)).toBe(committed);
  expect(richCopySelection(view.editor)).toEqual([committed.length, committed.length]);

  // Use the mounted component's actual DOM, not an independent renderer model.
  const markup = document.querySelector('.rich-copy-container')!.outerHTML;
  const source = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8');
  const css = source.split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style>${markup}`);
    for (const width of [300, 700]) {
      const displacement = await page.evaluate(width => {
        const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
        container.style.cssText += `;width:${width}px;height:180px;font-family:monospace`;
        const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
        ink.style.fontFamily = ghost.style.fontFamily = 'monospace';
        const firstGlyph = (root: HTMLElement) => {
          const node = document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode()!;
          const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 1);
          return range.getBoundingClientRect();
        };
        const actual = firstGlyph(ink), expected = firstGlyph(ghost);
        return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y));
      }, width);
      expect(displacement).toBeLessThanOrEqual(0.5);
    }
  } finally { await browser.close(); }
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  flushSync(); expect(view.text()).toBe('');
});
it('keeps an empty tracing caret at the first paragraph without future draft text', () => {
  const view = setup({ showGhost: true, ghostRuns: [...traceRuns, { text: 'Later paragraph', bold: false, align: 'left', line: 1 }] });
  expect(richCopyText(view.editor)).toBe('');
  setRichCopySelection(view.editor, 0, 0);
  const anchor = window.getSelection()!.anchorNode;
  expect(anchor?.parentElement?.closest('[data-copy-line]')?.getAttribute('data-copy-line')).toBe('0');
  edit(view.editor, 'insertText', 'x');
  expect(richCopyText(view.editor)).toBe('A');
});
it('keeps real glyph geometry aligned with the full reference at every font, wrap and scroll position', async () => {
  const renderer = readFileSync('src/lib/browser/copying-layout.ts', 'utf8').split('/** Measure')[0]
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const script = ts.transpile(renderer, { target: ts.ScriptTarget.ES2022 });
  const component = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8');
  const css = component.split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const fonts = [
    ['CopyBookerly', 'static/fonts/bookerly/bookerly-regular.ttf'],
    ['CopyMali', 'static/fonts/copying/Mali-Regular.ttf'],
    ['CopyBrignola', 'static/fonts/copying/MTD-Brignola-PUA-Script.otf'],
  ].map(([family, path]) => `@font-face{font-family:${family};src:url(data:font/ttf;base64,${readFileSync(path).toString('base64')})}`).join('');
  // CI installs Chromium; opt in to the installed WebKit engine for compatibility checks.
  for (const engine of process.env.COPYING_GEOMETRY_WEBKIT === '1' ? [chromium, webkit] : [chromium]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${fonts}${css}</style><div class="rich-copy-container" style="height:180px;--copy-paper-ink:#222;--border:#ccc"><div class="rich-copy-ghost" contenteditable="true" inert tabindex="-1"></div><div id="copy-text" class="rich-copy" data-has-ghost="true" contenteditable="true"></div></div>`);
    await page.evaluate(() => Promise.all(['CopyBookerly', 'CopyMali', 'CopyBrignola'].map(font => document.fonts.load(`20px ${font}`))));
    const results = await page.evaluate(({ script }) => {
      const render = new Function(`${script}; return { renderCopyRuns, renderGhostRuns, traced: typeof renderTracedCopyRuns === 'function' ? renderTracedCopyRuns : null };`)();
      const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
      const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
      const hasRules = () => [container, ink, ghost].some(element => [null, '::before', '::after'].some(pseudo => getComputedStyle(element, pseudo).backgroundImage.includes('repeating-linear-gradient')));
      ghost.focus();
      if (document.activeElement === ghost) throw new Error('visual ghost layer must remain unfocusable');
      for (const enabled of ['false', 'true']) {
        ink.dataset.hasGhost = enabled;
        if (!hasRules()) throw new Error(`notebook rules missing when ghost=${enabled}`);
      }
      const reference = [{ text: 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', bold: true, align: 'center', line: 0 },
        { text: ' Con thành tâm đảnh lễ, cúi xin chư Phật từ bi chứng giám. '.repeat(12), bold: false, align: 'left', line: 1 }];
      const glyphs = (root: HTMLElement, maximum: number) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rects: DOMRect[] = [];
        let node: Node | null;
        while ((node = walker.nextNode()) && rects.length < maximum) for (let i = 0; i < (node.textContent?.length ?? 0) && rects.length < maximum; i++) {
          const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1); rects.push(range.getBoundingClientRect());
        }
        return rects;
      };
      const results: number[] = [];
      for (const width of [300, 700]) for (const size of [20, 24]) for (const font of ['Arial', 'CopyBookerly', 'CopyMali', 'CopyBrignola']) for (const scale of [1, 1.35]) for (const length of [4, 180]) for (const spacing of [1.5, 1.8, 1.9, 2]) {
        container.style.width = `${width}px`; container.style.fontFamily = font; container.style.setProperty('--copy-font-size', `${size}px`);
        container.style.setProperty('--copy-font-scale', String(scale));
        container.style.setProperty('--copy-line-height', String(spacing));
        if (render.traced) render.traced(ink, reference, length);
        else render.renderCopyRuns(ink, reference, 0, length);
        render.renderGhostRuns(ghost, reference, length);
        for (const scroll of [0, 80]) {
          ink.scrollTop = scroll; ghost.scrollTop = ink.scrollTop;
          const actual = glyphs(ink, length), expected = glyphs(ghost, length);
          results.push(Math.max(0, ...actual.flatMap((rect, i) => [Math.abs(rect.x - expected[i].x), Math.abs(rect.y - expected[i].y), Math.abs(rect.width - expected[i].width)])));
        }
        if (ink.textContent !== reference.map(run => run.text).join('').slice(0, length)) throw new Error('future text leaked into draft');
        const range = document.createRange(); range.selectNodeContents(ink);
        window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
        if (window.getSelection()!.toString().replace(/\s/g, '') !== ink.textContent!.replace(/\s/g, '')) throw new Error('future text leaked into native copy selection');
        if (!hasRules()) throw new Error('notebook rules missing from blank paper');
        if (Math.abs(parseFloat(getComputedStyle(ink).lineHeight) - size * scale * spacing) > 0.1) throw new Error('existing line spacing setting ignored');
      }
      return results;
    }, { script });
    expect(Math.max(...results)).toBeLessThanOrEqual(0.5);
  } finally { await browser.close(); }
  }
}, process.env.COPYING_GEOMETRY_WEBKIT === '1' ? 20_000 : 5_000);
it('paints notebook rules behind ghost glyphs rather than erasing their pixels', async () => {
  setup({ showGhost: true, ghostRuns: [{ text: 'MMMMMMMM', bold: false, align: 'center', line: 0 }] });
  const component = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8');
  const css = component.split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>body{margin:0;background:white}${css}</style>${document.querySelector('.rich-copy-container')!.outerHTML}`);
    await page.evaluate(() => {
      const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
      container.style.cssText += ';width:300px;height:180px;background:white;--border:rgb(255,0,0);--copy-paper-ink:black';
      const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
      const node = document.createTreeWalker(ghost, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.selectNodeContents(node);
      const rect = range.getBoundingClientRect(), style = getComputedStyle(ink);
      const rule = ink.getBoundingClientRect().top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) - 1;
      // Deliberately intersect a glyph with a rule to verify paint order even
      // for a handwriting font whose ink extends beyond its normal line box.
      (node.parentElement!.closest('[data-copy-line]') as HTMLElement).style.transform = `translateY(${rule - rect.top - rect.height / 2}px)`;
    });
    const paper = page.locator('.rich-copy-container');
    const combined = (await paper.screenshot()).toString('base64');
    await page.locator('.rich-copy-ghost').evaluate(el => (el as HTMLElement).style.visibility = 'hidden');
    const ruleOnly = (await paper.screenshot()).toString('base64');
    await page.locator('.rich-copy-ghost').evaluate(el => (el as HTMLElement).style.visibility = '');
    await paper.evaluate(el => (el as HTMLElement).style.setProperty('--border', 'transparent'));
    const ghostOnly = (await paper.screenshot()).toString('base64');
    const pixels = await page.evaluate(async images => {
      const decoded = await Promise.all(images.map(async source => {
        const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      }));
      let intersections = 0, erased = 0;
      for (let i = 0; i < decoded[0].length; i += 4) {
        if (decoded[1][i] > 240 && decoded[1][i + 1] < 20 && decoded[1][i + 2] < 20 && decoded[2][i] < 240) {
          intersections++;
          if (decoded[0][i] >= 250) erased++;
        }
      }
      return { intersections, erased };
    }, [combined, ruleOnly, ghostOnly]);
    expect(pixels.intersections).toBeGreaterThan(5);
    expect(pixels.erased).toBe(0);
  } finally { await browser.close(); }
});
it('preserves the suffix when deleting a selected range in ghost mode', () => {
  const view = setup({ initial: 'ABCDEF', showGhost: true, ghostRuns: traceRuns });
  setRichCopySelection(view.editor, 1, 3);
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('ADEF');
});
it('deletes at the caret rather than the end of a ghost draft', () => {
  const view = setup({ initial: 'ABCDEF', showGhost: true, ghostRuns: traceRuns });
  setRichCopySelection(view.editor, 2, 2);
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('ACDEF');
});
it('retains an existing noncanonical draft when typing with ghost mode enabled', () => {
  const view = setup({ initial: 'My own draft', showGhost: true, ghostRuns: traceRuns });
  expect(view.text()).toBe('My own draft');
  setRichCopySelection(view.editor, 2, 2);
  edit(view.editor, 'insertText', '!');
  expect(view.text()).toBe('My! own draft');
  setRichCopySelection(view.editor, view.text().length, view.text().length);
  edit(view.editor, 'insertText', '?');
  expect(view.text()).toBe('My! own draft?');
});
it('keeps a pointer-established selection when the editor receives focus', () => {
  const view = setup({ initial: 'Nam mô Phật' });
  view.editor.blur();
  view.editor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  setRichCopySelection(view.editor, 0, 3);
  // Dispatch the browser-established range to the handler; jsdom's focus()
  // restores its own range before delivering focus, unlike a pointer gesture.
  view.editor.dispatchEvent(new FocusEvent('focus'));
  expect(richCopySelection(view.editor)).toEqual([0, 3]);
  window.dispatchEvent(new Event('pointerup')); flushSync();
});
it('does not replace text nodes beneath an active pointer selection during a layout refresh', () => {
  const view = setup({ initial: 'Nam mô Phật' });
  const original = view.editor.firstChild;
  view.editor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  setRichCopySelection(view.editor, 0, 6);
  instance!.refreshFormatting(); flushSync();
  expect(view.editor.firstChild).toBe(original);
  expect(richCopySelection(view.editor)).toEqual([0, 6]);
  window.dispatchEvent(new Event('pointerup')); flushSync();
  expect(richCopySelection(view.editor)).toEqual([0, 6]);
});
it('blocks guest paste and accepts administrator plain text without HTML', () => {
  let view = setup(); expect(paste(view.editor, 'Nam mô Phật').defaultPrevented).toBe(true); expect(view.text()).toBe('');
});
it('pastes literal text for administrators and supports undo/redo', () => {
  const view = setup({ allowPaste: true }); paste(view.editor, 'Nam mô Phật <img>');
  expect(view.text()).toBe('Nam mô Phật <img>'); expect(view.editor.querySelector('img')).toBeNull();
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync(); expect(view.text()).toBe('');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); flushSync(); expect(view.text()).toBe('Nam mô Phật <img>');
});
it.each([
  ['guest:dia-tang:1:1:0', 'NFC'],
  ['guest:dia-tang:1:0:1', 'NFD'],
  ['account:other:dia-tang:1:0:0', 'NFD'],
] as const)('isolates undo across equal blank editing contexts %s (%s) without remounting or losing focus', (context, normalization) => {
  const view = setup({ allowPaste: true });
  const raw = 'Nam mô Địa Tạng'.normalize(normalization);
  paste(view.editor, raw);
  setRichCopySelection(view.editor, 0, raw.length);
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('');
  instance!.switchEditingContext(context, ''); flushSync();
  expect(document.getElementById('copy-text')).toBe(view.editor);
  expect(document.activeElement).toBe(view.editor);
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('');
  expect(richCopyText(view.editor)).toBe('');
  paste(view.editor, raw);
  expect(view.text()).toBe(raw);
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('');
});
it('preserves Enter, accents and the insertion point for the next sentence', () => {
  const view = setup({ allowPaste: true, initial: 'Nam mô Phật' });
  setRichCopySelection(view.editor, 11, 11);
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })); flushSync();
  paste(view.editor, 'Địa Tạng'); expect(view.text()).toBe('Nam mô Phật\nĐịa Tạng');
});
it('treats a Vietnamese IME composition as one undoable edit', async () => {
  const view = setup({ initial: 'Nam ' }); setRichCopySelection(view.editor, 4, 4);
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = 'Nam mô';
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', bubbles: true })); flushSync();
  view.editor.textContent = 'Nam mô Phật';
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('Nam mô Phật');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync(); expect(view.text()).toBe('Nam ');
});
it('releases parent composition state when the editor unmounts before its deferred IME commit', async () => {
  const view = setup({ initial: 'Nam ' });
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  const raw = 'Nam mô'.normalize('NFD');
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = raw;
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'mô', bubbles: true }));
  flushSync();
  expect(instance!.isComposing()).toBe(true);
  instance!.closeEditor(); flushSync();
  expect(instance!.isComposing()).toBe(false);
  expect(view.text()).toBe(raw);
  instance!.openEditor(); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(instance!.isComposing()).toBe(false);
  expect(instance!.text()).toBe(raw);
  expect(richCopyText(document.getElementById('copy-text')!)).toBe(raw);
});
it.each(['NFC', 'NFD'] as const)('does not commit an old IME DOM into a new stable editing context (%s)', async normalization => {
  const view = setup({ initial: 'Old ' });
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  const oldRaw = 'Old mô'.normalize(normalization);
  const newRaw = 'Bản chép mới'.normalize(normalization);
  const newContext = 'account:other:dia-tang:1:1:0';
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = oldRaw;
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'mô', bubbles: true }));
  flushSync();
  expect(instance!.isComposing()).toBe(true);
  instance!.switchEditingContext(newContext, newRaw); flushSync();
  expect(document.getElementById('copy-text')).toBe(view.editor);
  expect(instance!.text()).toBe(newRaw);
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(instance!.text()).toBe(newRaw);
  expect(richCopyText(view.editor)).toBe(newRaw);
  expect(instance!.isComposing()).toBe(false);
  expect(instance!.committedValues().filter(commit => commit.context === newContext)).toEqual([]);
});
it('keeps the IME replacement range alive through compositionend until the final commit input', async () => {
  const view = setup({ initial: 'Nam ' });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node = view.editor.querySelector('span')!.firstChild as Text;
  node.appendData('thiền');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'thiền', bubbles: true })); flushSync();
  const commitRange = document.createRange(); commitRange.setStart(node, 4); commitRange.setEnd(node, 9);
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'thiền', bubbles: true })); flushSync();
  expect(commitRange.toString()).toBe('thiền');
  commitRange.deleteContents(); commitRange.insertNode(document.createTextNode('thiền'));
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'thiền', bubbles: true })); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('Nam thiền');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('Nam ');
});
it('does not accept a paste while a draft replacement is readonly', () => {
  const view = setup({ allowPaste: true, readonly: true, initial: 'Bản cũ' });
  paste(view.editor, 'Bản khác'); expect(view.text()).toBe('Bản cũ');
});
it('resumes a restored draft at the end and retains the caret across toolbar focus', () => {
  const view = setup({ allowPaste: true, initial: 'Nam mô' });
  paste(view.editor, ' Phật');
  expect(view.text()).toBe('Nam mô Phật');
  setRichCopySelection(view.editor, 3, 3);
  const toolbar = document.createElement('button'); document.body.append(toolbar); toolbar.focus();
  view.editor.focus(); paste(view.editor, ' thật');
  expect(view.text()).toBe('Nam thật mô Phật');
});

it('renders ghost text underlay when showGhost is enabled without polluting typed draft', () => {
  const ghostRuns = [
    { text: 'Kinh Địa Tạng in mờ', bold: true, align: 'center' as const, line: 0 },
    { text: 'Câu kinh tiếp theo in mờ.', bold: false, align: 'justify' as const, line: 1 },
  ];
  const originalRuns = JSON.stringify(ghostRuns);
  const view = setup({ showGhost: true, ghostRuns, allowPaste: true });
  const ghostEl = document.querySelector('.rich-copy-ghost');
  expect(ghostEl).not.toBeNull();
  expect(ghostEl?.getAttribute('aria-hidden')).toBe('true');
  const ghostEdit = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
  ghostEl!.dispatchEvent(ghostEdit);
  expect(ghostEdit.defaultPrevented).toBe(true);
  expect(paste(ghostEl as HTMLElement, 'Not editable').defaultPrevented).toBe(true);
  expect(ghostEl?.textContent).toContain('Kinh Địa Tạng in mờ');
  expect(ghostEl?.textContent).toContain('Câu kinh tiếp theo in mờ.');

  // User types on top of ghost layer
  paste(view.editor, 'Con gõ chữ đè lên');
  expect(view.text()).toBe('Con gõ chữ đè lên');
  // The hidden prefix uses actual draft metrics; only its untouched canonical
  // tail remains visible. Neither display layer may rewrite the source/draft.
  const raw = 'Con gõ chữ đè lên';
  const tail = ghostRuns.map(run => run.text).join('').slice(raw.length);
  const ghostGlyphs = Array.from(ghostEl!.querySelectorAll<HTMLElement>('span, strong'));
  expect(ghostGlyphs.filter(el => el.style.visibility === 'hidden').map(el => el.textContent).join('')).toBe(raw);
  expect(ghostGlyphs.filter(el => el.style.visibility !== 'hidden').map(el => el.textContent).join('')).toBe(tail);
  expect(ghostEl?.textContent).toBe(raw + tail);
  expect(JSON.stringify(ghostRuns)).toBe(originalRuns);
  expect(richCopyText(view.editor)).toBe(raw);
  expect(view.editor.textContent).toBe(raw);
  expect(Array.from(view.editor.querySelectorAll<HTMLElement>('[data-copy-future]')).map(el => el.dataset.copyFuture).join('')).toBe(tail);
});

it('automatically advances canonical characters when typing on ghost text mode', () => {
  const ghostRuns = [
    { text: 'Con thành tâm', bold: false, align: 'left' as const, line: 0 },
  ];
  const view = setup({ showGhost: true, ghostRuns });
  // Type any letter, e.g. 'x' -> advances canonical 'C'
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true }));
  flushSync();
  expect(view.text()).toBe('C');
  expect(richCopyText(view.editor)).toBe('C');
  expect(view.editor.textContent).toBe('C');
  expect(view.editor.querySelector('[data-copy-future]')?.getAttribute('aria-hidden')).toBe('true');
  setRichCopySelection(view.editor, 1, 1);
  expect(richCopySelection(view.editor)).toEqual([1, 1]);

  // Next letter -> advances canonical 'o'
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'o', bubbles: true, cancelable: true }));
  flushSync();
  expect(view.text()).toBe('Co');

  // Backspace steps back
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  flushSync();
  expect(view.text()).toBe('C');
});

it('keeps the ghost draft suffix for Delete at a caret and over a selection', () => {
  const view = setup({ initial: 'ABCDEF', showGhost: true, ghostRuns: traceRuns });
  setRichCopySelection(view.editor, 2, 2);
  edit(view.editor, 'deleteContentForward');
  expect(view.text()).toBe('ABDEF');
  setRichCopySelection(view.editor, 1, 3);
  edit(view.editor, 'deleteContentForward');
  expect(view.text()).toBe('AEF');
});
it('retains undo and redo for canonical tracing and Backspace without future text', () => {
  const view = setup({ showGhost: true, ghostRuns: traceRuns });
  edit(view.editor, 'insertText', 'x');
  edit(view.editor, 'insertText', 'x');
  expect(view.text()).toBe('AB');
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('A');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('AB');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('A');
  expect(richCopyText(view.editor)).toBe('A');
  expect(view.editor.textContent).toBe('A');
});
it('preserves the native Vietnamese replacement range and one undo while ghost mode is enabled', async () => {
  const view = setup({ initial: 'Nam ', showGhost: true, ghostRuns: [{ text: 'Nam thiền định.', bold: false, align: 'left', line: 0 }] });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node = view.editor.querySelector('[data-copy-typed]')?.firstChild ?? view.editor.querySelector('span')!.firstChild;
  (node as Text).appendData('thiền');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'thiền', bubbles: true })); flushSync();
  const commitRange = document.createRange(); commitRange.setStart(node!, 4); commitRange.setEnd(node!, 9);
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'thiền', bubbles: true })); flushSync();
  expect(commitRange.toString()).toBe('thiền');
  commitRange.deleteContents(); commitRange.insertNode(document.createTextNode('thiền'));
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'thiền', bubbles: true })); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('Nam thiền');
  expect(richCopyText(view.editor)).toBe('Nam thiền');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('Nam ');
});
