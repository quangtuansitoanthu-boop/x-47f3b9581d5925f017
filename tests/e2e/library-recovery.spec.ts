import { expect, test } from '@playwright/test';

for (const failure of ['server-error', 'html-response']) {
  test(`native library keeps bundled books readable when online with ${failure}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let catalogRequests = 0;
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/articles') {
        catalogRequests++;
        if (failure === 'html-response') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Service unavailable</html>' });
      }
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await expect(page.locator('.home-greeting-header')).toBeVisible();
    await page.evaluate(() => {
      const nativeWindow = window as unknown as { CapacitorCustomPlatform: { name: string }; Capacitor: Record<string, unknown> };
      nativeWindow.CapacitorCustomPlatform = { name: 'android' };
      nativeWindow.Capacitor = { ...nativeWindow.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' };
    });
    catalogRequests = 0;
    await page.locator('.qts-bottom-nav').getByRole('link', { name: 'Kinh sách', exact: true }).click();
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    await expect(page.locator('.offline-catalog-notice')).toBeVisible();
    await expect(page.locator('.art-card').first()).toBeVisible();
    await expect(page.locator('.state-box')).toHaveCount(0);
    expect(catalogRequests).toBe(1);
    await page.locator('.art-card').filter({ hasText: 'BÁO ỨNG HIỆN ĐỜI - Tập 7' }).locator('.art-card__open').click();
    const reader = page.locator('.reader-modal');
    await expect(reader).toBeVisible();
    await reader.locator('.toc-item').first().click();
    await expect.poll(async () => (await reader.locator('.reader-content').innerText()).length).toBeGreaterThan(50);
    if (failure === 'server-error') await page.screenshot({ path: 'plans/2026-10-22-android-ui-improvement/library-recovery-reader.png' });
  });
}
