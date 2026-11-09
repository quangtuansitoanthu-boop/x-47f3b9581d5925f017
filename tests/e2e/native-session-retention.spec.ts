import { expect, test } from '@playwright/test';

for (const failure of [403, 503]) {
  test('native account survives a temporary session failure after three days: ' + failure, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-25T01:00:00Z'));
    await page.addInitScript(() => {
      const runtime = window as unknown as { Capacitor?: Record<string, unknown>; CapacitorCustomPlatform: { name: string } };
      runtime.CapacitorCustomPlatform = { name: 'android' };
      runtime.Capacitor = { ...runtime.Capacitor, isNativePlatform: () => true };
      localStorage.setItem('tutam_locale', 'vi');
      if (!localStorage.getItem('qa_retention_initialized')) {
        localStorage.setItem('qa_retention_initialized', '1');
        localStorage.setItem('quangtu_active_url', 'https://quangtu.vn');
      }
    });
    const account = { authenticated: true, user: { id: 'retention-member', email: 'member@example.test', displayName: 'Retention Member', avatarUrl: '', role: 'user' }, csrfToken: 'fixture-csrf', expiresAt: '2026-11-08T01:00:00Z' };
    let phase: 'active' | 'temporary' | 'revoked' = 'active';
    const sessionRequests: string[] = [];
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/session') {
        sessionRequests.push(url.origin);
        if (phase === 'temporary') return route.fulfill({ status: failure, contentType: 'text/html', body: '<html>Temporary failure</html>' });
        return route.fulfill({ json: phase === 'active' ? account : { authenticated: false, user: null, csrfToken: null, expiresAt: null } });
      }
      if (url.pathname === '/api/health') return route.fulfill({ status: 503, json: { ok: false } });
      return route.fulfill({ json: url.pathname === '/api/presence' ? { enabled: false, activeCount: 0 } : [] });
    });
    await page.goto('/');
    await expect(page.locator('.greeting-name')).toHaveText('Retention Member');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_native_session') || 'null')?.user?.id)).toBe('retention-member');
    phase = 'temporary';
    await page.clock.setFixedTime(new Date('2026-10-28T01:00:00Z'));
    const temporary = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
    await page.reload();
    expect((await temporary).status()).toBe(failure);
    await expect(page.locator('.greeting-name')).toHaveText('Retention Member');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tutam_native_session') || 'null')?.user?.id)).toBe('retention-member');
    expect(await page.evaluate(() => localStorage.getItem('quangtu_active_url'))).toBe('https://quangtu.vn');
    phase = 'revoked';
    const revoked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
    await page.reload();
    await revoked;
    await expect(page.locator('.greeting-name')).not.toHaveText('Retention Member');
    expect(await page.evaluate(() => localStorage.getItem('tutam_native_session'))).toBeNull();
    expect(sessionRequests).toEqual(['https://quangtu.vn', 'https://quangtu.vn', 'https://quangtu.vn']);
  });
}
