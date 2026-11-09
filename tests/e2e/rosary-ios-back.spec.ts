import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

// Run this spec with WebKit as well as the normal Chromium release project.
// Safe-area emulation exercises the app CSS, not a claim of physical iPhone QA.
for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`rosary back remains reachable and preserves count ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/tu-tap');
    await settleClient(page);
    await page.addStyleTag({ content: ':root { --app-safe-top: 59px !important; }' });

    const open = async () => {
      await page.locator('button.tt-mode-card--chuoi').click();
      await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
      await expect(page.locator('.tt-rosary__swipe')).toBeVisible();
    };
    await open();
    const count = page.locator('.tt-rosary__meta > div > strong').first();
    const initial = Number(await count.textContent());
    await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
    await expect(count).toHaveText(String(initial + 1));
    const back = page.getByRole('button', { name: 'Quay lại tu tập', exact: true });
    await expect(back).toBeVisible();
    const geometry = await back.evaluate(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      const svg = element.querySelector('svg')!.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height,
        right: box.right, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
        hit: !!hit && element.contains(hit), svgWidth: svg.width, svgHeight: svg.height };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(0);
    expect(geometry.y).toBeGreaterThanOrEqual(59);
    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.hit).toBe(true);
    expect(geometry.svgWidth).toBeGreaterThan(0);
    expect(geometry.svgHeight).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`rosary-back-${viewport.width}x${viewport.height}.png`) });
    await back.click();
    await expect(page.locator('.tt-rosary-modal')).toHaveCount(0);
    await expect(page.locator('button.tt-mode-card--chuoi')).toBeVisible();
    await open();
    await expect(count).toHaveText(String(initial + 1));
  });
}

for (const insets of [{ left: 59, right: 0 }, { left: 0, right: 59 }]) {
  test(`rosary landscape header respects side safe areas ${insets.left}/${insets.right}`, async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'CDP safe-area environment override requires Chromium; native iOS proof remains separate');
    await page.setViewportSize({ width: 844, height: 390 });
    const transport = await page.context().newCDPSession(page);
    // Installed CDP protocol exposes real CSS env overrides; do not patch the app CSS under test.
    await transport.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, ...insets } });
    await page.goto('/tu-tap');
    await settleClient(page);
    const open = async () => {
      await page.locator('button.tt-mode-card--chuoi').click();
      await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
      await expect(page.locator('.tt-rosary__swipe')).toBeVisible();
    };
    await open();
    const count = page.locator('.tt-rosary__meta > div > strong').first();
    const initial = Number(await count.textContent());
    await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
    await expect(count).toHaveText(String(initial + 1));
    const back = page.getByRole('button', { name: 'Quay lại tu tập', exact: true });
    const end = page.getByRole('button', { name: 'Kết thúc phiên', exact: true });
    for (const control of [back, end]) {
      const geometry = await control.evaluate(element => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { x: box.x, right: box.right, width: box.width, height: box.height,
          hit: !!hit && element.contains(hit), viewportWidth: innerWidth };
      });
      expect(geometry.x).toBeGreaterThanOrEqual(insets.left);
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - insets.right);
      expect(geometry.width).toBeGreaterThanOrEqual(44);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.hit).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`rosary-side-insets-${insets.left}-${insets.right}.png`) });
    await back.click();
    await expect(page.locator('.tt-rosary-modal')).toHaveCount(0);
    await open();
    await expect(count).toHaveText(String(initial + 1));
    await transport.detach();
  });
}
