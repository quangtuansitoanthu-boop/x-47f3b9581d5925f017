import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import bundledManifest from '../../src/lib/data/english-pack-manifest.json' with { type: 'json' };
import bundledRituals from '../../src/lib/data/bundled-english-rituals.json' with { type: 'json' };
import { useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }, info) => {
  if (info.title === 'notification bell follows the restored principal and clears private items when the session expires') {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

for (const mode of ['denied', 'missing'] as const) {
  test(`feedback copying reports ${mode} clipboard without false success`, async ({ page }) => {
    await page.addInitScript(mode => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'missing' ? undefined : {
        writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); }
      } });
    }, mode);
    await page.goto('/ca-nhan?tab=feedback');
    await page.getByRole('button', { name: 'Gửi Email', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Soạn Thư Góp Ý' });
    await dialog.getByLabel('Nội dung góp ý:').fill('QA local draft');
    await dialog.getByRole('button', { name: 'Sao chép thư', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Không thể sao chép thư');
    await expect(dialog.getByRole('button', { name: 'Đã sao chép ✓', exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('Nội dung góp ý:')).toHaveValue('QA local draft');
  });
}

test('feedback copying waits for the clipboard and preserves the composed text', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.qaClipboard = text; }
    } });
  });
  await page.goto('/ca-nhan?tab=feedback');
  await page.getByRole('button', { name: 'Gửi Email', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Soạn Thư Góp Ý' });
  await dialog.getByLabel('Nội dung góp ý:').fill('QA local draft');
  await dialog.getByRole('button', { name: 'Sao chép thư', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Đã sao chép ✓', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.qaClipboard)).toContain('QA local draft');
});

test('a late clipboard rejection does not affect the reopened feedback dialog', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => {
        if (++calls === 1) await new Promise<void>((_resolve, reject) => {
          window.addEventListener('qa:reject-clipboard', () => reject(new DOMException('Denied', 'NotAllowedError')), { once: true });
        });
      }
    } });
  });
  await page.goto('/ca-nhan?tab=feedback');
  const open = page.getByRole('button', { name: 'Gửi Email', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Soạn Thư Góp Ý' });
  const copy = dialog.getByRole('button', { name: 'Sao chép thư', exact: true });
  await copy.click();
  await expect(copy).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Đã sao chép ✓' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await open.click();
  await copy.click();
  await page.evaluate(() => window.dispatchEvent(new Event('qa:reject-clipboard')));
  await expect(dialog.getByRole('button', { name: 'Đã sao chép ✓', exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('Phap Bao rejects malformed saved lines without crashing or overwriting the original', async ({ page }) => {
  const raw = JSON.stringify({ selectedTitleKind: 'dia_tang', lines: [null, 9, {}] });
  await page.addInitScript(raw => localStorage.setItem('tutam_phap_bao_draft_v1', raw), raw);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Root registers the modal listener synchronously in onMount. Its rendered
  // marker avoids depending on a session request that may already be cached.
  await page.goto('/ca-nhan?tab=account');
  await expect(page.locator('[data-mounted="1"]')).toBeVisible();
  await page.getByRole('button', { name: /Thỉnh Kinh & Pháp bảo Miễn Phí/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Thỉnh Kinh & Pháp Bảo Gieo Duyên' });
  await expect(dialog.getByRole('alert').filter({ hasText: 'Không đọc được bản chép đã lưu' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Bắt đầu chép 108 lần ›' })).toBeDisabled();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tutam_phap_bao_draft_v1'))).toBe(raw);
});

test('the feedback address copy also reports a denied clipboard', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); }
  } }));
  await page.goto('/ca-nhan?tab=feedback');
  const channel = page.locator('.cn-channel-email');
  await channel.getByRole('button', { name: 'Sao chép', exact: true }).click();
  await expect(channel.getByRole('alert')).toContainText('Không thể sao chép email');
  await expect(channel.getByRole('button', { name: 'Đã chép ✓', exact: true })).toHaveCount(0);
});

test('notification bell follows the restored principal and clears private items when the session expires', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'quangtu_session', value: 'e2e-google-admin-session-token', url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
  const verified = await (await page.request.get('/api/session')).json();
  expect(verified.authenticated).toBe(true);
  await page.clock.install({ time: new Date('2026-10-25T05:00:00Z') });
  await useNativeApiWithLocalBackend(page);
  const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
  let sessions = 0;
  let notifications = 0;
  let presenceRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/presence') presenceRequests++; });
  await page.route('**/api/session', route => route.request().method() === 'OPTIONS' ? route.fallback() : route.fulfill({ headers, json: ++sessions === 1
    ? { ...verified, expiresAt: '2026-10-25T04:59:59Z' }
    : { authenticated: false, user: null, csrfToken: null, expiresAt: null } }));
  await page.route('**/api/admin/notifications', route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    notifications++;
    return route.fulfill({ headers, json: { total: 1, notifications: [{
      id: 'qa-private-admin', type: 'pending_article', level: 'info', badge: 'QA',
      title: 'QA private notification', message: 'Synthetic admin item',
      timestamp: '2026-10-25T05:00:00Z', link: '/admin/books'
    }] } });
  });
  await page.goto('/ca-nhan?tab=account');
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();
  await expect.poll(() => notifications).toBe(1);
  await page.locator('.notification-bell-btn').click();
  await expect(page.getByText('QA private notification', { exact: true })).toBeVisible();
  expect(notifications).toBe(1);
  await page.context().clearCookies();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
  await expect(page.locator('.notification-popover')).toHaveCount(0);
  await page.locator('.notification-bell-btn').click();
  await expect(page.getByText('QA private notification', { exact: true })).toHaveCount(0);
  expect(sessions).toBe(2);
  expect(notifications).toBeLessThanOrEqual(2);
  expect(presenceRequests).toBe(0); // Native intentionally disables presence heartbeats.
});

test('English pack saves bundled and downloaded chapters then reloads without fetching their bodies again', async ({ page }) => {
  const ritual = bundledRituals[0];
  const bundled = bundledManifest.entries.find(entry => entry.file === ritual)!;
  const bytes = Buffer.from(JSON.stringify([{ noi_dung: 'QA English chapter' }]));
  const extra = { file: 'qa-english-pack.json', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  let manifestReads = 0;
  let bodyReads = 0;
  await page.route('https://media.quangtu.vn/offline-data/english-pack-manifest.json', route => {
    manifestReads++;
    return route.fulfill({ json: { version: 'qa-pack', entries: [bundled, extra] } });
  });
  await page.route(`**/offline-data/chapters-en/${ritual}`, route => {
    bodyReads++;
    return route.fulfill({ contentType: 'application/json', body: readFileSync(`static/offline-data/chapters-en/${ritual}`) });
  });
  await page.route(`**/offline-data/chapters-en/${extra.file}`, route => {
    bodyReads++;
    return route.fulfill({ contentType: 'application/json', body: bytes });
  });
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'en'));
  await page.goto('/ca-nhan?tab=settings');
  const savedCount = () => page.evaluate(async () => (await (await caches.open('tutam-english-chapters-v2')).keys()).length);
  await expect.poll(savedCount).toBe(2);
  await expect(page.locator('.english-download')).toHaveCount(0);
  expect(bodyReads).toBe(2);
  await page.reload();
  await expect.poll(() => manifestReads).toBe(2);
  await expect(page.locator('.english-download')).toHaveCount(0);
  expect(bodyReads).toBe(2);
  expect(await savedCount()).toBe(2);
});

test('the first notification opening refreshes data if the initial read is older than thirty seconds', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'quangtu_session', value: 'e2e-google-admin-session-token', url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
  const verified = await (await page.request.get('/api/session')).json();
  expect(verified.authenticated).toBe(true);
  await page.clock.install({ time: new Date('2026-10-25T05:00:00Z') });
  await page.route('**/api/session', route => route.fulfill({ json: verified }));
  let reads = 0;
  let releaseInitialRead: () => void = () => {};
  const initialRead = new Promise<void>(resolve => { releaseInitialRead = resolve; });
  await page.route('**/api/admin/notifications', async route => {
    reads++;
    if (reads === 1) await initialRead;
    return route.fulfill({ json: { total: 1, notifications: [{ id: 'qa-fresh', type: 'pending_article', level: 'info', badge: 'QA',
      title: `QA fresh ${reads}`, message: 'Synthetic notification', timestamp: '2026-10-25T05:00:00Z', link: '/admin/books' }] } });
  });
  await page.goto('/ca-nhan?tab=account');
  await expect.poll(() => reads).toBe(1);
  const unread = async () => await page.locator('.notification-badge').count() ? Number(await page.locator('.notification-badge').innerText()) : 0;
  const initialUnread = await unread();
  releaseInitialRead();
  await expect.poll(unread).toBe(initialUnread + 1);
  await page.clock.fastForward(31_000);
  await page.locator('.notification-bell-btn').click();
  await expect(page.getByText('QA fresh 2', { exact: true })).toBeVisible();
  expect(reads).toBe(2);
});

test('Phap Bao restores an old draft, keeps editing on a failed save and sends no writes', async ({ page }) => {
  const raw = JSON.stringify({ selectedTitleKind: 'a_di_da', lines: ['NAM MÔ A DI ĐÀ PHẬT'] });
  await page.addInitScript(raw => {
    localStorage.setItem('tutam_phap_bao_draft_v1', raw);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'tutam_phap_bao_draft_v1') throw new DOMException('Full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  }, raw);
  let reads = 0;
  const writes: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/phap-bao') reads++;
    if (request.method() !== 'GET' && request.url().includes('/api/phap-bao')) writes.push(request.url());
  });
  await page.goto('/ca-nhan?tab=account');
  await expect(page.locator('[data-mounted="1"]')).toBeVisible();
  await page.getByRole('button', { name: /Thỉnh Kinh & Pháp bảo Miễn Phí/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Thỉnh Kinh & Pháp Bảo Gieo Duyên' });
  await expect(dialog.getByRole('radio').filter({ hasText: 'A DI ĐÀ PHẬT' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Bắt đầu chép 108 lần ›' }).click();
  await expect(page.locator('#pb-line-input-0')).toHaveValue('NAM MÔ A DI ĐÀ PHẬT');
  await page.locator('#pb-line-input-1').fill('Nam mô');
  await expect(dialog.getByRole('alert')).toContainText('Không thể lưu bản chép');
  await expect(page.locator('#pb-line-input-1')).toHaveValue('NAM MÔ');
  expect(reads).toBe(1);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tutam_phap_bao_draft_v1'))).toBe(raw);
});
