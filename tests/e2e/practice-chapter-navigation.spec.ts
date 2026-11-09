import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const article of ['tt_1780910773084', 'tt_nghi_thuc_tri_chu_bao_khiep_an']) {
  test(`practice chapter has only the top navigation for ${article}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto(`/tu-tap?article=${article}`);
    await settleClient(page);
    await page.locator('.tt-preview__toc-list > button').first().click();
    const top = page.locator('.chapter-nav');
    await expect(page.locator('.reader-content')).not.toBeEmpty();
    await expect(top).toHaveCount(1);
    await expect(page.locator('.chapter-nav--bottom')).toHaveCount(0);
    await expect(top.getByRole('button', { name: 'Bài tiếp', exact: true })).toBeVisible();
    await expect.poll(() => top.evaluate(element => {
      const title = element.querySelector('.chapter-nav-title')!.getBoundingClientRect();
      return [...element.querySelectorAll('button')].every(button => {
        const box = button.getBoundingClientRect();
        return box.width >= 44 && box.height >= 44
          && Math.min(title.right, box.right) <= Math.max(title.left, box.left);
      });
    })).toBe(true);
    const initialTitle = await page.locator('.tt-reader-chapter-title').textContent();
    await top.getByRole('button', { name: 'Bài tiếp', exact: true }).click();
    await expect(page.locator('.tt-reader-chapter-title')).not.toHaveText(initialTitle!);
    await expect(page.locator('.reader-content')).not.toBeEmpty();
    await top.getByRole('button', { name: 'Bài trước', exact: true }).click();
    await expect(page.locator('.tt-reader-chapter-title')).toHaveText(initialTitle!);
    await page.locator('.reader-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator('.reader-body .chapter-nav')).toHaveCount(0);
    await expect(top).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
