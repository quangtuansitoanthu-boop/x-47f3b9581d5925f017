import { expect, test } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

for (const scenario of [
  { date: '2026-10-31T05:00:00Z', action: 'Tháng sau', expected: 'Tháng 11, 2026' },
  { date: '2026-03-31T05:00:00Z', action: 'Tháng trước', expected: 'Tháng 2, 2026' },
]) {
  test(`month navigation preserves adjacent month from ${scenario.date}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(scenario.date));
    await page.goto('/');
    await settleClient(page);
    const calendar = page.locator('.weekly-lunar-strip');
    await calendar.locator('.strip-expand-btn').click();
    await calendar.getByRole('button', { name: scenario.action, exact: true }).click();
    await expect(calendar.locator('.strip-title')).toHaveText(scenario.expected);
  });
}

test('feedback dialog owns keyboard focus and preserves the draft across Escape', async ({ page }) => {
  await page.goto('/ca-nhan?tab=feedback');
  await settleClient(page);
  const trigger = page.getByRole('button', { name: 'Gửi Email', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Soạn Thư Góp Ý', exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await dialog.getByLabel('Nội dung góp ý:').fill('Bản nháp cần giữ khi đóng bằng bàn phím');
  await dialog.getByRole('button', { name: 'Mở ứng dụng gửi thư', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Nội dung góp ý:')).toHaveValue('Bản nháp cần giữ khi đóng bằng bàn phím');
});

test('Escape closes only the nested rejection dialog and retains the editor draft', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/books?book=e2e-modal-rejection');
  await settleClient(page);
  const editor = page.getByRole('dialog', { name: 'Sửa bài viết', exact: true });
  await expect(editor).toBeVisible();
  const title = editor.getByLabel('Tiêu đề bài viết');
  await title.fill('Bản nháp quản trị chưa lưu');
  const trigger = editor.getByRole('button', { name: 'Trả lại cho CTV', exact: true });
  await trigger.click();
  const rejection = page.locator('.reject-modal-overlay');
  await expect(rejection).toBeVisible();
  await rejection.locator('textarea').fill('Lý do đang soạn');
  const discardConfirmation = page.locator('dialog[data-app-message]');
  await page.keyboard.press('Escape');
  await expect(rejection).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(title).toHaveValue('Bản nháp quản trị chưa lưu');
  await expect(trigger).toBeFocused();
  await expect(discardConfirmation).toHaveCount(0);
});

test('standalone rejection dialog traps focus and closes with Escape', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/books');
  await settleClient(page);
  const row = page.getByRole('row').filter({ hasText: 'Modal rejection fixture' });
  const trigger = row.getByRole('button', { name: 'Trả lại', exact: true });
  await trigger.click();
  const rejection = page.locator('.reject-modal-overlay');
  await expect(rejection).toBeVisible();
  await rejection.locator('textarea').fill('Kiểm tra vùng giữ focus');
  await rejection.getByRole('button', { name: 'Xác nhận trả lại', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => rejection.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(rejection).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a rejection in flight cannot be dismissed by Escape or submitted twice', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/books');
  await settleClient(page);
  let releasePatch = () => {};
  let receivedPatch = () => {};
  const pending = new Promise<void>(resolve => { releasePatch = resolve; });
  const received = new Promise<void>(resolve => { receivedPatch = resolve; });
  let writes = 0;
  await page.route('**/api/articles/e2e-modal-rejection', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    writes += 1;
    receivedPatch();
    await pending;
    await route.fulfill({ status: 500, json: { error: { message: 'Lỗi kiểm thử có kiểm soát' } } });
  });
  const row = page.getByRole('row').filter({ hasText: 'Modal rejection fixture' });
  await row.getByRole('button', { name: 'Trả lại', exact: true }).click();
  const rejection = page.locator('.reject-modal-overlay');
  await rejection.locator('textarea').fill('Lý do phải được giữ khi request đang chạy');
  await rejection.getByRole('button', { name: 'Xác nhận trả lại', exact: true }).click();
  try {
    await received;
    await expect(rejection.locator('textarea')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(rejection).toBeVisible();
    expect(writes).toBe(1);
  } finally {
    releasePatch();
  }
  await expect(rejection.locator('textarea')).toBeEnabled();
  await expect(rejection.locator('textarea')).toHaveValue('Lý do phải được giữ khi request đang chạy');
  await page.keyboard.press('Escape');
  await expect(rejection).toHaveCount(0);
});
