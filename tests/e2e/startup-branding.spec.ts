import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`startup artwork fits ${viewport.width}x${viewport.height} and dismisses when ready`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => Object.assign(window, { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/_app/immutable/entry/*.js', async route => { await gate; await route.continue(); });
    await page.goto('/', { waitUntil: 'commit' });
    const startup = page.locator('#app-startup');
    try {
      await expect(startup).toBeVisible();
      const logo = startup.locator('img');
      await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(startup).toHaveCSS('background-image', /\/images\/calendar\/lotus-dawn\.webp/);
      expect(await startup.locator('.startup-brand').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      })).toBe(true);
      await page.screenshot({ path: `plans/2026-10-22-android-ui-improvement/startup-${viewport.width}.png`, animations: 'disabled' });
    } finally { release(); }
    await expect(page.locator('.home-greeting-header')).toBeVisible();
    await expect(startup).toHaveCount(0);
  });
}

test('normal browser visits are not covered by the native startup screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-greeting-header')).toBeVisible();
  await expect(page.locator('#app-startup')).toHaveCount(0);
});

test('Android with native startup never paints a second WebView startup cover', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { Capacitor: {
    isNativePlatform: () => true, getPlatform: () => 'android',
    isPluginAvailable: (name: string) => name === 'StartupScreen',
  } }));
  await page.route('**/_app/immutable/entry/*.js', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-native-startup', 'true');
  await expect(page.locator('#app-startup')).toHaveCount(0);
});

test('startup uses all ten local calendar pictures before repeating', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
  await page.route('**/_app/immutable/entry/*.js', route => route.abort());
  const pictures: string[] = [];
  for (let index = 0; index < 11; index++) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    pictures.push(await page.locator('#app-startup').evaluate(el => getComputedStyle(el).backgroundImage));
  }
  expect(new Set(pictures.slice(0, 10)).size).toBe(10);
  expect(pictures[10]).toBe(pictures[0]);
  for (let index = 1; index < pictures.length; index++) expect(pictures[index]).not.toBe(pictures[index - 1]);
});
