import { expect, test, type Page } from '@playwright/test';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { loginAsMember, choosePdfOnline, settleClient, TEST_MEMBER_ID } from './runtime-helpers';

const routes = ['/', '/tu-tap', '/phap-thoai', '/huong-dan'] as const;
const lightReadingPapers = ['cream', 'white', 'gray'] as const;

async function mockPracticePreview(page: Page): Promise<void> {
  await page.route(/\/api\/data\/baiviet\?/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'dark-preview-baseline',
        tieu_de: 'Bài tu tập kiểm thử dark mode',
        danh_muc: 'KINH PHẬT',
        ngay_dang: '2026-08-09',
        anh_url: '',
        tac_gia: 'Quang Từ',
        tags: '',
        has_muc_luc: true,
        noi_dung: '',
        tap_tieu_de: JSON.stringify(['PHẨM KIỂM THỬ'])
      }])
    });
  });
  await page.route(/\/api\/data\/tap_noi_dung\?/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        so_thu_tu: 0,
        tieu_de: 'PHẨM KIỂM THỬ',
        tom_tat: 'Tóm tắt kiểm thử tương phản'
      }])
    });
  });
}

test.describe('route visual structure', () => {
  for (const route of routes) {
    test(`${route} renders a stable shell without horizontal clipping`, async ({ page }, testInfo) => {
      await page.goto(route);
      await expect(page.locator('.qts-shell')).toBeVisible();
      await expect(page.locator('#main-content')).toBeVisible();
      const geometry = await page.evaluate(() => ({
        bodyWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        background: getComputedStyle(document.body).backgroundColor,
      }));
      expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');
      await testInfo.attach(`route-${route === '/' ? 'home' : route.slice(1)}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  }

  test('each route keeps its shared header, return header and guide footer', async ({ page }) => {
    for (const route of ['/', '/kinh-sach', '/phap-thoai', '/tu-tap', '/huong-dan']) {
      await page.goto(route);
      await settleClient(page);
      if (route === '/tu-tap') {
        await expect(page.locator('.tt-topbar')).toBeVisible();
        await expect(page.locator('.qts-nav')).toHaveCount(0);
      } else {
        await expect(page.locator('.qts-nav')).toBeVisible();
        await expect(page.locator('.nl-name')).toContainText(route === '/phap-thoai' ? 'Kho Pháp Thoại' : 'Tu tập');
      }
      await expect(page.getByRole('contentinfo')).toHaveCount(route === '/huong-dan' ? 1 : 0);
    }
    await expect(page.getByText(/Giới thiệu về tác giả/)).toBeVisible();
  });

  test('account login providers fit inside the current viewport', async ({ page }) => {
    await page.goto('/ca-nhan?tab=account');
    await settleClient(page);
    for (const provider of ['Google', 'Facebook']) {
      const button = page.getByRole('button', { name: `Đăng nhập bằng ${provider}`, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole('dialog', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
  });

  test('homepage solar and lunar dates remain readable in the current layout', async ({ page }) => {
    await page.goto('/');
    await settleClient(page);
    const calendar = page.getByRole('region', { name: 'Thẻ Lịch Phật Giáo Nghệ Thuật', exact: true });
    await expect(calendar).toBeVisible();
    await expect(calendar.locator('time')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await expect(calendar).toContainText('Ngày âm lịch');
    const bounds = await calendar.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('dark Pháp Thoại keeps the production hero palette', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
    await page.goto('/phap-thoai');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { name: 'Kho Pháp Thoại' })).toBeVisible();
    const color = await page.getByRole('heading', { name: 'Kho Pháp Thoại' }).evaluate(element => getComputedStyle(element).color);
    expect(color).not.toBe('rgba(0, 0, 0, 0)');

  });

  for (const savedPaper of lightReadingPapers) {
    test(`dark Tu Tập preview overrides saved ${savedPaper} reading paper`, async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith('-dark'), 'Dark-theme baseline only');
      await loginAsMember(page);
      await mockPracticePreview(page);
      await page.addInitScript(({ key, paper }) => localStorage.setItem(key, paper), {
        key: principalStorageKey(TEST_MEMBER_ID, 'tt_bg'), paper: savedPaper,
      });
      await page.goto('/tu-tap');
      await page.locator('button.tt-mode-card--kinh').click();
      await page.locator('.tt-card').first().click();

      const preview = page.locator('.tt-preview');
      await expect(preview).toHaveAttribute('data-read-bg', 'dark');
      expect(await page.evaluate(key => localStorage.getItem(key), principalStorageKey(TEST_MEMBER_ID, 'tt_bg'))).toBe(savedPaper);
      await expect(preview).toHaveCSS('background-color', 'rgb(21, 18, 13)');
      await expect(preview.locator('.tt-preview__wrap')).toHaveCSS('background-color', 'rgb(21, 18, 13)');
      await expect(preview.locator('.tt-preview__start-card p')).toHaveCSS('color', 'rgb(149, 133, 112)');
      await expect(preview.locator('.tt-preview__chapter-copy small')).toHaveCSS('color', 'rgb(149, 133, 112)');

      const contrastRatios = await preview.evaluate((element) => {
        const rgb = (value: string) => value.match(/\d+/gu)!.slice(0, 3).map(Number);
        const luminance = (value: string) => {
          const channels = rgb(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const ratio = (foreground: Element, background: Element) => {
          const light = luminance(getComputedStyle(foreground).color);
          const dark = luminance(getComputedStyle(background).backgroundColor);
          return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
        };
        return [
          ratio(element.querySelector('.tt-preview__start-card p')!, element.querySelector('.tt-preview__start-card')!),
          ratio(element.querySelector('.tt-preview__chapter-copy small')!, element.querySelector('.tt-preview__toc')!)
        ];
      });
      for (const contrastRatio of contrastRatios) expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('dark PDF reader renders black paper instead of a white page', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-dark'), 'Dark-theme baseline only');
    await loginAsMember(page);
    await page.addInitScript(() => localStorage.setItem('tutam_pdf_paper_mode', 'default'));
    await page.goto('/');
    await page.goto('/kinh-sach');
    await page.getByRole('button', { name: 'Đọc ngay Bài PDF kiểm thử E2E' }).click();
    await choosePdfOnline(page);

    const reader = page.getByRole('dialog', { name: 'Bài PDF kiểm thử E2E' });
    const canvas = reader.locator('.pdf-page canvas').first();
    await expect(canvas).toBeVisible();
    await expect(reader.locator('.pdf-pages')).toHaveCSS('background-color', 'rgb(5, 5, 5)');
    await expect(reader.locator('.pdf-page').first()).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(canvas).toHaveCSS('filter', 'invert(1) hue-rotate(180deg)');
  });

  test('guide install action has a functional manual fallback', async ({ page }) => {
    await page.goto('/huong-dan');
    await page.getByRole('button', { name: 'Cài đặt App Tu Tập' }).click();
    await expect(page.getByRole('status')).toContainText('Thêm vào Màn hình chính');
  });
});
