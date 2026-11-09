import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const width of [320, 375]) {
  test(`Buddha selection arrows keep 44px touch targets at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/tu-tap?action=le-phat');
    await settleClient(page);
    const previous = page.getByRole('button', { name: 'Vị Phật trước', exact: true });
    const next = page.getByRole('button', { name: 'Vị Phật tiếp theo', exact: true });
    for (const control of [previous, next]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const image = page.locator('.lp__portrait-box img');
    const initialImage = await image.getAttribute('src');
    await expect(image).toHaveAttribute('src', '/images/le-phat/thich-ca-mau-ni-portrait.webp');
    await expect(page.locator('.lp__buddha-name')).toContainText('(1/14)');
    await expect(image).toHaveClass(/loaded/);
    await page.screenshot({ path: testInfo.outputPath('le-phat-thich-ca.png'), animations: 'disabled' });
    await next.click();
    await expect(image).toHaveAttribute('src', '/images/le-phat/a-di-da-approved.webp');
    await next.click();
    await expect(image).toHaveAttribute('src', '/images/le-phat/ty-lo-gia-na.webp');
    await previous.click();
    await expect(image).toHaveAttribute('src', '/images/le-phat/a-di-da-approved.webp');
    await previous.click();
    await expect(image).toHaveAttribute('src', initialImage!);
    await previous.click();
    await expect(image).toHaveAttribute('src', '/images/le-phat/nguyet-quang.webp');
    await expect(page.locator('.lp__buddha-name')).toContainText('(14/14)');
    await next.click();
    await expect(image).toHaveAttribute('src', initialImage!);
  });
}
