import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('a repeated practice widget link opens the closed tool without resetting an active rosary', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  const openWidget = () => page.evaluate(() => {
    const path = '/tu-tap?action=rosary';
    history.replaceState(history.state, '', path);
    window.dispatchEvent(new CustomEvent('quangtu:practice-widget-open', { detail: { path } }));
  });
  await openWidget();
  const begin = page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true });
  await expect(begin).toBeVisible();
  await begin.click();
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  await openWidget();
  await expect(begin).toHaveCount(0);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_rosary_count'))).toBe('0');
  await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toHaveCount(0);
  await openWidget();
  await expect(begin).toBeVisible();
  await begin.click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
});
