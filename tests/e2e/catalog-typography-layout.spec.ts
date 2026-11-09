import { expect, test } from '@playwright/test';

for (const width of [320, 375, 430, 768, 1440]) {
  for (const locale of ['vi', 'en']) {
    test(`practice reminder stays readable at ${width}px (${locale})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.install({ time: new Date('2026-11-01T05:00:00Z') });
      await page.addInitScript(value => localStorage.setItem('tutam_locale', value), locale);
      await page.route('**/api/**', route => route.abort('failed'));
      await page.goto('/tu-tap');
      await page.waitForSelector('[data-mounted="1"]');
      const banner = page.locator('.thap-trai-banner');
      await expect(banner).toBeVisible();
      for (const dark of [false, true]) {
        if (dark) await page.locator('.tt-theme-btn').click();
        const title = await banner.locator('.banner-badge-text').boundingBox();
        expect(title!.width).toBeGreaterThan(Math.min(width * .4, 250));
        const overflow = await banner.evaluate(el => el.scrollWidth > el.clientWidth);
        expect(overflow).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${dark ? 'dark' : 'light'}.png`), fullPage: true });
      }
      await expect(banner).toHaveAttribute('aria-expanded', 'false');
      await banner.locator('.banner-badge-text').click();
      await expect(banner).toHaveAttribute('aria-expanded', 'true');
      await banner.locator('.banner-badge-text').click();
      await expect(banner).toHaveAttribute('aria-expanded', 'false');
      const mainAction = page.locator('.dharma-giving-main-action');
      await expect(mainAction).toBeVisible();
      const close = page.locator('.dharma-giving-close-x');
      const contentBox = await mainAction.boundingBox();
      await expect(close).toHaveCount(0);
      await expect(page.locator('.btn-dismiss-dharma')).toHaveCount(0);
      expect(contentBox!.width).toBeGreaterThanOrEqual(44);
      expect(contentBox!.height).toBeGreaterThanOrEqual(44);
    });
  }
}
