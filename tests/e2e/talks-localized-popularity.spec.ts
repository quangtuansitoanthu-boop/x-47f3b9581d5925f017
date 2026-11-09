import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const locale of ['vi', 'en'] as const) {
  test(`talk Top 10 localizes play counts without refetching on reopen (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(value => localStorage.setItem('tutam_locale', value), locale);
    let catalogs = 0;
    let statistics = 0;
    await page.route(/\/api\/talks(?:\?|$)/u, route => {
      catalogs++;
      return route.fulfill({ json: [{
        id: 'e2e-localized-talk', tieu_de: 'Album kiểm thử bản dịch', visibility: 'public',
        chu_de: 'Pháp ngữ', tracks: [{ title: 'Bài thử', url: '/assets/audio/tieng-mo.m4a' }],
      }] });
    });
    await page.route('**/api/album-plays', route => {
      statistics++;
      return route.fulfill({ json: [{ albumId: 'e2e-localized-talk', playCount: 1234 }] });
    });
    await page.goto('/phap-thoai', { waitUntil: 'domcontentloaded' });
    await settleClient(page);
    const trigger = page.getByRole('button', { name: 'Top 10', exact: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      await trigger.click();
      const dialog = page.getByRole('dialog', {
        name: locale === 'en' ? 'Top 10 Most Listened Albums' : 'Top 10 album được nghe nhiều nhất',
      });
      await expect(dialog.locator('li').first()).toContainText('Album kiểm thử bản dịch');
      await expect(dialog.locator('li small').first()).toHaveText(locale === 'en' ? '1,234 plays' : '1.234 lượt phát');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    expect(catalogs).toBe(1);
    expect(statistics).toBe(1);
  });
}
