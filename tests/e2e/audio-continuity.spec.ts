import { expect, test, type Page } from '@playwright/test';

// Real, short browser audio. No synthetic ended events or mocked play() promise.
const samples = 8_000 * 4;
const wav = Buffer.alloc(44 + samples);
wav.write('RIFF'); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(8_000, 28);
wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(samples, 40);
for (let i = 0; i < samples; i++) wav[44 + i] = 128 + Math.round(10 * Math.sin(i * Math.PI * 2 * 220 / 8_000));
const title = 'Album ba phần kiểm thử liên tục';
const track = (i: number) => `/__audio-continuity/part-${i}.wav`;

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const events = { playing: [] as string[], ended: [] as string[] };
    (window as any).__audioContinuity = events;
    const Original = window.Audio;
    window.Audio = function (src?: string) {
      const audio = new Original(src);
      audio.addEventListener('playing', () => events.playing.push(new URL(audio.currentSrc).pathname));
      audio.addEventListener('ended', () => events.ended.push(new URL(audio.currentSrc).pathname));
      return audio;
    } as unknown as typeof Audio;
  });
  await page.route('**/__audio-continuity/*.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.route('**/api/talks?**', route => route.fulfill({ json: [{ id: 'e2e-continuous', tieu_de: title,
    mo_ta: 'Kiểm thử hàng đợi bằng audio thật', chu_de: 'Pháp ngữ', visibility: 'public',
    created_at: '2026-10-23T00:00:00Z', tracks: [1, 2, 3].map(i => ({ title: `Phần ${i}`, url: track(i) })),
  }] }));
  await page.goto('/phap-thoai');
});

async function playAll(page: Page) {
  await page.getByRole('button', { name: `Mở album ${title}`, exact: true }).click();
  const album = page.getByRole('dialog', { name: title, exact: true });
  await album.getByRole('button', { name: /Phát tất cả/ }).click();
  await album.getByRole('button', { name: 'Quay lại', exact: true }).click();
}
const events = (page: Page, kind: 'playing' | 'ended') => page.evaluate(k => (window as any).__audioContinuity[k] as string[], kind);

test('Play all uses real ended events to play every part and stop after the final part', async ({ page }) => {
  await playAll(page);
  await expect.poll(() => events(page, 'ended'), { timeout: 25_000 }).toEqual([track(1), track(2), track(3)]);
  expect(await events(page, 'playing')).toEqual([track(1), track(2), track(3)]);
  const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
  await expect(player.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();
  await player.getByRole('button', { name: 'Phát', exact: true }).click();
  await expect.poll(() => events(page, 'playing')).toEqual([track(1), track(2), track(3), track(3)]);
});

test('repeat-one stays on one part and repeat-album returns to its first part', async ({ page }) => {
  await playAll(page);
  await page.getByRole('button', { name: 'Mở rộng trình phát Pháp Thoại', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Chi tiết trình phát Pháp Thoại' });
  await full.getByRole('button', { name: 'Không lặp', exact: true }).click();
  await expect.poll(() => events(page, 'ended'), { timeout: 15_000 }).toEqual([track(1), track(1)]);
  await full.getByRole('button', { name: 'Lặp 1 bài', exact: true }).click();
  await expect.poll(async () => (await events(page, 'playing')).slice(-3), { timeout: 20_000 }).toEqual([track(2), track(3), track(1)]);
  await full.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
});

test('pressing Play all again replaces repeat-one with a single pass through the album', async ({ page }) => {
  await playAll(page);
  await page.getByRole('button', { name: 'Mở rộng trình phát Pháp Thoại', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Chi tiết trình phát Pháp Thoại' });
  await full.getByRole('button', { name: 'Không lặp', exact: true }).click();
  await full.getByRole('button', { name: 'Thu nhỏ trình phát', exact: true }).click();
  await playAll(page);
  await expect.poll(() => events(page, 'ended'), { timeout: 25_000 }).toEqual([track(1), track(2), track(3)]);
});
