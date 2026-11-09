import { expect, test } from '@playwright/test';
import { settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }, info) => {
  if (info.title === 'reconnecting flushes the existing completed session once without refreshing the user session') {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('a failed durable start does not advance beads and the next tap retries after storage recovers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.abort('failed'));
  await page.addInitScript(() => {
    const state = window as Window & { allowRosaryEvidenceWrites?: boolean };
    state.allowRosaryEvidenceWrites = false;
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(':quangtu_practice_session_outbox_v1') && !state.allowRosaryEvidenceWrites) {
        throw new DOMException('Storage is temporarily full', 'QuotaExceededError');
      }
      save.call(this, key, value);
    };
  });
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  const tap = page.getByRole('button', { name: 'Niệm một hạt', exact: true });
  await tap.click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
  expect(await page.evaluate(() => Number(localStorage.getItem('quangtu_principal_v1:anonymous:tt_rosary_count') || 0))).toBe(0);
  await page.evaluate(() => { (window as Window & { allowRosaryEvidenceWrites?: boolean }).allowRosaryEvidenceWrites = true; });
  await page.waitForTimeout(450);
  await tap.click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  const starts = await page.evaluate(() => (JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:quangtu_practice_session_outbox_v1') || '[]') as { kind: string }[]).filter(item => item.kind === 'start'));
  expect(starts).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('reconnecting flushes the existing completed session once without refreshing the user session', async ({ page, baseURL }) => {
  await useNativeApiWithLocalBackend(page);
  const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
  const session = {
    authenticated: true,
    user: { id: 'rosary-retry-member', email: 'qa@example.test', displayName: 'Rosary Member', avatarUrl: '', role: 'user' },
    csrfToken: 'rosary-retry-csrf', expiresAt: '2099-01-01T00:00:00Z',
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let online = false, sessionReads = 0, failedAttempts = 0;
  const sent: string[] = [];
  await page.route('**/api/**', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...headers,
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': route.request().headers()['access-control-request-headers'] || 'content-type,x-csrf-token',
      } });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') { sessionReads++; return route.fulfill({ headers, json: session }); }
    if (path.startsWith('/api/practice/sessions') && route.request().method() === 'POST') {
      if (!online) { failedAttempts++; return route.abort('internetdisconnected'); }
      sent.push(path);
      const completed = path.endsWith('/complete');
      const id = completed ? decodeURIComponent(path.split('/').at(-2)!) : route.request().postDataJSON().clientSessionId;
      return route.fulfill({ headers, json: { contributionsAdded: 0, session: {
        clientSessionId: id, status: completed ? 'completed' : 'active', verificationResult: completed ? 'accepted' : null,
      } } });
    }
    return route.fulfill({ headers, json: path === '/api/presence' ? { enabled: false, activeCount: 0 } : [] });
  });
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/');
  await expect(page.locator('.greeting-name')).toHaveText('Rosary Member');
  await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('link', { name: 'Tu tập', exact: true }).click();
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
  await expect.poll(() => failedAttempts).toBeGreaterThan(0);
  const queueKey = 'quangtu_principal_v1:rosary-retry-member:quangtu_practice_session_outbox_v1';
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, queueKey)).toBe(2);
  // Kết thúc lượt fetch lỗi trước khi phát tín hiệu kết nối lại.
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  const initialSessionReads = sessionReads;
  online = true;
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('quangtu:online'));
    window.dispatchEvent(new CustomEvent('quangtu:online'));
  });
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, queueKey)).toBe(0);
  expect(sent.filter(path => path === '/api/practice/sessions')).toHaveLength(1);
  expect(sent.filter(path => path.endsWith('/complete'))).toHaveLength(1);
  expect(sessionReads).toBe(initialSessionReads);
  expect(errors).toEqual([]);
});
