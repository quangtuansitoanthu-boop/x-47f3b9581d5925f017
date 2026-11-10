import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`practice reminder chevron follows expanded state (${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.addInitScript(theme => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, theme);
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/tu-tap');
    await settleClient(page);
    const banner = page.locator('.thap-trai-banner.compact');
    await expect(banner).toHaveAttribute('aria-expanded', 'false');
    const direction = () => banner.locator('.chevron').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
    await expect.poll(direction).toBeGreaterThan(0.99);
    await banner.locator('.banner-chevron-btn').click();
    await expect(banner).toHaveAttribute('aria-expanded', 'true');
    await expect(banner.locator('.content')).toBeVisible();
    await expect.poll(direction).toBeLessThan(-0.99);
    await banner.screenshot({ path: info.outputPath(`reminder-chevron-${theme}.png`) });
    await banner.press('Enter');
    await expect(banner).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(direction).toBeGreaterThan(0.99);
  });
}

for (const platform of ['ios', 'web'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`reminder guidance matches ${platform} (${theme})`, async ({ page }, testInfo) => {
      await page.addInitScript(({ platform, theme }) => {
        localStorage.setItem('tutam_locale', 'vi');
        localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
        if (platform === 'ios') Object.assign(window, {
          CapacitorCustomPlatform: { name: 'ios' },
          Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
        });
      }, { platform, theme });
      await page.route('**/api/**', route => route.abort('failed'));
      await page.goto('/ca-nhan?tab=settings');
      await settleClient(page);
      await page.locator('#settings-lunar > summary').click();
      const banner = page.locator('.reminder-perm-banner').filter({ hasText: platform === 'ios' ? 'Trên iOS' : 'Trên web' });
      await expect(banner).toBeVisible();
      await expect(banner).not.toContainText('Android');
      await expect(banner).not.toContainText('Báo thức và lời nhắc');
      if (platform === 'web') await expect(banner).toContainText('macOS');
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await banner.scrollIntoViewIfNeeded();
        expect(await banner.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      await page.setViewportSize({ width: 375, height: 900 });
      await banner.screenshot({ path: testInfo.outputPath(`${platform}-${theme}.png`) });
    });
  }
}
