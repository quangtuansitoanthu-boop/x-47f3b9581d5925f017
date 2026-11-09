import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const media = readFileSync(new URL('./fixtures/talk-video.mp4', import.meta.url));

test('mobile talk video follows one player and keeps the original audio album controls', async ({ page }, testInfo) => {
  let catalogs = 0;
  await page.route('**/api/talks?**', route => {
    catalogs++;
    return route.fulfill({ json: [
      { id: 'mobile-video', tieu_de: 'SỨ MỆNH THẦY PHÁP', visibility: 'public', tracks: [
        { title: 'Video một', url: '/__mobile-video.mp4?track=1', media_type: 'video', audio_url: '/must-not-use.m4a' },
        { title: 'Video hai', url: '/__mobile-video.mp4?track=2', media_type: 'video' },
      ] },
      { id: 'mobile-audio', tieu_de: 'SỨ MỆNH ĐỘ VONG FULL TIKTOK', visibility: 'public', tracks: [
        { title: 'Bài âm thanh', url: '/__mobile-video.mp4' },
      ] },
    ] });
  });
  await page.route('**/api/album-plays', route => route.fulfill({ json: [] }));
  await page.route('**/__mobile-video.mp4*', route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: media.subarray(start, end + 1),
      headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) },
    });
  });
  await page.goto('/phap-thoai');
  await expect(page.locator('article').filter({ hasText: 'SỨ MỆNH THẦY PHÁP' }).getByText('Video', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mở album SỨ MỆNH THẦY PHÁP', exact: true }).click();
  const album = page.getByRole('dialog', { name: 'SỨ MỆNH THẦY PHÁP', exact: true });
  await expect(album.locator('.pt-as-btn-offline')).toBeVisible();
  await expect(album.getByRole('button', { name: /MP3|ZIP/i })).toHaveCount(0);
  await album.getByRole('button', { name: 'Phát Video một', exact: true }).click();
  const viewer = album.locator('figure.talk-video');
  await expect(viewer).toHaveClass(/expanded/);
  await expect.poll(() => viewer.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await expect(viewer.getByRole('button')).toHaveCount(7);
  await expect(viewer.getByRole('button', { name: 'Quay lại', exact: true })).toBeVisible();
  await expect(viewer.getByRole('status').filter({ hasText: 'Bạn có thể khóa màn hình' })).toBeVisible();
  await expect(viewer.getByRole('status').filter({ hasText: 'Bạn có thể khóa màn hình' })).toHaveCount(0, { timeout: 6_000 });
  await viewer.getByRole('button', { name: 'Bài tiếp theo', exact: true }).click();
  await expect(viewer.locator('.video-transport strong')).toHaveText('Video hai');
  await viewer.getByRole('button', { name: 'Bài trước', exact: true }).click();
  await expect(viewer.locator('.video-transport strong')).toHaveText('Video một');
  await viewer.getByRole('button', { name: 'Danh sách bài', exact: true }).click();
  await expect(viewer).not.toHaveClass(/expanded/);
  await page.screenshot({ path: testInfo.outputPath('mobile-video-list.png') });
  await viewer.getByRole('button', { name: 'Mở rộng', exact: true }).click();
  await expect(viewer.getByRole('status').filter({ hasText: 'Bạn có thể khóa màn hình' })).toBeVisible();
  await viewer.getByRole('slider').fill('8');
  await page.screenshot({ path: testInfo.outputPath('mobile-video-back-hint.png') });
  await viewer.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(viewer).toHaveCount(0);
  const mini = page.locator('.pt-mp-info-touch');
  await expect(page.getByRole('region', { name: 'Trình phát Pháp Thoại' }).getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  await mini.click();
  await expect(viewer).toHaveClass(/expanded/);
  await expect(viewer.locator('.video-transport strong')).toHaveText('Video một');
  await expect.poll(() => viewer.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(7);
  await expect(page.locator('.pt-fp-sheet')).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await page.getByRole('button', { name: 'Mở album SỨ MỆNH ĐỘ VONG FULL TIKTOK', exact: true }).click();
  const audio = page.getByRole('dialog', { name: 'SỨ MỆNH ĐỘ VONG FULL TIKTOK', exact: true });
  await expect(audio.locator('video')).toHaveCount(0);
  await expect(audio.locator('.pt-video-badge')).toHaveCount(0);
  await expect(audio.locator('.pt-as-btn-offline')).toBeVisible();
  expect(catalogs).toBe(1);
});
