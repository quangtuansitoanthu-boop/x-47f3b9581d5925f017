import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient, choosePdfOnline, openReaderTools, savePdfOffline } from './runtime-helpers';

test.describe('homepage and guide parity', () => {
  test('primary client navigation reuses the hydrated root session', async ({ page }) => {
    await page.goto('/kinh-sach');
    await settleClient(page);

    const routeDataRequests: string[] = [];
    const sessionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('__data.json')) routeDataRequests.push(request.url());
      if (new URL(request.url()).pathname === '/api/session') sessionRequests.push(request.url());
    });

    await page.locator('a[href="/tu-tap"]:visible').first().click();
    await expect(page).toHaveURL(/\/tu-tap$/);
    await expect(page.locator('.tt-modes-grid').first()).toBeVisible();
    expect(routeDataRequests).toEqual([]);
    expect(sessionRequests).toEqual([]);

    await page.goto('/kinh-sach');
    await settleClient(page);
    routeDataRequests.length = 0;
    sessionRequests.length = 0;
    await page.locator('a[href="/phap-thoai"]:visible').first().click();
    await expect(page).toHaveURL(/\/phap-thoai$/);
    await expect(page.locator('.qts-nav--return .nl-name')).toHaveText('Kho Pháp Thoại');

    expect(routeDataRequests).toEqual([]);
    expect(sessionRequests).toEqual([]);
  });

  test('shared footer matches the production desktop and mobile geometry', async ({ page }) => {
    await page.goto('/huong-dan');
    await settleClient(page);

    const footer = page.getByRole('contentinfo');
    const inner = footer.locator('.qts-footer__inner');
    const logo = footer.locator('.qts-footer__brand img');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toHaveCSS('background-color', 'rgb(62, 44, 26)');
    await expect(footer).toHaveCSS('border-top-width', '1px');
    expect(await logo.boundingBox()).toMatchObject({ width: 36, height: 36 });

    const width = page.viewportSize()?.width ?? 0;
    const geometry = await footer.evaluate((element) => {
      const inner = element.querySelector<HTMLElement>('.qts-footer__inner')!;
      const brand = element.querySelector<HTMLElement>('.qts-footer__brand')!;
      const legal = element.querySelector<HTMLElement>('.qts-footer__legal')!;
      const footerStyle = getComputedStyle(element);
      const innerStyle = getComputedStyle(inner);
      const legalStyle = getComputedStyle(legal);
      // Token giữ biểu thức calc(); lấy giá trị px do trình duyệt phân giải.
      const tokenProbe = document.createElement('span');
      tokenProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;font-size:var(--font-size-meta)';
      element.append(tokenProbe);
      const metaToken = parseFloat(getComputedStyle(tokenProbe).fontSize);
      tokenProbe.remove();
      const footerBox = element.getBoundingClientRect();
      const innerBox = inner.getBoundingClientRect();
      const brandBox = brand.getBoundingClientRect();
      const legalBox = legal.getBoundingClientRect();
      return {
        footerHeight: footerBox.height,
        innerHeight: innerBox.height,
        contentHeight: innerStyle.flexDirection === 'row'
          ? Math.max(brandBox.height, legalBox.height)
          : brandBox.height + legalBox.height + parseFloat(innerStyle.rowGap),
        verticalFrame: parseFloat(footerStyle.paddingTop) + parseFloat(footerStyle.paddingBottom)
          + parseFloat(footerStyle.borderTopWidth) + parseFloat(footerStyle.borderBottomWidth),
        fontSize: parseFloat(legalStyle.fontSize),
        metaToken,
        lineHeight: parseFloat(legalStyle.lineHeight),
        fits: [innerBox, brandBox, legalBox].every((box) =>
          box.left >= footerBox.left && box.right <= footerBox.right
          && box.top >= footerBox.top && box.bottom <= footerBox.bottom),
        overflows: [element, inner, brand, legal].some((node) => node.scrollWidth > node.clientWidth),
      };
    });
    expect(Number.isFinite(geometry.metaToken)).toBe(true);
    expect(geometry.fontSize).toBe(geometry.metaToken);
    expect(geometry.lineHeight).toBeCloseTo(geometry.fontSize * 1.8, 2);
    expect(geometry.innerHeight).toBeCloseTo(geometry.contentHeight, 2);
    expect(geometry.footerHeight).toBeCloseTo(geometry.contentHeight + geometry.verticalFrame, 2);
    expect(geometry.fits).toBe(true);
    expect(geometry.overflows).toBe(false);
    if (width > 768) {
      const innerBox = await inner.boundingBox();
      expect(innerBox?.width).toBeCloseTo(Math.min(1160, width - 56), 0);
      await expect(inner).toHaveCSS('flex-direction', 'row');
      await expect(footer.locator('.qts-footer__legal')).toHaveCSS('text-align', 'right');
    } else {
      await expect(footer).toHaveCSS('padding', '24px 16px');
      await expect(inner).toHaveCSS('flex-direction', 'column');
      await expect(inner).toHaveCSS('gap', '14px');
      await expect(footer.locator('.qts-footer__legal')).toHaveCSS('text-align', 'left');
    }
  });

  test('homepage exposes the shared shell, hero, search, public catalog and footer', async ({ page }) => {
    const presenceResponse = page.waitForResponse((response) => response.url().includes('/api/presence') && response.request().method() === 'POST');
    await page.goto('/kinh-sach');
    expect((await presenceResponse).status()).toBe(200);
    await expect(page).toHaveURL(/\/kinh-sach$/);
    await expect(page.getByRole('navigation', { name: 'Tu tập Phật pháp' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Kho Kinh Sách/i })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Tìm kiếm bài viết' })).toBeVisible();
    expect((await presenceResponse).ok()).toBe(true);
    await expect(page.getByRole('button', { name: 'Đọc ngay Bài viết kiểm thử E2E' })).toBeVisible();
    await page.goto('/huong-dan');
    await expect(page.getByRole('contentinfo')).toContainText('Tu tập');
  });

  test('continue-reading shelf links to the private My Quotes screen', async ({ page }) => {
    await page.goto('/kinh-sach');
    await settleClient(page);
    const disclosure = page.locator('details.library-disclosure');
    await expect(disclosure).toHaveJSProperty('open', false);
    await disclosure.locator(':scope > summary').click();
    await expect(disclosure).toHaveJSProperty('open', true);
    await expect(page.getByRole('heading', { name: 'Tiếp tục đọc' })).toBeVisible();
    await page.getByRole('link', { name: /Trích dẫn của tôi/ }).click();
    await expect(page).toHaveURL(/\/trich-dan-cua-toi$/);
    await expect(page.getByRole('heading', { name: 'Trích dẫn của tôi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Đăng nhập để xem trích dẫn' })).toBeVisible();
  });

  test('PDF reader exposes page speech and can save then reclaim an atomic offline copy', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page.getByRole('button', { name: 'Đọc ngay Bài PDF kiểm thử E2E' }).click();

    await choosePdfOnline(page);
    const reader = page.getByRole('dialog', { name: 'Bài PDF kiểm thử E2E' });
    await expect(reader.getByTitle('Đọc trang hiện tại')).toBeEnabled();
    await expect(reader.getByTitle('Đọc trang hiện tại')).toHaveAttribute('aria-pressed', 'false');
    await expect(reader.locator('.download-gate')).toHaveCount(0);

    await reader.getByTitle('Tô sáng và ghi chú văn bản PDF').click();
    await expect(reader.getByRole('region', { name: /Văn bản và trích dẫn trang/ })).toBeVisible();
    await reader.getByRole('button', { name: 'Đóng bảng trích dẫn' }).click();

    const offline = await savePdfOffline(page);
    await expect(offline).toContainText('Sẵn sàng khi mất mạng.');
    await expect(offline).toContainText('Đang dùng');

    await offline.getByRole('button', { name: 'Xóa và giải phóng' }).click();
    await expect(offline.getByRole('button', { name: 'Lưu trên thiết bị' })).toBeVisible();
  });

  test('Top 10 books are ranked by real views and show formatted counts', async ({ page }) => {
    await page.route(/\/api\/articles\?/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.goto('/kinh-sach');
    await settleClient(page);

    const trigger = page.getByRole('button', { name: 'Top 10', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Top 10 sách được xem nhiều nhất' });
    const popularItems = dialog.locator('li');
    await expect(popularItems.first()).toBeVisible();
    expect(await popularItems.count()).toBeGreaterThanOrEqual(3);
    const firstPopular = popularItems.nth(0);
    await expect(firstPopular.locator('strong')).toHaveText('Bài PDF kiểm thử E2E');
    // Counts can climb as other specs read books; assert the actual ranking and format.
    await expect(firstPopular.locator('small')).toHaveText(/^[\d.]+ lượt xem$/);
    const viewCounts = (await popularItems.locator('small').allTextContents())
      .map((text) => Number(text.replace(/\D/gu, '')));
    expect(viewCounts).toHaveLength(await popularItems.count());
    expect(viewCounts.every(count => Number.isInteger(count) && count > 0)).toBe(true);
    expect(viewCounts).toEqual([...viewCounts].sort((a, b) => b - a));
    await expect(firstPopular.locator('small')).toHaveCSS('font-size', '12px');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('book card tags retain their sizing and filter the catalog', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/kinh-sach');
    await settleClient(page);

    const cards = page.locator('.articles-grid .art-card');
    const tagButtons = cards.locator('.art-tag');
    expect(await tagButtons.count()).toBeGreaterThanOrEqual(4);
    await expect(tagButtons.nth(0)).toHaveCSS('font-size', '13px');
    await expect(tagButtons.nth(0)).toHaveCSS('padding', '2px 8px');

    const causalTag = cards.getByRole('button', { name: 'nhân quả', exact: true });
    expect(await causalTag.count()).toBe(1);
    await causalTag.click();
    await expect(page.locator('.articles-grid .art-card')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Đọc ngay Bài viết kiểm thử E2E' })).toBeVisible();
  });

  test('reader shares the canonical book URL through Web Share and clipboard fallback', async ({ page }) => {
    await page.addInitScript(() => {
      const capture = window as typeof window & { __sharedBook?: ShareData; __copiedLink?: string };
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => { capture.__sharedBook = data; },
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value: string) => { capture.__copiedLink = value; } },
      });
    });
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page.getByRole('button', { name: 'Đọc ngay Bài viết kiểm thử E2E' }).click();
    const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E' });
    await openReaderTools(page);
    const share = reader.getByRole('button', { name: 'Chia sẻ', exact: true });
    await expect(share).toBeVisible();
    const canonicalUrl = new URL('/?article=e2e-public', page.url()).toString();
    await share.click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __sharedBook?: ShareData }).__sharedBook)).toEqual({
      title: 'Bài viết kiểm thử E2E',
      text: 'Một bài viết công khai dùng cho kiểm thử trình duyệt.',
      url: canonicalUrl,
    });
    expect(await page.evaluate(() => (window as typeof window & { __copiedLink?: string }).__copiedLink)).toBeUndefined();
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
    await share.click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __copiedLink?: string }).__copiedLink)).toBe(canonicalUrl);
    await expect(page.locator('.reader-toast')).toHaveText('Đã copy link bài viết!');
  });

  test('guest catalog hides practice-only categories while search remains functional', async ({ page }) => {
    await page.goto('/kinh-sach');
    await expect(page.getByRole('button', { name: /KINH PHẬT/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /CÁC NGHI THỨC/ })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Tìm kiếm bài viết' }).fill('nhiều tập');
    const results = page.locator('.articles-grid');
    await expect(results.getByRole('button', { name: 'Đọc ngay Sách nhiều tập E2E' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Tìm kiếm bài viết' })).toHaveValue('nhiều tập');
  });

  test('guide accordions work by keyboard and retain all primary guidance', async ({ page }) => {
    await page.goto('/huong-dan');
    await settleClient(page);
    await expect(page.getByRole('heading', { name: 'Hướng Dẫn Tu Tập' })).toBeVisible();
    const summary = page.locator('details').filter({ hasText: 'Hướng dẫn sử dụng ứng dụng' }).locator('summary').first();
    await summary.focus();
    if (await summary.locator('..').getAttribute('open') === null) await page.keyboard.press('Enter');
    await expect(page.getByText('Trang Chủ — Kho bài viết & sách hay', { exact: true })).toBeVisible();
    await expect(summary.locator('..')).toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).not.toHaveAttribute('open');
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).toHaveAttribute('open', '');
  });
});
