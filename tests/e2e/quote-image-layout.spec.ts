import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`quote image and meditation layout ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((enabled) => localStorage.setItem('tutam_dark_mode', enabled ? '1' : '0'), dark);
      await page.goto('/');
      await page.locator('.create-quote-image').click();
      const modal = page.locator('.quote-card-modal');
      const preview = modal.locator('.quote-canvas-preview-wrap');
      await expect(preview).toHaveAttribute('aria-busy', 'false');
      await expect(modal.locator('.quote-theme-pill')).toHaveCount(8);
      for (let index = 0; index < 8; index += 1) {
        await modal.locator('.quote-theme-pill').nth(index).click();
        await expect(modal.locator('.quote-theme-pill').nth(index)).toHaveAttribute('aria-pressed', 'true');
        await expect(preview).toHaveAttribute('aria-busy', 'false');
        await expect(modal.locator('canvas')).toHaveCSS('visibility', 'visible');
      }
      expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const download = page.waitForEvent('download');
      await modal.locator('.download-btn').click();
      await (await download).saveAs(testInfo.outputPath('quote-export.png'));
      await page.screenshot({ path: testInfo.outputPath('quote-editor.png') });
      await modal.locator('.quote-card-close-btn').click();
      await expect(page.locator('.create-quote-image')).toBeFocused();

      await page.goto('/tu-tap');
      await page.locator('.tt-mode-card--thien').click();
      const chooser = page.locator('.meditation-chooser');
      await expect(chooser).toBeVisible();
      const tabs = chooser.locator('.meditation-chooser__tabs button');
      await expect(tabs).toHaveCount(4);
      expect(await tabs.evaluateAll(elements => elements.every(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getBoundingClientRect().height <= parseFloat(getComputedStyle(element).lineHeight) + 1
          && element.scrollWidth <= element.clientWidth + 1;
      }))).toBe(true);
      await tabs.nth(2).click();
      const image = chooser.locator('[role="tabpanel"]:visible .meditation-choice-art img').first();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.screenshot({ path: testInfo.outputPath('meditation-ambient.png') });
      await page.keyboard.press('Escape');
      await expect(chooser).toHaveCount(0);

      await page.goto('/phap-thoai');
      await page.locator('.filter-toggle[aria-controls="talk-options"]').click();
      const select = page.locator('select:visible').first();
      await expect(select).toBeVisible();
      const original = await select.inputValue();
      await select.click();
      const picker = page.locator('.rosary-select__dialog');
      await expect(picker).toBeVisible();
      const panel = picker.locator('.rosary-select__panel');
      const bounds = await panel.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath('shared-dropdown.png') });
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(select).toHaveValue(original);
      await expect(select).toBeFocused();
    });
  }
}
