import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('personal continue-reading link opens the existing library disclosure', async ({ page }) => {
  await page.goto('/ca-nhan');
  await settleClient(page);
  const link = page.locator('a[href="/kinh-sach#reading-library"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/kinh-sach#reading-library$/);
  const disclosure = page.locator('#reading-library');
  await expect(disclosure).toHaveJSProperty('open', true);
  await expect(page.locator('#continue-reading-body')).toBeVisible();
  await disclosure.locator(':scope > summary').click();
  await expect(disclosure).toHaveJSProperty('open', false);
});

for (const catalog of [
  { path: '/kinh-sach', endpoint: '/api/articles' },
  { path: '/phap-thoai', endpoint: '/api/talks' },
]) {
  test(`${catalog.path} offers a touch-sized retry without reporting an empty catalog on load failure`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    let requests = 0;
    await page.route(`**${catalog.endpoint}?**`, async route => {
      requests++;
      await route.fulfill({ status: 503, json: { error: { message: 'Không thể tải nội dung kiểm thử.' } } });
    });
    await page.goto(catalog.path);
    await settleClient(page);
    const retry = page.getByRole('button', { name: /Thử lại/ });
    await expect(retry).toBeVisible();
    const bounds = await retry.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    if (catalog.path === '/phap-thoai') await expect(page.locator('.pt-count')).toHaveCount(0);
    const before = requests;
    await retry.click();
    await expect.poll(() => requests).toBeGreaterThan(before);
    await expect(retry).toBeVisible();
  });
}

test('native landscape library filters remain above the bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 320 });
  await page.goto('/kinh-sach');
  await settleClient(page);
  // Exercise native shell CSS without invoking a device bridge in the web harness.
  await page.evaluate(() => document.documentElement.dataset.nativeApp = 'true');
  const navigation = page.getByRole('navigation', { name: 'Điều hướng nhanh' });
  await expect(navigation).toBeVisible();
  const disclosure = page.locator('details.library-disclosure');
  await disclosure.locator(':scope > summary').click();
  await expect(disclosure).toHaveJSProperty('open', true);
  const toolbar = page.locator('.library-top-bar');
  await expect(toolbar).toHaveCSS('overflow-y', 'auto');
  const geometry = await toolbar.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return {
      bottom: element.getBoundingClientRect().bottom,
      navigationTop: document.querySelector('.qts-bottom-nav')!.getBoundingClientRect().top,
    };
  });
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.navigationTop + 1);
});

test('library search remains available while category and continue-reading panels collapse without refetch', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const catalogs: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/articles') catalogs.push(request.url()); });
  await page.goto('/kinh-sach'); await settleClient(page);
  await expect(page.locator('.articles-grid')).toHaveAttribute('aria-busy', 'false');
  const before = catalogs.length;
  const disclosure = page.locator('details.library-disclosure');
  const toggle = disclosure.locator(':scope > summary');
  const category = page.getByRole('combobox', { name: 'Lọc theo danh mục', includeHidden: true });
  const filters = page.getByRole('button', {name:'Lọc',exact:true});
  await expect(disclosure).toHaveJSProperty('open', false);
  await expect(toggle).toContainText('Thư viện của bạn');
  await expect(category).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toBeVisible();
  await toggle.click();
  await expect(disclosure).toHaveJSProperty('open', true);
  await expect(category).toHaveCount(0);
  await filters.click();
  await expect(category).toBeVisible();
  expect(await category.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await category.selectOption({ index: 1 });
  const choice = await category.inputValue();
  await toggle.click();
  await expect(disclosure).toHaveJSProperty('open', false);
  await expect(category).toBeVisible();
  await page.getByRole('searchbox').fill('Kinh');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveJSProperty('open', true);
  await expect(category).toHaveValue(choice);
  await expect(page.getByRole('searchbox')).toHaveValue('Kinh');
  const shelf = page.locator('.continue-reading');
  await expect(shelf).toBeVisible();
  await expect(page.locator('#continue-reading-body')).toBeVisible();
  await toggle.press('Enter');
  await expect(disclosure).toHaveJSProperty('open', false);
  await expect(page.locator('#continue-reading-body')).toBeHidden();
  await expect(page.getByRole('searchbox')).toHaveValue('Kinh');
  expect(catalogs.length).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('compact practice reminder preserves its title while details and saved expansion follow keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap'); await settleClient(page);
  const reminder = page.locator('.thap-trai-banner');
  const title = reminder.locator('.banner-badge-text');
  await expect(title).toHaveText('Nhắc ngày Thập Trai & Tu tập');
  if (await reminder.getAttribute('aria-expanded') === 'false') await reminder.click();
  await expect(reminder).toHaveAttribute('aria-expanded', 'true');
  await expect(title).toHaveText('Nhắc ngày Thập Trai & Tu tập');
  await expect(reminder.locator('.content')).toBeVisible();
  await expect(reminder.locator('.content')).not.toBeEmpty();
  await expect(reminder.locator('.banner-sub-text')).toContainText('Âm lịch');
  await reminder.click();
  await expect(reminder).toHaveAttribute('aria-expanded', 'false');
  await expect(title).toHaveText('Nhắc ngày Thập Trai & Tu tập');
  await expect(reminder.locator('.content')).toBeHidden();
  await expect(reminder.locator('.banner-sub-text')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('tutam_thaptrai_collapsed_date'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.reload(); await settleClient(page);
  await expect(reminder).toHaveAttribute('aria-expanded', 'false');
  await reminder.press('Enter');
  await expect(reminder).toHaveAttribute('aria-expanded', 'true');
  await expect(title).toHaveText('Nhắc ngày Thập Trai & Tu tập');
  await expect(reminder.locator('.content')).toBeVisible();
  await expect(reminder.locator('.banner-sub-text')).toContainText('Âm lịch');
  expect(await page.evaluate(() => localStorage.getItem('tutam_thaptrai_collapsed_date'))).toBeNull();
});
