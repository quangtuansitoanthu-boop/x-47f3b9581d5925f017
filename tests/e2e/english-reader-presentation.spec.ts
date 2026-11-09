import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import englishManifest from '../../src/lib/data/english-pack-manifest.json' with { type: 'json' };
const ENGLISH_TRANSLATION_NOTICE = 'AI is used to prepare English translations, which may contain errors. Please refer to the Vietnamese original when needed.';

const bookId = 'tuyen-tap-phap-facebook-quang-tu';
const file = `${bookId}.json`;
const original = readFileSync(`static/offline-data/chapters-en/${file}`);
const chapters = JSON.parse(original.toString('utf8')) as { id: number; tieu_de: string; noi_dung: string }[];
const metadata = englishManifest.entries.find(entry => entry.file === file)!;
const cacheKey = `/offline-data/chapters-en/${file}?revision=${metadata.sha256}`;

async function nativeOffline(page: Page): Promise<void> {
  await page.evaluate(() => {
    const runtime = window as unknown as { Capacitor?: Record<string, unknown>; CapacitorCustomPlatform: { name: string } };
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = { ...runtime.Capacitor, isNativePlatform: () => true };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
}

test('single Medicine Master translation stays English from preview into practice', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => {
    if (!localStorage.getItem('tutam_locale')) localStorage.setItem('tutam_locale', 'en');
    localStorage.setItem('tutam_dark_mode', '1');
  });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.route('https://media.quangtu.vn/**', route => route.abort('internetdisconnected'));
  await page.goto('/tu-tap?article=tt_kinh_duoc_su');
  const preview = page.locator('.tt-preview');
  await expect(preview.locator('.reader-content')).toContainText('Thus have I heard.');
  await expect(preview.locator('.preview-en-draft')).toHaveText(ENGLISH_TRANSLATION_NOTICE);
  await expect(page.getByText('English version is in progress. Showing Vietnamese original below — bundled offline in the app.', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('single-english-preview-ai-notice.png') });
  await preview.locator('.tt-preview__start').click();
  await page.getByRole('dialog', { name: 'Start Cultivation?', exact: true }).getByRole('button', { name: 'Begin 🙏', exact: true }).click();
  await expect(page.locator('.tt-practice .ttp-content')).toContainText('Thus have I heard.');
  await expect(page.locator('.tt-en-draft-notice')).toHaveText(ENGLISH_TRANSLATION_NOTICE);
  await expect(page.locator('.tt-practice .ttp-content')).not.toContainText('Đốt nén tâm hương trước Phật đài');
  await page.screenshot({ path: info.outputPath('single-english-practice-ai-notice.png') });
  await page.evaluate(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.goto('/tu-tap?article=tt_kinh_duoc_su');
  await expect(preview.locator('.reader-content')).toContainText('Đốt nén tâm hương trước Phật đài');
  await expect(page.locator('.preview-en-draft, .tt-en-draft-notice')).toHaveCount(0);
  await expect(preview.locator('.reader-content')).not.toContainText('Thus have I heard.');
});

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`cached English reader keeps translation notice and original credits (${width}, ${dark ? 'dark' : 'light'})`, async ({ page }, info) => {
      expect(original.byteLength).toBe(metadata.bytes);
      expect(createHash('sha256').update(original).digest('hex')).toBe(metadata.sha256);
      await page.setViewportSize({ width, height: width === 375 ? 844 : 900 });
      await page.addInitScript(({ dark, bookId }) => {
        if (!localStorage.getItem('tutam_locale')) localStorage.setItem('tutam_locale', 'en');
        localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
        localStorage.setItem(`tutam_media_prompt_seen_${bookId}`, '1');
      }, { dark, bookId });
      await page.route('**/api/**', route => route.abort('failed'));
      await page.route('https://media.quangtu.vn/**', route => route.abort('internetdisconnected'));
      await page.goto('/');
      await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
      await page.evaluate(async ({ key, text }) => {
        await (await caches.open('tutam-english-chapters-v2')).put(key, new Response(text, { headers: { 'content-type': 'application/json' } }));
      }, { key: cacheKey, text: original.toString('utf8') });
      await nativeOffline(page);
      await page.locator('a[href="/kinh-sach"]:visible').first().click();
      await page.locator('.art-card').filter({ hasText: 'Selected Dharma Teachings from Facebook Quang Tu' }).locator('.art-card__open').click();
      const reader = page.locator('.reader-modal');
      await expect(reader).toBeVisible();
      await expect(reader.getByText(ENGLISH_TRANSLATION_NOTICE, { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath('english-reader-ai-notice.png') });
      const search = reader.locator('.toc-search-input');
      for (const index of [72, 80, 93, 312]) {
        await search.fill(chapters[index].tieu_de);
        await expect(reader.locator('.toc-item')).toHaveCount(1);
        await reader.locator('.toc-item').click();
        await expect(reader).toHaveAccessibleName(chapters[index].tieu_de);
        await expect(reader.locator('.reader-content')).not.toContainText(/Source:\s*(?:https?:\/\/)?(?:nhanqua\.com\.vn|cafef\.vn)/i);
        await expect.poll(async () => (await reader.locator('.reader-content').innerText()).length).toBeGreaterThan(150);
        await reader.locator('.reader-back').click();
      }
      await search.fill(chapters[399].tieu_de);
      await reader.locator('.toc-item').click();
      await expect(reader.locator('.reader-content')).toContainText('Translator: Hanh Doan');
      await reader.locator('.reader-back').click();
      await search.fill(chapters[498].tieu_de);
      await reader.locator('.toc-item').click();
      await expect(reader.locator('.reader-content video source')).toHaveAttribute('src', /fb-video-1590804654-1\.mp4$/);
      expect(await page.evaluate(async key => {
        const saved = await (await caches.open('tutam-english-chapters-v2')).match(key);
        const hash = await crypto.subtle.digest('SHA-256', await saved!.arrayBuffer());
        return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
      }, cacheKey)).toBe(metadata.sha256);
      // Reopen the same persisted app in Vietnamese without clearing downloaded content.
      await page.evaluate(() => localStorage.setItem('tutam_locale', 'vi'));
      await page.goto('/');
      await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
      await nativeOffline(page);
      await page.locator('a[href="/kinh-sach"]:visible').first().click();
      await page.locator('.art-card').filter({ hasText: 'TUYỂN TẬP BÀI PHÁP HAY TỪ FACEBOOK QUANG TỪ' }).locator('.art-card__open').click();
      await expect(reader.locator('.reader-en-draft')).toHaveCount(0);
      await reader.locator('.toc-search-input').fill('QUẢ BÁO CỦA VIỆC ĂN MẶC HỞ HANG');
      await reader.locator('.toc-item').click();
      await expect(reader.locator('.reader-content')).toContainText('Nguồn: nhanqua.com.vn');
      await page.screenshot({ path: info.outputPath('vietnamese-original-source.png') });
    });
  }
}
