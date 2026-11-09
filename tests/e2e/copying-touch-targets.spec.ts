import { expect, test } from '@playwright/test';
import { beginScriptureCopying } from './runtime-helpers';

test.use({ hasTouch: true });

for (const theme of ['light', 'dark']) {
  test(`copying toolbar keeps 44px touch targets with the keyboard open (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tu-tap/chep-kinh', { waitUntil: 'domcontentloaded' });
    await beginScriptureCopying(page);
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.evaluate(async value => {
      if (document.fullscreenElement) await document.exitFullscreen();
      document.documentElement.setAttribute('data-theme', value);
    }, theme);

    const editor = page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });
    await editor.focus();
    // Mô phỏng phần viewport còn lại khi mở bàn phím, không thay thế thử IME thật.
    await page.setViewportSize({ width: 390, height: 430 });
    await expect(page.locator('.copy-writing')).toHaveClass(/keyboard-open/);

    const toolbarButtons = page.locator('.writing-bar button:visible');
    expect(await toolbarButtons.count()).toBeGreaterThanOrEqual(3);
    const sourceToggle = page.locator('.source-toggle');
    await expect(sourceToggle).toBeVisible();

    for (const button of [...await toolbarButtons.all(), sourceToggle]) {
      const label = await button.getAttribute('aria-label') ?? (await button.textContent())?.trim() ?? 'button';
      const bounds = await button.boundingBox();
      expect(bounds, `${label} has visible bounds`).not.toBeNull();
      expect.soft(bounds!.width, `${label} touch width`).toBeGreaterThanOrEqual(44);
      expect.soft(bounds!.height, `${label} touch height`).toBeGreaterThanOrEqual(44);
    }
  });
}
