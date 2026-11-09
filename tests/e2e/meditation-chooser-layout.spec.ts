import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
test(`meditation music stays built in and ambient selection stays independent of download (${width}, ${dark ? 'dark' : 'light'})`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
  await page.addInitScript(enabled => localStorage.setItem('tutam_dark_mode', enabled ? '1' : '0'), dark);
  await page.route('**/audio/practice/ambient/tieng-mua-roi.mp3', route => route.abort());
  await page.route('**/assets/audio/ambient/tieng-mua-roi.mp3', route => route.abort());
  await page.goto('/tu-tap');
  await page.getByRole('button', { name: /^Thiền định Hẹn giờ/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Thiền có hướng dẫn', exact: true });
  await dialog.getByRole('tab').nth(1).click();
  const music = dialog.getByRole('tabpanel');
  await expect(music.locator('.meditation-audio-tile')).toHaveCount(3);
  await expect(music.locator('.audio-badge-default')).toHaveCount(3);
  await expect(music.locator('.audio-btn-download, .audio-btn-delete')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('meditation-music-built-in.png') });
  await dialog.getByRole('tab').nth(2).click();
  const ambient = dialog.getByRole('tabpanel');
  const tile = ambient.locator('.meditation-audio-tile').nth(1);
  const selection = tile.locator('.meditation-audio-tile__select');
  await expect(selection).toHaveAttribute('aria-pressed', 'false');
  await tile.locator('.audio-btn-download').click();
  await expect(selection).toHaveAttribute('aria-pressed', 'false');
  const title = await tile.locator('.meditation-tile-title').boundingBox();
  expect(title).not.toBeNull();
  await page.mouse.click(title!.x + title!.width / 2, title!.y + title!.height / 2);
  await expect(selection).toHaveAttribute('aria-pressed', 'true');
  await ambient.locator('.meditation-audio-tile__select').first().click();
  await selection.focus();
  await page.keyboard.press('Space');
  await expect(selection).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('meditation-ambient-controls.png') });
});
  }
}

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
  for (const inset of [0, 44]) {
    test(`meditation setup keeps actions visible at ${viewport.width}x${viewport.height}, inset ${inset}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(top => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--app-safe-top', `${top}px`)), inset);
      await page.goto('/tu-tap');
      await page.getByRole('button', { name: /^Thiền định Hẹn giờ/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Thiền có hướng dẫn', exact: true });
      await expect(dialog).toBeVisible();
      for (const name of ['Hủy', 'Bắt đầu thiền']) {
        const button = dialog.getByRole('button', { name, exact: true });
        expect(await button.evaluate(element => {
          const r = element.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1
            && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })).toBe(true);
      }
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await dialog.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
      await dialog.getByRole('spinbutton').fill('20');
      await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    });
  }
}
