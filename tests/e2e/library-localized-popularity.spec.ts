import { expect, test } from '@playwright/test';
import englishBooks from '../../src/lib/data/offline-books-en.json' with { type: 'json' };
import { settleClient } from './runtime-helpers';

const bookId = 'tt_1781081372340_1_xqcxo';
const vietnameseTitle = 'SỨ MỆNH ĐỘ VONG — 50 CÂU CHUYỆN NHÂN QUẢ TỪ HÀNH TRÌNH SIÊU ĐỘ';

for (const locale of ['vi', 'en'] as const) {
  test(`library Top 10 preserves real views and localized labels (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(value => localStorage.setItem('tutam_locale', value), locale);
    let catalogs = 0;
    let statistics = 0;
    await page.route('**/api/articles?*', route => {
      catalogs++;
      return route.fulfill({ json: [{ id: bookId, tieu_de: vietnameseTitle,
        danh_muc: 'SÁCH KHUYẾN THIỆN', noi_dung: '<p>Nội dung kiểm thử</p>',
        trang_thai: 'Hoàn thành', ngay_dang: '2026-09-01', tags: '', tac_gia: 'E2E' }] });
    });
    await page.route('**/api/data/luot_xem?*', route => {
      statistics++;
      return route.fulfill({ json: [{ bai_viet_id: bookId, so_luot: 1234 }] });
    });
    await page.goto('/kinh-sach', { waitUntil: 'domcontentloaded' });
    await settleClient(page);
    const title = locale === 'en' ? englishBooks[bookId].title : vietnameseTitle;
    await expect(page.locator('.articles-grid .art-title')).toHaveText(title.toUpperCase());
    expect(catalogs).toBe(1);
    expect(statistics).toBe(1);
    const trigger = page.getByRole('button', { name: 'Top 10', exact: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: locale === 'en' ? 'Top 10 Most Viewed Books' : 'Top 10 sách được xem nhiều nhất' });
      await expect(dialog.locator('li').first()).toContainText(title);
      await expect(dialog.locator('li small').first()).toHaveText(locale === 'en' ? '1,234 views' : '1.234 lượt xem');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    expect(catalogs).toBe(1);
    expect(statistics).toBe(1);
  });
}
