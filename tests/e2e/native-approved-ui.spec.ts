import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];

async function localOnly(page: Page, baseURL: string | undefined): Promise<void> {
  const origin = new URL(baseURL || 'http://localhost:8787').origin;
  expect(loopbackHosts, 'These fixtures must never target a deployed environment').toContain(new URL(origin).hostname);
  await page.route(url => /^https?:$/.test(url.protocol) && url.origin !== origin,
    route => route.abort('blockedbyclient'));
}

for (const width of [375, 1440]) for (const dark of [false, true]) for (const locale of ['vi', 'en'] as const) {
  test(`approved practice cards keep four compact actions ${width} ${dark ? 'dark' : 'light'} ${locale}`, async ({ page, baseURL }, info) => {
    await localOnly(page, baseURL);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ locale, dark }) => {
      localStorage.setItem('tutam_locale', locale);
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
    }, { locale, dark });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tu-tap');
    await settleClient(page);
    const group = page.locator('.tt-entry-cards');
    const newbie = group.locator('.tt-entry--newbie > a');
    const dharma = group.locator('.dharma-giving-main-action');
    const study = group.locator('.tt-entry--study > a');
    const calendar = group.locator('.thap-trai-banner');
    const titles = locale === 'vi'
      ? ['Hướng dẫn tu tập cho người mới', 'Bố thí pháp — Độ vong linh', 'Hướng dẫn tu học Phật pháp', 'Nhắc ngày Thập Trai & Tu tập']
      : ['Practice guide for beginners', 'Dharma giving — Helping departed spirits', 'Buddhist practice guide', 'Fasting & practice reminders'];
    const cards = [newbie, dharma, study, calendar];
    const heights: number[] = [];
    for (const [index, card] of cards.entries()) {
      await expect(card).toBeVisible();
      await expect(card).toContainText(titles[index]);
      const rect = await card.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.height, 'Collapsed guide cards remain compact').toBeLessThanOrEqual(150);
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      heights.push(rect!.height);
    }
    expect(Math.max(...heights) - Math.min(...heights), 'One consistent card size').toBeLessThanOrEqual(8);
    await expect(group.locator('.tt-beginner-tag, .tt-beginner-content > span, .dharma-giving-desc, .dharma-giving-tag, .btn-view-dharma, .banner-tag, .banner-sub-text').filter({ visible: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await group.screenshot({ path: info.outputPath('four-approved-cards.png'), animations: 'disabled' });

    await expect(newbie).toHaveAttribute('href', '/huong-dan#huong-dan-nguoi-moi');
    await expect(study).toHaveAttribute('href', '/huong-dan?phan=tu-hoc');
    await expect(calendar).toHaveAttribute('aria-expanded', 'false');
    const apiRequests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
    });
    await calendar.focus();
    await page.keyboard.press('Enter');
    await expect(calendar).toHaveAttribute('aria-expanded', 'true');
    await expect(calendar.locator('.content')).toBeVisible();
    await expect(calendar.locator('.content')).not.toHaveText('');
    await page.keyboard.press('Enter');
    await expect(calendar).toHaveAttribute('aria-expanded', 'false');
    expect(apiRequests, 'Expanding local reminder content adds no data requests').toEqual([]);
    await dharma.click();
    await expect(page).toHaveURL(/\/huong-dan\?phan=tu-hoc#bo-thi-may-nghe-phap$/);
    await expect(page.locator('#bo-thi-may-nghe-phap')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('chrome is not selectable while search and actual reader text remain editable and selectable', async ({ page, baseURL }) => {
  await localOnly(page, baseURL);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/kinh-sach');
  await settleClient(page);
  const navLabel = page.locator('.qts-bottom-nav__item').first().locator('span').last();
  await expect(navLabel).toHaveCSS('user-select', 'none');
  const search = page.getByRole('searchbox', { name: 'Tìm kiếm bài viết' });
  await expect(search).toHaveCSS('user-select', 'text');
  await search.fill('Bài viết kiểm thử E2E');
  await expect(search).toHaveValue('Bài viết kiểm thử E2E');
  await search.press('ControlOrMeta+A');
  expect(await search.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Đọc ngay Bài viết kiểm thử E2E', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true });
  await expect(reader).toBeVisible();
  const paragraph = reader.locator('.reader-content p').filter({ hasText: 'Nội dung công khai giữ nguyên' }).first();
  await expect(paragraph).toHaveCSS('user-select', 'text');
  await paragraph.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  expect(await page.evaluate(() => getSelection()?.toString())).toContain('Nội dung công khai giữ nguyên');
});

for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`quote preview exports original text and source ${width} ${dark ? 'dark' : 'light'}`, async ({ page, baseURL }, info) => {
    await localOnly(page, baseURL);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
    await loginAsAdmin(page);
    const origin = new URL(page.url()).origin;
    const session = await (await page.request.get('/api/session')).json();
    const headers = { 'X-CSRF-Token': session.csrfToken, Origin: origin };
    const id = `e2e-approved-quote-${randomUUID()}`;
    const quoteText = 'Nội dung công khai giữ nguyên trong trình đọc SvelteKit. Đoạn văn kiểm thử bố cục giữ nguyên lời trích và nguồn sách khi tạo ảnh.';
    const created = await page.request.post('/api/reading/annotations', { headers, data: {
      id, idempotencyKey: id, anchorStatus: 'active', color: 'yellow', contentId: 'e2e-public', contentKind: 'article',
      contentVersion: 'e2e-approved-quote-v1', contextBefore: '', contextAfter: '', locator: { start: 0, end: quoteText.length }, note: id, quoteText,
    } });
    expect(created.ok(), await created.text()).toBe(true);
    try {
      await page.goto('/trich-dan-cua-toi');
      await settleClient(page);
      await page.evaluate(() => {
        const original = CanvasRenderingContext2D.prototype.fillText;
        const rows: { text: string; font: string; align: string; x: number; y: number }[] = [];
        Object.assign(window, { __approvedQuoteText: rows });
        CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
          rows.push({ text, font: this.font, align: this.textAlign, x, y });
          if (maxWidth === undefined) original.call(this, text, x, y);
          else original.call(this, text, x, y, maxWidth);
        };
      });
      const card = page.locator('.quotes-list article').filter({ hasText: id });
      await expect(card).toContainText(quoteText);
      const opener = card.getByRole('button', { name: /Tạo ảnh/ });
      await opener.click();
      const modal = page.getByRole('dialog', { name: 'Tạo ảnh trích dẫn', exact: true });
      await expect(modal).toBeVisible();
      const paper = modal.getByRole('button', { name: 'Sen hồng', exact: true });
      await paper.click();
      await expect(paper).toHaveAttribute('aria-pressed', 'true');
      const canvas = modal.locator('canvas');
      await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBe(1080);
      await expect.poll(() => page.evaluate(() => {
        const rows = (window as unknown as { __approvedQuoteText: { text: string; font: string; align: string }[] }).__approvedQuoteText;
        return rows.some(row => row.text.includes('Nguồn:') && row.text.includes('Bài viết kiểm thử E2E') && row.align === 'right');
      })).toBe(true);
      const drawing = await page.evaluate(() => (window as unknown as { __approvedQuoteText: { text: string; font: string; align: string; x: number; y: number }[] }).__approvedQuoteText);
      expect(drawing.some(row => row.font.includes('Bookerly') && row.font.includes('italic'))).toBe(true);
      expect(drawing.some(row => row.text.includes('Tu tập'))).toBe(true);
      expect(drawing.map(row => row.text).join('')).toContain('“');
      expect(drawing.map(row => row.text).join('')).toContain('”');
      await info.attach('canvas-drawing-observations', { body: JSON.stringify(drawing, null, 2), contentType: 'application/json' });
      await canvas.screenshot({ path: info.outputPath('quote-complete-canvas.png') });
      await page.screenshot({ path: info.outputPath('quote-modal.png') });
      const [download] = await Promise.all([page.waitForEvent('download'), modal.getByRole('button', { name: /Lưu ảnh$/ }).click()]);
      expect(download.suggestedFilename()).toMatch(/\.png$/);
      await download.saveAs(info.outputPath('exported-quote.png'));
      expect(await download.failure()).toBeNull();
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(card).toContainText(quoteText);
    } finally {
      const deleted = await page.request.delete(`/api/reading/annotations/${encodeURIComponent(id)}`, { headers });
      expect(deleted.ok(), `Local fixture cleanup failed: ${deleted.status()}`).toBe(true);
    }
  });
}
