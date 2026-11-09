import { expect, test } from '@playwright/test';
import { userTestimonials } from '../../src/lib/i18n/user-testimonials';
import { settleClient } from './runtime-helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`full user stories preserve separate authors and personal navigation (${theme})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
    }, { theme });
    const requests: string[] = [];
    await page.route('**/api/**', route => {
      requests.push(new URL(route.request().url()).pathname);
      return route.abort('failed');
    });
    await page.goto('/ca-nhan');
    await settleClient(page);
    const menu = page.locator('.cn-big-tab-card');
    const titles = await menu.locator('h2').allTextContents();
    expect(titles.indexOf('Chia sẻ từ người dùng')).toBe(titles.indexOf('Liên hệ & Góp ý') - 1);
    await expect.poll(() => requests.includes('/api/presence')).toBe(true);
    const initial = requests.filter(path => path !== '/api/presence');
    await page.getByRole('button', { name: /Chia sẻ từ người dùng/ }).click();
    await expect(page).toHaveURL(/tab=testimonials/);
    await expect(page).toHaveTitle('Chia sẻ từ người dùng — Quang Từ');
    const stories = page.locator('.cn-testimonials article');
    await expect(stories).toHaveCount(8);
    expect(await stories.first().evaluate(element => getComputedStyle(element).backdropFilter)).not.toBe('none');
    await expect(stories.getByRole('heading', { name: 'Khánh Vy', exact: true })).toHaveCount(2);
    await expect(stories.nth(1)).not.toContainText('thường dễ mất động lực');
    await expect(stories.nth(2)).not.toContainText('không phải mang theo kinh');
    await page.context().setOffline(true);
    for (const [index, testimonial] of userTestimonials.entries()) {
      await expect(stories.nth(index)).toContainText(testimonial.name);
      const paragraphs = stories.nth(index).locator('blockquote p');
      await expect(paragraphs).toHaveText(testimonial.paragraphs);
      await expect(paragraphs.last()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Đọc tiếp|Thu gọn|Xem thêm/ })).toHaveCount(0);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`testimonials-top-${width}-${theme}.png`) });
      await page.screenshot({ path: testInfo.outputPath(`testimonials-${width}-${theme}.png`), fullPage: true });
    }
    expect(requests.filter(path => path !== '/api/presence')).toEqual(initial);
    await page.context().setOffline(false);
    await page.locator('.cn-subpage-back-btn').click();
    await expect(page.getByRole('button', { name: /Liên hệ & Góp ý/ })).toBeVisible();
    await page.getByRole('button', { name: /Liên hệ & Góp ý/ }).click();
    await expect(page.getByRole('heading', { name: 'Liên hệ & Góp ý', exact: true })).toBeVisible();
    await page.goBack();
    await page.getByRole('button', { name: /Chia sẻ từ người dùng/ }).click();
    await expect(stories).toHaveCount(8);
    expect(requests.filter(path => path !== '/api/presence')).toEqual(initial);
  });
}
