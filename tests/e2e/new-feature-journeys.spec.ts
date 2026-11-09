import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { loginAsAdmin, loginAsMember, settleClient, choosePdfOnline, openReaderTools, savePdfOffline, startPdfOfflineDownload, TEST_MEMBER_ID } from './runtime-helpers';

const baseURL = process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787';

function mutation(page: Page, path: string, method: string): Promise<Response> {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path
    && response.request().method() === method);
}

async function csrf(page: Page): Promise<string> {
  const response = await page.request.get('/api/session');
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  expect(session.authenticated).toBe(true);
  expect(session.csrfToken).toBeTruthy();
  return session.csrfToken;
}

async function selectText(content: Locator, text?: string): Promise<string> {
  const value = await content.evaluate((element, requested) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const fullText = nodes.map((node) => node.data).join('');
    const value = requested || fullText.trim().slice(0, 65).trim();
    const start = fullText.indexOf(value);
    if (start < 0 || value.length < 5) throw new Error('Reader selection text is unavailable');
    const end = start + value.length;
    const range = document.createRange();
    let offset = 0;
    let startSet = false;
    for (const node of nodes) {
      const next = offset + node.data.length;
      if (!startSet && start >= offset && start < next) {
        range.setStart(node, start - offset);
        startSet = true;
      }
      if (startSet && end <= next) {
        range.setEnd(node, end - offset);
        break;
      }
      offset = next;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return value;
  }, text);
  if (!await content.evaluate(element => element.classList.contains('pdf-selectable-text'))) {
    await content.page().locator('.quote-floating-bar').getByRole('button', { name: /Ghi chú/u }).click();
  }
  return value;
}

async function openReader(page: Page, title: string): Promise<Locator> {
  await page.goto('/kinh-sach');
  await settleClient(page);
  await page.getByRole('button', { name: `Đọc ngay ${title}`, exact: true }).click();
  const reader = page.getByRole('dialog', { name: title, exact: true });
  await expect(reader).toBeVisible();
  if (title.includes('PDF')) await choosePdfOnline(page);
  return reader;
}

async function readOfflineCopy(page: Page, key: string) {
  return page.evaluate(async (recordKey) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tutam_offline_pdfs', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ status: string; size: number; blobSize: number; checksum: string } | null>((resolve, reject) => {
        const request = database.transaction('documents', 'readonly').objectStore('documents').get(recordKey);
        request.onsuccess = () => {
          const record = request.result;
          resolve(record ? { status: record.status, size: record.sizeBytes, blobSize: record.blob.size, checksum: record.checksum } : null);
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, key);
}

async function expectPointerTarget(control: Locator): Promise<void> {
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return Boolean(target && element.contains(target));
  }), { message: 'The visible action must receive a pointer without automatic scrolling' }).toBe(true);
}

async function textContrast(element: Locator): Promise<number> {
  return element.evaluate((node) => {
    const rgba = (value: string) => {
      const values = value.match(/[\d.]+/gu)?.map(Number) ?? [0, 0, 0];
      return [...values.slice(0, 3), values[3] ?? 1];
    };
    const backgrounds: number[][] = [];
    for (let current: Element | null = node; current; current = current.parentElement) {
      backgrounds.unshift(rgba(getComputedStyle(current).backgroundColor));
    }
    let background = [255, 255, 255];
    for (const color of backgrounds) background = background.map((value, index) => color[index] * color[3] + value * (1 - color[3]));
    const foreground = rgba(getComputedStyle(node).color);
    const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, value, index) => {
      const normalized = value / 255;
      return sum + (normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    return (light + 0.05) / (dark + 0.05);
  });
}

for (const kind of ['article', 'pdf'] as const) {
  test(`${kind} dark highlights remain readable and annotation actions work at phone and landscape sizes`, async ({ page }, testInfo) => {
    test.setTimeout(45_000);
    await loginAsMember(page);
    await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
    await page.setViewportSize({ width: 390, height: 844 });
    const reader = await openReader(page, kind === 'pdf' ? 'Bài PDF kiểm thử E2E' : 'Bài viết kiểm thử E2E');
    if (kind === 'pdf') {
      await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
      await reader.getByTitle('Tô sáng và ghi chú văn bản PDF').click();
      await expect(reader.locator('.pdf-selectable-text')).not.toBeEmpty();
      await expect(reader.locator('.pdf-floating-pager')).toHaveCount(0);
      await expect(reader.locator('.reader-tools-toggle')).toBeHidden();
    }
    await selectText(reader.locator(kind === 'pdf' ? '.pdf-selectable-text' : '.reader-content'));
    const composer = reader.locator(kind === 'pdf' ? '.pdf-annotation-editor' : '.annotation-composer');
    await composer.getByLabel(kind === 'pdf' ? 'Ghi chú' : 'Ghi chú riêng', { exact: true }).fill('Ghi chú trên màn hình nhỏ.');
    const save = composer.getByRole('button', { name: kind === 'pdf' ? 'Lưu' : 'Lưu trích dẫn', exact: true });
    await expect(save).toBeVisible();
    expect(await textContrast(save)).toBeGreaterThanOrEqual(4.5);
    if (kind === 'pdf') {
      await expectPointerTarget(save);
      await expectPointerTarget(composer.getByRole('button', { name: 'Hủy', exact: true }));
    }
    await save.click();
    const mark = reader.locator(kind === 'pdf' ? '.text-highlight' : 'mark[data-reading-annotation]').first();
    await expect(mark).toBeVisible();
    expect(await textContrast(mark)).toBeGreaterThanOrEqual(4.5);
    await mark.click();
    await page.setViewportSize({ width: 844, height: 390 });
    await save.scrollIntoViewIfNeeded();
    const bounds = await save.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
    if (kind === 'pdf') {
      await expectPointerTarget(save);
      await expectPointerTarget(composer.getByRole('button', { name: 'Hủy', exact: true }));
    }
    await testInfo.attach(`${kind}-dark-landscape`, { body: await page.screenshot(), contentType: 'image/png' });
    await save.click();
    await expect(composer).toHaveCount(0);
    if (kind === 'pdf') {
      await reader.getByRole('button', { name: 'Đóng bảng trích dẫn', exact: true }).click();
      await expect(reader.locator('.pdf-floating-pager')).toBeVisible();
      await expectPointerTarget(reader.locator('.pdf-floating-pager').getByRole('button', { name: 'Phóng to', exact: true }));
      await page.setViewportSize({ width: 390, height: 844 });
      const tools = reader.getByRole('button', { name: 'Công cụ', exact: true });
      await expect(tools).toBeVisible();
      await expectPointerTarget(tools);
    }
  });
}

test.describe('authenticated reading and saved audio journeys', () => {
  for (const fixture of [
    { kind: 'article', id: 'e2e-public', title: 'Bài viết kiểm thử E2E' },
    { kind: 'pdf', id: 'e2e-pdf', title: 'Bài PDF kiểm thử E2E' },
  ]) {
    test(`${fixture.kind} selection survives reload and another browser can edit, open its source and delete it`, async ({ page, browser }) => {
      test.setTimeout(60_000);
      const note = `Ghi chú ${fixture.kind} E2E ${Date.now()}`;
      let annotationId: string | undefined;
      await loginAsAdmin(page);
      const token = await csrf(page);
      const second = await browser.newContext({ baseURL, serviceWorkers: 'block' });
      try {
        let reader = await openReader(page, fixture.title);
        let content: Locator;
        let composer: Locator;
        if (fixture.kind === 'pdf') {
          await expect(reader.locator('.pdf-page canvas').first()).toHaveAttribute('data-rendered', /\d+/u);
          await reader.getByTitle('Tô sáng và ghi chú văn bản PDF').click();
          content = reader.locator('.pdf-selectable-text');
          await expect(content).not.toBeEmpty();
          composer = reader.locator('.pdf-annotation-editor');
        } else {
          content = reader.locator('.reader-content');
          composer = reader.getByRole('complementary', { name: 'Tạo trích dẫn' });
        }
        const quoteText = await selectText(content);
        await expect(composer).toBeVisible();
        await composer.getByLabel(fixture.kind === 'pdf' ? 'Ghi chú' : 'Ghi chú riêng', { exact: true }).fill(note);
        await composer.getByRole('radio', { name: 'Xanh', exact: true }).check();
        const created = mutation(page, '/api/reading/annotations', 'POST');
        await composer.getByRole('button', { name: fixture.kind === 'pdf' ? 'Lưu' : 'Lưu trích dẫn', exact: true }).click();
        const response = await created;
        expect(response.ok()).toBeTruthy();
        annotationId = response.request().postDataJSON().id;
        expect(annotationId).toBeTruthy();
        await expect(composer).toHaveCount(0);

        reader = await openReader(page, fixture.title);
        if (fixture.kind === 'pdf') await reader.getByTitle('Tô sáng và ghi chú văn bản PDF').click();
        const mark = reader.locator(fixture.kind === 'pdf' ? '.text-highlight' : 'mark[data-reading-annotation]')
          .filter({ hasText: quoteText });
        await expect(mark).toHaveCount(1);
        await expect(mark).toHaveAttribute('data-color', 'green');
        await mark.click();
        await expect(reader.getByLabel(fixture.kind === 'pdf' ? 'Ghi chú' : 'Ghi chú riêng', { exact: true })).toHaveValue(note);

        // A new context has no local annotation cache. Seeing this note here
        // proves the authenticated API stored the real reader mutation.
        const other = await second.newPage();
        await loginAsAdmin(other);
        await other.goto('/trich-dan-cua-toi');
        await settleClient(other);
        let card = other.locator('.quotes-list article').filter({ hasText: note });
        await expect(card).toContainText(quoteText);
        await card.getByRole('button', { name: 'Sửa', exact: true }).click();
        const editor = other.getByRole('dialog', { name: 'Sửa trích dẫn' });
        await editor.getByLabel('Ghi chú', { exact: true }).fill(`${note} đã sửa`);
        await editor.getByRole('radio', { name: 'Vàng', exact: true }).check();
        const updated = mutation(other, `/api/reading/annotations/${annotationId}`, 'PATCH');
        await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
        expect((await updated).ok()).toBeTruthy();
        await expect(editor).toHaveCount(0);
        await other.reload();
        await settleClient(other);
        card = other.locator('.quotes-list article').filter({ hasText: `${note} đã sửa` });
        await expect(card).toBeVisible();
        await card.getByRole('link', { name: new RegExp(fixture.title, 'u') }).click();
        await expect(other.getByRole('dialog', { name: fixture.title, exact: true })).toBeVisible();

        await other.goto('/trich-dan-cua-toi');
        await settleClient(other);
        card = other.locator('.quotes-list article').filter({ hasText: `${note} đã sửa` });
        const deleted = mutation(other, `/api/reading/annotations/${annotationId}`, 'DELETE');
        await card.getByRole('button', { name: 'Xóa', exact: true }).click();
        const deleteConfirmation = other.locator('dialog[data-app-message]');
        await expect(deleteConfirmation).toContainText('Xóa trích dẫn này?');
        await deleteConfirmation.getByRole('button', { name: 'Đồng ý', exact: true }).click();
        expect((await deleted).ok()).toBeTruthy();
        await expect(card).toHaveCount(0);
        await other.reload();
        await settleClient(other);
        await expect(other.locator('.quotes-list article').filter({ hasText: note })).toHaveCount(0);
        const remaining = await page.request.get(`/api/reading/annotations?contentKind=${fixture.kind}&contentId=${fixture.id}`);
        expect((await remaining.json()).annotations.some((row: { id: string }) => row.id === annotationId)).toBe(false);
        annotationId = undefined;
      } finally {
        await second.close();
        if (annotationId) {
          const cleanup = await page.request.delete(`/api/reading/annotations/${annotationId}`, { headers: { 'x-csrf-token': token, origin: baseURL } });
          expect([200, 204, 404]).toContain(cleanup.status());
        }
      }
    });
  }

  test('favorite mutations persist across browsers with combined metadata filters', async ({ page, browser }) => {
    const title = 'Pháp thoại kiểm thử E2E';
    await loginAsAdmin(page);
    await page.goto('/phap-thoai');
    await settleClient(page);
    const second = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    const labels = ['Yêu thích'];
    const original: boolean[] = [];
    const openAlbum = async (target: Page) => {
      await target.getByRole('button', { name: `Xem chi tiết album ${title}`, exact: true }).click();
      const dialog = target.getByRole('dialog', { name: title, exact: true });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    try {
      const album = await openAlbum(page);
      for (const label of labels) {
        const remove = album.getByRole('button', { name: `Bỏ khỏi ${label}`, exact: true });
        original.push(await remove.count() > 0);
        if (await remove.count()) await remove.click();
        await album.getByRole('button', { name: `Thêm vào ${label}`, exact: true }).click();
        await expect(album.getByRole('button', { name: `Bỏ khỏi ${label}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(album.getByRole('button', { name: `Bỏ khỏi ${label}`, exact: true })).toBeEnabled();
      }
      await album.getByRole('button', { name: 'Quay lại', exact: true }).click();
      await expect(album).toHaveCount(0);
      await page.reload();
      await settleClient(page);
      const reloadedAlbum = await openAlbum(page);
      for (const label of labels) await expect(reloadedAlbum.getByRole('button', { name: `Bỏ khỏi ${label}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await reloadedAlbum.getByRole('button', { name: 'Quay lại', exact: true }).click();
      await expect(reloadedAlbum).toHaveCount(0);

      const other = await second.newPage();
      await loginAsAdmin(other);
      await other.goto('/phap-thoai');
      await settleClient(other);
      const otherAlbum = await openAlbum(other);
      for (const label of labels) await expect(otherAlbum.getByRole('button', { name: `Bỏ khỏi ${label}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await otherAlbum.getByRole('button', { name: 'Quay lại', exact: true }).click();
      await expect(otherAlbum).toHaveCount(0);
      await other.getByRole('button', { name: 'Tìm kiếm và bộ lọc', exact: true }).click();
      const speaker = other.getByRole('combobox', { name: 'Mọi giảng sư' });
      await speaker.selectOption({ index: 1 });
      await other.getByRole('combobox', { name: 'Mọi thời lượng' }).selectOption('short');
      await expect(other.getByRole('button', { name: `Mở album ${title}`, exact: true })).toBeVisible();
      await other.getByRole('combobox', { name: 'Mọi thời lượng' }).selectOption('long');
      await expect(other.getByRole('button', { name: `Mở album ${title}`, exact: true })).toHaveCount(0);
      await other.getByRole('combobox', { name: 'Mọi thời lượng' }).selectOption('all');
      const filteredAlbum = await openAlbum(other);
      for (const label of labels) {
        await filteredAlbum.getByRole('button', { name: `Bỏ khỏi ${label}`, exact: true }).click();
        await expect(filteredAlbum.getByRole('button', { name: `Thêm vào ${label}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
        await expect(filteredAlbum.getByRole('button', { name: `Thêm vào ${label}`, exact: true })).toBeEnabled();
      }
      await page.reload();
      await settleClient(page);
      const syncedAlbum = await openAlbum(page);
      for (const label of labels) await expect(syncedAlbum.getByRole('button', { name: `Thêm vào ${label}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await second.close();
      await page.goto('/phap-thoai');
      await settleClient(page);
      const cleanupAlbum = await openAlbum(page);
      for (const [index, label] of labels.entries()) {
        if (original[index] === undefined) continue;
        const current = cleanupAlbum.getByRole('button', { name: `${original[index] ? 'Thêm vào' : 'Bỏ khỏi'} ${label}`, exact: true });
        if (await current.count()) await current.click();
      }
    }
  });
});

test.describe('PDF browser lifecycle', () => {
  test.use({ serviceWorkers: 'allow' });
  test.beforeEach(async ({ page }) => { await loginAsMember(page); });

  test('canceling a partial offline download leaves no copy, then retry is complete and readable offline', async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    const reader = await openReader(page, 'Bài PDF kiểm thử E2E');
    const key = `${TEST_MEMBER_ID}:e2e-pdf`;
    expect(await readOfflineCopy(page, key)).toBeNull();
    const transport = await context.newCDPSession(page);
    try {
      await transport.send('Network.enable');
      await transport.send('Network.setCacheDisabled', { cacheDisabled: true });
      await transport.send('Network.setBypassServiceWorker', { bypass: true });
      await transport.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 4096, uploadThroughput: -1 });
      await startPdfOfflineDownload(page);
      const downloading = page.getByRole('dialog', { name: 'Đang tải sách PDF...', exact: true });
      const progress = downloading.getByRole('progressbar', { name: 'Tiến độ tải sách PDF', exact: true });
      await expect.poll(() => progress.evaluate((element: HTMLProgressElement) => element.value)).toBeGreaterThan(0);
      const partial = await progress.evaluate((element: HTMLProgressElement) => ({ received: element.value, total: element.max }));
      expect(partial.received).toBeLessThan(partial.total);
      for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        const cancel = downloading.getByRole('button', { name: 'Hủy tải', exact: true });
        await expectPointerTarget(cancel);
      }
      await downloading.getByRole('button', { name: 'Hủy tải', exact: true }).click();
      await expect(downloading).toHaveCount(0);
      expect(await readOfflineCopy(page, key)).toBeNull();
      await transport.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await page.setViewportSize({ width: 1440, height: 900 });
      const manager = await savePdfOffline(page);
      await expect(manager).toContainText('Sẵn sàng khi mất mạng.');
      const fixture = await readFile('assets/pdfs/bai-viet-mau-gieo-nhan-lanh.pdf');
      expect(await readOfflineCopy(page, key)).toEqual({ status: 'complete', size: fixture.length, blobSize: fixture.length, checksum: createHash('sha256').update(fixture).digest('hex') });
      await manager.getByRole('button', { name: 'Đóng quản lý ngoại tuyến', exact: true }).click();
      await page.keyboard.press('Escape');
      // Throttling bypasses browser caches only for the transfer/cancel phase.
      await transport.send('Network.setCacheDisabled', { cacheDisabled: false });
      await transport.send('Network.setBypassServiceWorker', { bypass: false });
      await context.setOffline(true);
      await page.getByRole('button', { name: 'Đọc ngay Bài PDF kiểm thử E2E', exact: true }).click();
      await expect(page.locator('.pdf-page canvas[data-rendered]').first()).toBeVisible();
      expect(await page.evaluate(() => fetch('/api/health', { cache: 'no-store' }).then(() => false, () => true))).toBe(true);
      await testInfo.attach('offline-pdf', { body: await page.screenshot(), contentType: 'image/png' });
    } finally {
      await context.setOffline(false); await transport.detach();
    }
  });

  test('a real image-only PDF renders but Speak reports no text without starting an utterance', async ({ page, browser }, testInfo) => {
    await loginAsAdmin(page);
    const token = await csrf(page);
    const fixture = await readFile(new URL('./fixtures/image-only.pdf', import.meta.url));
    const uploaded = await page.request.post('/api/media', {
      headers: {
        'x-csrf-token': token, origin: baseURL, 'content-type': 'application/pdf',
        'x-content-sha256': createHash('sha256').update(fixture).digest('base64url'),
        'x-media-prefix': 'pdfs', 'x-file-name': 'image-only.pdf', 'idempotency-key': randomUUID(),
      },
      data: fixture,
    });
    expect(uploaded.status()).toBe(201);
    const media = await uploaded.json();
    expect(media.byteSize).toBe(fixture.length);
    let articleId: string | undefined;
    const member = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    try {
      const title = `PDF chỉ có ảnh ${randomUUID()}`;
      const created = await page.request.post('/api/articles', {
        headers: { 'x-csrf-token': token, origin: baseURL },
        data: {
          id: randomUUID(), tieu_de: title, tom_tat: 'Một trang ảnh không có lớp văn bản.',
          noi_dung: '', pdf_url: media.url, danh_muc: 'BÀI VIẾT', tac_gia: 'Kiểm thử PDF',
          trang_thai: 'Hoàn thành', has_muc_luc: false, so_tap: 0, noi_bat: false,
          ngay_dang: new Date().toISOString(),
        },
      });
      expect(created.ok()).toBeTruthy();
      articleId = (await created.json())[0].id;
      const reading = await member.newPage();
      await loginAsMember(reading);
      const reader = await openReader(reading, title);
      const canvas = reader.locator('.pdf-page canvas').first();
      await expect(canvas).toHaveAttribute('data-rendered', /\d+/u);
      // The embedded four-color raster must actually paint, not merely produce
      // a nonzero blank canvas or a text extractor stub.
      expect(await canvas.evaluate((element: HTMLCanvasElement) => {
        const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
        let colored = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 30) colored++;
        }
        return colored / (element.width * element.height);
      })).toBeGreaterThan(0.4);
      expect(await reading.evaluate(() => Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance))).toBe(true);
      await reader.getByTitle('Đọc trang hiện tại', { exact: true }).click();
      await expect(reader.locator('.pdf-capability-message[role="status"]')).toHaveText('Trang này không có lớp văn bản để đọc. Tài liệu quét cần OCR, hiện chưa được hỗ trợ.');
      await expect(reader.getByTitle('Đọc trang hiện tại', { exact: true })).toHaveAttribute('aria-pressed', 'false');
      await expect(reader.getByRole('button', { name: 'Dừng đọc trang', exact: true })).toHaveCount(0);
      expect(await reading.evaluate(() => ({ pending: speechSynthesis.pending, speaking: speechSynthesis.speaking }))).toEqual({ pending: false, speaking: false });
      const screenshot = testInfo.outputPath('image-only-pdf-no-text.png');
      await reading.screenshot({ path: screenshot });
      await testInfo.attach('image-only-pdf-no-text', { path: screenshot, contentType: 'image/png' });
    } finally {
      await member.close();
      if (articleId) {
        const removed = await page.request.delete(`/api/articles/${articleId}`, { headers: { 'x-csrf-token': token, origin: baseURL } });
        expect(removed.ok()).toBeTruthy();
        expect(await (await page.request.get(`/api/articles/${articleId}`)).json()).toEqual([]);
      } else {
        const removed = await page.request.delete(`/api/media/${media.objectKey}`, {
          headers: { 'x-csrf-token': token, origin: baseURL, 'idempotency-key': randomUUID() },
        });
        expect(removed.ok()).toBeTruthy();
      }
      // Public immutable bytes may remain cached after the manifest is
      // tombstoned. Validate the fresh proxy response, not cache revocation.
      expect((await page.request.get(media.url, { headers: { 'cache-control': 'no-cache' } })).status()).toBe(404);
    }
  });

  for (const dark of [false, true]) {
    test(`PDF selected toolbar and download action text remain readable in ${dark ? 'dark' : 'light'} mode`, async ({ page }, testInfo) => {
      await page.addInitScript((enabled) => localStorage.setItem('tutam_dark_mode', enabled ? '1' : '0'), dark);
      const reader = await openReader(page, 'Bài PDF kiểm thử E2E');
      const sepia = reader.getByTitle('Chế độ nền ấm', { exact: true });
      if (await sepia.getAttribute('aria-pressed') !== 'true') await sepia.click();
      await expect(sepia).toHaveAttribute('aria-pressed', 'true');
      // Measure the settled selected state, not an intermediate background
      // transition immediately after the text color changes.
      await expect.poll(() => sepia.evaluate((element) => element.getAnimations().length)).toBe(0);
      expect(await textContrast(sepia)).toBeGreaterThanOrEqual(4.5);
      await page.locator('.pdf-offline-main-btn').click();
      expect(await textContrast(page.getByRole('button', { name: 'Tải về máy', exact: true }))).toBeGreaterThanOrEqual(4.5);
      await testInfo.attach(`pdf-actions-${dark ? 'dark' : 'light'}`, {
        body: await page.screenshot(), contentType: 'image/png',
      });
    });
  }

  test('PDF thumbnails and explicit page entry keep the canonical page through automatic orientation changes', async ({ page }) => {
    const reader = await openReader(page, 'Bài PDF kiểm thử E2E');
    const scrubber = reader.getByRole('spinbutton', { name: 'Số trang PDF' });
    await expect(scrubber).toBeEnabled();
    await reader.getByRole('combobox', { name: 'Bố cục trang', exact: true }).selectOption('auto');
    await reader.getByTitle('Ảnh thu nhỏ các trang').click();
    const thumbnails = reader.getByRole('complementary', { name: 'Điều hướng bằng ảnh thu nhỏ' });
    await thumbnails.getByRole('button', { name: 'Đi đến trang 3', exact: true }).click();
    await expect(scrubber).toHaveValue('2');
    await expect(reader.locator('.pdf-spread[data-canonical-page="2"] .pdf-page')).toHaveCount(2);
    await expect(thumbnails).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(reader.locator('.pdf-spread')).toHaveCount(3);
    await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
    await scrubber.fill('3');
    await scrubber.press('Enter');
    await expect(scrubber).toHaveValue('3');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(scrubber).toHaveValue('2');
    await expect(reader.locator('.pdf-spread[data-canonical-page="2"] .pdf-page')).toHaveCount(2);
  });

  test('cold offline opening requires login and preserves the saved PDF for authenticated reconnect', async ({ page, context }) => {
    test.setTimeout(90_000);
    const reader = await openReader(page, 'Bài PDF kiểm thử E2E');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(reader.locator('.pdf-page canvas').first()).toHaveAttribute('data-rendered', /\d+/u);
    const offline = await savePdfOffline(page);
    await expect(offline).toContainText('Sẵn sàng khi mất mạng.');
    // Remove only this PDF from HTTP caches. Its explicit IndexedDB download
    // must be sufficient; a coincidental precache hit cannot satisfy the test.
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        await cache.delete('/assets/pdfs/bai-viet-mau-gieo-nhan-lanh.pdf');
      }
    });
    await page.close();
    const cold = await context.newPage();
    await context.setOffline(true);
    try {
      const response = await cold.goto('/?article=e2e-pdf');
      expect(response?.fromServiceWorker()).toBe(true);
      await settleClient(cold);
      // Chromium can report navigator.onLine=true after a SW navigation even
      // while its network is disabled. A network-only API request must fail.
      expect(await cold.evaluate(() => fetch('/api/health', { cache: 'no-store' }).then(() => false, () => true))).toBe(true);
      const reopened = cold.getByRole('dialog', { name: 'Bài PDF kiểm thử E2E' });
      await expect(cold.getByRole('heading', {name:'Quý Phật Tử', exact:true})).toBeVisible();
      await cold.getByRole('link', { name:'Trang cá nhân & Cài đặt', exact:true }).click();
      await cold.locator('.cn-tab-theme-auth').click();
      await expect(cold).toHaveURL(/\/ca-nhan\?tab=account/);
      await expect(cold.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true })).toBeVisible();
      await expect(reopened).toHaveCount(0);
      expect(await readOfflineCopy(cold, `${TEST_MEMBER_ID}:e2e-pdf`)).toMatchObject({ status: 'complete' });
      await context.setOffline(false);
      await loginAsMember(cold);
      await cold.goto('/?article=e2e-pdf');
      await settleClient(cold);
      await expect(reopened).toBeVisible();
      const canvas = reopened.locator('.pdf-page canvas').first();
      await expect(canvas).toHaveAttribute('data-rendered', /\d+/u);
      expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width > 100 && element.height > 100)).toBe(true);
      await openReaderTools(cold);
      await cold.locator('.pdf-offline-main-btn').click();
      await expect(reopened.getByRole('region', { name: 'Quản lý PDF ngoại tuyến' })).toContainText('Sẵn sàng khi mất mạng.');
      await reopened.getByRole('button', { name: 'Xóa và giải phóng' }).click();
      await expect(cold.locator('.pdf-offline-main-btn')).toContainText('Tải để đọc offline');
    } finally {
      await context.setOffline(false);
      await cold.close();
    }
  });

  test('authenticated saved PDF cards stay read-only during catalog failure and restore authoritative data on reconnect', async ({ page, context }) => {
    test.setTimeout(90_000);
    await loginAsAdmin(page);
    const reader = await openReader(page, 'Bài PDF kiểm thử E2E');
    const offline = await savePdfOffline(page);
    await expect(offline).toContainText('Sẵn sàng khi mất mạng.');
    await page.keyboard.press('Escape');
    // Abort the real catalog transport, not its response or stored records.
    // The authenticated SSR session remains authoritative and is not cached.
    await page.route('**/api/articles?*', (route) => route.abort('internetdisconnected'));
    try {
      const failed = page.waitForEvent('requestfailed', (request) => new URL(request.url()).pathname === '/api/articles');
      await page.reload();
      await settleClient(page);
      expect((await failed).failure()?.errorText).toContain('ERR_INTERNET_DISCONNECTED');
      expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: true });
      await expect(page.locator('.offline-catalog-notice')).toBeVisible();
      const card = page.locator('.art-card').filter({ has: page.getByRole('button', { name: 'Đọc ngay Bài PDF kiểm thử E2E', exact: true }) });
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Sửa Bài PDF kiểm thử E2E', exact: true })).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Xóa Bài PDF kiểm thử E2E', exact: true })).toHaveCount(0);
      await page.locator('a[href="/phap-thoai"]:visible').first().click();
      await expect(page).toHaveURL('/phap-thoai');
      await page.locator('a[href="/kinh-sach"]:visible').first().click();
      await expect(page).toHaveURL('/kinh-sach');
      await expect(page.locator('.offline-catalog-notice')).toBeVisible();
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Sửa Bài PDF kiểm thử E2E', exact: true })).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Xóa Bài PDF kiểm thử E2E', exact: true })).toHaveCount(0);
      await context.setOffline(true);
      await page.unroute('**/api/articles?*');
      const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/articles' && response.ok());
      await context.setOffline(false);
      await refreshed;
      await expect(page.locator('.offline-catalog-notice')).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Đọc ngay Bài PDF kiểm thử E2E', exact: true })).toBeEnabled();
      // Editing is available in the dedicated admin inventory.
      await expect(card.getByRole('button', { name: 'Sửa Bài PDF kiểm thử E2E', exact: true })).toHaveCount(0);
      await expect(card).toContainText('PDF ba trang dùng để kiểm tra trình đọc.');
      const persisted = await (await page.request.get('/api/data/baiviet?id=eq.e2e-pdf&select=*')).json();
      expect(persisted[0].noi_dung).toBe('<p>Nội dung giới thiệu PDF.</p>');
    } finally {
      await context.setOffline(false);
      await page.unroute('**/api/articles?*');
    }
  });

  test('PDF speech handles real browser capability and cancels on page navigation and reader close', async ({ page }, testInfo) => {
    const reader = await openReader(page, 'Bài PDF kiểm thử E2E');
    await expect(reader.getByTitle('Đọc trang hiện tại')).toBeEnabled();
    const capability = await page.evaluate(() => ({
      supported: Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance),
      voices: window.speechSynthesis?.getVoices().map((voice) => voice.lang) ?? [],
    }));
    testInfo.annotations.push({ type: 'speech-capability', description: JSON.stringify(capability) });
    await reader.getByTitle('Đọc trang hiện tại').click();
    if (!capability.supported) {
      await expect(page.getByText('Trình duyệt không hỗ trợ đọc tự động', { exact: false })).toBeVisible();
      return;
    }
    const stop = reader.getByTitle('Dừng đọc trang', { exact: true });
    await expect.poll(async () => await stop.isVisible() || await reader.getByTitle('Đọc trang hiện tại', { exact: true }).isVisible()).toBe(true);
    if (await stop.isVisible()) {
      await stop.click();
      await expect(reader.getByTitle('Đọc trang hiện tại', { exact: true })).toHaveAttribute('aria-pressed', 'false');
      await reader.getByTitle('Đọc trang hiện tại', { exact: true }).click();
    }
    const scrubber = reader.getByRole('spinbutton', { name: 'Số trang PDF' });
    // Vị trí đọc có thể đã được khôi phục từ phiên trước; phải thực sự chuyển trang để kiểm tra hủy đọc.
    const navigationPage = Number(await scrubber.inputValue()) === 1 ? '2' : '1';
    await scrubber.fill(navigationPage);
    await scrubber.press('Enter');
    await expect(reader.getByTitle('Đọc trang hiện tại')).toHaveAttribute('aria-pressed', 'false');
    await expect(reader.getByTitle('Dừng đọc trang', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => speechSynthesis.speaking || speechSynthesis.pending)).toBe(false);
    await reader.getByTitle('Đọc trang hiện tại').click();
    await page.keyboard.press('Escape');
    await expect(reader).toHaveCount(0);
    expect(await page.evaluate(() => speechSynthesis.speaking || speechSynthesis.pending)).toBe(false);
  });
});

test('an accepted rosary updates progress and a joined campaign once, with real PNG export and public opt-in', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const title = `Chuỗi chánh niệm E2E ${Date.now()}`;
  await loginAsAdmin(page);
  const token = await csrf(page);
  const beforeResponse = await page.request.get('/api/practice/progress');
  const before = await beforeResponse.json();
  let campaignId: string | undefined;
  const guest = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    await page.goto('/admin/practice');
    await settleClient(page);
    await page.getByRole('button', { name: 'Tạo chiến dịch', exact: true }).first().click();
    const form = page.getByRole('region', { name: 'Chiến dịch mới' });
    await form.getByLabel('Tên chiến dịch', { exact: true }).fill(title);
    await form.getByRole('combobox', { name: 'Chỉ số', exact: true }).selectOption('count');
    await form.getByLabel('Giá trị mục tiêu', { exact: true }).fill('108');
    await form.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('active');
    const localDate = (offset: number) => {
      const date = new Date(Date.now() + offset);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      return date.toISOString().slice(0, 16);
    };
    await form.getByLabel('Bắt đầu', { exact: true }).fill(localDate(-3_600_000));
    await form.getByLabel('Kết thúc', { exact: true }).fill(localDate(86_400_000));
    const created = mutation(page, '/api/practice/campaigns', 'POST');
    await form.getByRole('button', { name: 'Lưu chiến dịch' }).click();
    const createResponse = await created;
    expect(createResponse.ok()).toBeTruthy();
    await expect(page.getByText('Đã tạo chiến dịch.', { exact:true })).toBeVisible();
    const campaigns = await (await page.request.get('/api/practice/campaigns')).json();
    campaignId = campaigns.campaigns.find((campaign: { title:string }) => campaign.title === title)?.id;
    expect(campaignId).toBeTruthy();
    await page.goto('/tien-do-tu-tap');
    await settleClient(page);
    await page.getByRole('button', { name: `Tham gia chiến dịch ${title}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Rời chiến dịch ${title}`, exact: true })).toBeVisible();
    await page.reload();
    await settleClient(page);
    await expect(page.getByRole('button', { name: `Rời chiến dịch ${title}`, exact: true })).toBeVisible();

    await page.goto('/tu-tap');
    await settleClient(page);
    await page.locator('button.tt-mode-card--chuoi').click();
    await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
    const rosary = page.getByRole('region', { name: 'Chế độ lần chuỗi' });
    await rosary.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
    await rosary.getByRole('combobox', { name: 'Số hạt trong chuỗi', exact: true }).click();
    await page.getByRole('dialog', { name: 'Chuỗi', exact: true }).getByRole('button', { name: '18 hạt', exact: true }).click();
    await rosary.getByLabel('Bật âm thanh khi đếm').uncheck();
    for (let count = 1; count <= 18; count += 1) {
      await rosary.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
      await page.waitForTimeout(450);
    }
    await expect(rosary.getByText('1 chuỗi hoàn tất', { exact: true })).toBeVisible();
    const completed = page.waitForResponse((response) => /\/api\/practice\/sessions\/[^/]+\/complete$/u.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST');
    await rosary.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
    await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
    await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
    const completionResponse = await completed;
    expect(completionResponse.ok()).toBeTruthy();
    // The outbox intentionally does not consume response bodies. Read back the
    // accepted session through the authenticated listing instead of depending
    // on DevTools retaining an unconsumed fetch response body.
    const clientSessionId = decodeURIComponent(new URL(completionResponse.url()).pathname.split('/').at(-2)!);
    const sessions = await (await page.request.get('/api/practice/sessions?limit=100')).json();
    expect(sessions.sessions.find((item: { clientSessionId: string }) => item.clientSessionId === clientSessionId))
      .toMatchObject({ activityType: 'rosary', verificationResult: 'accepted', acceptedCount: 18 });
    const replay = await page.request.post(completionResponse.url(), {
      data: completionResponse.request().postDataJSON(), headers: { 'x-csrf-token': token, origin: baseURL },
    });
    expect(replay.ok()).toBeTruthy();
    expect((await replay.json()).completed).toBe(false);

    await page.goto('/tien-do-tu-tap');
    await settleClient(page);
    const totals = await (await page.request.get('/api/practice/progress')).json();
    expect(totals.totals.acceptedCount).toBe(before.totals.acceptedCount + 18);
    expect(totals.totals.sessions).toBe(before.totals.sessions + 1);
    const campaign = page.locator('.practice-campaigns article').filter({ hasText: title });
    await expect(campaign.locator('progress')).toHaveAttribute('value', '18');
    await expect(page.locator('.practice-community__summary > div').filter({ hasText: 'Tổng số biến' }).locator('dd'))
      .toHaveText(totals.totals.acceptedCount.toLocaleString('vi-VN'));

    const optIn = page.getByRole('checkbox', { name: /Tham gia bảng xếp hạng/u });
    if (await optIn.isChecked()) {
      const saveOff = page.waitForResponse((r) => r.url().includes('/api/practice/progress') && r.request().method() === 'PATCH');
      await optIn.uncheck();
      await saveOff;
    }
    const saveOn = page.waitForResponse((r) => r.url().includes('/api/practice/progress') && r.request().method() === 'PATCH');
    await optIn.check();
    await saveOn;
    await page.reload();
    await settleClient(page);
    await expect(page.getByRole('checkbox', { name: /Tham gia bảng xếp hạng/u })).toBeChecked();
    // Opt-in requests moderation; an earlier journey may have approved this fixture.
    const ownIdentityResponse = await page.request.get('/api/community/profile');
    expect(ownIdentityResponse.ok()).toBeTruthy();
    const { profile: publicIdentity } = await ownIdentityResponse.json();
    expect(publicIdentity).toBeTruthy();
    expect(['pending', 'approved']).toContain(publicIdentity.moderationStatus);
    const guestPage = await guest.newPage();
    await guestPage.goto('/tien-do-tu-tap');
    await settleClient(guestPage);
    if (publicIdentity.moderationStatus === 'pending') {
      if (!publicIdentity.approved) {
        const pendingRanking = await guestPage.request.get('/api/practice/leaderboard');
        expect(pendingRanking.ok()).toBeTruthy();
        expect((await pendingRanking.json()).ranking.some((entry: { authorId: string }) => entry.authorId === publicIdentity.authorId)).toBe(false);
        await expect(guestPage.getByRole('region', { name: 'Cùng nhau tinh tấn' })).not.toContainText('Quản trị viên E2E');
      }
      const approved = await page.request.patch(`/api/admin/community/moderation/profiles/${publicIdentity.authorId}`, {
        data: { action: 'approve', revision: publicIdentity.revision }, headers: { 'x-csrf-token': token, origin: baseURL },
      });
      expect(approved.ok()).toBeTruthy();
      expect(await approved.json()).toMatchObject({ updated: true });
    }
    await guestPage.reload();
    await settleClient(guestPage);
    await expect(guestPage.getByRole('region', { name: 'Cùng nhau tinh tấn' })).toContainText('Quản trị viên E2E');
    await page.reload();
    await settleClient(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải thẻ hồi hướng', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/u);
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const image = await page.evaluate(async (base64) => {
      const raw = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([raw], { type: 'image/png' }));
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    }, bytes.toString('base64'));
    expect(image.width).toBeGreaterThan(500);
    expect(image.height).toBeGreaterThan(500);
    await page.getByRole('button', { name: `Rời chiến dịch ${title}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Tham gia chiến dịch ${title}`, exact: true })).toBeVisible();
    await page.reload();
    await settleClient(page);
    await expect(page.getByRole('button', { name: `Tham gia chiến dịch ${title}`, exact: true })).toBeVisible();
  } finally {
    await guest.close();
    const profile = await page.request.patch('/api/practice/progress', { data: before.profile, headers: { 'x-csrf-token': token, origin: baseURL } });
    expect(profile.ok()).toBeTruthy();
    if (campaignId) {
      const deleted = await page.request.delete(`/api/practice/campaigns/${campaignId}`, { headers: { 'x-csrf-token': token, origin: baseURL } });
      expect([200, 204]).toContain(deleted.status());
    }
  }
});
