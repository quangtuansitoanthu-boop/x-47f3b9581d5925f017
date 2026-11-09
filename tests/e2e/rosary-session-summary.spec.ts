import { expect, test, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';

const prefix = 'quangtu_principal_v1:anonymous:';
const logsKey = `${prefix}tt_practice_logs_v1`;

async function start(page: Page) {
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
}

test('browser Back preserves unfinished beads and reopens without showing an end confirmation', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap');
  await settleClient(page);
  await start(page);
  await tap(page);
  await page.goBack();
  const confirm = page.getByRole('dialog', { name: 'Kết thúc phiên lần hạt', exact: true });
  await expect(page.locator('.tt-rosary')).toHaveCount(0);
  await expect(confirm).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), `${prefix}tt_rosary_count`)).toBe('1');
  await start(page);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  await tap(page);
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Đã kết thúc phiên lần hạt', exact: true }).locator('.session-count')).toHaveText('2 biến');
  expect(await page.evaluate(key => localStorage.getItem(key), `${prefix}tt_rosary_count`)).toBe('0');
});

async function tap(page: Page) {
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await page.waitForTimeout(450);
}

for (const [width, dark] of [[320, false], [375, true], [1440, false]] as const) {
  test(`approved end flow summarizes unfinished beads and groups daily logs at ${width}px dark=${dark}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const requests: string[] = [];
    await page.route('**/api/**', route => { requests.push(new URL(route.request().url()).pathname); return route.abort('failed'); });
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-11-03T03:00:00Z'));
    await page.addInitScript(({ prefix, dark }) => {
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
      const phrase = 'Nam mô A Di Đà Phật';
      localStorage.setItem(`${prefix}tt_rosary_count`, '432');
      localStorage.setItem(`${prefix}quangtu_guided_practice_settings_v1`, JSON.stringify({ rosaryDate: '2026-11-03', rosaryPhrase: phrase, rosarySize: 108, rosaryDailyGoal: 1000 }));
      localStorage.setItem(`${prefix}tt_rosary_completion_v1`, JSON.stringify({ date: '2026-11-03', accounted: 432, pending: null, resetPending: false }));
      localStorage.setItem(`${prefix}tt_practice_logs_v1`, JSON.stringify([108, 216, 108].map((count, index) => ({ id: index + 1, date: '2026-11-03', type: 'Niệm danh hiệu', count, note: index ? `Lần hạt: ${phrase}` : phrase, created: `2026-11-03T0${index}:00:00Z` }))));
      const save = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if ((window as Window & { failRosarySave?: boolean }).failRosarySave && key.endsWith(':tt_practice_logs_v1')) throw new DOMException('Storage full', 'QuotaExceededError');
        save.call(this, key, value);
      };
    }, { prefix, dark });
    await page.goto('/tu-tap');
    await settleClient(page);
    await start(page);
    await tap(page);
    await tap(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await tap(page);
    const requestCount = requests.length;
    await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Kết thúc phiên lần hạt', exact: true });
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('h2')).toHaveCount(0);
    await expect(confirm.locator('.session-count')).toHaveText('435 biến');
    expect(await confirm.locator('.practice-confirm__dialog').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur(22px)');
    expect(requests.length).toBe(requestCount);
    await page.screenshot({ path: info.outputPath('session-confirmation.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Tiếp tục niệm', exact: true }).click();
    await tap(page);
    await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
    await expect(confirm.locator('.session-count')).toHaveText('436 biến');
    await page.evaluate(() => { (window as Window & { failRosarySave?: boolean }).failRosarySave = true; });
    await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
    await expect(confirm.getByRole('alert')).toContainText('Chưa chốt sổ được');
    await expect(confirm.locator('.session-count')).toHaveText('436 biến');
    expect(await page.evaluate(key => localStorage.getItem(key), `${prefix}tt_rosary_count`)).toBe('436');
    await page.evaluate(() => { (window as Window & { failRosarySave?: boolean }).failRosarySave = false; });
    await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
    const result = page.getByRole('dialog', { name: 'Đã kết thúc phiên lần hạt', exact: true });
    await expect(result.locator('.session-count')).toHaveText('436 biến');
    expect(await page.evaluate(key => localStorage.getItem(key), `${prefix}tt_rosary_count`)).toBe('0');
    await expect(result.getByRole('alert')).toHaveCount(0);
    for (const button of await result.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('session-result.png') });
    await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
    const rawLogs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]') as { count: number }[], logsKey);
    expect(rawLogs.reduce((sum, log) => sum + log.count, 0)).toBe(436);
    expect(rawLogs).toHaveLength(5);
    await page.locator('.tt-mode-card--tracker').click();
    await expect(page.locator('.tt-tracker__log-item')).toHaveCount(1);
    await expect(page.locator('.tt-tracker__log-count')).toHaveText('436 biến');
    await page.screenshot({ path: info.outputPath('daily-grouped.png'), animations: 'disabled' });
    await page.locator('.tt-tracker__log-item .tt-history-del').click();
    await expect(page.locator('#practice-confirm-description')).toContainText('5 bản ghi');
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, logsKey)).toBe(5);
    await page.locator('.tt-tracker__close').click();
    await start(page);
    await page.getByRole('button', { name: 'Quay lại tu tập', exact: true }).click();
    await expect(page.locator('.tt-rosary')).toHaveCount(0);
    await expect(confirm).toHaveCount(0);
    await start(page);
    await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
    await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
    await expect(confirm.locator('.session-count')).toHaveText('0 biến');
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
    await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
    await expect(result).toContainText('Phiên này chưa có biến niệm để ghi sổ.');
    await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, logsKey)).toBe(5);
    await page.locator('.tt-mode-card--tracker').click();
    await page.locator('.tt-tracker__log-item .tt-history-del').click();
    await page.locator('.practice-confirm').getByRole('button', { name: 'Xóa mục này', exact: true }).click();
    await expect(page.locator('.tt-tracker__log-item')).toHaveCount(0);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, logsKey)).toBe(0);
    expect(errors).toEqual([]);
  });
}
