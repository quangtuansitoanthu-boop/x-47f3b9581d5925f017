import { expect, test, type Locator } from '@playwright/test';
import { settleClient } from './runtime-helpers';

const events = [
  { id: 'layout-birthday', title: 'Sinh nhật mẹ', type: 'gia-dinh', calendarMode: 'solar', solarDay: 20, solarMonth: 11, lunarDay: 1, lunarMonth: 1, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'layout-memorial', title: 'Ngày giỗ ông bà và tưởng niệm gia đình', type: 'gio-chap', calendarMode: 'lunar', lunarDay: 15, lunarMonth: 7, frequency: 'yearly', note: 'Chuẩn bị hương hoa', createdAt: '2026-01-01T00:00:00Z' },
];

async function appearance(control: Locator) {
  return control.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, fontSize: style.fontSize, radius: style.borderRadius };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`home anniversary form matches settings controls (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(theme => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, theme);
    await page.route('**/api/**', route => route.abort('failed'));
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await settleClient(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('.personal-add-first-btn, .personal-add-more-btn').click();
      const modal = page.locator('.pem-dialog');
      await expect(modal).toBeVisible();
      const form = modal.locator('.pem-form');
      await form.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
      const validation = page.locator('[data-app-message]');
      await expect(validation).toHaveClass(/personal-event-dialog/);
      await expect(validation.getByRole('heading')).toHaveText('Chưa đủ thông tin');
      await expect(validation).toContainText('Tên ngày lễ / Sự kiện');
      await validation.getByRole('button').click();
      await expect(form.locator('#pem-input-title')).toBeFocused();
      await expect(modal.locator('.pem-saved-message')).toHaveCount(0);
      const yearly = form.getByRole('button', { name: 'Hàng năm', exact: true });
      const monthly = form.getByRole('button', { name: 'Hàng tháng', exact: true });
      const lunar = form.getByRole('button', { name: 'Âm lịch', exact: true });
      await expect(lunar).toHaveAttribute('aria-pressed', 'true');
      await expect(yearly).toHaveAttribute('aria-pressed', 'true');
      const month = form.locator('#pem-select-month');
      await month.selectOption('8');
      await monthly.click();
      await expect(monthly).toHaveAttribute('aria-pressed', 'true');
      await expect(yearly).toHaveAttribute('aria-pressed', 'false');
      await expect(month).toBeDisabled();
      await expect(month).toHaveValue('0');
      await yearly.click();
      await expect(month).toBeEnabled();
      await expect(month).toHaveValue('8');
      for (const control of await form.locator('input, select, button').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await modal.locator('.pem-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const title = form.locator('#pem-input-title');
      const titleBox = (await title.boundingBox())!, categoryBox = (await form.locator('#pem-select-type').boundingBox())!;
      expect(categoryBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
      const modalAppearance = await Promise.all([title, lunar, yearly, form.getByRole('button', { name: 'Lưu ngày lễ', exact: true })].map(appearance));
      await modal.screenshot({ path: testInfo.outputPath(`home-form-${theme}-${width}.png`) });
      await title.fill(`Ngày lễ kiểm tra ${width}`);
      await form.getByRole('button', { name: 'Lưu ngày lễ', exact: true }).click();
      await expect(modal.locator('.pem-saved-message[role="status"]')).toHaveText('Đã lưu thành công');
      await expect(modal.locator('.pem-list')).toContainText(`Ngày lễ kiểm tra ${width}`);
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await page.goto('/ca-nhan?tab=settings');
      await settleClient(page);
      await page.locator('#settings-personal > summary').click();
      await page.locator('.personal-inline-add-btn').click();
      const editor = page.locator('.personal-inline-editor');
      const settingsControls = [editor.locator('.personal-inline-title-input'), editor.getByRole('button', { name: 'Âm lịch', exact: true }), editor.getByRole('button', { name: 'Hàng năm', exact: true }), editor.getByRole('button', { name: 'Lưu ngày lễ', exact: true })];
      expect(await Promise.all(settingsControls.map(appearance))).toEqual(modalAppearance);
      await editor.screenshot({ path: testInfo.outputPath(`settings-form-${theme}-${width}.png`) });
      await editor.getByRole('button', { name: 'Hủy', exact: true }).click();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`each personal anniversary keeps its own date beside its title (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(({ theme, events }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
      localStorage.setItem('tutam_personal_lunar_events', JSON.stringify(events));
    }, { theme, events });
    await page.route('**/api/**', route => route.abort('failed'));
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await settleClient(page);
      const card = page.locator('.personal-reminder-card');
      const items = card.locator('.personal-list-item');
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText('20/11 Dương lịch');
      await expect(items.nth(1)).toContainText('Ngày 15 Tháng 07 Âm Lịch');
      for (const item of await items.all()) {
        const title = await item.locator('.personal-item-title').boundingBox();
        const date = await item.locator('.personal-item-date').boundingBox();
        const bounds = await item.boundingBox();
        const remove = await item.getByRole('button').boundingBox();
        expect(Math.abs(date!.x - title!.x), 'Date must align with its own title, not become a separate full-width row').toBeLessThan(2);
        expect(date!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
        expect(date!.y - title!.y - title!.height, 'The date belongs directly below its title').toBeLessThanOrEqual(12);
        expect(date!.x + date!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
        expect(remove!.width).toBeGreaterThanOrEqual(44);
        expect(remove!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await card.screenshot({ path: testInfo.outputPath(`anniversaries-${theme}-${width}.png`) });
    }
  });
}
