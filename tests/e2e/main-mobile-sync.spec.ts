import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`main artwork, profiles and filters preserve mobile behavior ${width} dark=${dark}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', value ? '1' : '0');
    }, dark);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/\/api\/talks(?:\?|$)/, route => route.fulfill({ json: [] }));
    await page.goto('/tu-tap');
    await settleClient(page);
    await expect(page.locator('.tt-mode-card--le-phat')).toBeVisible();
    expect(await page.locator('.tt-mode-card .app-artwork').count()).toBeGreaterThan(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('practice.png'), fullPage: true });
    await page.locator('.tt-mode-card--le-phat').click();
    const profile = page.locator('.buddha-profile-dialog');
    await page.locator('.lp__profile-button').last().click();
    await expect(profile.locator('.reader')).toBeVisible();
    await expect(profile.locator('.profile-section')).not.toHaveCount(0);
    await page.screenshot({ path: info.outputPath('profile.png') });
    await profile.locator('button.close').click();
    await expect(profile).toHaveCount(0);
    await expect(page.locator('.lp__profile-button').last()).toBeFocused();
    await page.goto('/phap-thoai');
    await settleClient(page);
    await page.waitForLoadState('networkidle');
    const requests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
    });
    const toggle = page.getByRole('button', { name: 'Tìm kiếm và bộ lọc', exact: true });
    await toggle.click();
    await expect(page.locator('#talk-options')).toBeVisible();
    await page.locator('select').filter({ has: page.locator('option[value="title"]') }).selectOption('title');
    await toggle.click();
    await expect(page.locator('#talk-options')).toBeHidden();
    await toggle.click();
    await expect(page.locator('select').filter({ has: page.locator('option[value="title"]') })).toHaveValue('title');
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('talk-filters.png'), fullPage: true });
  });
}

for (const dark of [false, true]) {
  test(`English practice labels and bowing music follow the main correction dark=${dark}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(value => {
      localStorage.setItem('tutam_locale', 'en');
      localStorage.setItem('tutam_dark_mode', value ? '1' : '0');
    }, dark);
    await page.goto('/tu-tap');
    await settleClient(page);
    await expect(page.locator('.tt-mode-card--name-copying')).toContainText('Copy Buddha and Bodhisattva Names');
    await expect(page.locator('.tt-mode-card--name-copying')).toContainText('Type 108 sacred names by hand to cultivate mindfulness');
    await expect(page.locator('a.tt-mode-card--copying[href="/tu-tap/chep-kinh"]')).toContainText('Copy sutra passages, review your work, and save your copy');
    await page.locator('.tt-mode-card--le-phat').click();
    await expect(page.locator('#lp-music-select option')).toHaveText([
      '🔇 No meditation music', 'Meditation Music 1 — Stillness', 'Meditation Music 2 — Serenity', 'Meditation Music 3 — Peace',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('english-bowing.png'), animations: 'disabled' });
  });
}
