import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { NATIVE_BACKEND_STORAGE_KEY, normalizeNativeBackendOrigin } from '../../src/lib/browser/native-backend-origin';

interface NativeHttpTestRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: unknown;
}

test('native admin can lock and unlock members while content management stays read-only', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const requests: NativeHttpTestRequest[] = [];
    Object.assign(window, {
      androidBridge: {},
      nativeMemberHttpRequests: requests,
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        PluginHeaders: [{ name: 'CapacitorHttp', methods: [{ name: 'request', rtype: 'promise' }] }],
        // Native PATCH đi qua bridge thật; fetch chỉ là transport do trình duyệt kiểm thử giả lập.
        nativePromise: async (plugin: string, method: string, options: NativeHttpTestRequest) => {
          if (plugin !== 'CapacitorHttp' || method !== 'request') throw new Error(`Unexpected native call: ${plugin}.${method}`);
          requests.push(options);
          const target = new URL(options.url);
          const response = await fetch(`${target.pathname}${target.search}`, {
            method: options.method,
            headers: options.headers,
            body: options.data === undefined ? undefined : JSON.stringify(options.data),
          });
          return { status: response.status, headers: Object.fromEntries(response.headers.entries()), data: await response.json() };
        },
      },
    });
    localStorage.setItem('tutam_locale', 'vi');
  });
  const member = { kind: 'member', accountType: 'member', id: 'member', name: 'Thành viên kiểm thử', email: null, username: null, role: 'user', status: 'active', suspendedAt: null, avatarUrl: null, createdAt: null, updatedAt: null, isSelf: false };
  const writes: unknown[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: {
      authenticated: true, user: { id: 'admin', role: 'admin', displayName: 'Quản trị', email: '', avatarUrl: '' },
      csrfToken: 'test-csrf', expiresAt: '2099-01-01T00:00:00.000Z',
    } });
    if (path === '/api/admin/members') return route.fulfill({ json: { members: [member, { ...member, id: 'admin', name: 'Quản trị', accountType: 'admin', role: 'admin', isSelf: true }] } });
    if (path === '/api/admin/members/member' && request.method() === 'PATCH') {
      const body = request.postDataJSON(); writes.push(body); member.status = body.status;
      return route.fulfill({ json: { member } });
    }
    if (path === '/api/practice/campaigns') return route.fulfill({ json: { enabled: true, campaigns: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/admin/members'); await settleClient(page);
  await expect(page.getByRole('heading', { name: 'Thành viên', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chỉnh sửa', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xoá', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Khoá', exact: true })).toHaveCount(1);
  const lockBounds = await page.getByRole('button', { name: 'Khoá', exact: true }).boundingBox();
  expect(lockBounds!.width).toBeGreaterThanOrEqual(44);
  expect(lockBounds!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Khoá', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận khoá tài khoản', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở khoá', exact: true }).click();
  await page.getByRole('button', { name: 'Mở khoá ngay', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toEqual([{ status: 'suspended' }, { status: 'active' }]);
  const nativeRequests = await page.evaluate(() =>
    (window as unknown as { nativeMemberHttpRequests: NativeHttpTestRequest[] }).nativeMemberHttpRequests);
  const nativeBackendOrigin = normalizeNativeBackendOrigin(
    await page.evaluate(key => localStorage.getItem(key), NATIVE_BACKEND_STORAGE_KEY));
  expect(nativeRequests).toHaveLength(2);
  for (const request of nativeRequests) {
    expect(new URL(request.url).origin).toBe(nativeBackendOrigin);
    expect(new URL(request.url).pathname).toBe('/api/admin/members/member');
    expect(request.method).toBe('PATCH');
    expect(request.headers).toMatchObject({ origin: 'https://quangtu.vn', 'x-csrf-token': 'test-csrf' });
  }
  await page.screenshot({ path: testInfo.outputPath('native-admin-members.png'), fullPage: true });
  for (const path of ['/admin/books?mode=create', '/admin/tu-tap', '/admin/phap-thoai', '/admin/practice']) {
    await page.goto(path); await settleClient(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Thêm bài viết|Tạo bài tu tập|Tạo album|Tạo chiến dịch)$/u })).toHaveCount(0);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  }
});
