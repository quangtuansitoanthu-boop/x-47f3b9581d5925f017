import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

for (const status of [409, 503]) {
  test(`rejected account deletion retains provider state and the active account (${status})`, async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/ca-nhan?tab=account');
    await settleClient(page);
    await page.evaluate(() => localStorage.setItem('tutam_native_auth_provider', 'google'));

    let deletionRequests = 0;
    // Không xóa tài khoản fixture: chặn mọi POST xóa và mô phỏng lỗi server.
    await page.route('**/api/auth/delete-account', async route => {
      deletionRequests += 1;
      expect(route.request().method()).toBe('POST');
      await route.fulfill({ status, json: { message: 'Chưa thể xóa tài khoản thử nghiệm.' } });
    });

    await page.locator('.cn-btn-delete-account').click();
    const dialog = page.locator('.cn-delete-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.cn-btn-danger')).toBeDisabled();
    const code = (await dialog.locator('.cn-delete-code-display').innerText()).trim();
    await dialog.locator('#delete-confirm-input').fill(code);
    await expect(dialog.locator('.cn-btn-danger')).toBeEnabled();
    await dialog.locator('.cn-btn-danger').click();

    await expect(dialog).toBeHidden();
    await expect(page.locator('.cn-auth-alert-text')).toBeVisible();
    await expect(page.locator('.cn-auth-alert-text')).toHaveText('Chưa thể xóa tài khoản thử nghiệm.');
    expect(deletionRequests).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('tutam_native_auth_provider'))).toBe('google');
    expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: true });
    await expect(page).toHaveURL(/\/ca-nhan\?tab=account$/);
    await expect(page.locator('.cn-btn-delete-account')).toBeVisible();
  });
}

test('network failure during account deletion reveals the error and retains the active account', async ({ page }) => {
  await loginAsMember(page);
  await page.goto('/ca-nhan?tab=account');
  await settleClient(page);
  await page.evaluate(() => localStorage.setItem('tutam_native_auth_provider', 'google'));

  let deletionRequests = 0;
  await page.route('**/api/auth/delete-account', async route => {
    deletionRequests += 1;
    expect(route.request().method()).toBe('POST');
    await route.abort('failed');
  });

  await page.locator('.cn-btn-delete-account').click();
  const dialog = page.locator('.cn-delete-dialog');
  const code = (await dialog.locator('.cn-delete-code-display').innerText()).trim();
  await dialog.locator('#delete-confirm-input').fill(code);
  await dialog.locator('.cn-btn-danger').click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('.cn-auth-alert-text')).toBeVisible();
  await expect(page.locator('.cn-auth-alert-text')).not.toBeEmpty();
  expect(deletionRequests).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('tutam_native_auth_provider'))).toBe('google');
  expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: true });
  await expect(page).toHaveURL(/\/ca-nhan\?tab=account$/);
  await expect(page.locator('.cn-btn-delete-account')).toBeVisible();
  await page.locator('.cn-btn-delete-account').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#delete-confirm-input')).toBeEmpty();
  await expect(dialog.locator('.cn-btn-danger')).toBeDisabled();
  expect(deletionRequests).toBe(1);
});

test('accepted account deletion clears provider state only after server confirmation', async ({ page }) => {
  await loginAsMember(page);
  await page.goto('/ca-nhan?tab=account');
  await settleClient(page);
  await page.evaluate(() => localStorage.setItem('tutam_native_auth_provider', 'google'));
  const cookie = (await page.context().cookies()).find(item => item.name.endsWith('quangtu_session'));
  expect(cookie).toBeDefined();
  let acceptDeletion = () => {};
  const serverConfirmation = new Promise<void>(resolve => { acceptDeletion = resolve; });
  let receivedDeletion = () => {};
  const deletionStarted = new Promise<void>(resolve => { receivedDeletion = resolve; });
  let deletionRequests = 0;
  // Chỉ mô phỏng thành công và xóa cookie trong browser context này, không xóa fixture/server session.
  await page.route('**/api/auth/delete-account', async route => {
    deletionRequests += 1;
    receivedDeletion();
    await serverConfirmation;
    await route.fulfill({
      json: { deleted: true, authenticated: false },
      headers: { 'set-cookie': `${cookie!.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${cookie!.secure ? '; Secure' : ''}` },
    });
  });

  await page.locator('.cn-btn-delete-account').click();
  const dialog = page.locator('.cn-delete-dialog');
  const code = (await dialog.locator('.cn-delete-code-display').innerText()).trim();
  await dialog.locator('#delete-confirm-input').fill(code);
  await dialog.locator('.cn-btn-danger').click();
  try {
    await deletionStarted;
    expect(await page.evaluate(() => localStorage.getItem('tutam_native_auth_provider'))).toBe('google');
  } finally {
    acceptDeletion();
  }
  await expect(page).toHaveURL('/');
  expect(deletionRequests).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('tutam_native_auth_provider'))).toBeNull();
  expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: false });
});
