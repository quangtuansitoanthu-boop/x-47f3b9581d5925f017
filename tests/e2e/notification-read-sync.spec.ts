import { expect, test, type Page } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

async function prepare(page: Page, id: string) {
  await page.clock.install({ time: new Date(2026, 10, 1, 12, 0) });
  // Unique synthetic inbox event; read/write receipts still use the actual local D1 API.
  await page.route('**/api/practice/mindful-notifications*', route => route.fulfill({ json: { enabled: true, items: [{
    id, postId: 'read-sync-fixture', kind: 'repentance', nickname: 'Đồng tu kiểm thử', templateId: 'tam-bao', text: 'Lời cầu nguyện kiểm thử', createdAt: '2026-11-01T05:00:00Z',
  }], nextCursor: null } }));
  await loginAsMember(page); await page.goto('/'); await settleClient(page);
}
test('two independent devices share read status and keep the approved bubble layout', async ({ browser }) => {
  const first = await browser.newContext({ viewport: { width: 375, height: 844 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const a = await first.newPage(), b = await second.newPage();
    const id = `device-sync-${Date.now()}`;
    await prepare(a, id); await prepare(b, id);
    await a.locator('.notification-bell-btn').click();
    const aPanel = a.locator('.notification-popover');
    await expect(aPanel.getByRole('button', { name: 'Đọc tất cả', exact: true })).toBeVisible();
    await expect(aPanel.locator('.notification-tail')).toBeVisible();
    await expect(aPanel.locator('.app-artwork')).not.toHaveCount(0);
    const written = a.waitForResponse(response => new URL(response.url()).pathname === '/api/notifications/read-state' && response.request().method() === 'POST');
    await aPanel.getByRole('button', { name: 'Đọc tất cả', exact: true }).click();
    expect((await written).ok()).toBe(true);
    await expect(aPanel.locator('.notification-item.unread')).toHaveCount(0);
    const fetched = b.waitForResponse(response => new URL(response.url()).pathname === '/api/notifications/read-state' && response.request().method() === 'GET');
    await b.locator('.notification-bell-btn').click();
    expect((await fetched).ok()).toBe(true);
    await expect(b.locator('.notification-popover .notification-item.unread')).toHaveCount(0);
    await expect(b.locator('.notification-badge')).toHaveCount(0);
    await expect(b.locator('.notification-popover .notification-item')).not.toHaveCount(0);
    await aPanel.screenshot({ path: '.cache/notification-approved-mobile.png' });
    await b.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await b.locator('.notification-popover').screenshot({ path: '.cache/notification-approved-desktop-dark.png' });
  } finally { await first.close(); await second.close(); }
});

test('failed read receipt remains local, survives reload and flushes on reconnect without losing another account scope', async ({ page }) => {
  await prepare(page, `offline-sync-${Date.now()}`);
  await page.route('**/api/notifications/read-state', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }) : route.continue());
  await page.locator('.notification-bell-btn').click();
  const panel = page.locator('.notification-popover');
  const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notifications/read-state' && response.request().method() === 'POST');
  await panel.getByRole('button', { name: 'Đọc tất cả', exact: true }).click();
  expect((await failed).status()).toBe(503);
  await expect(panel.locator('.notification-item.unread')).toHaveCount(0);
  const pendingKey = 'quangtu_notifications_read_e2e-member_pending_v1';
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]').length, pendingKey)).toBeGreaterThan(0);
  await page.reload(); await settleClient(page);
  await page.locator('.notification-bell-btn').click();
  await expect(panel.locator('.notification-item.unread')).toHaveCount(0);
  await page.unroute('**/api/notifications/read-state');
  const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notifications/read-state' && response.request().method() === 'POST');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  expect((await uploaded).ok()).toBe(true);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]').length, pendingKey)).toBe(0);
});
