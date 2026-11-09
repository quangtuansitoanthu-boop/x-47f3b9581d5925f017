import { expect, test, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';

async function openRosary(page: Page) {
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('button.tt-mode-card--chuoi').click();
  await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
  const area = page.locator('.tt-rosary__swipe');
  await expect(area).toBeVisible();
  await area.scrollIntoViewIfNeeded();
  return area;
}

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`water boundaries and idle cleanup ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(darkMode => {
        localStorage.setItem('tutam_dark_mode', darkMode ? '1' : '0');
        localStorage.setItem('tutam_ui_motion', '1');
      }, dark);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const area = await openRosary(page);
      const water = area.locator('canvas');
      await expect(water).toHaveAttribute('data-water-ready', 'true');
      const contrast = await page.locator('.tt-rosary__count-button').evaluate(element => {
        const style = getComputedStyle(element);
        const luminance = (value: string) => {
          const rgb = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => {
            const v = channel / 255;
            return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
          });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const foreground = luminance(style.color); const background = luminance(style.backgroundColor);
        return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      const box = await area.boundingBox();
      expect(box).not.toBeNull();
      const x = box!.x + box!.width / 2;
      const y = box!.y + Math.min(box!.height / 2, 120);
      const count = page.locator('.tt-rosary__meta > div > strong').first();
      const initial = Number(await count.textContent());
      const storage = await page.evaluate(() => JSON.stringify(localStorage));
      const api: string[] = [];
      const record = (request: import('@playwright/test').Request) => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()); };
      page.on('request', record);
      // Bắt đầu ở nước, đi qua chuỗi hạt: không trở thành một lần niệm.
      await page.mouse.move(box!.x + 20, y);
      await page.mouse.down();
      await expect(water).toHaveAttribute('data-water-active', 'true');
      await page.mouse.move(x, y - 70, { steps: 8 });
      await page.mouse.up();
      await expect(count).toHaveText(String(initial));
      expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storage);
      expect(api).toEqual([]);
      page.off('request', record);
      await page.screenshot({ path: `.artifacts/rosary-water-${width}-${dark ? 'dark' : 'light'}.png` });
      await expect(water).toHaveAttribute('data-water-active', 'false');
      // Bắt đầu ở hạt, đi ra nước: vẫn đếm đúng một lần (hướng mặc định lên).
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(box!.x + 20, y - 80, { steps: 8 });
      await page.mouse.up();
      await expect(count).toHaveText(String(initial + 1));
      await expect(water).toHaveAttribute('data-water-active', 'true');
      await page.screenshot({ path: `.artifacts/rosary-water-count-${width}-${dark ? 'dark' : 'light'}.png` });
      await expect(water).toHaveAttribute('data-water-active', 'false');
      expect(errors).toEqual([]);
    });
  }
}

test('live reduced motion clears water and keeps the count button functional', async ({ page }) => {
  const area = await openRosary(page);
  const water = area.locator('canvas');
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(water).toHaveAttribute('data-water-active', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(water).toHaveAttribute('data-water-active', 'false');
  const count = page.locator('.tt-rosary__meta > div > strong').first();
  await expect(count).toHaveText('1');
  await page.waitForTimeout(420);
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(count).toHaveText('2');
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(420);
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(count).toHaveText('3');
  await expect(water).toHaveAttribute('data-water-active', 'true');
});

test('saved motion off leaves water idle while keyboard and button still count', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_ui_motion', '0'));
  const area = await openRosary(page);
  await area.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-rosary__meta > div > strong').first()).toHaveText('1');
  await expect(area.locator('canvas')).toHaveAttribute('data-water-active', 'false');
});

test('previously missed rosary actions and picker retain the approved glass shadow', async ({ page }) => {
  await openRosary(page);
  for (const name of ['Kết thúc phiên', 'Tùy chọn']) {
    const button = page.getByRole('button', { name, exact: true });
    expect(await button.evaluate(element => getComputedStyle(element).boxShadow)).toContain('inset');
  }
  await page.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
  await expect(page.locator('.rosary-select__trigger')).toHaveCount(3);
  for (const trigger of await page.locator('.rosary-select__trigger').all()) {
    expect(await trigger.evaluate(element => getComputedStyle(element).boxShadow)).toContain('inset');
  }
});

test('header links and install action receive the same glass material', async ({ page }) => {
  await page.goto('/huong-dan');
  await settleClient(page);
  const links = page.locator('nav.qts-nav a.btn');
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    expect(await link.evaluate(element => getComputedStyle(element).boxShadow)).toContain('inset');
  }
  const install = page.locator('.guide-install-button');
  if (!await install.isVisible()) await page.locator('#cai-app > summary').click();
  await expect(install).toBeVisible();
  expect(await install.evaluate(element => getComputedStyle(element).boxShadow)).toContain('inset');
});
