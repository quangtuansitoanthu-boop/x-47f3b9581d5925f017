import { expect, test, type Locator } from '@playwright/test';
import { settleClient } from './runtime-helpers';

async function expectTouchTargets(controls: Locator) {
  expect(await controls.count()).toBeGreaterThan(0);
  // Chờ animation mở popover về kích thước ổn định trước khi đo vùng chạm.
  await expect.poll(async () => {
    const invalid = [];
    for (const control of await controls.all()) {
      const bounds = await control.boundingBox();
      if (!bounds || Math.round(bounds.width) < 44 || Math.round(bounds.height) < 44) {
        invalid.push({ name: await control.textContent(), bounds });
      }
    }
    return invalid;
  }).toEqual([]);
}

for (const width of [320, 375, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`other UI touch targets and reflow ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(mode => {
        localStorage.setItem('tutam_locale', 'vi');
        localStorage.setItem('tutam_dark_mode', mode === 'dark' ? '1' : '0');
      }, theme);
      await page.goto('/phap-thoai');
      await settleClient(page);
      await page.waitForLoadState('networkidle');
      await expectTouchTargets(page.locator('.nav-logo, .nav-theme-btn, .notification-bell-btn, .nav-r > .btn:visible'));
      const header = await page.locator('.qts-nav').boundingBox();
      expect(Math.round(header!.height)).toBe(width > 900 ? 62 : 56);
      await page.locator('.notification-bell-btn').click();
      await expect(page.locator('.notification-popover')).toBeVisible();
      await expectTouchTargets(page.locator('.notification-popover button:visible'));
      await page.keyboard.press('Escape');
      await expect(page.locator('.notification-popover')).toHaveCount(0);
      await expect(page.locator('.notification-bell-btn')).toBeFocused();
      await page.waitForLoadState('networkidle');
      const requests: string[] = [];
      page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
      });
      const filterToggle = page.getByRole('button', { name: 'Tìm kiếm và bộ lọc', exact: true });
      await expectTouchTargets(filterToggle);
      await expect(filterToggle).toHaveAttribute('aria-controls', 'talk-options');
      await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#talk-options')).toBeHidden();
      await filterToggle.click();
      await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#talk-options')).toBeVisible();
      await expectTouchTargets(page.locator('.pt-tab:visible'));
      for (const tab of await page.locator('.pt-tab').all()) {
        expect(await tab.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
      await page.locator('.pt-tab').nth(1).click();
      await expect(page.locator('.pt-tab').nth(1)).toHaveClass(/active/);
      await page.locator('.pt-tab').first().click();
      expect(requests).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.cache/other-ui-audit/talks-${width}-${theme}-after.png` });

      await page.goto('/ca-nhan');
      await settleClient(page);
      await page.getByRole('button', { name: /Cài đặt ứng dụng Giao diện/ }).click();
      await expect(page).toHaveURL(/\/ca-nhan\?tab=settings$/);
      await settleClient(page);
      await expectTouchTargets(page.locator('.cn-subpage-back-btn, .reminder-master-row button, .settings-section > summary'));
      for (const id of ['lunar', 'personal', 'daily', 'sound', 'display', 'reading']) {
        const group = page.locator(`#settings-${id}`);
        await group.locator(':scope > summary').click();
        await expectTouchTargets(group.locator('button:visible, .reminder-practice-input:visible, .reminder-time-input:visible'));
      }
      const contrasts = await page.locator('.reminder-perm-btn, .reminder-day-pill.selected').evaluateAll(buttons => buttons.map(button => {
        const luminance = (value: string) => {
          const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(channel => {
            const normalized = Number(channel) / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const style = getComputedStyle(button);
        const ink = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05);
      }));
      expect(contrasts.length).toBeGreaterThan(0);
      for (const contrast of contrasts) expect(contrast).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.cache/other-ui-audit/settings-${width}-${theme}-after.png` });
      await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
      await expect(page).toHaveURL(/\/ca-nhan$/);

      await page.goto('/huong-dan');
      await settleClient(page);
      await expectTouchTargets(page.locator('.guide-back-btn'));
      await page.getByRole('searchbox').fill('PDF');
      await expect(page.locator('#guide-search-results')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.cache/other-ui-audit/guide-${width}-${theme}-after.png` });
    });
  }
}
