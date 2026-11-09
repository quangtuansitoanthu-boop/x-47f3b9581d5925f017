import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

for (const width of [375, 1440]) {
for (const theme of ['light', 'dark']) {
test(`library disclosure keeps search and Top 10 stable without refetching at ${width} ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript((mode) => localStorage.setItem('tutam_dark_mode', mode === 'dark' ? '1' : '0'), theme);
  if (width === 375 && theme === 'light') await loginAsMember(page);
  const presenceResponse = page.waitForResponse(response => response.url().includes('/api/presence') && response.request().method() === 'POST');
  await page.goto('/kinh-sach');
  await settleClient(page);
  await expect(page.locator('.articles-grid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.continue-reading')).toHaveAttribute('aria-busy', 'false');
  expect((await presenceResponse).ok()).toBe(true);
  // Chờ cả session refresh khởi động trước khi đo riêng chi phí tương tác UI.
  await page.waitForLoadState('networkidle');
  const disclosure = page.locator('details.library-disclosure');
  const toggle = disclosure.locator(':scope > summary');
  await expect(toggle).toContainText('Thư viện của bạn');
  await expect(disclosure).toHaveJSProperty('open', false);
  const shelf = page.getByRole('region', { name: 'Tiếp tục đọc', exact: true, includeHidden: true });
  await expect(shelf).toBeHidden();
  await expect(page.getByRole('link', { name: /Trích dẫn của tôi/ })).toBeHidden();
  const search = page.getByRole('searchbox');
  const topTen = page.getByRole('button', { name: 'Top 10', exact: true });
  const category = page.getByRole('combobox', { name: 'Lọc theo danh mục', exact: true, includeHidden: true });
  const filters = page.getByRole('button', {name:/^Lọc(?:\s|$)/u});
  await expect(category).toHaveCount(0);
  await expect(filters).toHaveAttribute('aria-expanded','false');
  const before = await search.boundingBox();
  const top = await topTen.boundingBox();
  expect(before).not.toBeNull();
  expect(top).not.toBeNull();
  // Toolbar căn giữa theo trục dọc; input và nút có chiều cao riêng.
  expect(Math.abs((before!.y + before!.height / 2) - (top!.y + top!.height / 2))).toBeLessThan(2);
  expect(before!.x + before!.width).toBeLessThanOrEqual(top!.x);
  expect(before!.height).toBeGreaterThanOrEqual(44);
  expect(top!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `.cache/library-${width}-${theme}-collapsed.png`, fullPage: true });
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  });
  await toggle.click();
  await expect(disclosure).toHaveJSProperty('open', true);
  await expect(shelf).toBeVisible();
  await expect(category).toHaveCount(0);
  await filters.click();
  await expect(filters).toHaveAttribute('aria-expanded','true');
  await expect(category).toBeVisible();
  await expect(page.getByRole('link', { name: /Trích dẫn của tôi/ })).toBeVisible();
  await page.screenshot({ path: `.cache/library-${width}-${theme}-expanded.png`, fullPage: true });
  await expect(search).toHaveValue('');
  const expandedSearch = (await search.boundingBox())!;
  const expandedTop = (await topTen.boundingBox())!;
  // Nội dung details mở phía trên toolbar; giữ cùng hàng và kích thước ngang.
  expect(expandedSearch.x).toBeCloseTo(before!.x, 0);
  expect(expandedSearch.width).toBeCloseTo(before!.width, 0);
  expect(Math.abs((expandedSearch.y + expandedSearch.height / 2) - (expandedTop.y + expandedTop.height / 2))).toBeLessThan(2);
  expect(expandedSearch.x + expandedSearch.width).toBeLessThanOrEqual(expandedTop.x);
  expect(expandedSearch.height).toBeGreaterThanOrEqual(44);
  expect(expandedTop.height).toBeGreaterThanOrEqual(44);
  await search.fill('không có kết quả e2e');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveJSProperty('open', false);
  await expect(shelf).toBeHidden();
  await expect(category).toBeVisible();
  await expect(search).toHaveValue('không có kết quả e2e');
  await topTen.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(topTen).toBeFocused();
  await toggle.click();
  await expect(disclosure).toHaveJSProperty('open', true);
  await expect(category).toBeVisible();
  expect((await category.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await category.selectOption('SÁCH KHUYẾN THIỆN');
  await filters.click();
  await expect(category).toHaveCount(0);
  await toggle.click();
  await expect(disclosure).toHaveJSProperty('open', false);
  await expect(category).toHaveCount(0);
  await toggle.press('Enter');
  await expect(disclosure).toHaveJSProperty('open', true);
  await filters.click();
  await expect(category).toHaveValue('SÁCH KHUYẾN THIỆN');
  await expect(search).toHaveValue('không có kết quả e2e');
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
}
}

for (const count of [0, 1, 2, 7]) {
  test(`continue reading shows the three most recent of ${count} saved books and persists removal`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((size) => {
      const rows = Array.from({ length: size }, (_, index) => ({
        contentKind: 'article', contentId: `shelf-test-${index}`, revision: 0,
        epoch: 1, deviceId: 'shelf-test', deviceSequence: index + 1,
        position: { scrollTop: index * 100 }, total: null, percent: index * 10,
        contentVersion: null, serverUpdatedAt: null,
        clientUpdatedAt: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
      }));
      const key = 'quangtu_principal_v1:anonymous:quangtu_reading_progress_v1';
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(rows));
    }, count);
    await page.route('**/api/articles?*', route => route.fulfill({ json: Array.from({ length: count }, (_, index) => ({
      id: `shelf-test-${index}`, tieu_de: `Sách tiếp tục ${index}`, danh_muc: 'CHUYỆN NHÂN QUẢ', noi_dung: '<p>Nội dung kiểm thử</p>',
      trang_thai: 'Hoàn thành', ngay_dang: '2026-09-01', tags: '', tac_gia: 'E2E',
    })) }));
    await page.goto('/kinh-sach');
    await settleClient(page);
    await expect(page.locator('.articles-grid .art-card')).toHaveCount(count);
    const disclosure = page.locator('details.library-disclosure');
    await expect(disclosure).toHaveJSProperty('open', false);
    await disclosure.locator(':scope > summary').click();
    await expect(disclosure).toHaveJSProperty('open', true);
    const shelf = page.getByRole('region', { name: 'Tiếp tục đọc', exact: true });
    await expect(shelf).toHaveAttribute('aria-busy', 'false');
    const cards = shelf.locator('article');
    const more = shelf.getByRole('button', { name: 'Hiển thị thêm', exact: true });
    await expect(cards).toHaveCount(Math.min(count, 3));
    if (count <= 3) {
      await expect(more).toHaveCount(0);
      return;
    }
    await expect(cards.nth(0)).toContainText(`Sách tiếp tục ${count - 1}`);
    await expect(cards.nth(1)).toContainText(`Sách tiếp tục ${count - 2}`);
    await page.screenshot({ path: '.cache/library-with-progress.png', fullPage: true });
    await expect(more).toHaveCount(0);
    await cards.first().getByRole('button', { name: /Xóa/ }).click();
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText(`Sách tiếp tục ${count - 2}`);
    await page.reload();
    await settleClient(page);
    await expect(disclosure).toHaveJSProperty('open', false);
    await disclosure.locator(':scope > summary').press('Enter');
    await expect(disclosure).toHaveJSProperty('open', true);
    await expect(shelf).toHaveAttribute('aria-busy', 'false');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText(`Sách tiếp tục ${count - 2}`);

  });
}
