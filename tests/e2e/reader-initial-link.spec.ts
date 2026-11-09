import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const entry of ['/', '/kinh-sach']) {
  for (const closeBeforeRefresh of [false, true]) {
    test(`${entry} initial article ${closeBeforeRefresh ? 'stays closed after dismissal' : 'survives a delayed expiry refresh'}`, async ({ page }) => {
      await loginAsMember(page);
      const fetchLocal = await useNativeApiWithLocalBackend(page);
      let sessions = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => release = resolve);
      let observeExpiry!: () => void;
      const expiryPending = new Promise<void>(resolve => observeExpiry = resolve);
      await page.route('**/api/session', async route => {
        sessions++;
        const response = await fetchLocal(route);
        if (sessions === 1) {
          const session = await response.response.json();
          expect(session).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
          await route.fulfill({ ...response, json: { ...session, expiresAt: new Date(Date.now() + 3000).toISOString() } });
          return;
        }
        observeExpiry();
        await gate;
        await route.fulfill(response);
      });
      try {
        await page.goto(`${entry}?article=e2e-public`);
        await settleClient(page);
        const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true });
        await expect(reader).toBeVisible();
        await expiryPending;
        if (closeBeforeRefresh) {
          await page.keyboard.press('Escape');
          await expect(reader).toHaveCount(0);
        }
        const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
        release();
        const response = await refreshed;
        expect(response.ok()).toBe(true);
        expect(await response.json()).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
        await settleClient(page);
        if (closeBeforeRefresh) {
          await expect(reader).toHaveCount(0);
          await expect(page).not.toHaveURL(/article=/);
        } else {
          await expect(reader).toBeVisible();
          await expect(page).toHaveURL(/article=e2e-public/);
          await expect(reader.locator('.reader-content')).not.toBeEmpty();
        }
        expect(sessions).toBe(2);
      } finally { release(); }
    });
  }
}
