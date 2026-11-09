import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

async function disableMotionThroughSettings(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  const toggle = page.getByRole('switch', { name: 'Hiệu ứng chuyển động', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.locator('.qts-bottom-nav [data-nav="practice"]').click();
  await expect(page).toHaveURL(/\/tu-tap/);
  await settleClient(page);
}

test('motion setting preserves legacy off preference and navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('tutam_ui_motion', '0'));
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  const toggle = page.getByRole('switch', { name: 'Hiệu ứng chuyển động', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'off');
  expect(await page.evaluate(() => localStorage.getItem('tutam_ui_motion'))).toBe('0');
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const dark of [false, true]) {
      await page.evaluate((enabled) => {
        document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
      }, dark);
      await expect(page.locator('.cn-motion-row')).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect(page.locator('#ui-font-scale-label')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'off');
  await page.locator('.qts-bottom-nav [data-nav="practice"]').click();
  await expect(page).toHaveURL(/\/tu-tap/);
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'off');
});

test('system reduced motion wins while the user preference stays enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  const toggle = page.getByRole('switch', { name: 'Hiệu ứng chuyển động', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cn-motion-system-note')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'off');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'on');
  await expect(page.locator('.cn-motion-system-note')).toHaveCount(0);
});

test('motion defaults on, toggles without API requests and restores the saved choice', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  const toggle = page.getByRole('switch', { name: 'Hiệu ứng chuyển động', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'on');
  const requests: string[] = [];
  const observe = (request: import('@playwright/test').Request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  };
  page.on('request', observe);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'off');
  expect(await page.evaluate(() => localStorage.getItem('tutam_ui_motion'))).toBe('0');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion', 'on');
  expect(await page.evaluate(() => localStorage.getItem('tutam_ui_motion'))).toBe('1');
  expect(requests).toEqual([]);
  page.off('request', observe);
  await page.reload();
  await settleClient(page);
  await page.locator('#settings-display > summary').click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('settings motion off stops rosary water on taps and drags while the count button works', async ({ page }) => {
  await disableMotionThroughSettings(page);
  await page.locator('button.tt-mode-card--chuoi').click();
  await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
  const area = page.locator('.tt-rosary__swipe');
  const water = area.locator('canvas');
  await expect(water).toHaveAttribute('data-water-ready', 'true');
  const count = page.locator('.tt-rosary__meta > div > strong').first();
  const initial = Number(await count.textContent());
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(count).toHaveText(String(initial + 1));
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await area.scrollIntoViewIfNeeded();
  const box = (await area.boundingBox())!;
  const y = box.y + Math.min(box.height / 2, 120);
  // Start in the water outside the beads, so a drag cannot count a bead.
  await page.mouse.move(box.x + 20, y);
  await page.mouse.down();
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y - 70, { steps: 8 });
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await page.mouse.up();
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await expect(count).toHaveText(String(initial + 1));
});

test('settings motion off stops meditation pointer water while pause and resume work', async ({ page }) => {
  await disableMotionThroughSettings(page);
  await page.locator('button.tt-mode-card--thien').click();
  await page.locator('.meditation-chooser').getByRole('button', { name: 'Bắt đầu thiền', exact: true }).click();
  const screen = page.locator('.meditation-screen');
  const water = screen.locator('canvas');
  await expect(water).toHaveAttribute('data-water-ready', 'true');
  const main = (await screen.locator('main').boundingBox())!;
  await page.mouse.move(main.x + main.width / 2, main.y + 50);
  await page.mouse.down();
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await page.mouse.move(main.x + 30, main.y + 120, { steps: 8 });
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await page.mouse.up();
  await expect(water).toHaveAttribute('data-water-active', 'false');
  await screen.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await expect(screen.locator('.meditation-screen__badge--paused')).toBeVisible();
  await screen.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(screen.locator('.meditation-screen__badge--paused')).toHaveCount(0);
  await expect(screen.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  await expect(water).toHaveAttribute('data-water-active', 'false');
});
