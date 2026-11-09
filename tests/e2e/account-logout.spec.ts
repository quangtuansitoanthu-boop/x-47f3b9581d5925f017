import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsMember, settleClient } from './runtime-helpers';

test('failed logout keeps the account active and displays a retryable error', async ({ page }) => {
  await loginAsMember(page);
  await page.goto('/ca-nhan?tab=account');
  await settleClient(page);
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' });
  await dialog.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Chưa thể đăng xuất');
  await expect(dialog.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/ca-nhan\?tab=account$/);
  expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: true });
});

test('admin topbar logout submits the current CSRF before clearing the session', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');
  await settleClient(page);
  const current = await (await page.request.get('/api/session')).json();
  const cookie = (await page.context().cookies()).find(item => item.name.endsWith('quangtu_session'));
  expect(cookie).toBeDefined();
  // Mô phỏng contract logout mà không thu hồi cookie fixture dùng chung bởi suite khác.
  await page.route('**/api/auth/logout', async route => {
    const validCsrf = route.request().headers()['x-csrf-token'] === current.csrfToken;
    await route.fulfill({
      status: validCsrf ? 200 : 403,
      json: validCsrf ? { authenticated: false } : { error: { code: 'invalid_csrf' } },
      headers: validCsrf ? { 'set-cookie': `${cookie!.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${cookie!.secure ? '; Secure' : ''}` } : {},
    });
  });
  await page.locator('.admin-topbar .session-status').click();
  await page.locator('.account-dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' });
  const response = page.waitForResponse(item => new URL(item.url()).pathname === '/api/auth/logout');
  await dialog.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL('/');
  expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: false });
});

test('admin topbar failed logout retains the account and allows retry', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');
  await settleClient(page);
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.locator('.admin-topbar .session-status').click();
  await page.locator('.account-dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' });
  await dialog.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Chưa thể đăng xuất');
  await expect(dialog.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: true });
});
