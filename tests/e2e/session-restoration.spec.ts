import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsMember, settleClient } from './runtime-helpers';

test('restores a member cookie on a direct profile visit and after reload', async ({ page }) => {
  await loginAsMember(page);
  const sessionRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/session') sessionRequests.push(request.url());
  });
  await page.goto('/ca-nhan?tab=account');
  await settleClient(page);
  await expect(page.locator('.cn-user-display-name')).toContainText('e2e-member@example.com');
  await expect(page.locator('.cn-btn-logout')).toBeVisible();
  await page.reload();
  await settleClient(page);
  await expect(page.locator('.cn-user-display-name')).toContainText('e2e-member@example.com');
  expect(sessionRequests).toEqual([]);
});

test('resolves the cookie before guarding direct admin content visits', async ({ page }) => {
  await loginAsAdmin(page);
  for (const [path, heading] of [['/admin/books', 'Sách & bài viết'], ['/admin/phap-thoai', 'Pháp thoại'], ['/admin/tu-tap', 'Nội dung tu tập']]) {
    // Each goto starts a fresh JS runtime, without a mounted root session store.
    await page.goto(path);
    await settleClient(page);
    await expect(page.getByRole('heading', { name: 'Yêu cầu quyền Quản trị' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});
