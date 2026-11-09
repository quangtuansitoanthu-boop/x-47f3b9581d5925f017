import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => localStorage.setItem('tt_reflection_guide_seen_v1', '1'));
  await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session'
    ? { authenticated: false, user: null, csrfToken: null, expiresAt: null }
    : new URL(route.request().url()).pathname === '/api/presence' ? { enabled: false, activeCount: 0 } : [] }));
  await page.goto('/tu-tap');
  await page.locator('.tt-mode-card--reflection').click();
});

const field = (page: import('@playwright/test').Page) => page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true });
const key = 'quangtu_principal_v1:anonymous:tt_personal_reflections_v1';
test('keeps a private draft when leaving through the bottom navigation', async ({ page }) => {
  await field(page).fill('Draft before leaving the practice route');
  await page.locator('.qts-bottom-nav a[data-nav="home"]').click();
  await expect(page).toHaveURL(/\/$/u);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toContain('Draft before leaving the practice route');
});
test('keeps a private draft on direct reload without first using header Back', async ({ page }) => {
  await field(page).fill('Draft immediately before reload');
  await page.reload();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toContain('Draft immediately before reload');
});
test('cancels route departure when the private draft cannot be saved', async ({ page }) => {
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.endsWith(':tt_personal_reflections_v1')) throw new DOMException('quota', 'QuotaExceededError');
      set.call(this, key, value);
    };
  });
  await field(page).fill('Keep unsaved writing after quota failure');
  await page.locator('.qts-bottom-nav a[data-nav="home"]').click();
  await expect(field(page)).toHaveValue('Keep unsaved writing after quota failure');
  await expect(page).toHaveURL(/\/tu-tap$/u);
  await expect(page.locator('.personal-journal [role=status]')).toContainText('Chưa lưu được');
});
