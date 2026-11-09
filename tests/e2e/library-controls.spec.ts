import { expect, test } from '@playwright/test';
import { settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`library filter and quotes return ${width} ${dark}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
      await page.goto('/kinh-sach');
      await settleClient(page);
      await page.locator('.library-disclosure > summary').click();
      const quotes = page.locator('.library-my-quotes');
      await expect(quotes).toBeVisible();
      expect((await quotes.boundingBox())!.height).toBeGreaterThanOrEqual(70);
      await expect(page.locator('#library-category')).toHaveCount(0);
      const filter = page.getByRole('button', { name: 'Lọc', exact: true });
      await filter.click();
      await expect(page.locator('#library-category')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('library-filter.png') });
      await filter.click();
      await expect(page.locator('#library-category')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await quotes.click();
      await page.getByRole('link', { name: /Quay lại/ }).click();
      await expect(page).toHaveURL(/\/kinh-sach/);
    });
    test(`native ambient has no download or delete controls ${width} ${dark}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await useNativeApiWithLocalBackend(page);
      await page.addInitScript(value => {
        localStorage.setItem('tutam_dark_mode', value ? '1' : '0');
        Object.assign(globalThis, { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } });
      }, dark);
      await page.goto('/tu-tap');
      await settleClient(page);
      await page.getByRole('button', { name: /^Thiền định Hẹn giờ/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Thiền có hướng dẫn', exact: true });
      await dialog.getByRole('tab').nth(2).click();
      await expect(dialog.locator('.audio-btn-download, .audio-btn-delete')).toHaveCount(0);
      const ambient = dialog.getByRole('tabpanel');
      await expect(ambient.locator('.audio-badge-default')).toHaveCount(8);
      const rain = ambient.locator('.meditation-audio-tile__select').nth(1);
      await rain.click();
      await expect(rain).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: testInfo.outputPath('native-ambient.png') });
    });
  }
}
