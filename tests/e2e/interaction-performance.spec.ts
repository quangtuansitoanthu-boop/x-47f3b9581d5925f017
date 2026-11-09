import { expect, test } from '@playwright/test';

test('economical rendering keeps navigation, search and off-screen cards usable without extra catalog reads', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 });
  });
  let catalogRequests = 0;
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/data/luot_xem') {
      return route.fulfill({ json: Array.from({ length: 40 }, (_, index) => ({
        bai_viet_id: `performance-${index}`, so_luot: 40 - index,
      })) });
    }
    if (pathname === '/api/articles') {
      catalogRequests++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.from({ length: 40 }, (_, index) => ({
        id: `performance-${index}`, tieu_de: `Sách Nhân Quả ${index}`, danh_muc: 'SÁCH KHUYẾN THIỆN',
        trang_thai: 'Hoàn thành', noi_dung: '<p>Nội dung sách kiểm tra.</p>', tom_tat: 'Đọc và thực hành mỗi ngày.',
      }))) });
    }
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-performance', 'efficient');
  const nav = page.locator('.qts-bottom-nav');
  await nav.getByRole('link', { name: 'Kinh sách', exact: true }).click();
  const cards = page.locator('.art-card');
  await expect(cards).toHaveCount(40);
  await expect(cards.first()).toHaveCSS('content-visibility', 'visible');
  await expect(page.locator('.qts-nav')).toHaveCSS('backdrop-filter', 'none');
  await expect(page.locator('.qts-nav')).toHaveCSS('transform', 'none');
  const before = catalogRequests;
  const search = page.locator('.search-input');
  await search.fill('nhan qua 39');
  await expect(cards).toHaveCount(1);
  await search.fill('');
  await expect(cards).toHaveCount(40);
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last().getByRole('heading')).toContainText('39');
  await nav.getByRole('link', { name: 'Kinh sách', exact: true }).click();
  expect(catalogRequests).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
