import { expect, test } from '@playwright/test';

test('abstinence screens share the header, width and tab names and reset scroll when changing tools', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('tutam_thanh_tinh_v1', JSON.stringify({ joined: true, joinedAt: '2026-10-29T00:00:00Z', cleanSince: '2026-10-29T00:00:00Z', longestStreakDays: 0, resistedUrgesCount: 0, lastCheckInDate: '2026-10-29', checkInDates: ['2026-10-29'], relapseHistory: [] })));
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap');
  await page.locator('.tt-mode-card--thanh-tinh').click();
  const overlay = page.locator('.thanh-tinh-overlay');
  const settings = overlay.getByLabel('Cài đặt', { exact: true });
  for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await expect(settings).toBeVisible();
    const before = await overlay.locator('.thanh-tinh-container').boundingBox();
    const tabs = overlay.locator('.tt-tab-btn');
    await expect(tabs).toHaveCount(6);
    await expect(overlay.locator('.abstinence-overview')).toHaveCount(0);
    if (width === 375 && theme === 'light') await page.screenshot({ path: info.outputPath('abstinence-direct-entry.png') });
    for (const title of ['Tổng quan', 'Tiến độ', 'Vượt qua thôi thúc', 'Nghe chú', 'Ăn uống và sinh hoạt', 'Sám hối và bắt đầu lại']) {
      await overlay.evaluate(element => element.scrollTop = element.scrollHeight);
      const tab = tabs.filter({ hasText: title });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect(settings).toBeVisible();
      expect(await overlay.evaluate(element => element.scrollTop)).toBe(0);
      expect((await overlay.locator('.thanh-tinh-container').boundingBox())!.width).toBeCloseTo(before!.width, 1);
      expect(await overlay.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      if (title === 'Sám hối và bắt đầu lại') await page.screenshot({ path: info.outputPath(`abstinence-${width}-${theme}.png`) });
    }
  }
  await overlay.locator('.btn-back').click();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('.tt-mode-card--thanh-tinh')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tutam_thanh_tinh_v1')!).cleanSince)).toBe('2026-10-29T00:00:00Z');
});

for (const locale of ['vi', 'en'] as const) {
  test(`Thanh tinh audio artwork and controls remain readable in ${locale}`, async ({ page }, testInfo) => {
    const mediaRequests: string[] = [];
    page.on('request', request => { if (request.url().includes('chu-lang-nghiem-dieu-am-tinh-tuan')) mediaRequests.push(request.url()); });
    await page.addInitScript(language => localStorage.setItem('tutam_locale', language), locale);
    await page.route('**/api/**', route => route.abort('failed'));
    await page.goto('/tu-tap');
    await page.locator('.tt-mode-card--thanh-tinh').click();
    await page.locator('.btn-onboarding-join').click();
    expect(mediaRequests).toEqual([]);
    await page.locator('.tt-tab-btn').nth(3).click();
    const audio = page.locator('.audio-pane');
    const caption = audio.locator('figcaption');
    await expect(caption).toHaveText(locale === 'vi'
      ? 'Nam mô Đại trí Văn Thù Sư Lợi Bồ Tát'
      : 'Homage to Manjushri Bodhisattva of Great Wisdom');
    await expect(audio.locator('.audio-desc')).toHaveText(locale === 'vi'
      ? 'Bạn nên đeo tai nghe vào nhiếp tâm theo lời tụng chú nghe ít nhất 15 phút'
      : 'Please wear headphones, focus your mind on the chanting, and listen for at least 15 minutes.');
    for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      const image = audio.locator('img');
      await expect(image).toHaveCSS('object-fit', 'contain');
      const imageBox = (await image.boundingBox())!;
      const captionBox = (await caption.boundingBox())!;
      expect(imageBox.height).toBeGreaterThan(240);
      expect(captionBox.y).toBeGreaterThanOrEqual(imageBox.y + imageBox.height);
      const ratio = await image.evaluate((element: HTMLImageElement) => element.naturalWidth / element.naturalHeight);
      expect(imageBox.width / imageBox.height).toBeCloseTo(ratio, 1);
      expect(await audio.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      for (const button of await audio.locator('.player-controls-box button').all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: testInfo.outputPath(`${locale}-${width}-${theme}.png`) });
    }
    await audio.locator('.btn-timer-chip').last().click();
    await expect(audio.locator('.btn-timer-chip').last()).toHaveAttribute('aria-pressed', 'true');
    await audio.locator('.btn-loop').click();
    await expect(audio.locator('.btn-loop')).toHaveAttribute('aria-checked', 'false');
  });
}
