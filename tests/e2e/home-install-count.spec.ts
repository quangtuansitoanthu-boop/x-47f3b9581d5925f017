import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const locale of ['vi', 'en']) {
  test(`home shows the approved 1291+ milestone despite old install stats (${locale})`, async ({ page }) => {
    await page.addInitScript(locale => {
      localStorage.setItem('tutam_locale', locale);
      localStorage.setItem('tutam_install_count_cache', JSON.stringify({ count: 6519, timestamp: Date.now() }));
    }, locale);
    await page.route('**/api/**', route => route.abort('failed'));
    await page.route('**/api/app/stats', route => route.fulfill({ json: { total: 6519 } }));
    await page.goto('/');
    await settleClient(page);
    const badge = page.locator('.global-presence-pill');
    await expect(badge).toContainText(locale === 'vi' ? '1.291+' : '1,291+');
    await expect(badge).not.toContainText('6.519');
    await expect(badge).not.toContainText('6,519');
    await page.reload();
    await settleClient(page);
    await expect(badge).toContainText(locale === 'vi' ? '1.291+' : '1,291+');
  });
}
