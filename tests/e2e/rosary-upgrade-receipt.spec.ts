import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('upgrading a saved daily total without a receipt does not credit an existing legacy log again', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('failed'));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('legacy-rosary-seeded')) return;
    const prefix = 'quangtu_principal_v1:anonymous:';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const phrase = 'Nam mô A Di Đà Phật';
    localStorage.setItem(prefix + 'tt_rosary_count', '28');
    localStorage.setItem(prefix + 'quangtu_guided_practice_settings_v1', JSON.stringify({
      rosaryDate: today, rosaryPhrase: phrase, rosarySize: 108, rosaryDailyGoal: 1000,
    }));
    localStorage.setItem(prefix + 'tt_practice_logs_v1', JSON.stringify([{
      id: 1, date: today, count: 28, type: 'Niệm danh hiệu', note: `Lần hạt: ${phrase}`, created: new Date().toISOString(),
    }]));
    sessionStorage.setItem('legacy-rosary-seeded', '1');
  });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('28/108');
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Kết thúc phiên lần hạt', exact: true }).locator('.session-count')).toHaveText('28 biến');
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toHaveCount(0);
  const saved = await page.evaluate(() => ({
    count: localStorage.getItem('quangtu_principal_v1:anonymous:tt_rosary_count'),
    logs: JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]') as { id: number; count: number }[],
  }));
  expect(saved.count).toBe('0');
  expect(saved.logs).toEqual([expect.objectContaining({ id: 1, count: 28 })]);
  expect(saved.logs.reduce((sum, log) => sum + log.count, 0)).toBe(28);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
});
