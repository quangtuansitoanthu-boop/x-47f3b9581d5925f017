import { expect, test, type Locator } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test.use(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});

async function expectCompactHeader(calendar: Locator): Promise<void> {
  const title = await calendar.locator('.strip-title-box').boundingBox();
  const controls = await calendar.locator('.strip-controls').boundingBox();
  expect(title).not.toBeNull();
  expect(controls).not.toBeNull();
  expect(controls!.y).toBeLessThan(title!.y + title!.height);
  expect(controls!.x).toBeGreaterThanOrEqual(title!.x + title!.width - 1);
  const card = await calendar.boundingBox();
  expect(controls!.x + controls!.width).toBeLessThanOrEqual(card!.x + card!.width);
  const solarTitleFits = await calendar.locator('.strip-title').evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(solarTitleFits).toBe(true);
  for (const button of await calendar.locator('.strip-controls button').all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
}

for (const theme of ['light', 'dark'] as const) {
test(`calendar controls stay beside the title in week and month modes (${theme})`, async ({ page }) => {
  await page.addInitScript((mode) => localStorage.setItem('tutam_dark_mode', mode === 'dark' ? '1' : '0'), theme);
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00Z'));
  for (const width of [320, 360, 375, 390, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await settleClient(page);
    const calendar = page.locator('.weekly-lunar-strip');
    await expect(calendar).toBeVisible();
    await expectCompactHeader(calendar);
    const initialDays = await calendar.locator('.day-solar-num').allTextContents();
    await calendar.getByRole('button', { name: 'Tuần sau', exact: true }).click();
    await expect(calendar.getByRole('button', { name: 'Hôm nay', exact: true })).toBeVisible();
    await expectCompactHeader(calendar);
    await calendar.getByRole('button', { name: 'Tuần trước', exact: true }).click();
    await expect(calendar.locator('.day-solar-num')).toHaveText(initialDays);
    await calendar.locator('.strip-expand-btn').click();
    await expect(calendar.locator('.month-calendar-view')).toBeVisible();
    await expectCompactHeader(calendar);
    await calendar.getByRole('button', { name: 'Tháng sau', exact: true }).click();
    await expectCompactHeader(calendar);
    await calendar.getByRole('button', { name: 'Hôm nay', exact: true }).click();
    await expectCompactHeader(calendar);
  }
});
}
