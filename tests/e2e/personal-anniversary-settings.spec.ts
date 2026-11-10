import { expect, test, type Locator, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';

async function verifyTimingGeometry(page: Page, timing: Locator) {
  const times = timing.locator('input[type="time"]');
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of await timing.locator('input, select, button').all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const rows = await timing.locator('.timing-row').all();
    const first = (await rows[0].boundingBox())!, second = (await rows[1].boundingBox())!;
    for (const row of rows) {
      const spacing = await row.evaluate(element => {
        const last = element.lastElementChild!;
        const style = getComputedStyle(element);
        return {
          emptyBottom: element.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom,
          padding: parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth),
        };
      });
      expect(spacing.emptyBottom).toBeLessThanOrEqual(spacing.padding + 1);
    }
    const firstTime = (await times.nth(0).boundingBox())!, secondTime = (await times.nth(1).boundingBox())!;
    expect(Math.abs(firstTime.x - secondTime.x)).toBeLessThan(2);
    expect(Math.abs(firstTime.width - secondTime.width)).toBeLessThan(2);
    expect(firstTime.x + firstTime.width).toBeLessThanOrEqual(first.x + first.width);
    expect(secondTime.x + secondTime.width).toBeLessThanOrEqual(second.x + second.width);
  }
}

const events = [
  { id: 'compact-birthday', title: 'Sinh nhật mẹ', type: 'gia-dinh', calendarMode: 'solar', solarDay: 20, solarMonth: 11, lunarDay: 1, lunarMonth: 1, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'compact-memorial', title: 'Ngày giỗ ông bà', type: 'gio-chap', calendarMode: 'lunar', lunarDay: 15, lunarMonth: 7, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z' },
];

test('legacy monthly anniversaries keep their contract and yearly month survives a draft roundtrip', async ({ page }) => {
  const legacy = { id: 'legacy-monthly', title: 'Lễ hàng tháng cũ', type: 'gia-dinh', lunarDay: 15, lunarMonth: 0, createdAt: '2026-01-01T00:00:00Z' };
  const yearly = { ...legacy, id: 'yearly-month-eight', title: 'Lễ tháng tám', lunarMonth: 8, frequency: 'yearly' };
  await page.addInitScript(seed => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_personal_lunar_events', JSON.stringify(seed));
  }, [legacy, yearly]);
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-personal > summary').click();
  const cards = page.locator('#personal-events-settings .personal-inline-card');
  await cards.nth(0).getByRole('button', { name: 'Sửa', exact: true }).click();
  const editor = page.locator('.personal-inline-editor');
  await expect(editor.getByRole('button', { name: 'Hàng tháng', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.locator('.personal-select-sm').nth(1)).toBeDisabled();
  await editor.locator('.personal-inline-title-input').fill('Tên mới của lễ hàng tháng');
  await editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
  const storedEvents = () => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_personal_lunar_events:v2:guest')!).events);
  await expect.poll(async () => (await storedEvents())[0]).toEqual({ ...legacy, title: 'Tên mới của lễ hàng tháng' });
  await expect(cards.nth(0)).toContainText('hàng tháng');
  await cards.nth(1).getByRole('button', { name: 'Sửa', exact: true }).click();
  const month = editor.locator('.personal-select-sm').nth(1);
  await expect(month).toHaveValue('8');
  await editor.getByRole('button', { name: 'Hàng tháng', exact: true }).click();
  await expect(month).toHaveValue('0');
  await expect(month).toBeDisabled();
  await editor.getByRole('button', { name: 'Hàng năm', exact: true }).click();
  await expect(month).toHaveValue('8');
  await expect(month).toBeEnabled();
  await editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
  expect((await storedEvents())[1]).toEqual(yearly);
});

for (const theme of ['light', 'dark'] as const) {
test(`inline personal events stay drafts until a valid save and use the device date (${theme})`, async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 10, 6, 10));
  await page.addInitScript(theme => { localStorage.setItem('tutam_locale', 'vi'); localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0'); }, theme);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-personal > summary').click();
  const saved = () => page.evaluate(() => localStorage.getItem('tutam_personal_lunar_events:v2:guest'));
  const initial = await saved();
  await page.locator('.personal-inline-add-btn').click();
  expect(await saved()).toBe(initial);
  const editor = page.locator('.personal-inline-editor');
  const title = editor.locator('.personal-inline-title-input');
  await expect(title).toHaveValue('');
  await editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
  const alert = page.locator('[data-app-message]');
  await expect(alert).toContainText('Tên ngày lễ / Sự kiện');
  await expect(alert).toHaveClass(/personal-event-dialog/);
  await expect(alert.getByRole('heading')).toHaveText('Chưa đủ thông tin');
  await page.screenshot({ path: testInfo.outputPath(`personal-missing-${theme}.png`) });
  await alert.getByRole('button').click();
  await expect(title).toBeFocused();
  expect(await saved()).toBe(initial);
  await title.fill('Ngày lễ đang soạn');
  expect(await saved()).toBe(initial);
  await editor.getByRole('button', { name: 'Dương lịch', exact: false }).click();
  const selections = editor.locator('.personal-select-sm');
  await expect(selections.nth(0)).toHaveValue('6');
  await expect(selections.nth(1)).toHaveValue('11');
  await selections.nth(0).selectOption('31');
  await selections.nth(1).selectOption('2');
  await editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
  await expect(alert).toContainText('Ngày dương lịch không hợp lệ');
  await expect(alert.getByRole('heading')).toHaveText('Ngày chưa hợp lệ');
  await page.screenshot({ path: testInfo.outputPath(`personal-invalid-${theme}.png`) });
  await alert.getByRole('button').click();
  await expect(selections.nth(0)).toBeFocused();
  expect(await saved()).toBe(initial);
  await selections.nth(0).selectOption('29');
  await editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.personal-inline-summary')).toContainText('Ngày lễ đang soạn');
  await expect.poll(saved).not.toBe(initial);
  const success = page.locator('#personal-events-settings .reminder-feedback-badge[role="status"]');
  await expect(success).toHaveText('Đã lưu ngày lễ');
  await success.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`personal-saved-${theme}.png`) });
  await page.locator('.personal-inline-card').getByRole('button', { name: 'Sửa', exact: true }).click();
  await editor.getByRole('button', { name: 'Hàng tháng', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Hàng tháng', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(selections.nth(1)).toBeDisabled();
  await expect(selections.nth(1)).toHaveValue('0');
  await editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
  await page.reload();
  await settleClient(page);
  await page.locator('#settings-personal > summary').click();
  await page.locator('.personal-inline-card').getByRole('button', { name: 'Sửa', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Hàng tháng', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(selections.nth(1)).toBeDisabled();
  await editor.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(editor).toHaveCount(0);
});
}

for (const theme of ['light', 'dark'] as const) {
  test(`personal reminder times save and cancel without API requests (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, { theme });
    const requests: string[] = [];
    await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort('failed'); });
    await page.goto('/ca-nhan?tab=settings');
    await settleClient(page);
    await page.locator('#settings-personal > summary').click();
    const timing = page.locator('.personal-timing');
    await expect(timing).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const days = timing.locator('input[type="number"]');
    const leadTime = timing.locator('.timing-lead-time select');
    const times = timing.locator('input[type="time"]');
    await expect(leadTime).toHaveValue('1');
    await expect(leadTime.locator('option')).toHaveText(['1 ngày', '2 ngày', '3 ngày', '5 ngày', '7 ngày', '9 ngày', '14 ngày', 'Tùy chỉnh…']);
    await expect(times.nth(0)).toHaveValue('19:30');
    // Presence đã nghỉ; shell không được khởi động lại heartbeat khi mở cài đặt.
    expect(requests.some(url => new URL(url).pathname === '/api/presence')).toBe(false);
    const initialRequests = requests.length;
    await leadTime.selectOption('custom');
    await days.fill('100');
    await times.nth(0).fill('21:45');
    await timing.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(leadTime).toHaveValue('1');
    await expect(days).toHaveCount(0);
    await expect(times.nth(0)).toHaveValue('19:30');
    await leadTime.selectOption('custom');
    await days.fill('100');
    await times.nth(0).fill('21:45');
    await times.nth(1).fill('08:15');
    await timing.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).personal)).toEqual({ beforeEnabled: true, dayEnabled: true, daysBefore: 100, beforeTime: '21:45', dayTime: '08:15' });
    await days.fill('2');
    await timing.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(days).toHaveValue('100');
    await expect(leadTime).toHaveValue('custom');
    await verifyTimingGeometry(page, timing);
    for (const preset of ['1', '2', '3', '5', '7', '9', '14']) {
      await leadTime.selectOption(preset);
      await timing.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).personal.daysBefore)).toBe(Number(preset));
      await expect(leadTime).toHaveValue(preset);
    }
    expect(requests).toHaveLength(initialRequests);
    expect(requests.some(url => new URL(url).pathname === '/api/presence')).toBe(false);
    await verifyTimingGeometry(page, timing);
    await page.setViewportSize({ width: 375, height: 900 });
    await timing.screenshot({ path: testInfo.outputPath(`personal-timing-${theme}.png`) });
  });

  test(`personal reminder times survive a reload (${theme})`, async ({ page }) => {
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, { theme });
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/ca-nhan?tab=settings');
    await settleClient(page);
    await page.locator('#settings-personal > summary').click();
    const timing = page.locator('.personal-timing');
    const days = timing.locator('input[type="number"]');
    const times = timing.locator('input[type="time"]');
    await timing.locator('.timing-lead-time select').selectOption('custom');
    await days.fill('100');
    await times.nth(0).fill('21:45');
    await times.nth(1).fill('08:15');
    await timing.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).personal.daysBefore)).toBe(100);
    await page.reload();
    await settleClient(page);
    await page.locator('#settings-personal > summary').click();
    await expect(days).toHaveValue('100');
    await expect(times.nth(0)).toHaveValue('21:45');
    await expect(times.nth(1)).toHaveValue('08:15');
  });

  test(`settings anniversaries stay compact until edited (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(({ theme, events }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
      localStorage.setItem('tutam_personal_lunar_events', JSON.stringify(events));
    }, { theme, events });
    await page.route('**/api/**', route => route.abort('failed'));
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/ca-nhan?tab=settings');
    await settleClient(page);
    await page.locator('#settings-personal > summary').click();
    const list = page.locator('#personal-events-settings');
    const cards = list.locator('.personal-inline-card');
    await expect(cards).toHaveCount(2);
    await expect(list.locator('input, select')).toHaveCount(0);
    await expect(cards.nth(0)).toContainText('Sinh nhật mẹ');
    await expect(cards.nth(0)).toContainText('20/11 Dương lịch');
    await expect(cards.nth(1)).toContainText('Ngày 15 Tháng 07 Âm Lịch');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const card of await cards.all()) {
        expect((await card.boundingBox())!.height).toBeLessThan(140);
        const edit = await card.getByRole('button', { name: 'Sửa', exact: true }).boundingBox();
        expect(edit!.height).toBeGreaterThanOrEqual(44);
        expect(edit!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await list.screenshot({ path: testInfo.outputPath(`compact-${theme}.png`), animations: 'disabled' });
    await cards.nth(0).getByRole('button', { name: 'Sửa', exact: true }).click();
    await expect(cards.nth(0).getByRole('button', { name: 'Thu gọn', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(list.locator('.personal-inline-editor')).toHaveCount(1);
    await cards.nth(0).getByLabel('Tên ngày lễ *', { exact: true }).fill('Sinh nhật gia đình');
    await cards.nth(0).getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
    await cards.nth(1).getByRole('button', { name: 'Sửa', exact: true }).click();
    await expect(cards.nth(0).locator('input, select')).toHaveCount(0);
    await expect(cards.nth(0)).toContainText('Sinh nhật gia đình');
    await expect(list.locator('.personal-inline-editor')).toHaveCount(1);
    await cards.nth(1).getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
    await expect(list.locator('input, select')).toHaveCount(0);
    await cards.nth(0).getByRole('button', { name: 'Sửa', exact: true }).click();
    await expect(cards.nth(0).getByLabel('Tên ngày lễ *', { exact: true })).toHaveValue('Sinh nhật gia đình');
    await cards.nth(0).getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
    await list.getByRole('button', { name: 'Thêm ngày lễ kỷ niệm' }).click();
    await expect(cards).toHaveCount(3);
    await expect(list.getByLabel('Tên ngày lễ *', { exact: true })).toBeVisible();
    await expect(list.getByLabel('Tên ngày lễ *', { exact: true })).toHaveValue('');
    await expect(list.locator('.personal-inline-editor')).toHaveCount(1);
  });
}
