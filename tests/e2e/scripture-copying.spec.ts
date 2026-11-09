import { beginScriptureCopying } from './runtime-helpers';
import { test, expect, type Page } from '@playwright/test';
import book from '../../src/lib/data/scripture-copying/dia-tang.json' with { type: 'json' };
import { normalizeCopyText } from '../../src/lib/domain/practice/scripture-copying';

async function acceptAppConfirm(page: Page, message: string) {
  const dialog = page.locator('dialog[data-app-message]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(message);
  await dialog.getByRole('button', { name: 'Đồng ý', exact: true }).click();
}

test('leaving and reopening during composition does not leave passage navigation locked', async ({ page }) => {
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const editor = page.locator('#copy-text');
  await editor.dispatchEvent('compositionstart');
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await beginScriptureCopying(page);
  await page.locator('#copy-block').selectOption({ value: '1' });
  await expect(page.locator('#copy-block')).toHaveValue('1');
  await expect(page.locator('#copy-source-title')).toContainText('2/');
});

test('passage select keeps the requested value through input and change events', async ({ page }, testInfo) => {
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const select = page.locator('#copy-block');
  await expect(select).toHaveValue('0');
  await select.evaluate(node => {
    const events: Record<string, unknown>[] = [];
    Object.assign(window, { __copySelectDiagnostic: events });
    const record = (phase: string) => (event: Event) => {
      if (event.target !== node) return;
      const target = node as HTMLSelectElement & { __value?: unknown };
      events.push({ type: event.type, phase, value: target.value, index: target.selectedIndex,
        modelValue: target.__value, source: document.getElementById('copy-source-title')?.textContent });
    };
    for (const type of ['input', 'change']) {
      document.addEventListener(type, record('capture'), true);
      window.addEventListener(type, record('bubble'));
    }
  });
  try {
    await select.selectOption({ value: '1' });
    await expect(select).toHaveValue('1');
    await expect(page.locator('#copy-source-title')).toContainText('2/');
  } finally {
    const diagnostic = await page.evaluate(() => ({
      events: (window as Window & { __copySelectDiagnostic?: unknown[] }).__copySelectDiagnostic,
      finalValue: (document.getElementById('copy-block') as HTMLSelectElement | null)?.value,
      source: document.getElementById('copy-source-title')?.textContent,
    }));
    await testInfo.attach('passage-select-events.json', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
  }
});

for (const form of ['NFC', 'NFD'] as const) {
  test(`undo does not restore the previous passage after an equal blank transition (${form})`, async ({ page }) => {
    const writes: string[] = [];
    page.on('request', request => { if (request.method() !== 'GET' && new URL(request.url()).pathname === '/api/practice/copying') writes.push(request.method()); });
    await page.goto('/tu-tap/chep-kinh');
    await beginScriptureCopying(page);
    const editor = page.locator('#copy-text');
    await editor.pressSequentially('Nam mô Địa Tạng'.normalize(form));
    await editor.press('ControlOrMeta+A');
    await editor.press('Backspace');
    await expect(editor).toHaveText('');
    await page.getByRole('button', { name: 'Đoạn sau', exact: true }).click();
    await expect(page.locator('#copy-source-title')).toContainText('2/');
    await editor.click();
    await editor.press('ControlOrMeta+Z');
    await expect(editor).toHaveText('');
    await page.locator('#copy-block').selectOption({ value: '0' });
    await expect(page.locator('#copy-source-title')).toContainText('1/');
    await expect(editor).toHaveText('');
    await page.reload();
    await beginScriptureCopying(page);
    await expect(editor).toHaveText('');
    expect(writes).toEqual([]);
  });
}

declare global {
  interface Window {
    __copyingSpoken: SpeechSynthesisUtterance[];
  }
}

async function mockCopyingSpeech(page: Page, locale: 'vi' | 'en' = 'vi') {
  await page.addInitScript(language => {
    localStorage.setItem('tutam_locale', language);
    const spoken: SpeechSynthesisUtterance[] = [];
    Object.assign(window, { __copyingSpoken: spoken });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      constructor(public text: string) {}
    } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
      getVoices: () => [{ lang: 'vi-VN', name: 'Vietnamese' }, { lang: 'en-US', name: 'English' }],
      speak(utterance: SpeechSynthesisUtterance) {
        if (!utterance.text) return;
        spoken.push(utterance);
        utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
      },
    } });
  }, locale);
}

test('English copying controls retain Vietnamese speech for the canonical sutra', async ({ page }) => {
  await mockCopyingSpeech(page, 'en');
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await page.locator('.sample-speech').click();
  await expect.poll(() => page.evaluate(() => window.__copyingSpoken.filter(utterance => utterance.text).map(utterance => utterance.lang))).toEqual(['vi-VN']);
  await expect(page.locator('#copy-source-text')).toHaveAttribute('lang', 'vi');
  await page.locator('.sample-speech').click();
});

test('sample speech stops without replaying when composition prevents passage advancement', async ({ page }) => {
  await mockCopyingSpeech(page);
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const chunks = await page.locator('#copy-source-text .source-line').count();
  expect(chunks).toBeGreaterThan(0);
  await page.locator('#copy-text').dispatchEvent('compositionstart');
  await page.locator('.sample-speech').click();
  for (let index = 0; index < chunks; index++) {
    await expect.poll(() => page.evaluate(() => window.__copyingSpoken.length)).toBe(index + 1);
    await page.evaluate(i => {
      const utterance = window.__copyingSpoken[i];
      utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
    }, index);
  }
  await expect(page.locator('.sample-speech')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__copyingSpoken.length)).toBe(chunks);
  await expect(page.locator('#copy-block')).toHaveValue('0');
  await page.locator('#copy-text').dispatchEvent('compositionend');
});

test('manual passage selection stops speech after an automatic speech advance', async ({ page }) => {
  await mockCopyingSpeech(page);
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const chunks = await page.locator('#copy-source-text .source-line').count();
  await page.locator('.sample-speech').click();
  for (let index = 0; index < chunks; index++) {
    await expect.poll(() => page.evaluate(() => window.__copyingSpoken.length)).toBe(index + 1);
    await page.evaluate(i => {
      const utterance = window.__copyingSpoken[i];
      utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
    }, index);
  }
  await expect(page.locator('#copy-block')).toHaveValue('1');
  await expect.poll(() => page.evaluate(() => window.__copyingSpoken.length)).toBe(chunks + 1);
  // Vượt cửa sổ bảo vệ120ms cũ để kiểm tra dependency, không chỉ timer chuyển đoạn.
  await page.waitForTimeout(150);
  await page.locator('#copy-block').selectOption({ value: '0' });
  await expect(page.locator('.sample-speech')).toHaveAttribute('aria-pressed', 'false');
});

async function prepareBookDraft(page: Page, chapter: number, allChapters: boolean, scope = 'guest') {
  await page.evaluate(({ book, chapter, allChapters, scope }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
      for (const item of book.chapters) {
        const key = `tt_copy_v1:${encodeURIComponent(scope)}:${book.id}:${book.version}:${item.number}`;
        const read = store.get(key);
        read.onsuccess = () => {
          const draft = read.result;
          if (!draft) { tx.abort(); return; }
          if (allChapters || item.number === chapter) draft.texts = item.blocks.map((text: string) => text);
          if (item.number === chapter) { draft.block = item.blocks.length - 1; draft.texts[draft.block] = ''; }
          store.put(draft, key);
        };
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  }), { book, chapter, allChapters, scope });
  await page.reload();
  if (chapter !== 1) await page.locator('#copy-chapter').selectOption({ value: String(chapter) });
  await beginScriptureCopying(page);
}

async function finishLastPassage(page: Page, chapter: number) {
  await page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true }).evaluate((element, value) => {
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }, normalizeCopyText(book.chapters[chapter - 1].blocks.at(-1)!));
}

test('finishing a chapter automatically opens the next chapter without crediting a whole book', async ({ page }) => {
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await prepareBookDraft(page, 1, false);
  await expect(page.locator('#copy-block')).toHaveValue(String(book.chapters[0].blocks.length - 1));
  await finishLastPassage(page, 1);
  await expect(page.locator('.writing-title p')).toHaveText(book.chapters[1].title);
  await expect(page.locator('#copy-block')).toHaveValue('0');
  await expect(page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true })).toBeFocused();
  await expect(page.getByText('Đã ghi nhận 1 lượt vào Công phu của tôi. Bản chép được giữ nguyên.', { exact: true })).toHaveCount(0);
});

test('the final chapter points back to unfinished chapters instead of awarding a full book', async ({ page }) => {
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await prepareBookDraft(page, book.chapters.length, false);
  await finishLastPassage(page, book.chapters.length);
  await expect(page.getByText('Đã chép trọn bộ kinh', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tiếp tục phẩm/quyển chưa hoàn thành: 1', exact: true }).click();
  await expect(page.locator('.writing-title p')).toHaveText(book.chapters[0].title);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') ?? '[]').length)).toBe(0);
});

test('an archived cloud chapter is shown without relabelling it as the new book run', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'quangtu_session', value: 'e2e-google-admin-session-token', url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await prepareBookDraft(page, book.chapters.length, true, 'account:e2e-google-admin');
  await finishLastPassage(page, book.chapters.length);
  await expect(page.getByRole('button', { name: 'Bắt đầu lượt 2', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Bắt đầu lượt 2', exact: true }).click();
  await expect(page.locator('.book-run-progress')).toContainText('Lượt 2');
  const oldRun = await page.evaluate(({ id, version }) => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('drafts'), read = tx.objectStore('drafts').get(`tt_copy_book_v1:account%3Ae2e-google-admin:${id}:${version}`);
      tx.oncomplete = () => { resolve(read.result.previousRuns[0].chapterRunIds[0]); db.close(); };
      tx.onerror = () => reject(tx.error);
    };
  }), book);
  await page.route('**/api/practice/copying?**', route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('run')
    ? { copy: { runId: oldRun, sourceVersion: book.version, texts: book.chapters[0].blocks, revision: 1, savedAt: '2026-10-30T00:00:00Z' } }
    : { copies: [{ runId: oldRun, sourceVersion: book.version, revision: 1, savedAt: '2026-10-30T00:00:00Z', complete: true }], nextCursor: null } }));
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Xem bản đã lưu trên hệ thống' }).click();
  await page.getByRole('button', { name: 'Mở bản này' }).click();
  await acceptAppConfirm(page, 'Mở bản hệ thống để tiếp tục?');
  await expect(page.getByText('Đây là bản của lượt trước. Chỉ mở để xem, không thay bản đang chép hoặc cộng lại công phu.', { exact: true })).toBeVisible();
  await expect(page.locator('.archive-preview')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true })).toHaveText('');
});

test('one full book earns one completion and a new run preserves every old chapter', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method()); });
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await prepareBookDraft(page, book.chapters.length, true);
  await finishLastPassage(page, book.chapters.length);
  await expect(page.getByText('Đã chép trọn bộ kinh', { exact: true })).toBeVisible();
  await expect(page.getByText('Đã ghi nhận 1 lượt vào Công phu của tôi. Bản chép được giữ nguyên.', { exact: true })).toBeVisible();
  const copyLogs = () => page.evaluate(() => (JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') ?? '[]') as Array<{type:string}>).filter(log => log.type === 'Chép kinh').length);
  expect(await copyLogs()).toBe(1);
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
  for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    await expect(page.getByRole('button', { name: 'Bắt đầu lượt 2', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/copying-book-complete-${width}-${theme}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Bắt đầu lượt 2', exact: true }).click();
  await expect(page.locator('.writing-title p')).toHaveText(book.chapters[0].title);
  await expect(page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true })).toHaveText('');
  await expect(page.locator('.book-run-progress')).toContainText('Lượt 2');
  expect(await copyLogs()).toBe(1);
  const archives = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('drafts'), read = tx.objectStore('drafts').getAllKeys();
      tx.oncomplete = () => { resolve(read.result.filter(key => String(key).includes(':run:')).length); db.close(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  expect(archives).toBe(book.chapters.length);
  await page.reload();
  await beginScriptureCopying(page);
  await expect(page.locator('.book-run-progress')).toContainText('Lượt 2');
  expect(await copyLogs()).toBe(1);
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Xem lượt chép 1', exact: true }).click();
  await expect(page.locator('.archive-preview')).not.toBeEmpty();
  expect(requests).toEqual([]);
});

for (const width of [375, 1440]) test(`idle completion respects composition and cancels when choosing again at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const input = page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });
  const completed = normalizeCopyText(book.chapters[0].blocks[0]);
  await input.evaluate((element, value) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true }));
  }, completed);
  await page.waitForTimeout(750); // Deliberately cross the 600ms auto-advance deadline.
  await expect(page.locator('#copy-block')).toHaveValue('0');
  await input.dispatchEvent('compositionend');
  await expect(page.locator('#copy-block')).toHaveValue('1');
  await expect(input).toBeFocused();
  await input.evaluate((element, value) => {
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }, normalizeCopyText(book.chapters[0].blocks[1]));
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await page.waitForTimeout(750);
  await beginScriptureCopying(page);
  await expect(page.locator('#copy-block')).toHaveValue('1');
  await expect(input).not.toBeEmpty();
});

test('finishing a passage with Enter advances once and preserves the completed draft', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method()); });
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const input = page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });
  const completed = normalizeCopyText(book.chapters[0].blocks[0]);
  // Commit the last word and Enter in the same task, before the idle advance timer.
  await input.evaluate((element, value) => {
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' }));
  }, completed);
  await expect(page.locator('#copy-block')).toHaveValue('1');
  await expect(input).toHaveText('');
  await expect(page.locator('#copy-source-title small')).toHaveText(`2/${book.chapters[0].blocks.length}`);
  await expect(input).toBeFocused();
  await input.pressSequentially('Bản chép đoạn tiếp theo');
  await expect(page.getByText('Đã lưu trên máy', { exact: true })).toBeVisible();
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await beginScriptureCopying(page);
  await expect(page.locator('#copy-block')).toHaveValue('1');
  await expect(input).toHaveText('Bản chép đoạn tiếp theo');
  await page.locator('#copy-block').selectOption({ value: '0' });
  await expect(page.locator('#copy-source-title small')).toHaveText(`1/${book.chapters[0].blocks.length}`);
  await expect(input).toContainText(completed);
  expect(requests).toEqual([]);
});

test('only an administrator can paste plain text into the copying editor for testing', async ({ page, baseURL }) => {
  const secure = baseURL!.startsWith('https:');
  await page.context().addCookies([{ name: secure ? '__Host-quangtu_session' : 'quangtu_session', value: 'e2e-google-admin-session-token', url: baseURL!, httpOnly: true, secure, sameSite: 'Lax' }]);
  const writes: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/practice/copying') && request.method() !== 'GET') writes.push(request.method()); });
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const input = page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });
  await expect(page.getByText('Quản trị · Cho phép dán', { exact: true })).toBeVisible();
  await input.focus();
  await input.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'Nam mô Phật <img>');
    clipboardData.setData('text/html', '<img src="/invalid-test-image">');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(input).toHaveText('Nam mô Phật <img>');
  await expect(input.locator('img')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('three-step copying expands the editor and preserves local text when choosing again', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') requests.push(request.method()); });
  await page.goto('/tu-tap/chep-kinh');
  const input = page.getByLabel('Tự gõ bản chép của bạn', { exact: true });
  await expect(page.getByRole('heading', { name: 'Bạn muốn chép bộ kinh nào?' })).toBeVisible();
  await expect(input).toHaveCount(0);
  await beginScriptureCopying(page);
  await expect(input).toBeVisible();
  await expect(page.locator('.tt-topbar')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Điều hướng nhanh' })).toBeHidden();
  const before = (await input.boundingBox())!;
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click();
  await expect(page.locator('#copy-source-text')).toHaveCount(0);
  const expanded = (await input.boundingBox())!;
  expect(expanded.width * expanded.height).toBeGreaterThan(before.width * before.height * 1.1);
  await input.pressSequentially('Nam mô Phật');
  await expect(page.getByText('Đã lưu trên máy', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đổi kinh hoặc phẩm', exact: true }).click();
  await expect(input).toHaveCount(0);
  await expect(page.locator('.tt-topbar')).toBeVisible();
  await beginScriptureCopying(page);
  await expect(input).toHaveText('Nam mô Phật');
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bản đã lưu trong tài khoản' })).toBeVisible();
  expect(requests).toEqual([]);
});

test('copying keeps drafts locally and never saves until an authenticated explicit click', async ({ page }) => {
  const writes: string[] = [];
  const copyRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/practice/copying')) copyRequests.push(request.method()); });
  page.on('request', request => { if (request.url().includes('/api/practice/copying') && request.method() !== 'GET') writes.push(request.method()); });
  await page.goto('/tu-tap/chep-kinh');
  await expect(page.getByRole('heading', { name: 'Bản chép được lưu ở đâu?' })).toBeVisible();
  await page.getByRole('button', { name: 'Đã hiểu', exact: true }).click();
  await beginScriptureCopying(page);
  const input = page.getByLabel('Tự gõ bản chép của bạn');
  await expect(input).toBeVisible();
  const source = page.locator('.source-panel .source');
  await expect(source).not.toContainText('{align:');
  await expect(source).not.toContainText('**');
  await expect(source).toHaveCSS('font-size', '20px');
  await page.getByRole('button', {name:'Tăng cỡ chữ',exact:true}).click();
  await expect(source).toHaveCSS('font-size', '22px');
  await page.getByRole('button', {name:'Giảm cỡ chữ',exact:true}).click();
  await expect(source).toHaveCSS('font-size', '20px');
  await input.pressSequentially('Nam mo');
  await expect(page.getByText('Đã lưu trên máy', { exact: true })).toBeVisible();
  await expect.poll(() => writes.length).toBe(0);
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await beginScriptureCopying(page);
  await expect(input).toHaveText('Nam mo');
  await input.pressSequentially(' Phat');
  await expect(page.getByText('Đã lưu trên máy', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(copyRequests).toEqual([]);
  await page.getByRole('button', { name: 'Rà soát đoạn này' }).click();
  await expect(page.getByRole('region', { name: 'Vị trí cần sửa' })).toBeVisible();
  await input.dispatchEvent('paste');
  await expect(input).toHaveText('Nam mo Phat');
  await page.getByRole('button', { name: 'Lưu lên hệ thống', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test('authenticated save acknowledges exactly the submitted snapshot and restores it explicitly', async ({ page, baseURL }) => {
  const secure = baseURL!.startsWith('https:');
  await page.context().addCookies([{ name: secure ? '__Host-quangtu_session' : 'quangtu_session', value: 'e2e-google-admin-session-token', url: baseURL!, httpOnly: true, secure, sameSite: 'Lax' }]);
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await expect(page.getByText('Bạn có thể lưu cả khi chép dở.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
  const input = page.getByLabel('Tự gõ bản chép của bạn');
  await expect(input).toBeVisible();
  const writes: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/practice/copying') && request.method() === 'PUT') writes.push(request.method()); });
  await input.pressSequentially('Nam mo');
  await expect(page.getByText('Đã lưu trên máy', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Lưu lên hệ thống', exact: true }).click();
  await expect(page.getByText('Đã lưu lên hệ thống thành công.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Lưu lên hệ thống', exact: true }).click();
  expect(writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Xem bản đã lưu trên hệ thống' }).click();
  await expect(page.getByRole('button', { name: 'Mở bản này' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mở bản này' }).first().click();
  await acceptAppConfirm(page, 'Mở bản hệ thống để tiếp tục?');
  await acceptAppConfirm(page, 'Đã tải được bản hệ thống. Thay bản đang chép trên máy bằng bản này?');
  await expect(page.getByText('Đã mở bản hệ thống trên thiết bị này.')).toBeVisible();
  await expect(input).toHaveText('Nam mo');
  expect(writes).toHaveLength(1);
});

test('copying remains usable on narrow screens in light and dark', async ({ page }) => {
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.getByLabel('Tự gõ bản chép của bạn')).toBeVisible();
  for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    await page.getByLabel('Tự gõ bản chép của bạn').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `output/scripture-copying/${width}-${theme}.png`, fullPage: true });
  }
});

test('login keeps the guest draft separate until the user explicitly adopts and saves it', async ({ page, baseURL }) => {
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  const input = page.getByLabel('Tự gõ bản chép của bạn');
  await expect(input).toBeVisible();
  await input.pressSequentially('Ban chep khach');
  await expect(page.getByText('Đã lưu trên máy', { exact: true })).toBeVisible();
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/practice/copying')) requests.push(request.method()); });
  const secure = baseURL!.startsWith('https:');
  await page.context().addCookies([{ name: secure ? '__Host-quangtu_session' : 'quangtu_session', value: 'e2e-google-admin-session-token', url: baseURL!, httpOnly: true, secure, sameSite: 'Lax' }]);
  await page.goto('/tu-tap/chep-kinh');
  await beginScriptureCopying(page);
  await expect(page.getByRole('button', { name: 'Tiếp tục bản chép khách trong tài khoản' })).toBeVisible();
  await expect(input).toHaveText('');
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Tiếp tục bản chép khách trong tài khoản' }).click();
  await acceptAppConfirm(page, 'Tiếp tục bản chép khách trong tài khoản này?');
  await expect(input).toHaveText('Ban chep khach');
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Lưu lên hệ thống', exact: true }).click();
  await expect(page.getByText('Đã lưu lên hệ thống thành công.', { exact: true })).toBeVisible();
  expect(requests).toEqual(['PUT']);
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('button', { name: 'Giữ bản trên máy thành lượt chép riêng' }).click();
  await acceptAppConfirm(page, 'Giữ nguyên nội dung trên máy thành một lượt chép riêng?');
  await expect(page.getByText('Đã giữ thành lượt riêng trên máy. Chưa gửi lên hệ thống.')).toBeVisible();
  await expect(input).toHaveText('Ban chep khach');
  expect(requests).toEqual(['PUT']);
});
