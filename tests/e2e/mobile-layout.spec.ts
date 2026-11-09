import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsMember, settleClient } from './runtime-helpers';

for (const width of [320, 375] as const) {
  test.describe(`mobile ${width}px`, () => {
    test.use({ viewport: { width, height: 812 } });

    test('shared navigation and all canonical routes avoid horizontal overflow', async ({ page }) => {
      for (const route of ['/', '/huong-dan', '/tu-tap', '/phap-thoai'] as const) {
        await page.goto(route);
        const bottomNavigation = page.getByRole('navigation', { name: 'Điều hướng nhanh' });
        await expect(bottomNavigation).toBeVisible();
        const geometry = await page.evaluate(() => ({
          body: document.body.scrollWidth,
          viewport: document.documentElement.clientWidth,
        }));
        expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
        const visibleTargets = bottomNavigation.locator('a:visible,button:visible');
        await expect(visibleTargets).toHaveCount(5);
        for (const target of await visibleTargets.all()) {
          const box = await target.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(geometry.viewport + 1);
        }
      }
    });

    test('practice ends above the bottom navigation without duplicate clearance', async ({ page }) => {
      await loginAsMember(page);
      await page.goto('/tu-tap');
      await settleClient(page);
      const lastCard = page.locator('.tt-mode-card').last();
      await expect(lastCard).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.locator('[data-context-notices]')).toHaveCSS('margin-bottom', '0px');
      const card = await lastCard.boundingBox();
      const navigation = await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).boundingBox();
      const gap = navigation!.y - (card!.y + card!.height);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(44);
    });

    test('reader occupies the mobile viewport and remains dismissible', async ({ page }) => {
      await loginAsMember(page);
      await page.goto('/kinh-sach');
      await page.getByRole('button', { name: 'Đọc ngay Bài viết kiểm thử E2E' }).click();
      const dialog = page.getByRole('dialog', { name: /Bài viết kiểm thử E2E/ });
      await expect(dialog).toBeVisible();
      await expect.poll(async () => Math.round((await dialog.boundingBox())?.width ?? 0)).toBe(width);
      await dialog.getByRole('button', { name: /Quay lại/ }).click();
      await expect(dialog).toHaveCount(0);
    });

    test('chapter editor keeps its professional toolbar inside the viewport', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/books');
      await page.getByRole('row', { name: /Sách nhiều tập E2E/ }).getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
      const articleEditor = page.getByRole('dialog', { name: /Sửa bài viết/i });
      const tocEditor = articleEditor.locator('.toc-editor');
      // Chapter order is shared fixture state other specs reorder, so open whichever
      // chapter currently sits first instead of assuming a fixed title.
      const firstChapter = await tocEditor.getByLabel('Tên mục 1').inputValue();
      await tocEditor.getByRole('button', { name: 'Soạn' }).first().click();
      const composer = page.getByRole('dialog', { name: firstChapter });
      const editor = composer.locator('.native-editor');

      await expect(editor).toBeVisible();
      const toolbar = composer.locator('.editor-toolbar');
      await expect(toolbar).toBeVisible();
      const geometry = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(Math.round((await toolbar.boundingBox())?.width ?? 0)).toBeLessThanOrEqual(width);
      await expect(composer.locator('.editor-input')).toBeVisible();
    });

    test('article editor keeps its scroll body clear of the action footer', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/books');
      await page.getByRole('button', { name: 'Thêm bài viết' }).click();
      const dialog = page.getByRole('dialog', { name: 'Thêm bài viết mới' });
      const body = dialog.locator('.article-admin-body');
      const footer = dialog.locator('.article-admin-footer');

      await expect(body).toHaveCSS('overflow-y', 'auto');
      await expect(dialog.locator('.native-editor')).toBeVisible();
      const geometry = await dialog.evaluate((element) => {
        const modalBody = element.querySelector('.article-admin-body')!.getBoundingClientRect();
        const modalFooter = element.querySelector('.article-admin-footer')!.getBoundingClientRect();
        const metadata = element.querySelector('.article-admin-left')!.getBoundingClientRect();
        const editorSection = element.querySelector('.article-admin-right')!.getBoundingClientRect();
        const coverUpload = element.querySelector('.article-cover-upload')!.getBoundingClientRect();
        const editorHeading = element.querySelector('.article-admin-right h3')!.getBoundingClientRect();
        const editor = element.querySelector('.native-editor')!.getBoundingClientRect();
        return {
          bodyBottom: modalBody.bottom,
          bodyWidth: modalBody.width,
          coverBottom: coverUpload.bottom,
          editorSectionTop: editorSection.top,
          editorHeadingTop: editorHeading.top,
          editorWidth: editor.width,
          footerTop: modalFooter.top,
          metadataBottom: metadata.bottom,
          viewportWidth: document.documentElement.clientWidth,
          pageWidth: document.body.scrollWidth,
        };
      });
      expect(geometry.bodyBottom).toBeLessThanOrEqual(geometry.footerTop + 1);
      expect(geometry.metadataBottom).toBeLessThanOrEqual(geometry.editorSectionTop + 1);
      expect(geometry.coverBottom).toBeLessThanOrEqual(geometry.editorHeadingTop);
      expect(geometry.editorWidth).toBeLessThanOrEqual(geometry.bodyWidth + 1);
      expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      for (const action of ['Hủy', 'Lưu bài viết'] as const) {
        expect(Math.round((await footer.getByRole('button', { name: action }).boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test('390px Pháp Thoại toolbar and player match the production mobile anatomy', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/phap-thoai');
  await settleClient(page);
  const filterToggle = page.getByRole('button', { name: /bộ lọc/i });
  await expect(filterToggle).toHaveAttribute('aria-controls', 'talk-options');
  await filterToggle.click();
  const toolbar = await page.evaluate(() => {
    const search = document.querySelector('.pt-search-wrap')!.getBoundingClientRect();
    const sort = document.querySelector('select[aria-label="Sắp xếp"]')!.getBoundingClientRect();
    const count = document.querySelector('.pt-count')!.getBoundingClientRect();
    return { searchY: search.y, sortY: sort.y, countY: count.y };
  });
  expect(toolbar.sortY).toBeGreaterThan(toolbar.searchY + 30);
  expect(toolbar.countY).toBeGreaterThan(toolbar.searchY + 30);

  const fixtureCard = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
  await fixtureCard.getByRole('button', { name: /^Phát album / }).click();
  const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
  await expect(player).toBeVisible();
  await expect(player.getByLabel('Âm lượng')).toBeHidden();
  await expect(player.getByRole('button', { name: 'Đổi tốc độ' })).toBeHidden();
  await expect(player.getByRole('button', { name: 'Hẹn giờ tắt' })).toBeHidden();
  const playerPosition = await player.evaluate((element) => ({
    bottomGap: innerHeight - element.getBoundingClientRect().bottom,
    bottom: element.getBoundingClientRect().bottom,
    navTop: document.querySelector('.qts-bottom-nav')!.getBoundingClientRect().top,
    navBase: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-base-h')),
  }));
  expect(playerPosition.bottomGap).toBeCloseTo(playerPosition.navBase, 0);
  expect(playerPosition.bottom).toBeLessThanOrEqual(playerPosition.navTop + 1);
});
