import { expect, type Page, type Route } from '@playwright/test';

const baseUrl = process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787';
export const TEST_MEMBER_ID = 'e2e-member';

/** Exercise native revalidation while every backend request stays on the local fixture. */
export async function useNativeApiWithLocalBackend(page: Page, locale: 'vi' | 'en' = 'vi') {
  const origin = new URL(baseUrl).origin;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
  const cors = {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
  };
  const fetchLocal = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    expect([origin, 'https://quangtu.vn']).toContain(url.origin);
    expect(url.pathname.startsWith('/api/')).toBe(true);
    const cookies = await page.context().cookies(origin);
    const headers = { ...request.headers(), origin, host: new URL(origin).host, 'sec-fetch-site': 'same-origin',
      cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join(';') };
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}`, headers, maxRedirects: 0 });
    return { response, headers: { ...response.headers(), ...cors } };
  };
  await page.addInitScript(locale => {
    const runtime = window as unknown as { CapacitorCustomPlatform: { name: string }; Capacitor: Record<string, unknown> };
    runtime.CapacitorCustomPlatform = { name: 'ios' };
    runtime.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
    localStorage.setItem('tutam_locale', locale);
    localStorage.setItem('quangtu_active_url', 'https://quangtu.vn');
  }, locale);
  await page.route(url => /^https?:$/u.test(url.protocol) && url.origin !== origin, async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://quangtu.vn' || !url.pathname.startsWith('/api/')) {
      await route.abort('blockedbyclient');
      return;
    }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...cors,
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': route.request().headers()['access-control-request-headers'] || 'content-type,x-csrf-token',
      } });
      return;
    }
    await route.fulfill(await fetchLocal(route));
  });
  return fetchLocal;
}

export async function beginScriptureCopying(page: Page): Promise<void> {
  await page.getByTestId('start-copying').click();
  await expect(page.getByTestId('copying-preparation')).toBeVisible();
  await expect(page.locator('#copy-text')).toHaveCount(0);
  await page.getByTestId('confirm-copying-guide').click();
}

export async function loginAsMember(page: Page): Promise<void> {
  const policy = sessionCookiePolicy(baseUrl);
  await page.context().addCookies([{
    name: policy.name, value: 'e2e-member-session-token', url: baseUrl,
    httpOnly: true, secure: policy.secure, sameSite: 'Lax',
  }]);
}

// Mirrors resolveAuthCookiePolicy: an HTTP loopback origin issues the host-only
// non-Secure cookie, every other origin keeps the `__Host-*; Secure` cookie.
// Only the matching cookie may be seeded — declaring a `__Host-` cookie over
// plain HTTP makes Chromium reject the whole addCookies batch.
function sessionCookiePolicy(origin: string): { name: string; secure: boolean } {
  const url = new URL(origin);
  const loopback = url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '[::1]'
    || url.hostname === '::1';
  return url.protocol === 'http:' && loopback
    ? { name: 'quangtu_session', secure: false }
    : { name: '__Host-quangtu_session', secure: true };
}

export async function settleClient(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(document.querySelector('[data-mounted="1"]')));
  await page.waitForTimeout(200);
}

/** Explicitly choose online reading; cached offline copies open without this prompt. */
export async function choosePdfOnline(page: Page): Promise<void> {
  const choice = page.getByRole('button', { name: 'Đọc online', exact: true });
  await expect.poll(async () => await choice.isVisible()
    || await page.locator('.pdf-page canvas[data-rendered]').first().isVisible()).toBe(true);
  if (await choice.isVisible()) await choice.click();
  await expect(page.locator('.pdf-page canvas[data-rendered]').first()).toBeVisible();
}

export async function openReaderTools(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Công cụ', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}

export async function startPdfOfflineDownload(page: Page): Promise<void> {
  await openReaderTools(page);
  await page.locator('.pdf-offline-main-btn').click();
  await page.getByRole('button', { name: 'Tải về máy', exact: true }).click();
}

export async function savePdfOffline(page: Page) {
  await startPdfOfflineDownload(page);
  await expect(page.locator('.pdf-offline-main-btn')).toContainText('Đã tải offline', { timeout: 20_000 });
  await openReaderTools(page);
  await page.locator('.pdf-offline-main-btn').click();
  const manager = page.getByRole('region', { name: 'Quản lý PDF ngoại tuyến', exact: true });
  await expect(manager).toBeVisible();
  return manager;
}

export async function logoutThroughAccount(page: Page): Promise<void> {
  await page.goto('/ca-nhan?tab=account');
  await settleClient(page);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  const logout = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/logout' && response.request().method() === 'POST');
  await page.getByRole('alertdialog', { name: 'Xác nhận đăng xuất' }).getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  expect((await logout).status()).toBe(200);
  await expect(page).toHaveURL('/');
  await settleClient(page);
  expect(await (await page.request.get('/api/session', { headers: { 'cache-control': 'no-store' } })).json()).toMatchObject({ authenticated: false });
}

export async function loginAsAdmin(
  page: Page,
  rawToken = 'e2e-google-admin-session-token',
): Promise<void> {
  const policy = sessionCookiePolicy(baseUrl);
  await page.context().addCookies([{
    name: policy.name,
    value: rawToken,
    url: baseUrl,
    httpOnly: true,
    secure: policy.secure,
    sameSite: 'Lax',
  }]);
  await page.goto('/');
  await settleClient(page);
  const response = await page.request.get('/api/session');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ authenticated: true, user: { role: 'admin' } });
}
