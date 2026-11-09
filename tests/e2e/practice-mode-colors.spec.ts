import { expect, test } from '@playwright/test';

test('practice entry cards have distinct readable palettes in both themes and viewport sizes', async ({ page }, testInfo) => {
  await page.goto('/tu-tap');
  await expect(page.locator('a[href="/tu-tap/chep-danh-hieu"]')).toBeVisible();
  const cards = page.locator('.tt-modes-grid > .tt-mode-card');
  await expect(cards).toHaveCount(16);
  for (const card of await cards.all()) await expect(card).toBeEnabled();
  for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    const palettes = await cards.evaluateAll(elements => {
      const luminance = (channels: number[]) => channels.map(value => {
        const scaled = value / 255;
        return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const channels = (value: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      return elements.map(element => {
        const style = getComputedStyle(element);
        const ink = luminance(channels(style.color));
        const colors = style.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g) ?? [];
        if (colors.length < 2) throw new Error(`Missing card background: ${element.textContent}`);
        const ratios = colors.map(color => {
          const background = luminance(channels(color));
          return (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05);
        });
        // Eight precepts also carries the base precepts class; identify the specific action.
        const mode = element.classList.contains('tt-mode-card--eight-precepts')
          ? 'eight-precepts'
          : [...element.classList].find(name => name.startsWith('tt-mode-card--'))?.slice('tt-mode-card--'.length);
        return { mode, title: element.querySelector('.tt-mode-title')?.textContent, background: style.backgroundImage, contrast: Math.min(...ratios) };
      });
    });
    expect(palettes.every(palette => palette.mode)).toBe(true);
    expect(new Set(palettes.map(palette => palette.mode)).size).toBe(16);
    const backgroundFamilies = new Map<string, string[]>();
    for (const palette of palettes) {
      const family = backgroundFamilies.get(palette.background) ?? [];
      family.push(palette.mode!);
      backgroundFamilies.set(palette.background, family);
    }
    const sharedFamilies = [...backgroundFamilies.values()]
      .filter(family => family.length > 1)
      .map(family => family.sort().join(','))
      .sort();
    // Existing practice-theme.css uses gold-light → gold-muted for these
    // three light cards (including eight-precepts through its base precepts class).
    // The baseline ui-refresh.css dark rules give every action its own gradient.
    // The approved four guide cards do not authorize changing these mode palettes.
    expect(sharedFamilies, `${width}, ${theme}: unexpected shared card gradient`).toEqual(
      theme === 'light' ? ['copying,eight-precepts,precepts,reflection'] : ['copying,reflection']
    );
    for (const palette of palettes) expect(palette.contrast, `${palette.title} (${width}, ${theme})`).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const mainModes = page.locator('.tt-modes-grid').filter({ has: page.locator('a[href="/tu-tap/chep-danh-hieu"]') });
    await mainModes.screenshot({ path: testInfo.outputPath(`${width}-${theme}.png`), animations: 'disabled' });
  }
});
