import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import manifest from '../../src/lib/data/mission-book-images.json' with { type: 'json' };
import videoManifest from '../../src/lib/data/quang-tu-facebook-videos.json' with { type: 'json' };

async function openNativeBook(page: Page, loaded = false): Promise<void> {
  await page.route('**/api/**', route => route.abort('failed'));
  if (!loaded) await page.goto('/');
  await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
  await page.evaluate(() => {
    const runtime = window as unknown as { Capacitor?: Record<string, unknown>; CapacitorCustomPlatform: { name: string } };
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = { ...runtime.Capacitor, isNativePlatform: () => true };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await page.locator('a[href="/kinh-sach"]:visible').first().click();
  await page.locator('.art-card').filter({ hasText: 'SỨ MỆNH ĐỘ VONG' }).locator('.art-card__open').click();
  await expect(page.locator('.reader-modal')).toBeVisible();
}

test('native book offers optional images and remains readable without downloading', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => { localStorage.setItem('tutam_locale', 'vi'); localStorage.setItem('tutam_dark_mode', '1'); });
  const remote: string[] = [];
  await page.route('https://media.quangtu.vn/**', route => { remote.push(route.request().url()); return route.abort('internetdisconnected'); });
  await openNativeBook(page);
  const prompt = page.getByRole('dialog', { name: 'Quản lý Dữ liệu Ngoại tuyến', exact: true });
  await expect(prompt).toBeVisible();
  const totalMb = (manifest.images.reduce((sum, image) => sum + image.bytes, 0) / (1024 * 1024)).toFixed(1);
  await expect(prompt).toContainText(`0 / ${manifest.images.length} ảnh (0.0 MB / ${totalMb} MB)`);
  await page.screenshot({ path: 'test-results/optional-book-images-mobile-dark.png' });
  expect(remote).toEqual([]);
  await prompt.getByRole('button', { name: 'Để sau', exact: true }).click();
  const reader = page.locator('.reader-modal');
  await expect(reader.locator('.toc-item')).toHaveCount(51);
  await reader.locator('.toc-item').nth(1).click();
  await expect(reader).toHaveAccessibleName('Câu chuyện 1: ĂN CỨT 10 NĂM');
  await expect(reader.locator('.reader-content')).toContainText('10');
  await expect(reader.locator('.reader-content img')).toHaveCount(0);
  expect(remote).toEqual([]);
  await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
  await reader.getByTitle('Quản lý tải ảnh minh họa ngoại tuyến', { exact: true }).click();
  await prompt.getByRole('button', { name: /^⬇ Tải toàn bộ/ }).click();
  await expect(prompt.getByRole('alert')).toBeVisible();
  await prompt.getByRole('button', { name: 'Để sau', exact: true }).click();
  await expect(reader.locator('.reader-content')).toContainText('10');
  expect(await page.evaluate(bookId => localStorage.getItem(`tutam_media_prompt_seen_${bookId}`), manifest.bookId)).toBe('1');
});

test('previously downloaded illustrations display from cache without a network', async ({ page }) => {
  await page.addInitScript(bookId => { localStorage.setItem('tutam_locale', 'vi'); localStorage.setItem(`tutam_media_prompt_seen_${bookId}`, '1'); }, manifest.bookId);
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/');
  const image = manifest.images[0];
  const bytes = [...readFileSync('.' + image.path)];
  await page.evaluate(async ({ path, bytes }) => {
    const cache = await caches.open('tutam-mission-images-v1');
    await cache.put(new URL(path, location.origin).href, new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/webp' } }));
  }, { path: image.path, bytes });
  const remote: string[] = [];
  await page.route('https://media.quangtu.vn/**', route => { remote.push(route.request().url()); return route.abort('internetdisconnected'); });
  await openNativeBook(page, true);
  await expect(page.getByRole('dialog', { name: 'Quản lý Dữ liệu Ngoại tuyến', exact: true })).toHaveCount(0);
  const reader = page.locator('.reader-modal');
  await reader.locator('.toc-item').nth(1).click();
  const illustration = reader.locator('.reader-content img').first();
  await expect(illustration).toHaveAttribute('src', /^blob:/);
  await illustration.scrollIntoViewIfNeeded();
  await expect.poll(() => illustration.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(remote).toEqual([]);
  await page.screenshot({ path: 'test-results/optional-book-images-desktop-light.png' });
});

test('Facebook book streams the R2 source and switches a successful download to an offline playable blob', async ({ page }) => {
  const fixture = readFileSync('tests/e2e/fixtures/talk-video.mp4');
  const video = videoManifest.videos[0];
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_media_prompt_seen_tuyen-tap-phap-facebook-quang-tu', '1');
  });
  await page.route('**/api/**', route => route.abort('failed'));
  let downloads = 0;
  await page.route(video.src, route => {
    downloads++;
    return route.fulfill({ status: 200, contentType: 'video/mp4',
      headers: { 'access-control-allow-origin': '*', 'content-length': String(fixture.byteLength) }, body: fixture });
  });
  await page.goto('/');
  await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
  await page.evaluate(() => {
    const runtime = window as unknown as { Capacitor?: Record<string, unknown>; CapacitorCustomPlatform: { name: string } };
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = { ...runtime.Capacitor, isNativePlatform: () => true };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await page.locator('a[href="/kinh-sach"]:visible').first().click();
  await page.locator('.art-card').filter({ hasText: 'TUYỂN TẬP BÀI PHÁP HAY TỪ FACEBOOK QUANG TỪ' }).locator('.art-card__open').click();
  const reader = page.locator('.reader-modal');
  await expect(reader).toBeVisible();
  await reader.locator('.toc-search-input').fill('VUA ĐƯỜNG THÁI TÔNG NHẬP XÁC VÀO HOÀNG HẬU');
  await expect(reader.locator('.toc-item')).toHaveCount(1);
  await reader.locator('.toc-item').click();
  const player = reader.locator('.reader-content video');
  await expect(player.locator('source')).toHaveAttribute('src', video.src);
  // The served video deliberately differs from both compressed and R2 manifest
  // sizes: a complete response must be validated against its own Content-Length.
  await reader.locator('.btn-download').click();
  await expect(reader.locator('.badge-saved')).toBeVisible();
  await expect(player.locator('source')).toHaveAttribute('src', /^blob:/);
  const beforeOfflineReload = downloads;
  await page.route(video.src, route => route.abort('internetdisconnected'));
  await player.evaluate((element: HTMLVideoElement) => element.load());
  await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  expect(downloads).toBe(beforeOfflineReload);
});
