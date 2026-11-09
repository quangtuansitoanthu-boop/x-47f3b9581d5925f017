import { expect, test } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

test.describe('Facebook login and import management', () => {
  test('rejects malformed browser handoffs and cross-origin redemption without a session cookie', async ({ request }) => {
    const start = await request.get('/api/auth/facebook/native?challenge=invalid', { maxRedirects: 0 });
    expect(start.status()).toBe(400);
    expect(start.headers()['set-cookie']).toBeUndefined();
    const invalidOrigin = await request.post('/api/auth/facebook/native/redeem', {
      headers: { Origin: 'https://attacker.example', 'X-CSRF-Token': 'login' },
      data: { code: 'a'.repeat(43), verifier: 'b'.repeat(64) },
    });
    expect(invalidOrigin.status()).toBe(403);
    expect(invalidOrigin.headers()['set-cookie']).toBeUndefined();
    const missingCsrf = await request.post('/api/auth/facebook/native/redeem', {
      headers: { Origin: 'http://localhost:8787' }, data: { code: 'a'.repeat(43), verifier: 'b'.repeat(64) },
    });
    expect(missingCsrf.status()).toBe(403);
    expect(missingCsrf.headers()['set-cookie']).toBeUndefined();
  });
  test('offers Facebook Login beside Google without requesting import consent', async ({ page }) => {
    await page.goto('/ca-nhan?tab=account');
    await settleClient(page);
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
    const facebook = page.getByRole('button', { name: 'Đăng nhập bằng Facebook' });
    await expect(facebook).toBeVisible();
    await expect(page.getByText('user_posts')).toHaveCount(0);
  });

  test('shows the dark-launched admin connector and ledger safely', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/settings');
    await settleClient(page);

    const facebook = page.locator('.facebook-import-settings');
    await expect(facebook.getByRole('heading', { name: 'Facebook' })).toBeVisible();
    await expect(facebook.getByLabel('Đường dẫn trang Facebook')).toHaveValue('https://www.facebook.com/tranan.buhd');
    await expect(facebook.getByText('Bộ nhập đang tắt')).toBeVisible();
    await expect(facebook.getByRole('button', { name: /^(?:Kết nối Facebook|Kết nối lại)$/u })).toBeDisabled();
    await expect(facebook.getByRole('table', { name: 'Sổ quản lý bài viết nhập từ Facebook' })).toBeVisible();
  });

  test('requires confirmation and preserves local edits when removing imports and disconnecting', async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    const session = await (await page.request.get('/api/session')).json();
    const headers = { 'x-csrf-token': session.csrfToken, origin: baseURL! };
    const ids = ['remove-managed', 'remove-edited', 'disconnect-managed', 'disconnect-edited'];
    const metaRequests: string[] = [];
    const mutations: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/(^|\.)facebook\.com$/u.test(url.hostname)) metaRequests.push(request.url());
      if (url.pathname.startsWith('/api/admin/facebook') && request.method() !== 'GET') {
        mutations.push(`${request.method()} ${url.pathname}`);
      }
    });
    const article = async (kind: string) => {
      const response = await page.request.get(`/api/data/baiviet?id=eq.e2e-fb-${kind}&select=*`);
      expect(response.status()).toBe(200);
      return response.json();
    };
    try {
      await page.goto('/admin/settings');
      await settleClient(page);
      const facebook = page.locator('.facebook-import-settings');
      const ledger = facebook.getByRole('table', { name: 'Sổ quản lý bài viết nhập từ Facebook' });
      for (const kind of ids) await expect(ledger.getByRole('row').filter({ hasText: `local-${kind}` })).toBeVisible();

      for (const kind of ['remove-managed', 'remove-edited']) {
        const row = ledger.getByRole('row').filter({ hasText: `local-${kind}` });
        const before = await article(kind);
        const beforeMutations = mutations.length;
        await row.getByRole('button', { name: 'Xóa', exact: true }).click();
        const confirmation = page.locator('dialog[data-app-message]');
        await expect(confirmation).toContainText('Bài đã chỉnh sửa được giữ lại');
        await confirmation.getByRole('button', { name: 'Hủy', exact: true }).click();
        await expect(confirmation).toHaveCount(0);
        await expect(row).toBeVisible();
        expect(await article(kind)).toEqual(before);
        expect(mutations).toHaveLength(beforeMutations);

        const removed = page.waitForResponse((response) => response.url().endsWith(`/e2e-fb-import-${kind}/remove`)
          && response.request().method() === 'POST');
        await row.getByRole('button', { name: 'Xóa', exact: true }).click();
        await expect(confirmation).toContainText('Bài đã chỉnh sửa được giữ lại');
        await confirmation.getByRole('button', { name: 'Đồng ý', exact: true }).click();
        await expect(confirmation).toHaveCount(0);
        expect((await removed).status()).toBe(200);
        await expect(row).toHaveCount(0);
        expect(await article(kind)).toEqual(kind.endsWith('edited') ? before : []);
      }

      const beforeEdited = await article('disconnect-edited');
      const beforeManaged = await article('disconnect-managed');
      const beforeDisconnect = mutations.length;
      await facebook.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
      const disconnectConfirmation = page.locator('dialog[data-app-message]');
      await expect(disconnectConfirmation).toContainText('Ngắt kết nối và xóa dữ liệu Facebook chưa chỉnh sửa?');
      await disconnectConfirmation.getByRole('button', { name: 'Hủy', exact: true }).click();
      await expect(disconnectConfirmation).toHaveCount(0);
      await expect(ledger.getByRole('row').filter({ hasText: 'local-disconnect-managed' })).toBeVisible();
      expect(await article('disconnect-managed')).toEqual(beforeManaged);
      expect(mutations).toHaveLength(beforeDisconnect);

      const disconnected = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/facebook'
        && response.request().method() === 'DELETE');
      await facebook.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
      await expect(disconnectConfirmation).toContainText('Ngắt kết nối và xóa dữ liệu Facebook chưa chỉnh sửa?');
      await disconnectConfirmation.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await expect(disconnectConfirmation).toHaveCount(0);
      expect((await disconnected).status()).toBe(204);
      await expect(facebook.getByText('Chưa có bài viết Facebook nào được nhập.')).toBeVisible();
      expect(await article('disconnect-managed')).toEqual([]);
      expect(await article('disconnect-edited')).toEqual(beforeEdited);
      await page.reload();
      await settleClient(page);
      await expect(facebook.getByText('Chưa có bài viết Facebook nào được nhập.')).toBeVisible();
      const state = await (await page.request.get('/api/admin/facebook')).json();
      expect(state.imports).toEqual([]);
      expect(metaRequests).toEqual([]);
    } finally {
      // The standard disposable harness is the only fixture reset mechanism.
      // Never touch unrelated article rows or create a production test endpoint.
      for (const kind of ids) {
        const response = await page.request.delete(`/api/data/baiviet?id=eq.e2e-fb-${kind}`, { headers });
        expect(response.ok()).toBe(true);
      }
    }
  });
});
