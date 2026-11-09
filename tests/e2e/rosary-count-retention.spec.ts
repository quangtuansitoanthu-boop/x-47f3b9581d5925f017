import { expect, test, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test.use({ hasTouch: true });

const countKey = 'quangtu_principal_v1:anonymous:tt_rosary_count';
const guidedKey = 'quangtu_principal_v1:anonymous:quangtu_guided_practice_settings_v1';
const logsKey = 'quangtu_principal_v1:anonymous:tt_practice_logs_v1';
const phrase = 'Nam mô Quán Thế Âm Bồ Tát';

test('touch and count button save practice before ending resets beads when a WebView has no randomUUID', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: undefined });
  });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await openRosary(page);
  await page.getByRole('button', { name: 'Vuốt, chạm chuỗi hạt hoặc dùng phím mũi tên để đếm hạt', exact: true }).tap();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('2/108');
  await closeRosary(page);
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('0');
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(logs).toMatchObject([{ count: 2, type: 'Niệm danh hiệu' }]);
  const queueKey = 'quangtu_principal_v1:anonymous:quangtu_practice_session_outbox_v1';
  const queued = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), queueKey);
  expect(queued.map((operation: { kind: string }) => operation.kind)).toEqual(['start', 'complete']);
  expect(queued[1].clientSessionId).toBe(queued[0].clientSessionId);
  await page.reload();
  await settleClient(page);
  await openRosary(page);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
  await closeRosary(page);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey)).toEqual(logs);
});

async function openRosary(page: Page) {
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toBeVisible();
}

async function closeRosary(page: Page) {
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toHaveCount(0);
}

test('unfinished beads survive Back, reopen and reload while explicit reset remains available', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(({ countKey, guidedKey, phrase }) => {
    if (sessionStorage.getItem('rosary-retention-seeded')) return;
    localStorage.setItem(countKey, '28');
    localStorage.setItem(guidedKey, JSON.stringify({
      rosaryDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
      rosaryPhrase: phrase, rosarySize: 108, rosaryDailyGoal: 3000,
    }));
    // Receipt đã được khởi tạo trước 28 lần niệm; đây là bản dở chưa chốt của phiên bản hiện tại.
    localStorage.setItem('quangtu_principal_v1:anonymous:tt_rosary_completion_v1', JSON.stringify({
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
      accounted: 0, pending: null, resetPending: false,
    }));
    sessionStorage.setItem('rosary-retention-seeded', '1');
  }, { countKey, guidedKey, phrase });
  await page.goto('/tu-tap');
  await settleClient(page);
  await openRosary(page);
  await expect(page.locator('.tt-rosary__meta')).toContainText('28');
  await page.getByRole('button', { name: 'Quay lại tu tập', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Kết thúc phiên lần hạt', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('28');
  await openRosary(page);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('28/108');
  await expect(page.locator('.tt-rosary__phrase')).toHaveText(phrase);
  await expect(page.locator('.tt-rosary__options-bar')).toContainText('3.000');
  await page.getByRole('button', { name: 'Quay lại tu tập', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toHaveCount(0);
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(logs).toMatchObject([{ count: 28, note: `Lần hạt: ${phrase}` }]);
  await page.reload();
  await settleClient(page);
  await openRosary(page);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('28/108');
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('28');
  await page.locator('.tt-rosary__reset').click();
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('0');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey)).toEqual(logs);
});

test('real touch taps increase both the visible cycle and persisted daily beads', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await openRosary(page);
  const bead = page.getByRole('button', { name: 'Vuốt, chạm chuỗi hạt hoặc dùng phím mũi tên để đếm hạt', exact: true });
  await bead.tap();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('1');
  await page.waitForTimeout(450);
  await bead.tap();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('2/108');
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('2');
});
