import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsMember, settleClient, logoutThroughAccount } from './runtime-helpers';

test('guest notice banner displays for unauthenticated visitors and re-appears on every visit', async ({ page }) => {
  await page.goto('/');
  await settleClient(page);

  const banner = page.locator('[data-guest-notice-banner]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Đăng nhập để lưu tiến độ');
  await expect(banner).toContainText('Đồng bộ tiến độ đọc sách, nghe pháp và tu tập');

  // "Để sau" dismisses the banner during current browsing
  await banner.getByRole('button', { name: 'Để sau' }).click();
  await expect(banner).toHaveCount(0);

  // Re-accessing web displays it again
  await page.reload();
  await settleClient(page);
  await expect(page.locator('[data-guest-notice-banner]')).toBeVisible();
});

test('real logout closes an open album and stops its playback', async ({ page }) => {
  await loginAsAdmin(page, 'e2e-album-logout-session-token');
  await page.goto('/phap-thoai?album=e2e-talk');
  await settleClient(page);
  const album = page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' });
  await expect(album).toBeVisible();
  await album.getByRole('button', { name: 'Phát Tiếng mõ kiểm thử' }).click();
  const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
  await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
  await logoutThroughAccount(page);
  await expect(album).toHaveCount(0);
  await expect(player).toHaveCount(0);
});

test('guest can read books and articles normally without mandatory login', async ({ page, request }) => {
  await page.goto('/kinh-sach');
  await settleClient(page);
  const book = page.getByRole('button', { name: 'Đọc ngay Sách nhiều tập E2E', exact: true });
  await expect(book).toBeVisible();
  await book.click();

  // Reader opens normally for guest
  await expect(page.locator('.reader-scroll')).toBeVisible();
  const login = page.getByRole('dialog', { name: 'Đăng nhập' });
  await expect(login).toHaveCount(0);

  await page.goto('/?article=e2e-pdf');
  await settleClient(page);
  await expect(login).toHaveCount(0);
  expect((await request.get('/assets/pdfs/bai-viet-mau-gieo-nhan-lanh.pdf')).ok()).toBe(true);
});

test('guest practice, meditation and rosary are available without mandatory login', async ({ page }) => {
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('button.tt-mode-card--kinh').click();
  const practice = page.locator('.tt-grid').getByText('Kinh kiểm thử E2E', { exact: true });
  await expect(practice).toBeVisible();

  // Guest can preview and practice
  await practice.click();
  await expect(page.getByRole('region', { name: 'Xem trước bài tu tập' })).toBeVisible();

  // Rosary opens
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('button.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: /Bắt đầu/ }).click();
  await expect(page.getByRole('region', { name: 'Chế độ lần chuỗi' })).toBeVisible();
});

test('guest can open album and play talks normally without mandatory login', async ({ page, request }) => {
  await page.goto('/phap-thoai');
  await settleClient(page);
  const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
  await expect(card).toBeVisible();

  // Clicking open album opens dialog for guest
  await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E' }).click();
  await expect(page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' })).toBeVisible();

  // MP3 remains public
  expect((await request.get('/assets/audio/tieng-mo.m4a')).ok()).toBe(true);
});
