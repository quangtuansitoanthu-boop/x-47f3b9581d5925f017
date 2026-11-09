import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loginAsMember, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const dismissed of [false, true]) {
  test(`initial album ${dismissed ? 'stays closed after dismissal' : 'survives a delayed expiry refresh'}`, async ({ page }) => {
    await loginAsMember(page);
    const fetchLocal = await useNativeApiWithLocalBackend(page);
    // Native catalog starts from its bundled metadata, so bundle the same local
    // published fixture that the web test runtime serves instead of production albums.
    const catalogResponse = await page.request.get('/api/talks');
    expect(catalogResponse.ok()).toBe(true);
    const albums = await catalogResponse.json();
    expect(Array.isArray(albums)).toBe(true);
    expect(albums).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'e2e-talk', visibility: 'public' })]));
    await page.route('**/offline-data/talks.json', route => route.fulfill({ json: albums }));
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
      await page.goto('/phap-thoai?album=e2e-talk');
      await settleClient(page);
      const album = page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E', exact: true });
      await expect(album).toBeVisible();
      await expiryPending;
      if (dismissed) await album.getByRole('button', { name: 'Quay lại', exact: true }).click();
      const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
      release();
      const response = await refreshed;
      expect(response.ok()).toBe(true);
      expect(await response.json()).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
      await settleClient(page);
      if (dismissed) {
        await expect(album).toHaveCount(0);
        await expect(page).not.toHaveURL(/album=/);
      } else {
        await expect(album).toBeVisible();
        await expect(page).toHaveURL(/album=e2e-talk/);
      }
      expect(sessions).toBe(2);
    } finally { release(); }
  });
}

test('warm native album links replace the mounted album and reopen a dismissed target without extra data requests', async ({ page, baseURL }) => {
  const origin = new URL(baseURL || 'http://localhost:8787').origin;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
  await page.route(url => /^https?:$/u.test(url.protocol) && url.origin !== origin, route => route.abort('blockedbyclient'));
  const requests: string[] = [];
  await page.route('**/api/**', route => {
    requests.push(new URL(route.request().url()).pathname);
    return route.abort('failed');
  });
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.goto('/');
  await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
  // Activate only native catalog fallback after root mount, matching the offline native harness.
  await page.evaluate(() => {
    const runtime = window as unknown as { Capacitor?: Record<string, unknown>; CapacitorCustomPlatform: { name: string } };
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = { ...runtime.Capacitor, isNativePlatform: () => true };
  });
  const albums = (JSON.parse(readFileSync('src/lib/data/offline-talks.json', 'utf8')) as Array<{
    id: string; tieu_de: string; visibility?: string; tracks?: unknown[];
  }>).filter(album => album.visibility !== 'private' && album.tracks?.length).slice(0, 2);
  expect(albums).toHaveLength(2);
  const handoff = async (id: string) => {
    // A native App callback calls goto(). This transient internal anchor exercises
    // the same real SvelteKit navigation without reload or a synthetic popstate.
    await page.evaluate(path => {
      const anchor = document.createElement('a');
      anchor.href = path;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }, `/phap-thoai?album=${encodeURIComponent(id)}`);
  };
  await handoff(albums[0].id);
  const first = page.getByRole('dialog', { name: albums[0].tieu_de, exact: true });
  const second = page.getByRole('dialog', { name: albums[1].tieu_de, exact: true });
  await expect(first).toBeVisible();
  const metadataCount = () => requests.filter(path => /^\/api\/(?:talks|articles)(?:\/|$)/u.test(path)).length;
  const beforeWarm = metadataCount();
  await handoff(albums[1].id);
  await expect(page).toHaveURL(new RegExp(`[?&]album=${albums[1].id}(?:&|$)`));
  await expect(second).toBeVisible();
  await expect(first).toHaveCount(0);
  await second.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(second).toHaveCount(0);
  await handoff(albums[1].id);
  await expect(second).toBeVisible();
  expect(metadataCount()).toBe(beforeWarm);
  expect(requests.filter(path => /^\/api\/(?:audio\/|downloads\/access)/u.test(path))).toEqual([]);
});
