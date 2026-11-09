import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { settleClient } from './runtime-helpers';

for (const dark of [false, true]) {
  test(`new practice panels and existing picker remain consistent at 375px, dark=${dark}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
    await page.goto('/tu-tap');
    await settleClient(page);
    await expect(page.locator('nav.tt-upgrade-tabs')).toHaveCount(0);
    await expect(page.locator('.tt-mode-card--mindful')).toHaveCount(0);
    const geometry = await page.locator('.tt-modes-grid > .tt-mode-card--reflection, .tt-modes-grid > .tt-mode-card--rec').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height };
    }));
    expect(Math.max(...geometry.map(item => item.width)) - Math.min(...geometry.map(item => item.width))).toBeLessThanOrEqual(1);
    expect(geometry.every(item => item.height >= 44)).toBe(true);
    const trackerIcon = page.locator('.tt-mode-card--tracker .tracker-entry-icon');
    const reflectionIcon = page.locator('.tt-mode-card--reflection .reflection-entry-icon');
    await expect(trackerIcon.locator('svg')).toBeVisible();
    await expect(reflectionIcon.locator('svg')).toBeVisible();
    expect(await trackerIcon.locator('svg').innerHTML()).not.toBe(await reflectionIcon.locator('svg').innerHTML());
    expect(await trackerIcon.evaluate(node => getComputedStyle(node).color)).not.toBe(await reflectionIcon.evaluate(node => getComputedStyle(node).color));
    await page.getByRole('navigation', { name: 'Đồng hành tu tập', exact: true }).screenshot({ path: info.outputPath('practice-entry-icons.png'), animations: 'disabled' });
    await mkdir('.artifacts', { recursive: true });
    await page.evaluate(async () => {
      const source = document.querySelector('.tt-mode-card--reflection svg image')?.getAttribute('href');
      if (source) { const image = new Image(); image.src = source; await image.decode(); }
    });
    await page.locator('.tt-mode-card--reflection').screenshot({ path: `.artifacts/daily-reflection-card-${dark ? 'dark' : 'light'}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'Quán chiếu việc thiện ác trong ngày', exact: true }).click();
    const guide = page.getByTestId('reflection-guide');
    if (await guide.isVisible()) await guide.getByRole('button', { name: 'Tôi đã hiểu, Bắt đầu quán chiếu →', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true })).toBeVisible();
    await mkdir('.artifacts', { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `.artifacts/practice-upgrade-journal-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    await page.locator('.tt-topbar .tt-back-btn').click();
    await page.getByRole('button', { name: /^Thời khóa gợi ý/u }).click();
    await page.getByRole('button', { name: 'Tạo thời khóa mới', exact: true }).click();
    const pickerRequests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) pickerRequests.push(request.url()); });
    await page.getByRole('combobox', { name: 'Vị Phật / Bồ Tát', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Vị Phật / Bồ Tát', exact: true });
    await expect(picker).toBeVisible();
    const rect = await picker.locator('.rosary-select__panel').boundingBox();
    expect(rect?.width).toBeLessThanOrEqual(375);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(845);
    await page.screenshot({ path: `.artifacts/practice-upgrade-picker-${dark ? 'dark' : 'light'}.png` });
    await picker.getByRole('button', { name: 'Đóng bảng chọn', exact: true }).click();
    expect(pickerRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
