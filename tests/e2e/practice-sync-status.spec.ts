import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

for (const width of [320, 375, 1440]) for (const dark of [false, true]) {
test(`Later dismisses the sync banner without discarding queued practice ${width} dark=${dark}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const key = 'quangtu_principal_v1:anonymous:quangtu_practice_session_outbox_v1';
  await page.addInitScript(({ key, dark }) => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
    localStorage.setItem(key, JSON.stringify([{
      id: 'start:defer', kind: 'start', clientSessionId: 'defer', queuedAt: new Date().toISOString(),
      payload: { clientSessionId: 'defer', activityType: 'meditation', targetDurationSeconds: 60,
        targetCount: null, sourceKind: null, sourceId: null, startedAt: new Date().toISOString(), idempotencyKey: 'defer' },
    }]));
  }, { key, dark });
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/practice/')) writes++; });
  await page.goto('/tu-tap');
  await settleClient(page);
  const notice = page.locator('[data-practice-sync-status]');
  await expect(notice).toBeVisible();
  const buttons = notice.getByRole('button');
  const first = await buttons.nth(0).boundingBox();
  const second = await buttons.nth(1).boundingBox();
  expect(Math.abs(first!.width - second!.width)).toBeLessThan(1);
  expect(first!.height).toBeGreaterThanOrEqual(44);
  expect(second!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/practice-sync-banner-${width}-${dark ? 'dark' : 'light'}.png` });
  await notice.getByRole('button', { name: 'Để sau', exact: true }).click();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, key)).toBe(1);
  expect(writes).toBe(0);
});
}

test('keeps a failed practice operation and retries through one shared owner', async ({ page }) => {
  await loginAsMember(page);
  const key = 'quangtu_principal_v1:e2e-member:quangtu_practice_session_outbox_v1';
  await page.addInitScript(({ key }) => {
    localStorage.setItem('tutam_locale', 'vi');
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([{
      id: 'start:sync-status', kind: 'start', clientSessionId: 'sync-status', queuedAt: new Date().toISOString(),
      payload: { clientSessionId: 'sync-status', activityType: 'meditation', targetDurationSeconds: 60,
        targetCount: null, sourceKind: null, sourceId: null, startedAt: new Date().toISOString(), idempotencyKey: 'sync-status' },
    }]));
  }, { key });
  let failing = true;
  let writes = 0;
  await page.route('**/api/practice/sessions', route => {
    writes++;
    return route.fulfill({ status: failing ? 503 : 200, json: failing ? { error: 'unavailable' } : { ok: true } });
  });
  await page.goto('/');
  await settleClient(page);
  const notice = page.locator('[data-practice-sync-status]');
  await expect(notice).toContainText('1 thao tác');
  await expect.poll(() => writes).toBe(1);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, key)).toBe(1);
  failing = false;
  await notice.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(notice).toHaveCount(0);
  expect(writes).toBe(2);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, key)).toBe(0);
});
