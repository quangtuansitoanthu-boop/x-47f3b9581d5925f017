import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { PRACTICE_LOG_CHANGED_EVENT } from '../../src/lib/domain/practice/completed-logs';

async function campaigns(page: Page, baseURL: string) {
  await loginAsAdmin(page);
  const session = await (await page.request.get('/api/session')).json();
  const headers = { origin: baseURL, 'x-csrf-token': session.csrfToken };
  const ids: string[] = [];
  for (const metric of ['count', 'sessions']) {
    const response = await page.request.post('/api/practice/campaigns', { headers, data: {
      title: `Tool sync ${metric} ${Date.now()}`, description: '', metric, goalValue: 1000000,
      startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), status: 'active',
    } });
    expect(response.ok()).toBe(true);
    const id = (await response.json()).campaign.id; ids.push(id);
    expect((await page.request.post(`/api/practice/campaigns/${id}/join`, { headers })).ok()).toBe(true);
  }
  return { ids, headers, async totals() {
    const rows = (await (await page.request.get('/api/practice/campaigns')).json()).campaigns;
    return ids.map(id => rows.find((row: { id: string }) => row.id === id)?.contributionValue);
  }, async clean() {
    for (const id of ids) expect((await page.request.delete(`/api/practice/campaigns/${id}`, { headers })).ok()).toBe(true);
  } };
}

test('bowing automatically contributes once to joined count and session campaigns', async ({ page, baseURL }) => {
  const setup = await campaigns(page, baseURL!);
  try {
    await page.goto('/tu-tap');
    await settleClient(page);
    await page.locator('.tt-mode-card--le-phat').click();
    await page.locator('#lp-bell-select').selectOption('none');
    await page.getByRole('button', { name: /BẮT ĐẦU ĐẢNH LỄ/ }).click();
    for (let i = 0; i < 3; i++) await page.locator('.lp-fullscreen-counter').click();
    await page.locator('.lp-fullscreen-finish-btn').click();
    await page.getByRole('dialog', { name: 'Ghi nhận công phu Lễ Phật', exact: true }).getByRole('button', { name: /Ghi nhận 3 lạy/ }).click();
    await expect.poll(setup.totals).toEqual([3, 1]);
    await page.reload(); await expect.poll(setup.totals).toEqual([3, 1]);
  } finally { await setup.clean(); }
});

test('a completed 108-name round automatically contributes from its own route', async ({ page, baseURL }) => {
  const setup = await campaigns(page, baseURL!);
  try {
    await page.goto('/tu-tap/chep-danh-hieu');
    await expect(page.locator('#name-line-0')).toBeEnabled();
    for (let i = 0; i < 108; i++) await page.locator(`#name-line-${i}`).fill('Nam mô A Di Đà Phật');
    await expect(page.locator('#name-line-0')).toHaveValue('');
    await expect.poll(setup.totals).toEqual([108, 1]);
    await page.reload(); await expect.poll(setup.totals).toEqual([108, 1]);
  } finally { await setup.clean(); }
});

test('the completed-copy log bridge survives root navigation and rejects missing CSRF', async ({ page, baseURL }) => {
  const setup = await campaigns(page, baseURL!);
  try {
    expect((await page.request.post('/api/practice/completed-logs', { headers: { origin: baseURL! }, data: { logs: [] } })).status()).toBe(403);
    await page.goto('/tu-tap/chep-kinh');
    // Helper recordCompletedCopy đã được unit-test; ở đây kiểm tra cầu nối log→root→API thật.
    await page.evaluate(({ key, event }) => {
      localStorage.setItem(key, JSON.stringify([{ id: Date.now(), type: 'Chép kinh', count: 1,
        date: '2026-10-28', created: new Date().toISOString(), note: 'Địa Tạng · Chương 1' }]));
      window.dispatchEvent(new Event(event));
    }, { key: principalStorageKey('e2e-google-admin', 'tt_practice_logs_v1'), event: PRACTICE_LOG_CHANGED_EVENT });
    await expect.poll(setup.totals).toEqual([1, 1]);
    await page.goto('/kinh-sach'); await expect.poll(setup.totals).toEqual([1, 1]);
  } finally { await setup.clean(); }
});
