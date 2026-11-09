import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const entry of ['/', '/kinh-sach']) {
  test(`${entry} initial article fallback closes without reopening from duplicate history`, async ({ page, baseURL }) => {
    await loginAsMember(page);
    await useNativeApiWithLocalBackend(page);
    const origin = new URL(baseURL!).origin;
    let catalogRequests = 0;
    let singleRequests = 0;
    // Ép nhánh thiếu trong catalog; truy vấn bài theo ID vẫn dùng fixture thật.
    await page.route(url => url.pathname === '/api/articles', async route => {
      catalogRequests++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
      } });
    });
    await page.route(url => url.pathname === '/api/data/baiviet', async route => {
      if (new URL(route.request().url()).searchParams.get('id') === 'eq.e2e-public') singleRequests++;
      await route.fallback();
    });
    await page.goto(`${entry}?article=e2e-public`);
    await settleClient(page);
    const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true });
    await expect(reader).toBeVisible();
    expect(catalogRequests).toBeGreaterThan(0);
    expect(singleRequests).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/article=/);
    await expect(reader).toHaveCount(0);
    // Một lượt route qua lại không được khôi phục bài đã đóng.
    await page.reload();
    await settleClient(page);
    await expect(reader).toHaveCount(0);
  });

  test(`${entry} explicit open-book fallback preserves Back and Forward history`, async ({ page, baseURL }) => {
    await loginAsMember(page);
    await useNativeApiWithLocalBackend(page);
    const origin = new URL(baseURL!).origin;
    let singleRequests = 0;
    await page.route(url => url.pathname === '/api/articles', route => route.fulfill({
      status: 200, contentType: 'application/json', body: '[]', headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
      },
    }));
    await page.route(url => url.pathname === '/api/data/baiviet', async route => {
      if (new URL(route.request().url()).searchParams.get('id') === 'eq.e2e-public') singleRequests++;
      await route.fallback();
    });
    const sessionReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
    await page.goto(entry);
    expect((await sessionReady).ok()).toBe(true);
    await settleClient(page);
    const initialHistoryLength = await page.evaluate(() => history.length);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('quangtu:open-book', { detail: { bookId: 'e2e-public' } }));
    });
    const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true });
    await expect(reader).toBeVisible();
    await expect(page).toHaveURL(/article=e2e-public/);
    expect(singleRequests).toBeGreaterThan(0);
    expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength + 1);
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/article=/);
    await expect(reader).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/article=e2e-public/);
    await expect(reader).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength + 1);
    await page.goBack();
    await expect(page).not.toHaveURL(/article=/);
    await expect(reader).toHaveCount(0);
  });
}
