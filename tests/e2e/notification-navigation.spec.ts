import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

test('lunar notifications open practice and stay read after reload', async ({ page }) => {
  // This case tests lunar reminders, independent of prior local-D1 community reaction fixtures.
  await page.route('**/api/practice/mindful-notifications*', route => route.fulfill({json:{enabled:true,items:[],nextCursor:null}}));
  await page.clock.install({ time: new Date(2026, 10, 1, 12, 0) });
  await loginAsMember(page);
  await page.goto('/');
  await settleClient(page);
  await page.locator('.notification-bell-btn').click();
  const item = page.getByRole('button', { name: /Hôm nay là ngày Ăn Chay/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/tu-tap$/);
  await page.reload();
  await page.goto('/');
  await settleClient(page);
  await page.locator('.notification-bell-btn').click();
  await expect(page.getByRole('button', { name: /Hôm nay là ngày Ăn Chay/ })).not.toHaveClass(/unread/);
  await page.getByRole('button', { name: /Nhắc nhở: Ngày Kiêng Hành Dâm/ }).click();
  await expect(page).toHaveURL(/\/tu-tap$/);
  await expect(page.locator('.notification-badge')).toHaveCount(0);
});

test('an internal notification keeps the document and active root audio player', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date(2026, 9, 28, 7, 0) });
  await loginAsMember(page);
  // Audio WAV thật đủ dài để kiểm tra tiếp tục phát qua điều hướng, không mock play().
  const samples = 8_000 * 20;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write('RIFF'); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(8_000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(samples, 40);
  await page.route('**/__notification-player.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.route('**/api/talks?**', route => route.fulfill({ json: [{
    id: 'notification-player', tieu_de: 'Album điều hướng thông báo', chu_de: 'Pháp ngữ', visibility: 'public',
    tracks: [{ title: 'Bài nghe liên tục', url: '/__notification-player.wav', duration_sec: 20 }],
  }] }));
  await page.goto('/phap-thoai');
  await settleClient(page);
  await page.getByRole('button', { name: 'Phát album Album điều hướng thông báo', exact: true }).click();
  const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại', exact: true });
  await expect(player.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  await player.evaluate(element => { Reflect.set(window, '__notificationPlayerNode', element); });
  const documents: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'document') documents.push(request.url()); });
  await page.locator('.notification-bell-btn').click();
  await page.getByRole('button', { name: /Thời khóa tu tập sáng sớm/ }).click();
  await expect(page).toHaveURL(/\/tu-tap$/);
  await expect(player).toContainText('Bài nghe liên tục');
  await expect(player.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  expect(await player.evaluate(element => Reflect.get(window, '__notificationPlayerNode') === element)).toBe(true);
  expect(documents).toEqual([]);
  await expect(page.locator('.notification-popover')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_notifications_read_e2e-member') ?? '[]'))).toContain('practice_morning_2026-10-28');
});
