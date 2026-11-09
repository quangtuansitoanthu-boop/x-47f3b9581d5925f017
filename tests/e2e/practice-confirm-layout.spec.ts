import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`practice confirmation covers the viewport without native dialog borders ${width} dark=${dark}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
    await page.goto('/tu-tap');
    await settleClient(page);
    await page.locator('.tt-mode-card--chuoi').click();
    const dialog = page.locator('dialog.practice-confirm');
    await expect(dialog).toBeVisible();
    const geometry = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, border: getComputedStyle(element).borderTopWidth };
    });
    expect(geometry).toEqual({ x: 0, y: 0, width, height: 850, border: '0px' });
    await expect(dialog.locator('.practice-confirm__dialog')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('confirmation.png'), animations: 'disabled' });
    await page.mouse.click(5, 845);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.tt-rosary')).toHaveCount(0);
    await expect(page.locator('.tt-mode-card--chuoi')).toBeVisible();
    await page.goto('/kinh-sach');
    await settleClient(page);
    await expect(page.getByRole('heading', { name: 'Kho Kinh Sách', exact: true })).toHaveCSS('text-align', 'center');
    await page.screenshot({ path: info.outputPath('library-title.png'), animations: 'disabled' });
  });
}

for (const width of [375, 1440]) {
  test(`copying chooser clears the measured fixed header at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/tu-tap/chep-kinh');
    await settleClient(page);
    const header = await page.locator('.tt-topbar').boundingBox();
    const title = await page.locator('.choose-header h1').boundingBox();
    expect(header).not.toBeNull();
    expect(title).not.toBeNull();
    expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height + 12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('copying-header.png'), animations: 'disabled' });
  });
}
