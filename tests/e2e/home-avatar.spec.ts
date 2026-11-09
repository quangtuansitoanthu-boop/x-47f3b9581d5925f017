import { expect, test } from '@playwright/test';
import { loginAsMember, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const locale of ['vi', 'en'] as const) for (const provider of ['google', 'facebook']) {
  test(`${provider} photo survives verified session refresh on the home greeting (${locale})`, async ({ page, baseURL }) => {
    const avatarUrl = provider === 'google' ? 'https://lh3.googleusercontent.com/qa-avatar' : 'https://platform-lookaside.fbsbx.com/qa-avatar';
    await loginAsMember(page);
    const verified = await (await page.request.get('/api/session')).json();
    expect(verified).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
    await useNativeApiWithLocalBackend(page, locale);
    const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
    const session = { ...verified, user: { ...verified.user, displayName: 'Avatar QA', avatarUrl } };
    await page.setViewportSize({ width: 390, height: 844 });
    let sessions = 0;
    let includeAvatar = true;
    await page.route('**/api/session', route => {
      sessions++;
      const user = includeAvatar
        ? (provider === 'facebook' ? { ...session.user, avatarUrl: '', picture: { data: { url: avatarUrl } } } : session.user)
        : { ...session.user, avatarUrl: '' };
      return route.fulfill({ headers, json: { ...session, user } });
    });
    await page.route(avatarUrl, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#167c70"/><circle cx="40" cy="30" r="14" fill="#fff"/><path d="M15 78q0-34 25-34t25 34" fill="#fff"/></svg>' }));
    await page.goto('/');
    const photo = page.locator('.greeting-avatar .avatar-photo');
    await expect(photo).toHaveAttribute('src', avatarUrl);
    await expect.poll(() => photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    includeAvatar = false;
    await page.reload();
    await expect(photo).toHaveAttribute('src', avatarUrl);
    await expect(page.locator('.greeting-avatar .avatar-lotus')).toHaveCount(0);
    expect(sessions).toBe(2);
    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('tutam_native_session') || 'null'));
    expect(cached).toMatchObject({ authenticated: true, user: { id: verified.user.id, avatarUrl } });
    expect(Object.keys(cached).sort()).toEqual(['authenticated', 'expiresAt', 'user']);
    expect(typeof verified.csrfToken).toBe('string');
    expect(JSON.stringify(cached)).not.toContain(verified.csrfToken);
    expect(JSON.stringify(cached)).not.toContain('e2e-member-session-token');
  });
}

test('home avatar stays scoped to the verified account and clears on logout', async ({ page, baseURL }) => {
  const avatarUrl = 'https://lh3.googleusercontent.com/account-a-avatar';
  await loginAsMember(page);
  const verified = await (await page.request.get('/api/session')).json();
  expect(verified).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
  await useNativeApiWithLocalBackend(page);
  const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
  const first = { ...verified, user: { ...verified.user, displayName: 'Account A', avatarUrl } };
  const second = { ...first, user: { ...first.user, id: 'avatar-b', displayName: 'B Account', avatarUrl: '' } };
  const guest = { authenticated: false, user: null, csrfToken: null, expiresAt: null };
  let activeSession = first;
  await page.route('**/api/session', route => route.fulfill({ headers, json: activeSession }));
  await page.route(avatarUrl, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="22"/></svg>' }));
  await page.goto('/');
  await expect(page.locator('.greeting-avatar .avatar-photo')).toHaveAttribute('src', avatarUrl);
  activeSession = second;
  await page.reload();
  await expect(page.locator('.greeting-avatar .avatar-initial')).toHaveText('B');
  await expect(page.locator('.greeting-avatar .avatar-photo')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tutam_native_session') || 'null')?.user?.id)).toBe('avatar-b');
  activeSession = guest;
  await page.context().clearCookies();
  await page.reload();
  await expect(page.locator('.greeting-avatar .avatar-lotus')).toHaveCount(1);
  await expect(page.locator('.greeting-avatar .avatar-photo')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('tutam_native_session'))).toBeNull();
});

test('an unavailable provider photo keeps the account identity without showing the lotus', async ({ page, baseURL }) => {
  const avatarUrl = 'https://platform-lookaside.fbsbx.com/unavailable-avatar';
  await loginAsMember(page);
  const verified = await (await page.request.get('/api/session')).json();
  expect(verified).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
  await useNativeApiWithLocalBackend(page);
  const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
  await page.route('**/api/session', route => route.fulfill({ headers, json: { ...verified,
    user: { ...verified.user, displayName: 'Avatar QA', avatarUrl } } }));
  await page.route(avatarUrl, route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await expect(page.locator('.greeting-avatar .avatar-initial')).toHaveText('A');
  await expect(page.locator('.greeting-avatar .avatar-photo')).toHaveCount(0);
  await expect(page.locator('.greeting-avatar .avatar-lotus')).toHaveCount(0);
});
