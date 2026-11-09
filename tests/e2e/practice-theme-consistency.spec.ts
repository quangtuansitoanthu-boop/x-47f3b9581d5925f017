import { expect, test } from '@playwright/test';

for (const savedBackground of ['dark', 'cream', 'gray', 'white']) {
test(`scripture preview and navigation follow the same theme with saved ${savedBackground} paper`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((background) => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', '0');
    localStorage.setItem('tt_bg', background);
  }, savedBackground);
  const lightBackground = savedBackground === 'dark' ? 'cream' : savedBackground;
  const lightColors: Record<string, string> = { cream: 'rgb(250, 246, 238)', gray: 'rgb(232, 232, 232)', white: 'rgb(255, 255, 255)' };
  const lightColor = lightColors[lightBackground];
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap?article=tt_1780910773084');
  const preview = page.locator('.tt-preview');
  await expect(preview).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
  await expect(preview).toHaveCSS('background-color', lightColor!);
  await page.screenshot({ path: testInfo.outputPath('practice-light.png'), animations: 'disabled' });

  await page.locator('.tt-theme-btn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(preview).toHaveAttribute('data-read-bg', 'dark');
  await expect(preview).toHaveCSS('background-color', 'rgb(21, 18, 13)');
  await page.screenshot({ path: testInfo.outputPath('practice-dark.png'), animations: 'disabled' });

  await page.locator('.tt-theme-btn').click();
  await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
  await expect(preview).toHaveCSS('background-color', lightColor!);
  // Theme changes must not rewrite the user's saved reading-paper choice.
  expect(await page.evaluate(() => localStorage.getItem('tt_bg'))).toBe(savedBackground);
});
}

for (const savedBackground of ['dark', 'cream', 'gray', 'white']) {
  test(`chapter paper follows theme after opening dark with saved ${savedBackground} paper`, async ({ page }, testInfo) => {
    const darkBackground = savedBackground === 'gray' ? 'cream' : 'dark';
    const wide = savedBackground === 'gray' || savedBackground === 'white';
    await page.setViewportSize({ width: wide ? 1440 : 390, height: wide ? 1000 : 844 });
    await page.addInitScript(({ background, darkPaper }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', '1');
      localStorage.setItem('tt_bg', background);
      localStorage.setItem('tutam_read_bg', background);
      localStorage.setItem('tutam_read_bg_dark', darkPaper);
    }, { background: savedBackground, darkPaper: darkBackground });
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/tu-tap?article=tt_1780910773084');
    const preview = page.locator('.tt-preview');
    const toggle = page.locator('.tt-theme-btn');
    await expect(preview).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Keep the same preview mounted: dark mount, light TOC, then chapter.
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('.tt-preview__toc-list > button').first().click();
    await expect(page.locator('.tt-preview .reader-content')).not.toBeEmpty();
    const lightBackground = savedBackground === 'dark' ? 'cream' : savedBackground;
    const lightColors: Record<string, string> = { cream: 'rgb(250, 246, 238)', gray: 'rgb(232, 232, 232)', white: 'rgb(255, 255, 255)' };
    await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
    await expect(preview).toHaveCSS('background-color', lightColors[lightBackground]!);

    await page.locator('.tt-reader-back-btn').click();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.tt-preview__toc-list > button').first().click();
    await expect(page.locator('.tt-preview .reader-content')).not.toBeEmpty();
    await expect(preview).toHaveAttribute('data-read-bg', darkBackground);
    await expect(preview).toHaveCSS('background-color', 'rgb(21, 18, 13)');
    await page.locator('.tt-reader-back-btn').click();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('.tt-preview__toc-list > button').first().click();
    await expect(page.locator('.tt-preview .reader-content')).not.toBeEmpty();
    await expect(preview).toHaveAttribute('data-read-bg', lightBackground);
    await expect(preview).toHaveCSS('background-color', lightColors[lightBackground]!);
    expect(await page.evaluate(() => ({
      paper: localStorage.getItem('tt_bg'),
      lightPaper: localStorage.getItem('tutam_read_bg'),
      darkPaper: localStorage.getItem('tutam_read_bg_dark')
    }))).toEqual({ paper: savedBackground, lightPaper: savedBackground, darkPaper: darkBackground });
    await page.screenshot({ path: testInfo.outputPath('chapter-light-restored.png'), animations: 'disabled' });
  });
}
