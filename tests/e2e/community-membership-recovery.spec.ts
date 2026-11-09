import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test('community joining exposes errors, retries, and updates membership exactly once', async ({ page, baseURL }) => {
  const session = { authenticated: true, user: { id: 'e2e-member', email: 'qa@example.test', displayName: 'Thành viên thử nghiệm', avatarUrl: '', role: 'user' }, csrfToken: 'qa-server-csrf', expiresAt: '2099-01-01T00:00:00Z' };
  await loginAsMember(page);
  await useNativeApiWithLocalBackend(page);
  const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
  const campaign = { id: 'qa-goal', title: 'Mục tiêu thử nghiệm', description: '', metric: 'count', goalValue: 100, contributionValue: 0, memberCount: 7, joined: false, status: 'active', startsAt: '2026-01-01', endsAt: '2099-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  let attempts = 0;
  const reads: Record<string,number> = {};
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...headers,
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': route.request().headers()['access-control-request-headers'] || 'content-type,x-csrf-token',
      } });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET' && ['/api/practice/campaigns','/api/practice/leaderboard','/api/practice/progress'].includes(path)) reads[path] = (reads[path] ?? 0) + 1;
    let body: unknown = {};
    let status = 200;
    if (path === '/api/session') body = session;
    else if (path === '/api/practice/campaigns') body = { enabled: true, campaigns: [campaign] };
    else if (path === '/api/practice/leaderboard') body = { enabled: true, generatedAt: '2026-10-22', metric: { key: 'count', windowDays: 30, description: 'Kiểm thử' }, ranking: [] };
    else if (path === '/api/practice/progress') body = { profile: { leaderboardOptIn: false, presenceOptIn: false, selectedBadge: null, timeZone: 'Asia/Ho_Chi_Minh' }, heatmap: [], streaks: { current: 0, longest: 0 }, badges: [], totals: { acceptedCount: 0, acceptedDurationSeconds: 0, sessions: 0 }, breakdown: [], today: '2026-10-22' };
    else if (path === '/api/practice/campaigns/qa-goal/join') {
      expect(route.request().headers()['x-csrf-token']).toBe('qa-server-csrf');
      attempts += 1;
      status = attempts === 1 ? 503 : 200;
      body = attempts === 1 ? { error: { message: 'Máy chủ đang bận, vui lòng thử lại.' } } : { joined: true };
    } else if (path === '/api/talks') body = [];
    await route.fulfill({ status, headers, json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const sessionReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
  await page.goto('/tien-do-tu-tap');
  expect(await (await sessionReady).json()).toMatchObject({ authenticated: true, user: { id: 'e2e-member' } });
  await settleClient(page);
  const card = page.locator('.practice-campaigns article').filter({ hasText: campaign.title });
  const join = card.getByRole('button', { name: `Tham gia chiến dịch ${campaign.title}`, exact: true });
  // Native startup revalidates its remembered owner. Each principal has
  // its own campaign cache; membership mutations must not refetch either.
  expect(reads['/api/practice/campaigns']).toBeGreaterThanOrEqual(1);
  expect(reads['/api/practice/campaigns']).toBeLessThanOrEqual(2);
  expect(reads['/api/practice/leaderboard']).toBe(1);
  expect(reads['/api/practice/progress']).toBe(1);
  const initialReads = { ...reads };
  await join.click();
  await expect(page.getByRole('alert')).toContainText('Máy chủ đang bận');
  await expect(card).toContainText('7 thành viên');
  await join.click();
  await expect(card.getByRole('button', { name: `Rời chiến dịch ${campaign.title}`, exact: true })).toBeVisible();
  await expect(card).toContainText('8 thành viên');
  expect(attempts).toBe(2);
  expect(reads).toEqual(initialReads);
  await page.getByRole('navigation', { name:'Điều hướng nhanh' }).getByRole('link', { name:'Tu tập', exact:true }).click();
  await page.locator('.tt-mode-card--community').click();
  await expect(page.locator('.practice-campaigns article').filter({ hasText:campaign.title })).toContainText('8 thành viên');
  expect(reads).toEqual(initialReads);
});
