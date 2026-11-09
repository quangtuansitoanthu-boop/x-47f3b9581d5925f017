import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test.use({ timezoneId: 'America/Los_Angeles', viewport: { width: 375, height: 812 } });

for (const locale of ['vi', 'en'] as const) {
  test(`Thanh Tinh start date follows the interface locale without changing stored values (${locale})`, async ({ page }) => {
    const cleanSince = '2026-10-24T17:30:00.000Z';
    await page.clock.setFixedTime(new Date('2026-10-25T12:00:00.000Z'));
    await page.addInitScript(({ locale, cleanSince }) => {
      localStorage.setItem('tutam_locale', locale);
      localStorage.setItem('tutam_thanh_tinh_v1', JSON.stringify({
        joined: true, joinedAt: cleanSince, cleanSince, longestStreakDays: 0,
        resistedUrgesCount: 0, pendingResistedCount: 0, lastCheckInDate: '2026-10-25',
        checkInDates: ['2026-10-25'], relapseHistory: [], hasRecentRelapse: false,
        consecutiveCheckInsSinceRelapse: 2,
      }));
    }, { locale, cleanSince });
    await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session'
      ? { authenticated: false, user: null, csrfToken: null, expiresAt: null } : [] }));
    await page.route('**/*.mp3', route => route.abort());
    await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
    await settleClient(page);
    await page.locator('.tt-mode-card--thanh-tinh').click();
    const start = page.locator('.stat-pill--btn');
    await expect(start).toContainText(locale === 'vi' ? '25/10/2026' : 'Oct 25, 2026');
    await start.click();
    const input = page.locator('#adjust-start-date-input');
    await expect(input).toHaveValue('2026-10-25');
    await expect(input).toHaveAttribute('lang', locale);
    await input.locator('xpath=ancestor::*[@role="dialog"][1]').getByRole('button', { name: locale === 'vi' ? 'Hủy' : 'Cancel', exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tutam_thanh_tinh_v1')!).cleanSince)).toBe(cleanSince);
  });
}
