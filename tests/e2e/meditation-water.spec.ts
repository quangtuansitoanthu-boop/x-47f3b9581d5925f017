import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

async function expectReadableHoveredPrimary(button: import('@playwright/test').Locator) {
  await button.hover();
  await button.evaluate(async element => {
    // Read the style first, then await the finite hover transition before measuring.
    void getComputedStyle(element).backgroundColor;
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined)));
  });
  const contrast = await button.evaluate(element => {
    const style = getComputedStyle(element);
    const parse = (color: string) => color.match(/[\d.]+/g)!.map(Number);
    const foreground = parse(style.color);
    const background = parse(style.backgroundColor);
    const alpha = background[3] ?? 1;
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(channel => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const gradient = getComputedStyle(element.closest('.meditation-screen')!).backgroundImage;
    const stops = [...gradient.matchAll(/rgba?\(([^)]+)\)/g)].map(match => parse(match[1]));
    const ratios = stops.map(stop => {
      const composited = background.slice(0, 3).map((channel, index) => channel * alpha + stop[index] * (1 - alpha));
      const ink = luminance(foreground), surface = luminance(composited);
      return (Math.max(ink, surface) + .05) / (Math.min(ink, surface) + .05);
    });
    return { alpha, stops: stops.length, minimum: Math.min(...ratios), hovered: element.matches(':hover') };
  });
  expect(contrast.hovered).toBe(true);
  expect(contrast.stops).toBeGreaterThan(0);
  expect(contrast.alpha).toBe(1);
  expect(contrast.minimum).toBeGreaterThanOrEqual(4.5);
}

for (const dark of [false, true]) {
  test(`hovered meditation primary stays readable when active, paused and ended (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.addInitScript(darkMode => localStorage.setItem('tutam_dark_mode', darkMode ? '1' : '0'), dark);
    await page.goto('/tu-tap?mode=meditation');
    await settleClient(page);
    await page.locator('.meditation-chooser').getByRole('button', { name: 'Bắt đầu thiền', exact: true }).click();
    const screen = page.locator('.meditation-screen');
    const pause = screen.getByRole('button', { name: 'Tạm dừng', exact: true });
    await expectReadableHoveredPrimary(pause);
    await pause.click();
    await expect(screen.locator('.meditation-screen__badge--paused')).toHaveText('⏸️ Thời thiền đang tạm dừng');
    const resume = screen.getByRole('button', { name: 'Tiếp tục', exact: true });
    await expectReadableHoveredPrimary(resume);
    await screen.getByRole('button', { name: 'Kết thúc sớm', exact: true }).click();
    const finish = screen.getByRole('button', { name: 'Hoàn tất', exact: true });
    await expectReadableHoveredPrimary(finish);
    await finish.click();
    await expect(screen).toHaveCount(0);
  });
}

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`meditation water preserves session and controls ${width} ${dark}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(darkMode => {
        localStorage.setItem('tutam_dark_mode', darkMode ? '1' : '0');
        localStorage.setItem('tutam_ui_motion', '1');
      }, dark);
      await page.goto('/tu-tap?mode=meditation');
      await settleClient(page);
      await page.locator('.meditation-chooser').getByRole('button', { name: 'Bắt đầu thiền', exact: true }).click();
      const screen = page.locator('.meditation-screen');
      const water = screen.locator('canvas');
      await expect(water).toHaveAttribute('data-water-ready', 'true');
      const main = await screen.locator('main').boundingBox();
      expect(main).not.toBeNull();
      await page.waitForLoadState('networkidle');
      const requests: string[] = [];
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
      const storage = await page.evaluate(() => JSON.stringify(localStorage));
      // Khởi đầu giữa màn: không áp dụng vùng loại trừ dành riêng cho chuỗi hạt.
      await page.mouse.move(main!.x + main!.width / 2, main!.y + 50);
      await page.mouse.down();
      await expect(water).toHaveAttribute('data-water-active', 'true');
      await page.mouse.move(main!.x + 30, main!.y + 120, { steps: 8 });
      await page.mouse.up();
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
      await page.screenshot({ path: `.artifacts/meditation-water-${width}-${dark ? 'dark' : 'light'}.png` });
      await expect(water).toHaveAttribute('data-water-active', 'false');
      expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storage);
      expect(requests).toEqual([]);
      if (width === 375) {
        const touch = await page.context().newCDPSession(page);
        const x = main!.x + 25;
        const y = main!.y + 50;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 80 }] });
        await expect(water).toHaveAttribute('data-water-active', 'true');
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(water).toHaveAttribute('data-water-active', 'false');
        await touch.detach();
      }
      await screen.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await expect(screen.locator('.meditation-screen__badge--paused')).toBeVisible();
      await expect(water).toHaveAttribute('data-water-active', 'false');
      await screen.getByRole('button', { name: 'Đổi nền', exact: true }).click();
      await expect(screen.locator('.meditation-background-picker')).toBeVisible();
      await screen.locator('.meditation-background-picker__tile').nth(1).click();
      await screen.getByRole('button', { name: 'Xong', exact: true }).click();
      await expect(screen.locator('.meditation-screen__photo img')).toBeVisible();
      await expect.poll(() => screen.locator('.meditation-screen__photo img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.mouse.move(main!.x + 25, main!.y + 50);
      await page.mouse.down();
      await expect(water).toHaveAttribute('data-water-active', 'true');
      await page.mouse.up();
      await page.screenshot({ path: `.artifacts/meditation-water-photo-${width}-${dark ? 'dark' : 'light'}.png` });
      await expect(water).toHaveAttribute('data-water-active', 'false');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.mouse.move(main!.x + 30, main!.y + 50);
      await page.mouse.down();
      await page.mouse.move(main!.x + 80, main!.y + 100, { steps: 5 });
      await page.mouse.up();
      await expect(water).toHaveAttribute('data-water-active', 'false');
      if (width === 375) {
        await page.setViewportSize({ width, height: 430 });
        await expect(screen.locator('main')).toHaveCSS('touch-action', 'pan-y');
        await screen.locator('.meditation-screen__motion').scrollIntoViewIfNeeded();
        await expect(screen.locator('.meditation-screen__motion')).toBeInViewport();
        await expect(screen.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeInViewport();
      }
      expect(errors).toEqual([]);
    });
  }
}
