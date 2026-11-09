import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { copySourceText } from '../../src/lib/domain/practice/copying-formatting';
import { normalizeCopyText } from '../../src/lib/domain/practice/scripture-copying';
import { copyingBlockCompleted, copyingTextCompletion } from '../../src/lib/domain/practice/copying-completion-progress';
import { beginScriptureCopying, loginAsAdmin } from './runtime-helpers';
const book = JSON.parse(readFileSync(new URL('../../src/lib/data/scripture-copying/dia-tang.json', import.meta.url), 'utf8'));

const editorFor = (page: Page) => page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });

function longImperfectDraft(): string {
  const source = normalizeCopyText(book.chapters[0].blocks[0]);
  const words = source.split(' ');
  // Keep the ending for reference-following, but omit 20% from the middle so
  // the existing completion timer cannot move this layout fixture to block 2.
  words.splice(Math.floor(words.length / 3), Math.ceil(words.length * .2));
  words[0] = 'sai';
  const typed = words.join(' ');
  expect(copyingTextCompletion(source, typed).accepted).toBe(false);
  expect(copyingBlockCompleted(source, typed)).toBe(false);
  return typed;
}
test('Nguyện xin stays in one reference paragraph without changing the saved draft', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method()); });
  await open(page);
  const typed = normalizeCopyText(book.chapters[0].blocks[0]).split('nguyện xin')[0].trimEnd() + ' xin các vị gia hộ cho con:';
  await editorFor(page).pressSequentially(typed);
  const prayer = editorFor(page).locator('[data-copy-line="4"]');
  for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    await expect(prayer).toHaveText('nguyện xin các vị gia hộ cho con:');
    await expect(prayer).toHaveCSS('text-align', 'justify');
    await prayer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/copying-prayer-${width}-${theme}.png` });
  }
  await expect.poll(() => localText(page)).toBe(typed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await beginScriptureCopying(page);
  await expect(prayer).toHaveText('nguyện xin các vị gia hộ cho con:');
  expect(await localText(page)).toBe(typed);
  expect(requests).toEqual([]);
});

test('native Android shell keeps navigation hidden and reserves the status-bar inset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tu-tap/chep-kinh', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('start-copying')).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.nativeApp = 'true'; document.documentElement.style.setProperty('--app-safe-top', '48px'); });
  await beginScriptureCopying(page);
  await expect.soft(page.getByRole('navigation', { name: 'Điều hướng nhanh' })).toBeHidden();
  const header = await page.locator('.writing-bar').boundingBox();
  expect.soft(header!.y).toBeGreaterThanOrEqual(48);
});
test('fullscreen and compact mobile settings preserve the continuous draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Thoát toàn màn hình', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.getByRole('button', { name: 'Cuộn liên tục', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await editorFor(page).pressSequentially('Nam mô Địa Tạng Bồ Tát');
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.locator('#mobile-copy-font').selectOption('mali');
  await page.locator('#mobile-source-size').selectOption({ value: '24' });
  await page.locator('#mobile-editor-size').selectOption({ value: '24' });
  await page.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
  await expect(page.locator('#copy-source-text')).toHaveCSS('font-size', '24px');
  await expect(editorFor(page)).toHaveCSS('font-size', '24px');
  await expect.poll(() => localText(page)).toBe('Nam mô Địa Tạng Bồ Tát');
  await expect(page.locator('.block-toolbar')).toBeHidden();
  await page.screenshot({ path: 'test-results/copying-mobile-settings.png' });
});
test('desktop pointer can select and replace text after the viewport shrinks', async ({ page }) => {
  // A laptop can expose touch points while its primary pointer is a mouse.
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 10 }));
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page);
  const editor = editorFor(page);
  await editor.pressSequentially('Nam mô Địa Tạng Bồ Tát');
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
  await page.setViewportSize({ width: 700, height: 700 });
  await expect(page.locator('.copy-writing')).not.toHaveClass(/keyboard-open/);
  await editor.selectText();
  await editor.pressSequentially('Con thành tâm');
  await expect.poll(() => localText(page)).toBe('Con thành tâm');
  const bounds = await editor.boundingBox();
  await page.mouse.move(bounds!.x + 15, bounds!.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 100, bounds!.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(editor).toBeFocused();
  await editor.press('End');
  await editor.pressSequentially(' đảnh lễ');
  await expect.poll(() => localText(page)).toContain('đảnh lễ');
});
test.describe('touch keyboard', () => {
test.use({ hasTouch: true });
test('mobile keyboard reserves writing space and keeps the reference word visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
  await editorFor(page).focus();
  await page.setViewportSize({ width: 390, height: 430 });
  await expect(page.locator('.copy-writing')).toHaveClass(/keyboard-open/);
  await expect(page.locator('.block-toolbar')).toBeHidden();
  const bounds = await editorFor(page).boundingBox();
  expect(bounds!.height).toBeGreaterThan(110);
  const typed = normalizeCopyText(book.chapters[0].blocks[0]).split(' ').slice(0, 75).join(' ');
  await editorFor(page).pressSequentially(typed);
  const source = page.locator('#copy-source-text');
  await expect.poll(() => source.evaluate(panel => {
    const anchor = panel.querySelector('.source-word--current');
    if (!anchor) return false;
    const view = panel.getBoundingClientRect(), word = anchor.getBoundingClientRect();
    return word.top >= view.top && word.bottom <= view.bottom;
  })).toBe(true);
  await page.screenshot({ path: 'test-results/copying-mobile-keyboard.png' });
});
});
async function open(page: Page) {
  await page.goto('/tu-tap/chep-kinh', { waitUntil: 'domcontentloaded' });
  await beginScriptureCopying(page);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
}
async function localText(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1');
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('drafts');
      const read = transaction.objectStore('drafts').getAll();
      transaction.oncomplete = () => { resolve(read.result.find(row => row.sutraId === 'dia-tang' && row.chapter === 1)?.texts[0] ?? ''); db.close(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

test('switching from a late passage to a shorter chapter never mixes old draft layout or throws 500', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await page.locator('#copy-block').selectOption({ value: '34' });
  await editorFor(page).pressSequentially('Bản nháp đoạn cuối');
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await page.locator('#copy-chapter').selectOption({ value: '2' });
  await beginScriptureCopying(page);
  await expect(editorFor(page)).toBeVisible();
  await expect(page.locator('#copy-block')).toHaveValue('0');
  await expect(page.locator('#copy-source-text')).not.toBeEmpty();
  await expect(page.getByText('Internal Error', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a locally saved copy does not block any main navigation tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await editorFor(page).pressSequentially('Nam mô Phật');
  await expect.poll(() => localText(page)).toBe('Nam mô Phật');
  await page.getByRole('button', { name: 'Lưu lên hệ thống', exact: true }).click();
  await expect(page).toHaveURL(/\/ca-nhan\?tab=account/);
  await page.goto('/tu-tap/chep-kinh');
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  for (const [name, path] of [['Kinh sách', '/kinh-sach'], ['Tu tập', '/tu-tap'], ['Pháp thoại', '/phap-thoai'], ['Cá nhân', '/ca-nhan'], ['Trang chủ', '/']]) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('link', { name, exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    await expect(page.locator('dialog[data-app-message]')).toHaveCount(0);
  }
  expect(dialogs).toEqual([]);
  expect(await localText(page)).toBe('Nam mô Phật');
  await expect(page.locator('body')).not.toHaveClass(/copying-workspace-open/);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('reference follows a long imperfect copy, returns with the caret, and review stays advisory', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.locator('#copy-source-text').evaluate(node => {
    const target = node as HTMLElement & { scrollCalls: number };
    target.scrollCalls = 0;
    const original = target.scrollTo.bind(target);
    target.scrollTo = ((options: ScrollToOptions) => { target.scrollCalls++; original(options); }) as typeof target.scrollTo;
  });
  const typed = longImperfectDraft();
  await editorFor(page).pressSequentially(typed);
  await expect.poll(() => localText(page)).toBe(typed);
  await expect(page.getByRole('region', { name: 'Vị trí cần sửa' })).toHaveCount(0);
  const source = page.locator('#copy-source-text');
  await expect(source.locator('.source-line').first()).toHaveCSS('text-align', 'center');
  await expect(source.locator('.source-line').first().locator('strong').first()).toBeVisible();
  await expect(source.locator('.source-line').nth(2)).toHaveCSS('text-align', 'justify');
  await expect.poll(() => source.evaluate(node => node.scrollTop)).toBeGreaterThan(50);
  await expect(source.locator('.source-word--current')).toContainText('đổi');
  expect(await source.evaluate(node => (node as HTMLElement & { scrollCalls: number }).scrollCalls)).toBeLessThan(40);
  while (await page.getByRole('button', { name: 'Trang gõ trước', exact: true }).count() && await page.getByRole('button', { name: 'Trang gõ trước', exact: true }).isEnabled()) {
    await page.getByRole('button', { name: 'Trang gõ trước', exact: true }).click();
  }
  await editorFor(page).press('Control+Home');
  await expect.poll(() => source.evaluate(node => node.scrollTop)).toBeLessThan(5);
  await page.getByRole('button', { name: 'Rà soát đoạn này', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vị trí cần sửa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rà soát đoạn này', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Đóng rà soát', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vị trí cần sửa' })).toHaveCount(0);
  expect(await localText(page)).toBe(typed);
});

test('writing pages reflow across fonts, viewport changes and reload without rewriting text', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const typed = longImperfectDraft();
  await page.getByRole('button', { name: 'Cuộn liên tục', exact: true }).click();
  await editorFor(page).pressSequentially(typed);
  await expect.poll(() => localText(page)).toBe(typed);
  for (const font of ['mali', 'hipsteria', 'autogate', 'brignola', 'reader']) {
    await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
    await page.locator('#mobile-copy-font').selectOption(font);
    await page.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
    await expect.poll(() => editorFor(page).evaluate(node => {
      const style = getComputedStyle(node); return document.fonts.check(`${style.fontSize} ${style.fontFamily}`);
    })).toBe(true);
    await expect.poll(async () => editorFor(page).evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
    expect(await localText(page)).toBe(typed);
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Rà soát đoạn này', exact: true })).toBeInViewport();
    expect(await localText(page)).toBe(typed);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await beginScriptureCopying(page);
  await expect(page.getByRole('button', { name: 'Cuộn liên tục', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Cuộn liên tục', exact: true }).click();
  await expect.poll(async () => Number((await page.locator('.editor-pages output').textContent())!.split('/')[1])).toBeGreaterThan(1);
  await expect.poll(async () => editorFor(page).evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
  expect(await localText(page)).toBe(typed);
});

test('administrator can copy and paste the entire reference into its matching passages without a cloud save', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAsAdmin(page);
  await open(page);
  const writes: string[] = [];
  page.on('request', request => { if (['/api/practice/copying', '/api/sync'].includes(new URL(request.url()).pathname) && request.method() !== 'GET') writes.push(request.method()); });
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Sao chép toàn bộ kinh mẫu', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n?/g, '\n')).toBe(copySourceText(book.chapters[0].blocks.join('\n\n')));
  await page.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
  await editorFor(page).evaluate((node, text) => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, copied);
  await expect(page.getByText('Đã chép xong phẩm/quyển này', { exact: true })).toBeVisible();
  await expect.poll(() => localText(page)).toBe(copySourceText(book.chapters[0].blocks[0]));
  expect(writes).toEqual([]);
});

test('ghost input without keyup follows the committed caret and backward corrections without cloud writes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method()); });
  await open(page);
  await page.getByRole('button', { name: 'Chữ mờ', exact: true }).click();
  await page.getByRole('button', { name: 'Hiện kinh mẫu', exact: true }).click();
  const editor = editorFor(page);
  await editor.click();
  // Touch keyboards may deliver beforeinput without a physical keyup event.
  for (const expected of ['L', 'LỜ', 'LỜI', 'LỜI ', 'LỜI N']) {
    await editor.evaluate(node => node.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText', data: 'x', bubbles: true, cancelable: true
    })));
    await expect(editor).toHaveText(expected);
  }
  const activeWord = page.locator('#copy-source-text .source-word--current');
  await expect(activeWord).toHaveText('NGUYỆN');
  await editor.press('Home');
  await expect(activeWord).toHaveText('LỜI');
  await editor.press('End');
  await expect(activeWord).toHaveText('NGUYỆN');
  await expect.poll(() => localText(page)).toBe('LỜI N');
  expect(requests).toEqual([]);
});

test('ghost text tracing mode collapses sample text and synchronizes font changes without heading overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);

  // Sample scripture is initially visible
  await expect(page.locator('#copy-source-text')).toBeVisible();
  const ghostBtn = page.getByRole('button', { name: 'Chữ mờ', exact: true });
  const paperBackground = () => page.locator('.rich-copy-container')
    .evaluate(node => getComputedStyle(node, '::before').backgroundImage);
  await expect(ghostBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rich-copy-ghost')).toHaveCount(0);
  await expect.poll(paperBackground).toMatch(/linear-gradient/);

  // Turn ON ghost text
  await ghostBtn.click();
  await expect(ghostBtn).toHaveAttribute('aria-pressed', 'true');
  // Sample scripture automatically collapses
  await expect(page.locator('#copy-source-text')).toBeHidden();
  // Ghost text layer appears
  const ghostLayer = page.locator('.rich-copy-ghost');
  await expect(ghostLayer).toBeVisible();
  expect(await ghostLayer.textContent()).toContain('phước mỏng trí cạn');
  await expect.poll(() => ghostLayer.evaluate(ghost => {
    const container = ghost.closest('.rich-copy-container')!;
    const ink = container.querySelector('#copy-text')!;
    return [getComputedStyle(container, '::before').zIndex, getComputedStyle(ghost).zIndex,
      getComputedStyle(ink).zIndex].map(Number);
  })).toEqual([0, 1, 2]);

  // The sample can still be opened manually while tracing stays enabled.
  await page.getByRole('button', { name: 'Hiện kinh mẫu', exact: true }).click();
  await expect(page.locator('#copy-source-text')).toBeVisible();
  await expect(ghostBtn).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click();

  // Verify font change synchronizes to ghost layer
  const display = page.locator('.compact-editor-display');
  await display.getByRole('combobox', { name: 'Phông chữ', exact: true }).selectOption('mali');
  await expect(ghostLayer).toHaveCSS('font-family', /CopyMali/);

  // Type keys: automatically advances canonical scripture letters
  const editor = page.locator('#copy-text');
  await editor.click();
  await editor.pressSequentially('abc');
  await expect(editor).toHaveText(/^LỜI/);
  await page.evaluate(() => document.fonts.ready);
  const glyphDisplacement = () => page.evaluate(() => {
    const ink = document.querySelector('#copy-text')!;
    const ghost = document.querySelector('.rich-copy-ghost')!;
    const firstText = (node: Element) => document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const typedText = firstText(ink), referenceText = firstText(ghost);
    let maximum = 0;
    for (let index = 0; index < 2; index++) {
      const typed = document.createRange(), reference = document.createRange();
      typed.setStart(typedText, index); typed.setEnd(typedText, index + 1);
      reference.setStart(referenceText, index); reference.setEnd(referenceText, index + 1);
      const a = typed.getBoundingClientRect(), b = reference.getBoundingClientRect();
      maximum = Math.max(maximum, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
    return maximum;
  });
  await expect.poll(glyphDisplacement).toBeLessThanOrEqual(0.5);

  // Backspace steps back one character
  await editor.press('Backspace');
  await expect(editor).toHaveText(/^LỜ$/);

  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
  // Verify responsiveness and no overflow on 320px and 375px
  for (const width of [320, 375, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    const heading = page.locator('.editor-heading');
    expect(await heading.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await ghostBtn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect.poll(glyphDisplacement).toBeLessThanOrEqual(0.5);
    await page.screenshot({ path: `test-results/copying-ghost-aligned-${width}-${theme}.png` });
  }

  // Reload preserves the device preference and only the real typed draft.
  await expect.poll(() => localText(page)).toBe('LỜ');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tt_copy_ghost_v1'))).toBe('1');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await beginScriptureCopying(page);
  await expect(ghostBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#copy-source-text')).toBeHidden();
  await expect(editor).toHaveText('LỜ');
  expect(await localText(page)).toBe('LỜ');

  // Turn OFF ghost text
  await ghostBtn.click();
  await expect(ghostBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rich-copy-ghost')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tt_copy_ghost_v1'))).toBe('0');
  expect(await localText(page)).toBe('LỜ');
  await expect(page.locator('#copy-source-text')).toBeVisible();
  await expect.poll(paperBackground).toMatch(/linear-gradient/);
});
