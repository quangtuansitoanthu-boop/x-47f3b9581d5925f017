import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const target of ['article', 'sach']) for (const dismiss of [false, true]) {
  test(`initial practice link (${target}) ${dismiss ? 'stays dismissed' : 'remains open'} after delayed expiry refresh`, async ({ page }) => {
    await loginAsMember(page);
    const fetchLocal = await useNativeApiWithLocalBackend(page);
    // Match the native bundled catalog/detail path with real local fixture rows;
    // preloading fixture data here is outside the browser request budget below.
    const articleResponse = await page.request.get('/api/data/baiviet?id=eq.e2e-practice&select=*');
    expect(articleResponse.ok()).toBe(true);
    const articles = await articleResponse.json();
    expect(articles).toEqual([expect.objectContaining({ id: 'e2e-practice', danh_muc: 'KINH PHẬT' })]);
    const chapterResponse = await page.request.get('/api/articles/e2e-practice/chapters?order=so_thu_tu.asc');
    expect(chapterResponse.ok()).toBe(true);
    const chapters = await chapterResponse.json();
    expect(Array.isArray(chapters)).toBe(true);
    expect(chapters).toHaveLength(2);
    await page.route('**/offline-bundled-articles.json', route => route.fulfill({ json: articles }));
    await page.route('**/offline-data/chapters/e2e-practice.json', route => route.fulfill({ json: chapters }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let observeExpiry!: () => void;
    const expiryPending = new Promise<void>(resolve => observeExpiry = resolve);
    let sessionResponses = 0;
    let sessions = 0;
    let details = 0;
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/session') sessions++;
      if (url.pathname === '/api/data/baiviet' && url.searchParams.get('id') === 'eq.e2e-practice') details++;
    });
    await page.route('**/api/session', async route => {
      const response = await fetchLocal(route);
      sessionResponses++;
      if (sessionResponses === 1) {
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
      await page.goto(`/tu-tap?${target}=e2e-practice`);
      const start = page.getByRole('button', { name: /Bắt Đầu Công Phu/u });
      await expect(start).toBeVisible();
      await settleClient(page);
      await expiryPending;
      if (dismiss) {
        await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
        await expect(start).toHaveCount(0);
        await expect(page).not.toHaveURL(/article=/u);
        await expect(page).not.toHaveURL(/sach=/u);
      }
      const hydrated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
      release();
      const response = await hydrated;
      expect(response.ok()).toBe(true);
      expect(await response.json()).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
      await settleClient(page);
      if (dismiss) await expect(start).toHaveCount(0);
      else {
        await expect(start).toBeVisible();
        await expect(page).toHaveURL(/article=e2e-practice/u);
        await start.click();
        await expect(page.getByRole('dialog', { name: /Bắt Đầu Công Phu/u })).toBeVisible();
      }
      expect(sessions).toBe(2);
      expect(details).toBeLessThanOrEqual(1);
    } finally { release(); }
  });
}
