import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { inspectHorizontalOverflow } from './ios-overflow-helpers';

test.use({ browserName: 'webkit', isMobile: true, hasTouch: true });

for (const width of [320, 375]) test(`account remains within iPhone width ${width} after logout and Apple sign-in`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 812 });
  const user = { id: 'ios-layout-user', email: `${'a'.repeat(60)}@privaterelay.appleid.com`,
    displayName: 'An'.repeat(40) + ' Người dùng Apple', avatarUrl: '', role: 'user' };
  let signedIn = false;
  let rejectLogin = false;
  const session = () => ({ authenticated: signedIn, user: signedIn ? user : null,
    csrfToken: signedIn ? 'fixture-csrf' : null, expiresAt: signedIn ? '2099-01-01T00:00:00Z' : null });
  await page.addInitScript(() => {
    const runtime = window as unknown as { CapacitorCustomPlatform: { name: string }; Capacitor: Record<string, unknown> };
    runtime.CapacitorCustomPlatform = { name: 'ios' };
    runtime.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
      SignInWithApple: { authorize: async () => ({ response: { identityToken: 'layout-fixture-token' } }) },
    } };
    localStorage.setItem('tutam_locale', 'vi');
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: session() });
    if (path === '/api/auth/native-verify') {
      if (rejectLogin) return route.fulfill({ status:503, json:{ message:'ProviderError_'+'x'.repeat(180) } });
      signedIn = true;
      return route.fulfill({ json: { success: true, userId: user.id, user,
        session: { csrfToken: 'fixture-csrf', expiresAt: '2099-01-01T00:00:00Z' } } });
    }
    if (path === '/api/auth/logout') { signedIn = false; return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: path === '/api/presence' ? { enabled: false, activeCount: 0 } : [] });
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/ca-nhan?tab=account');
    await settleClient(page);
    await page.locator('.cn-btn-apple').click();
    await expect(page.locator('.cn-btn-logout')).toBeVisible();
    const email = page.locator('.cn-user-display-name').filter({ hasText: user.email });
    await expect(email).toBeVisible();
    expect(await email.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await inspectHorizontalOverflow(page)).findings).toEqual([]);
    if (attempt === 1) await page.screenshot({ path: testInfo.outputPath('account-after-sign-in.png') });
    await page.locator('.cn-btn-logout').click();
    await page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' }).getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  rejectLogin = true;
  await page.goto('/ca-nhan?tab=account');
  await settleClient(page);
  await page.locator('.cn-btn-apple').click();
  await expect(page.locator('.cn-auth-alert')).toContainText('ProviderError_');
  await page.screenshot({path:testInfo.outputPath('account-provider-error.png')});
  expect((await inspectHorizontalOverflow(page)).findings).toEqual([]);
});
