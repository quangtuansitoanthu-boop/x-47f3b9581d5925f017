import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Mount the actual replacement component in Chromium, including Svelte reactivity.
describe('native rich-text editor', () => {
  let browser: Browser;
  let script: string;
  beforeAll(async () => {
    const result = await build({
      stdin: {
        contents: `import { mount } from 'svelte';
          import Editor from './src/lib/components/admin/editor/ProfessionalRichTextEditor.svelte';
          window.changes = [];
          mount(Editor, { target: document.body, props: {
            content: '<p style="line-height:1.8;text-align:justify"><strong>Saved content</strong></p>',
            label: 'Nội dung', placeholder: 'Viết tại đây',
            onChange: value => window.changes.push(value),
            createImageHtml: () => '', uploadImage: async () => '',
            onImageBusy: () => {}, onError: () => {}
          }});`,
        resolveDir: process.cwd(), loader: 'js',
      },
      bundle: true, write: false, format: 'iife', platform: 'browser',
      conditions: ['browser'], alias: { '$lib': path.resolve('src/lib') },
      plugins: [{ name: 'svelte-test', setup(builder) {
        builder.onLoad({ filter: /\.svelte$/ }, args => ({
          contents: compile(readFileSync(args.path, 'utf8'), { filename: args.path, generate: 'client', css: 'injected' }).js.code,
          loader: 'js', resolveDir: path.dirname(args.path),
        }));
      } }],
    });
    script = result.outputFiles[0].text;
    browser = await chromium.launch();
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  it('preserves saved styles, emits edits and sanitizes pasted HTML', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<html><body></body></html>');
      await page.addScriptTag({ content: script });
      const editor = page.getByRole('textbox', { name: 'Nội dung' });
      await editor.waitFor();
      expect(await editor.locator('p').getAttribute('style')).toContain('line-height:1.8');
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.type(' updated');
      expect(await page.evaluate(() => (window as any).changes.at(-1))).toContain('updated');
      await editor.evaluate(el => {
        const data = new DataTransfer();
        data.setData('text/html', '<p onclick="alert(1)">Pasted <strong>text</strong><script>alert(1)</script></p>');
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      });
      const saved = await page.evaluate(() => (window as any).changes.at(-1));
      expect(saved).toContain('Pasted');
      expect(saved).not.toContain('<script');
      expect(saved).not.toContain('onclick');
      await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
      expect(await page.locator('.preview-panel').textContent()).toContain('Pasted');
    } finally { await page.close(); }
  });
});
