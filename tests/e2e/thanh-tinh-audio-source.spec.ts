import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const native of [false, true]) {
test(`Thanh tinh tam plays the compressed ADD recording (${native ? 'native blob' : 'web'})`, async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('chu-lang-nghiem-dieu-am-tinh-tuan')) mediaRequests.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src);
        if (src?.includes('chu-lang-nghiem')) {
          (window as any).__mantraAudio = this;
          (window as any).__mantraInitialSrc = src;
        }
      }
    };
  });
  await page.route('**/api/**', route => route.abort('failed'));
  if (native) {
    // Reproduce the native asset server's response without seekable Range headers.
    const recording = readFileSync('assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3');
    await page.route('**/assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3*', route => route.fulfill({
      status: 200, contentType: 'audio/mpeg', body: recording,
    }));
  }
  await page.goto('/tu-tap');
  await page.locator('.tt-mode-card--thanh-tinh').click();
  await expect(page.locator('.thanh-tinh-overlay')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__mantraAudio)).toBeUndefined();
  expect(mediaRequests).toEqual([]);
  await page.locator('.btn-onboarding-join').click();
  expect(mediaRequests).toEqual([]);
  // Chờ route hydrate xong trước khi giả lập native; core khởi tạo lại các hàm này khi module nạp.
  if (native) {
    await page.evaluate(() => { (window as any).Capacitor.isNativePlatform = () => true; (window as any).Capacitor.getPlatform = () => 'android'; });
    expect(await page.evaluate(() => (window as any).Capacitor.isNativePlatform())).toBe(true);
  }
  await page.locator('.tt-tab-btn').filter({ hasText: 'Nghe Chú' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__mantraInitialSrc)).toContain('chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3');
  await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio?.duration)).toBeGreaterThan(1014);
  expect(await page.evaluate(() => (window as any).__mantraAudio.duration)).toBeLessThan(1015);
  expect(await page.evaluate(() => (window as any).__mantraAudio.duration)).toBeLessThan(1025);
  if (native) await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentSrc)).toMatch(/^blob:/);
  else await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentSrc)).toContain('chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3');
  const play = page.locator('.btn-play-pause-main');
  await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentTime)).toBeGreaterThan(0);
  await play.click();
  await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.paused)).toBe(true);
  await page.locator('.progress-slider').evaluate((el: HTMLInputElement) => {
    el.value = '1010';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await play.click();
  await expect.poll(() => page.evaluate(() => (window as any).__mantraAudio.currentTime)).toBeGreaterThanOrEqual(1010);
  expect(await page.evaluate(() => (window as any).__mantraAudio.error)).toBeNull();
});
}
