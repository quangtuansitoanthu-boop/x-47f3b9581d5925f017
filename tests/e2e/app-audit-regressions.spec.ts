import { test, expect } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const action of ['add', 'edit', 'delete'] as const) {
  test(`inline personal anniversary ${action} preserves data and reports full storage`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_personal_events_notify_enabled', '1');
      const saved = { id: 'quota-anniversary', title: 'Ngày lễ đã lưu', type: 'gia-dinh',
        lunarDay: 15, lunarMonth: 7, calendarMode: 'lunar', frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z' };
      localStorage.setItem('tutam_personal_lunar_events:v2:guest', JSON.stringify({
        version: 2, events: [saved], base: [saved], revision: null, pending: false, status: 'local',
      }));
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('tutam_personal_lunar_events:v2:')) throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/ca-nhan?tab=settings');
    await settleClient(page);
    await page.locator('#settings-personal > summary').click();
    const cards = page.locator('.personal-inline-card');
    await expect(cards).toHaveCount(1);
    const saved = await page.evaluate(() => localStorage.getItem('tutam_personal_lunar_events:v2:guest'));
    if (action === 'add') {
      await page.locator('.personal-inline-add-btn').click();
      await cards.locator('.personal-inline-title-input').fill('Ngày lễ chưa lưu');
      await cards.locator('.personal-edit-done').click();
    } else {
      await cards.getByRole('button', { name: 'Sửa', exact: true }).click();
      if (action === 'edit') {
        await cards.locator('.personal-inline-title-input').fill('Tên đang sửa');
        await cards.locator('.personal-edit-done').click();
      }
      else {
        await cards.locator('.personal-inline-del-btn').click();
        await page.getByRole('dialog', { name: 'Xóa lịch cá nhân?' }).getByRole('button', { name: 'Xóa lịch', exact: true }).click();
      }
    }
    await expect(page.getByRole('alert')).toContainText('Không thể lưu');
    await expect(cards).toHaveCount(action === 'add' ? 2 : 1);
    expect(await page.evaluate(() => localStorage.getItem('tutam_personal_lunar_events:v2:guest'))).toBe(saved);
    if (action === 'add') await expect(cards.locator('.personal-inline-title-input')).toHaveValue('Ngày lễ chưa lưu');
    if (action === 'edit') await expect(cards.locator('.personal-inline-title-input')).toHaveValue('Tên đang sửa');
    expect(errors).toEqual([]);
  });
}

test('enabling web reminders retains the preference and reports that closed-browser scheduling needs the app', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_practice_reminders_v1', JSON.stringify({ masterEnabled: false }));
    Object.defineProperty(Notification, 'permission', { configurable: true, value: 'denied' });
    Object.defineProperty(Notification, 'requestPermission', { configurable: true, value: async () => 'denied' });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  const master = page.locator('.reminder-master-row .reminder-switch-btn');
  await expect(master).toHaveAttribute('aria-pressed', 'false');
  await master.click();
  await expect(master).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).masterEnabled)).toBe(true);
  await expect(page.getByRole('alert')).toContainText('Nhắc theo lịch khi đóng trình duyệt cần ứng dụng Android/iOS. Cài đặt vẫn được lưu trên thiết bị.');
  expect(errors).toEqual([]);
});

test('personal reminder switch keeps its saved state when preference storage is full', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_personal_events_notify_enabled', '1');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tutam_personal_events_notify_enabled') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-personal > summary').click();
  const personal = page.getByRole('button', { name: 'Ngày Lễ Cá Nhân', exact: true });
  await expect(personal).toHaveAttribute('aria-pressed', 'true');
  await personal.click();
  await expect(personal).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('tutam_personal_events_notify_enabled'))).toBe('1');
  await expect(page.getByRole('alert')).toContainText('Không thể lưu');
  expect(errors).toEqual([]);
});

test('reminders report local storage failure without claiming success', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tutam_practice_reminders_v1') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-sound > summary').click();
  await page.getByRole('button', { name: 'Âm thanh thông báo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Không thể lưu trên máy');
  await expect(page.getByText('✓ Đã lưu cài đặt nhắc nhở!', { exact: true })).toHaveCount(0);
});

test('web reminders distinguish saved preferences from native scheduling', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { configurable: true, value: 'denied' }));
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-sound > summary').click();
  await page.getByRole('button', { name: 'Âm thanh thông báo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Nhắc theo lịch khi đóng trình duyệt cần ứng dụng Android/iOS. Cài đặt vẫn được lưu trên thiết bị.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).soundEnabled)).toBe(false);
});
