import { expect, test } from '@playwright/test';

import {
  LEGACY_LOCAL_STORAGE_KEYS,
  LEGACY_SESSION_STORAGE_KEYS,
} from '../../src/lib/browser/storage-contract';

const baseUrl = process.env.SVELTEKIT_BASE_URL ?? 'http://localhost:8787';

test.describe('browser compatibility and PWA registration', () => {
  test('registers the service worker from a direct non-index visit while preserving legacy storage', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    await context.addInitScript((storageKeys) => {
      localStorage.setItem(storageKeys.darkMode, '1');
      sessionStorage.setItem(storageKeys.role, 'admin');
    }, {
      darkMode: LEGACY_LOCAL_STORAGE_KEYS.darkMode,
      role: LEGACY_SESSION_STORAGE_KEYS.role,
    });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/tu-tap`);
    await expect(page.locator('[data-layout-id="quangtu-master-layout"]')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return Boolean(registration?.active?.scriptURL.includes('/service-worker.js'));
    }).catch(() => false), { timeout: 15_000 }).toBe(true);

    await expect.poll(async () => page.evaluate((key) => localStorage.getItem(key), LEGACY_LOCAL_STORAGE_KEYS.darkMode))
      .toBe('1');
    await expect.poll(async () => page.evaluate((key) => sessionStorage.getItem(key), LEGACY_SESSION_STORAGE_KEYS.role))
      .toBe('admin');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'))
      .toHaveAttribute('content', 'black-translucent');
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');

    await context.close();
  });

  test('reopens a cached guide route offline after the first online shell visit', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();

    // Clean the origin before loading application code so registration cannot
    // race with unregister/controllerchange during test setup.
    await page.goto(`${baseUrl}/api/health`);
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    });
    await page.goto(`${baseUrl}/huong-dan`);
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration('/'))?.active)).catch(() => false), { timeout: 15_000 }).toBe(true);
    // The runtime reloads once on controllerchange. Polling the controller
    // avoids racing that intentional navigation with a second manual reload.
    await expect.poll(async () => {
      try {
        return await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
      } catch {
        return false;
      }
    }, {
      timeout: 15_000,
    }).toBe(true);
    await expect.poll(async () => {
      try {
        return await page.evaluate(async () => Boolean(await caches.match('/huong-dan')));
      } catch {
        return false;
      }
    }, { timeout: 15_000 }).toBe(true);

    await context.setOffline(true);
    const offlinePage = await context.newPage();
    await offlinePage.goto(`${baseUrl}/huong-dan`, { waitUntil: 'domcontentloaded' });
    await expect(offlinePage.getByRole('heading', { name: 'Hướng Dẫn Tu Tập' })).toBeVisible();

    await context.close();
  });
});
