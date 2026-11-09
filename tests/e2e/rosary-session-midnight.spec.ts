import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('same-principal refresh carries unfinished beads across midnight while recording each day separately', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => route.abort('failed'));
  await page.clock.setFixedTime(new Date('2026-11-01T16:59:55Z'));
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  const count = page.getByRole('button', { name: 'Niệm một hạt', exact: true });
  await count.click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');

  await page.clock.setFixedTime(new Date('2026-11-01T17:00:05Z'));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('quangtu:session-changed', {
    detail: { authenticated: false, user: null, csrfToken: null, expiresAt: null },
  })));
  const countKey = 'quangtu_principal_v1:anonymous:tt_rosary_count';
  const guidedKey = 'quangtu_principal_v1:anonymous:quangtu_guided_practice_settings_v1';
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').rosaryDate, guidedKey)).toBe('2026-11-02');
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('1');
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');

  await page.waitForTimeout(450);
  await count.click();
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('2');
  await expect(page.locator('.tt-rosary__cycle')).toContainText('2/108');
  const logs = await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]'));
  expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ date: '2026-11-01', count: 1 })]));
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await expect(page.locator('.session-count')).toHaveText('2 biến');
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Đã kết thúc phiên lần hạt', exact: true }).locator('.session-count')).toHaveText('2 biến');
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('0');
  await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
  const settled = await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]'));
  expect(settled).toEqual(expect.arrayContaining([
    expect.objectContaining({ date: '2026-11-01', count: 1 }),
    expect.objectContaining({ date: '2026-11-02', count: 1 }),
  ]));
  expect(settled).toHaveLength(2);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
  expect(pageErrors).toEqual([]);
});
