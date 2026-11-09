import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

const publicRow = { id: 'catalog-public', tieu_de: 'Catalog public', visibility: 'public', tracks: [{ title: 'Public track', url: '/public.mp3' }] };
const privateRow = { id: 'catalog-private', tieu_de: 'Catalog private', visibility: 'private', tracks: [{ title: 'Private track', url: '/private.mp3' }] };

test('cold offline public PWA shell hides private talks without treating cached guest HTML as a verified logout', async ({ browser }) => {
  test.setTimeout(90_000);
  const baseURL = process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787';
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL).hostname);
  const context = await browser.newContext({ baseURL, serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let sessionReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/session') sessionReads++; });
  try {
    await loginAsAdmin(page);
    const admin = await (await page.request.get('/api/session')).json();
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.ready).active));
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/phap-thoai')))).toBe(true);
    await page.evaluate(async ({ publicRow, privateRow, ownerId }) => {
      const rows = [publicRow, privateRow];
      localStorage.setItem('quangtu_cached_talk_catalog_v1', JSON.stringify(rows));
      localStorage.setItem('quangtu_talk_catalog_meta_v1', JSON.stringify({ albumCount: rows.length, privateOwnerId: ownerId, privateOwnerRole: 'admin' }));
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open('tutam_talk_catalog_v1', 1);
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['albums', 'meta'], 'readwrite');
        tx.objectStore('albums').clear();
        for (const row of rows) tx.objectStore('albums').put(row);
        tx.objectStore('meta').put({ key: 'album_count', value: rows.length, privateOwnerId: ownerId, privateOwnerRole: 'admin' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    }, { publicRow, privateRow, ownerId: admin.user.id });
    await page.goto('/phap-thoai');
    await settleClient(page);
    await expect(page.locator('.pt-card').filter({ hasText: privateRow.tieu_de })).toBeVisible();
    sessionReads = 0;
    await context.setOffline(true);
    const offlineSession = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === '/api/session');
    const response = await page.reload({ waitUntil: 'networkidle' });
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('[data-mounted="1"]')).toBeAttached();
    await expect(page.locator('.pt-card').filter({ hasText: publicRow.tieu_de })).toBeVisible();
    await expect(page.locator('.pt-card[data-private="1"]')).toHaveCount(0);
    expect(await page.evaluate(async () => (await caches.match('/phap-thoai'))?.text())).not.toContain('data-offline-shell');
    expect((await persistedRows(page)).map(row => row.id)).toContain(privateRow.id);
    expect(await page.evaluate(() => localStorage.getItem('quangtu_cached_talk_catalog_v1'))).toContain(privateRow.id);
    expect(sessionReads).toBe(1);
    expect((await offlineSession).failure()).not.toBeNull(); // Offline transport failure, no server/D1 access.
    sessionReads = 0;
    await context.setOffline(false);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.pt-card').filter({ hasText: privateRow.tieu_de })).toBeVisible();
    await context.clearCookies();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.pt-card').filter({ hasText: publicRow.tieu_de })).toBeVisible();
    await expect(page.locator('.pt-card[data-private="1"]')).toHaveCount(0);
    await expect.poll(async () => (await persistedRows(page)).filter(row => row.visibility === 'private').length).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('quangtu_cached_talk_catalog_v1'))).not.toContain(privateRow.id);
    expect(sessionReads).toBe(0);
  } finally {
    await context.setOffline(false);
    await context.close();
  }
});

async function persistedRows(page: Page) {
  return page.evaluate(() => new Promise<Array<{ id: string; visibility: string }>>((resolve, reject) => {
    const opening = indexedDB.open('tutam_talk_catalog_v1', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('albums', 'readonly');
      const rows = tx.objectStore('albums').getAll();
      tx.oncomplete = () => { db.close(); resolve(rows.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

test('same admin can reopen cached private talks offline; guest loses private metadata on logout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await expect(page.locator('.greeting-name')).toHaveText('Quản trị viên E2E');
  let catalogReads = 0;
  await page.route('**/api/talks**', route => {
    if (new URL(route.request().url()).pathname !== '/api/talks') return route.continue();
    catalogReads++;
    return route.fulfill({ json: [publicRow, privateRow] });
  });
  await page.locator('.qts-bottom-nav').getByRole('link', { name: 'Pháp thoại', exact: true }).click();
  await settleClient(page);
  await expect(page.locator('.pt-card').filter({ hasText: privateRow.tieu_de })).toBeVisible();
  expect(catalogReads).toBe(1);
  await page.route('**/api/talks**', route => {
    if (new URL(route.request().url()).pathname !== '/api/talks') return route.continue();
    catalogReads++;
    return route.abort('internetdisconnected');
  });
  catalogReads = 0;
  await page.reload();
  await settleClient(page);
  await expect(page.locator('.pt-card').filter({ hasText: privateRow.tieu_de })).toBeVisible();
  expect(catalogReads).toBe(0);
  await page.context().clearCookies();
  await page.reload();
  await settleClient(page);
  await expect(page.locator('.pt-card').filter({ hasText: publicRow.tieu_de })).toBeVisible();
  await expect(page.locator('.pt-card[data-private="1"]')).toHaveCount(0);
  await expect.poll(async () => (await persistedRows(page)).map(row => row.id)).toEqual([publicRow.id]);
  expect(catalogReads).toBe(0);
});

test('reads cached owner and rows from one IDB snapshot during an account replacement write', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  const session = await (await page.request.get('/api/session')).json();
  await expect(page.locator('.greeting-name')).toHaveText(session.user.displayName);
  const replacement = { ...privateRow, id: 'new-admin-private', tieu_de: 'New admin private' };
  const previous = { ...privateRow, id: 'old-admin-private', tieu_de: 'Old admin private' };
  await page.route('**/api/talks**', route => {
    if (new URL(route.request().url()).pathname !== '/api/talks') return route.continue();
    return route.fulfill({ json: [publicRow, replacement] });
  });
  await page.evaluate(async ({ previous, replacement, publicRow, principalId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tutam_talk_catalog_v1', 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => resolve(opening.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['albums', 'meta'], 'readwrite');
      tx.objectStore('albums').clear();
      tx.objectStore('albums').put(publicRow);
      tx.objectStore('albums').put(previous);
      tx.objectStore('meta').put({ key: 'album_count', value: 2, privateOwnerId: 'previous-admin', privateOwnerRole: 'admin' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const original = IDBObjectStore.prototype.getAll;
    let armed = true;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
      const request = original.apply(this, args);
      if (armed && this.name === 'albums' && this.transaction.mode === 'readonly') {
        armed = false;
        request.addEventListener('success', () => {
          // Ghi chờ sau snapshot readonly, trước lượt đọc metadata riêng nếu có.
          const tx = db.transaction(['albums', 'meta'], 'readwrite');
          tx.objectStore('albums').clear();
          tx.objectStore('albums').put(publicRow);
          tx.objectStore('albums').put(replacement);
          tx.objectStore('meta').put({ key: 'album_count', value: 2, privateOwnerId: principalId, privateOwnerRole: 'admin' });
          tx.oncomplete = () => db.close();
          IDBObjectStore.prototype.getAll = original;
        }, { once: true });
      }
      return request;
    };
  }, { previous, replacement, publicRow, principalId: session.user.id });
  // SPA giữ principal đã chọn, không dọn dữ liệu vừa gieo trước khi tái hiện race.
  await page.locator('.qts-bottom-nav').getByRole('link', { name: 'Pháp thoại', exact: true }).click();
  await expect(page.locator('.pt-card').filter({ hasText: replacement.tieu_de })).toBeVisible();
  await expect(page.locator('.pt-card').filter({ hasText: previous.tieu_de })).toHaveCount(0);
});

test('pending startup guest can load public talks without replacing private IDB before session verification', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator('.greeting-name')).toHaveText('Quản trị viên E2E');
  await page.context().clearCookies();
  await page.evaluate(async privateRow => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tutam_talk_catalog_v1', 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['albums', 'meta'], 'readwrite');
      tx.objectStore('albums').clear();
      tx.objectStore('albums').put(privateRow);
      tx.objectStore('meta').put({ key: 'album_count', value: 1, privateOwnerId: 'e2e-google-admin', privateOwnerRole: 'admin' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }, privateRow);
  await useNativeApiWithLocalBackend(page);
  const cors = {
    'access-control-allow-origin': new URL(page.url()).origin,
    'access-control-allow-credentials': 'true',
  };
  let releaseSession: (() => Promise<void>) | undefined;
  let sessionSeen!: () => void;
  const sessionRequested = new Promise<void>(resolve => { sessionSeen = resolve; });
  await page.route('**/api/session', async route => {
    await new Promise<void>((resolve, reject) => {
      releaseSession = async () => {
        try {
          await route.fulfill({ headers: cors, json: { authenticated: false, user: null, csrfToken: null, expiresAt: null } });
          resolve();
        } catch (error) { reject(error); throw error; }
      };
      sessionSeen();
    });
  });
  let catalogReads = 0;
  let bundledReads = 0;
  let apiCatalogReads = 0;
  // Native mở catalog public đóng gói trong khi phiên thật vẫn đang xác minh.
  await page.route('**/offline-data/talks.json', route => {
    catalogReads++;
    bundledReads++;
    return route.fulfill({ json: [publicRow] });
  });
  await page.route('**/api/talks**', route => {
    if (new URL(route.request().url()).pathname !== '/api/talks') return route.continue();
    catalogReads++;
    apiCatalogReads++;
    return route.fulfill({ headers: cors, json: [publicRow] });
  });
  try {
    await page.goto('/phap-thoai');
    await sessionRequested;
    await expect(page.locator('.pt-card').filter({ hasText: publicRow.tieu_de })).toBeVisible();
    await expect(page.locator('.pt-card[data-private="1"]')).toHaveCount(0);
    expect(catalogReads).toBe(1);
    expect(bundledReads).toBe(1);
    expect(apiCatalogReads).toBe(0);
    expect((await persistedRows(page)).map(row => row.id)).toEqual([privateRow.id]);
  } finally {
    if (releaseSession) await releaseSession();
  }
  await expect.poll(async () => (await persistedRows(page)).filter(row => row.visibility === 'private').length).toBe(0);
  await expect(page.locator('.pt-card').filter({ hasText: publicRow.tieu_de })).toBeVisible();
  expect(catalogReads).toBe(1);
  expect(bundledReads).toBe(1);
  expect(apiCatalogReads).toBe(0);
});
