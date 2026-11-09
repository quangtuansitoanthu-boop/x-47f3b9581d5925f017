import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { settleClient } from './runtime-helpers';

const countKey = 'quangtu_principal_v1:anonymous:tt_rosary_count';
const savedCount = (page: Page) => page.evaluate(key => Number(localStorage.getItem(key) ?? '0'), countKey);

test('10,800-recitation automatic session keeps counting with all options folded and pauses outside them', async ({ page }) => {
  // Covers real audio decode/chunk preparation and two full paused 750ms cadences.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();

  const options = page.locator('#tt-rosary-options');
  const toggle = page.locator('.tt-rosary__options-bar button');
  await expect(toggle).toHaveText('Tùy chọn');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'tt-rosary-options');
  await expect(options).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveText('Thu gọn');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(options).toBeVisible();
  await options.getByRole('button', { name: 'Tự động gõ mõ', exact: true }).click();

  await options.getByRole('combobox', { name: 'Số biến trong phiên', exact: true }).click();
  const targetPicker = page.getByRole('dialog', { name: 'Số biến trong phiên', exact: true });
  await targetPicker.locator('button[data-value="10800"]').click();
  await expect(options.getByRole('combobox', { name: 'Số biến trong phiên', exact: true })).toContainText('10.800 biến');
  await options.getByRole('combobox', { name: 'Tốc độ', exact: true }).click();
  await page.getByRole('dialog', { name: 'Tốc độ', exact: true }).locator('button[data-value="750"]').click();
  await expect(page.locator('.tt-rosary__options-bar p')).toContainText('Chuỗi 108 hạt');

  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/practice/')) requests.push(`${request.method()} ${path}`);
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Bắt đầu gõ mõ', exact: true }).click();
  await expect(options).toBeHidden();
  await expect(toggle).toHaveText('Tùy chọn');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => savedCount(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  await expect(toggle).toHaveText('Tùy chọn');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(options).toBeHidden();
  await expect(page.getByRole('group', { name: 'Chế độ lần hạt', exact: true })).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Tốc độ', exact: true })).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Số biến trong phiên', exact: true })).toBeHidden();
  await expect(page.locator('.tt-rosary__auto-encouragement')).toBeHidden();
  const foldedCount = await savedCount(page);
  await expect.poll(() => savedCount(page), { timeout: 5_000 }).toBeGreaterThan(foldedCount);
  await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  await mkdir('.artifacts', { recursive: true });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('dialog.tt-rosary-modal')?.scrollTo(0, 0);
    document.querySelector('.tt-rosary__body')?.scrollTo(0, 0);
  });
  await page.screenshot({ path: '.artifacts/rosary-auto-options-folded-mobile.png', fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
  const pausedCount = await savedCount(page);
  await page.waitForTimeout(1650);
  expect(await savedCount(page)).toBe(pausedCount);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(options).toBeVisible();
  // Pause unlocks only tempo; the finite target belongs to this session until Stop.
  await expect(options.locator('button[aria-label="Số biến trong phiên"]')).toContainText('10.800 biến');
  expect(await options.locator('button[aria-label="Số biến trong phiên"]').evaluate(element => Boolean(element.closest('[inert]')))).toBe(true);
  expect(await options.locator('button[aria-label="Tốc độ"]').evaluate(element => Boolean(element.closest('[inert]')))).toBe(false);
  await options.getByRole('combobox', { name: 'Tốc độ', exact: true }).click();
  await page.getByRole('dialog', { name: 'Tốc độ', exact: true }).locator('button[data-value="1000"]').click();
  await expect(options.getByRole('combobox', { name: 'Tốc độ', exact: true })).toContainText('60 nhịp/phút');
  expect(await savedCount(page)).toBe(pausedCount);
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  await expect.poll(() => savedCount(page), { timeout: 5000 }).toBeGreaterThanOrEqual(pausedCount + 2);
  await expect(options.locator('button[aria-label="Số biến trong phiên"]')).toContainText('10.800 biến');
  expect(await options.locator('button[aria-label="Tốc độ"]').evaluate(element => Boolean(element.closest('[inert]')))).toBe(true);
  await expect(options.locator('button[aria-label="Số hạt trong chuỗi"]')).toContainText('108 hạt');
  await expect(page.locator('.tt-rosary__options-bar p')).toContainText('Chuỗi 108 hạt');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Dừng nhịp', exact: true }).click();
  expect(await options.locator('button[aria-label="Số biến trong phiên"]').evaluate(element => Boolean(element.closest('[inert]')))).toBe(false);
  await options.getByRole('combobox', { name: 'Số biến trong phiên', exact: true }).click();
  await page.getByRole('dialog', { name: 'Số biến trong phiên', exact: true }).locator('button[data-value="216"]').click();
  await expect(options.getByRole('combobox', { name: 'Số biến trong phiên', exact: true })).toContainText('216 biến');
});
