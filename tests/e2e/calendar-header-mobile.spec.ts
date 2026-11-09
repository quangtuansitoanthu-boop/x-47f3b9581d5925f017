import { expect, test, type Locator } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test.use(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});

async function expectCompactHeader(calendar: Locator): Promise<void> {
  const title = await calendar.locator('.strip-title-box').boundingBox();
  const controls = await calendar.locator('.strip-controls').boundingBox();
  expect(title).not.toBeNull();
  expect(controls).not.toBeNull();
  expect(controls!.y).toBeLessThan(title!.y + title!.height);
  expect(controls!.x).toBeGreaterThanOrEqual(title!.x + title!.width - 1);
  const card = await calendar.boundingBox();
  expect(controls!.x + controls!.width).toBeLessThanOrEqual(card!.x + card!.width);
  const solarTitleFits = await calendar.locator('.strip-title').evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(solarTitleFits).toBe(true);
  for (const button of await calendar.locator('.strip-controls button').all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
}

test('dark calendar surfaces stay dark with readable dates when artwork is unavailable', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00Z'));
  await page.route('**/images/calendar/**', route => route.abort('failed'));
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await settleClient(page);
    const art = page.locator('.buddhist-daily-art-card');
    const calendar = page.locator('.weekly-lunar-strip');
    await art.scrollIntoViewIfNeeded();
    await expect(art.locator('.art-placeholder')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const solarDate = await art.locator('.art-solar-text').innerText();
    for (const mode of ['week', 'month']) {
      if (mode === 'month') await calendar.locator('.strip-expand-btn').click();
      const { surfaces, dateContrast } = await page.locator([
        '.buddhist-daily-art-card', '.art-main', '.art-left-panel', '.art-visual', '.art-footer', '.art-shuffle-btn',
        '.weekly-lunar-strip', '.strip-arrow-btn', mode === 'week' ? '.day-col:not(.is-selected)' : '.month-day-cell:not(.is-selected)',
      ].join(',')).evaluateAll(elements => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        const parsed = new Map<string, number[]>();
        const pixel = (color: string) => {
          if (!CSS.supports('color', color)) throw new Error(`Unsupported rendered color: ${color}`);
          if (!parsed.has(color)) {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            parsed.set(color, Array.from(context.getImageData(0, 0, 1, 1).data));
          }
          return parsed.get(color)!;
        };
        const luminance = (rgb: number[]) => rgb.map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).slice(0, 3).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
        const blend = (foreground: number[], background: number[]) => {
          const alpha = foreground[3] / 255;
          return foreground.slice(0, 3).map((value, index) => value * alpha + background[index] * (1 - alpha)).concat(255);
        };
        const samples = (element: Element, behind: number[]) => {
          const style = getComputedStyle(element);
          const background = blend(pixel(style.backgroundColor), behind);
          const stops = style.backgroundImage.match(/(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[\da-f]{3,8}\b|\btransparent\b/gi) ?? [];
          return stops.length ? stops.map(color => blend(pixel(color), background)) : [background];
        };
        const brightest = (colors: number[][]) => colors.reduce((a, b) => luminance(a) > luminance(b) ? a : b);
        const behind = (element: Element) => {
          const ancestors: Element[] = [];
          for (let parent = element.parentElement; parent; parent = parent.parentElement) ancestors.unshift(parent);
          // Transparent surfaces inherit the rendered backdrop, not an artificial black pixel.
          return ancestors.reduce((background, ancestor) => brightest(samples(ancestor, background)), [255, 255, 255, 255]);
        };
        const date = document.querySelector('.art-huge-day')!;
        const dateBackground = brightest(samples(date, behind(date)));
        const foreground = luminance(blend(pixel(getComputedStyle(date).color), dateBackground));
        const background = luminance(dateBackground);
        return {
          surfaces: elements.map(element => ({ name: element.className, colors: samples(element, behind(element)).map(luminance) })),
          dateContrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05),
        };
      });
      for (const surface of surfaces) {
        expect(surface.colors.length, `${surface.name} exposes a rendered surface color`).toBeGreaterThan(0);
        expect(Math.max(...surface.colors), `${surface.name} must not retain a light panel in dark mode`).toBeLessThan(.15);
      }
      expect(dateContrast).toBeGreaterThanOrEqual(4.5);
      await expect(calendar.getByRole('tab', { selected: true })).toHaveCount(1);
      await expect(art.locator('.art-solar-text')).toHaveText(solarDate);
    }
    await page.locator('#home-calendar').screenshot({ path: info.outputPath(`calendar-dark-${width}.png`), animations: 'disabled' });
  }
});

for (const theme of ['light', 'dark'] as const) {
test(`calendar controls stay beside the title in week and month modes (${theme})`, async ({ page }) => {
  await page.addInitScript((mode) => localStorage.setItem('tutam_dark_mode', mode === 'dark' ? '1' : '0'), theme);
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00Z'));
  for (const width of [320, 360, 375, 390, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await settleClient(page);
    const calendar = page.locator('.weekly-lunar-strip');
    await expect(calendar).toBeVisible();
    await expectCompactHeader(calendar);
    const initialDays = await calendar.locator('.day-solar-num').allTextContents();
    await calendar.getByRole('button', { name: 'Tuần sau', exact: true }).click();
    await expect(calendar.getByRole('button', { name: 'Hôm nay', exact: true })).toBeVisible();
    await expectCompactHeader(calendar);
    await calendar.getByRole('button', { name: 'Tuần trước', exact: true }).click();
    await expect(calendar.locator('.day-solar-num')).toHaveText(initialDays);
    await calendar.locator('.strip-expand-btn').click();
    await expect(calendar.locator('.month-calendar-view')).toBeVisible();
    await expectCompactHeader(calendar);
    await calendar.getByRole('button', { name: 'Tháng sau', exact: true }).click();
    await expectCompactHeader(calendar);
    await calendar.getByRole('button', { name: 'Hôm nay', exact: true }).click();
    await expectCompactHeader(calendar);
  }
});
}
