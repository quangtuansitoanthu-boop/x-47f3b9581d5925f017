import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

const events = [
  { id: 'layout-birthday', title: 'Sinh nhật mẹ', type: 'gia-dinh', calendarMode: 'solar', solarDay: 20, solarMonth: 11, lunarDay: 1, lunarMonth: 1, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'layout-memorial', title: 'Ngày giỗ ông bà và tưởng niệm gia đình', type: 'gio-chap', calendarMode: 'lunar', lunarDay: 15, lunarMonth: 7, frequency: 'yearly', note: 'Chuẩn bị hương hoa', createdAt: '2026-01-01T00:00:00Z' },
];

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
