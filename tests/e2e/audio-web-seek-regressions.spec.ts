import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const recording = readFileSync('assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3');
const albumTitle = 'Album tua MP3 không hỗ trợ Range';

async function openPlayer(page: Page) {
  await page.addInitScript(() => {
    const Original = window.Audio;
    window.Audio = class extends Original {
      constructor(src?: string) { super(src); (window as any).__talkSeekAudio = this; }
    };
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/talks') return route.fulfill({ json: [{ id: 'web-seek', tieu_de: albumTitle,
      chu_de: 'Pháp ngữ', visibility: 'public', tracks: [1, 2].map(index => ({ title: `Bài ${index}`, url: `/__talk-seek/${index}.mp3` })),
    }] });
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto('/phap-thoai');
  await page.getByRole('button', { name: /^Phát album / }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__talkSeekAudio?.currentTime)).toBeGreaterThan(0);
  return page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
}

test('Pháp thoại seeks a full-200 MP3 while paused and reuses one Blob for later seeks', async ({ page }) => {
  let fullFetches = 0;
  await page.route('**/__talk-seek/*.mp3', route => {
    if (!route.request().headers().range) fullFetches++;
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: recording });
  });
  const player = await openPlayer(page);
  expect(fullFetches).toBe(0);
  await player.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await player.getByRole('slider', { name: 'Vị trí phát' }).fill('900');
  await expect.poll(() => page.evaluate(() => (window as any).__talkSeekAudio.currentTime)).toBe(900);
  expect(await page.evaluate(() => (window as any).__talkSeekAudio.paused)).toBe(true);
  await player.getByRole('slider', { name: 'Vị trí phát' }).fill('400');
  await expect.poll(() => page.evaluate(() => (window as any).__talkSeekAudio.currentTime)).toBe(400);
  expect(fullFetches).toBe(1);
  await player.getByRole('button', { name: 'Phát', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__talkSeekAudio.currentTime)).toBeGreaterThan(400);
});

test('pausing during a deferred MP3 seek keeps the latest requested position without restarting', async ({ page }) => {
  let started = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/__talk-seek/*.mp3', async route => {
    if (!route.request().headers().range) { started = true; await gate; }
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: recording });
  });
  const player = await openPlayer(page);
  await player.getByRole('slider', { name: 'Vị trí phát' }).fill('700');
  await expect.poll(() => started).toBe(true);
  await player.getByRole('slider', { name: 'Vị trí phát' }).fill('900');
  await player.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  release();
  await expect.poll(() => page.evaluate(() => (window as any).__talkSeekAudio.currentTime)).toBe(900);
  expect(await page.evaluate(() => (window as any).__talkSeekAudio.paused)).toBe(true);
});

test('seeking a playing full-200 MP3 resumes at the requested time', async ({ page }) => {
  await page.route('**/__talk-seek/*.mp3', route => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: recording }));
  const player = await openPlayer(page);
  await player.getByRole('slider', { name: 'Vị trí phát' }).fill('900');
  await expect.poll(() => page.evaluate(() => (window as any).__talkSeekAudio.currentTime)).toBeGreaterThan(900);
  await expect(player.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
});
