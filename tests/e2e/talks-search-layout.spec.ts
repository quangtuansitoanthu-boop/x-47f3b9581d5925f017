import { expect, test } from '@playwright/test';

for (const width of [360, 390, 768]) {
  for (const locale of ['vi', 'en']) {
    test(`talk search has its own row and no header gap: ${width}px ${locale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((language) => {
        localStorage.setItem('tutam_locale', language);
        document.documentElement.dataset.nativeApp = 'true';
      }, locale);
      // Keep the English download banner visible without using the remote service.
      await page.route('**/offline-data/english-pack-manifest.json', route => route.abort());
      await page.route('**/offline-data/chapters-en/**', async route => {
        await new Promise(resolve => setTimeout(resolve, 500));
        await route.abort().catch(() => {});
      });
      // Giữ đủ nội dung cuộn để kiểm tra sticky, không phụ thuộc catalog local có dữ liệu hay đang lỗi.
      await page.route(/\/api\/talks(?:\?|$)/u, route => route.fulfill({ json: Array.from({ length: 12 }, (_, index) => ({
        id: `e2e-sticky-talk-${index}`, tieu_de: `Album kiểm tra bố cục ${index + 1}`, visibility: 'public',
        chu_de: 'Pháp ngữ', tracks: [{ title: 'Bài thử', url: '/assets/audio/tieng-mo.m4a' }],
      })) }));
      await page.route('**/api/album-plays', route => route.fulfill({ json: [] }));
      await page.goto('/phap-thoai');
      const search = page.locator('.pt-search');
      await expect(search).toBeVisible();
      await expect(page.locator('.pt-card').first()).toBeVisible();
      const banner = page.locator('.english-download');
      if (locale === 'en') await expect(banner).toBeVisible();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
        const geometry = await page.evaluate(() => {
          const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
          const nav = rect('.qts-nav');
          const search = rect('.pt-search');
          const toolbar = rect('.pt-toolbar');
          const toolbarStyle = getComputedStyle(document.querySelector('.pt-toolbar')!);
          const actions = rect('.pt-toolbar-end');
          const banner = document.querySelector('.english-download')?.getBoundingClientRect();
          return {
            navTop: nav.top, searchWidth: search.width, toolbarWidth: toolbar.width - parseFloat(toolbarStyle.paddingLeft) - parseFloat(toolbarStyle.paddingRight),
            searchHeight: search.height, searchBottom: search.bottom, actionsTop: actions.top,
            bannerTop: banner?.top, navBottom: nav.bottom,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(geometry.navTop).toBeLessThanOrEqual(1);
        expect(geometry.searchWidth).toBeGreaterThanOrEqual(geometry.toolbarWidth - 1);
        // Toolbar đã đồng bộ từ web; giữ chuẩn vùng chạm 44px của app.
        expect(geometry.searchHeight).toBeGreaterThanOrEqual(44);
        expect(geometry.actionsTop).toBeGreaterThanOrEqual(geometry.searchBottom);
        expect(geometry.overflow).toBe(false);
        if (geometry.bannerTop !== undefined) expect(geometry.bannerTop - geometry.navBottom).toBeLessThanOrEqual(9);
      }
      await search.fill('Địa ngục');
      await expect(search).toHaveValue('Địa ngục');
      await page.locator('.pt-search-clear').click();
      await expect(search).toHaveValue('');
      await page.locator('button[aria-controls="talk-options"]').click();
      await expect(page.locator('.pt-filter-chips')).toBeVisible();
      await page.evaluate(() => scrollTo(0, 240));
      expect(await page.locator('.pt-browse-controls').evaluate(el => {
        const nav = document.querySelector('.qts-nav')!.getBoundingClientRect();
        const controls = el.getBoundingClientRect();
        const tabs = el.querySelector('.pt-tabs')!.getBoundingClientRect();
        const toolbar = el.querySelector('.pt-toolbar')!.getBoundingClientRect();
        return controls.top >= nav.bottom - 1 && tabs.top >= toolbar.bottom - 1;
      })).toBe(true);
      const stickyOffset = await page.locator('.pt-browse-controls').evaluate(el =>
        el.getBoundingClientRect().top - document.querySelector('.qts-nav')!.getBoundingClientRect().bottom);
      if (width === 360 && locale === 'vi') await page.screenshot({ path: testInfo.outputPath('talks-sticky-alignment.png') });
      expect(Math.abs(stickyOffset)).toBeLessThanOrEqual(1);
      if (width === 390 && locale === 'en') {
        await page.evaluate(() => { scrollTo(0, 0); document.documentElement.dataset.theme = 'light'; });
        await page.screenshot({ path: testInfo.outputPath('talks-search-fixed.png') });
      }
    });
  }
}
