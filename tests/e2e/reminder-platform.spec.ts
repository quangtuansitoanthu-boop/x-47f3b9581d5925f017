import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

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
