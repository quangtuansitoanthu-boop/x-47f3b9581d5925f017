import { expect, test, type Page } from '@playwright/test';
import { loginAsMember, settleClient, TEST_MEMBER_ID } from './runtime-helpers';
import { MINDFUL_REACTION_TEMPLATES } from '../../src/lib/contracts/mindful-community';

const inboxPath = '/api/practice/mindful-notifications';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = []; errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
const notification = (id: string, kind: 'repentance' | 'good_deed' = 'repentance', nickname = 'Diệu Âm') => ({
  id, postId: `post-${id}`, kind, nickname, templateId: MINDFUL_REACTION_TEMPLATES[kind][0].id,
  text: MINDFUL_REACTION_TEMPLATES[kind][0].text, createdAt: new Date().toISOString(),
});

test('a guest opens existing reminders without requesting account notifications', async ({ page }) => {
  let reads = 0;
  await page.route(`**${inboxPath}*`, route => { reads++; return route.fulfill({ json: { enabled: true, items: [], nextCursor: null } }); });
  await page.goto('/tu-tap'); await settleClient(page);
  await page.locator('.notification-bell-btn').click();
  await expect(page.locator('.notification-popover')).toBeVisible();
  await expect(page.locator('.mindful-item')).toHaveCount(0);
  expect(reads).toBe(0);
});

for (const width of [375, 1440]) {
  test(`account notifications reuse the initial query and mark read locally at ${width}px`, async ({ page }, info) => {
    await loginAsMember(page); await page.setViewportSize({ width, height: 900 });
    let reads = 0;
    await page.route(`**${inboxPath}*`, route => { reads++; return route.fulfill({ json: { enabled: true, items: [notification('prayer'), notification('rejoice', 'good_deed', 'Minh Tâm')], nextCursor: null } }); });
    await page.goto('/tu-tap'); await settleClient(page);
    await expect.poll(() => reads).toBe(1);
    await page.locator('.notification-bell-btn').click();
    const rows = page.locator('.notification-popover .mindful-item');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Có lời cầu nguyện mới');
    await expect(rows.last()).toContainText('Có lời tùy hỷ mới');
    await page.screenshot({ path: info.outputPath('account-notifications-light.png'), animations: 'disabled' });
    await page.locator('.notification-popover .mark-all-btn').click();
    await expect(rows.filter({ has: page.locator('.item-unread-dot') })).toHaveCount(0);
    expect(reads).toBe(1);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), `quangtu_notifications_read_${TEST_MEMBER_ID}`)).toEqual(expect.arrayContaining(['mindful-reaction:prayer', 'mindful-reaction:rejoice']));
    await page.locator('.notification-popover .close-popover-btn').click();
    await page.getByRole('button', { name: 'Giao diện Sáng/Tối', exact: true }).click();
    await page.locator('.notification-bell-btn').click();
    await expect(rows).toHaveCount(2);
    await page.screenshot({ path: info.outputPath('account-notifications-dark.png'), animations: 'disabled' });
    expect(reads).toBe(1);
    await page.locator('.notification-popover .close-popover-btn').click();
    // Exercise a route remount on both layouts; the practice desktop header has no home link.
    await page.evaluate(() => {
      const link = document.createElement('a'); link.href = '/'; document.body.append(link); link.click(); link.remove();
    });
    await expect(page).toHaveURL(/\/$/u);
    await page.locator('.notification-bell-btn').click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).not.toHaveClass(/unread/u);
    expect(reads).toBe(1);
    expect(await page.locator('.notification-popover').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(false);
  });
}

test('an empty filtered notification page offers manual paging with exactly one additional GET', async ({ page }) => {
  await loginAsMember(page);
  const cursors: (string | null)[] = [];
  await page.route(`**${inboxPath}*`, route => {
    const cursor = new URL(route.request().url()).searchParams.get('after'); cursors.push(cursor);
    return route.fulfill({ json: cursor
      ? { enabled: true, items: [notification('later')], nextCursor: null }
      : { enabled: true, items: [], nextCursor: 'filtered-next' } });
  });
  await page.goto('/tu-tap'); await settleClient(page);
  await expect.poll(() => cursors.length).toBe(1);
  await page.locator('.notification-bell-btn').click();
  await expect(page.locator('.notification-more')).toBeVisible();
  expect(cursors).toEqual([null]);
  await page.locator('.notification-more').click();
  await expect(page.locator('.mindful-item')).toHaveCount(1);
  expect(cursors).toEqual([null, 'filtered-next']);
});

test('an older backend reports a friendly unavailable state and retries only on request', async ({ page }) => {
  await loginAsMember(page);
  let reads = 0;
  await page.route(`**${inboxPath}*`, route => {
    reads++;
    return reads === 1 ? route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'API không tồn tại.' } } })
      : route.fulfill({ json: { enabled: true, items: [notification('retry')], nextCursor: null } });
  });
  await page.goto('/tu-tap'); await settleClient(page);
  await page.locator('.notification-bell-btn').click();
  await expect(page.locator('.notification-load-state')).toContainText('Chưa thể tải thông báo');
  await page.locator('.notification-popover .close-popover-btn').click();
  await page.locator('.notification-bell-btn').click();
  expect(reads).toBe(1);
  await page.locator('.notification-load-state button').click();
  await expect(page.locator('.mindful-item')).toHaveCount(1);
  expect(reads).toBe(2);
});

test('offline refresh keeps cached notifications and retries only after explicit reconnect action', async ({ page }) => {
  await loginAsMember(page); await page.clock.install({ time: new Date() });
  let offline = false; let reads = 0;
  await page.route(`**${inboxPath}*`, route => {
    reads++;
    return offline ? route.abort('internetdisconnected') : route.fulfill({ json: { enabled: true, items: [notification('cached')], nextCursor: null } });
  });
  await page.goto('/tu-tap'); await settleClient(page); await expect.poll(() => reads).toBe(1);
  await page.clock.fastForward(60_001); offline = true; await page.context().setOffline(true);
  await page.locator('.notification-bell-btn').click();
  await expect(page.locator('.notification-load-state')).toContainText('Chưa thể tải thông báo');
  await expect(page.locator('.mindful-item')).toContainText('Diệu Âm');
  const failedReads = reads;
  await page.locator('.notification-popover .close-popover-btn').click(); await page.locator('.notification-bell-btn').click();
  expect(reads).toBe(failedReads);
  offline = false; await page.context().setOffline(false);
  await page.locator('.notification-load-state button').click();
  await expect(page.locator('.notification-load-state')).toHaveCount(0);
  expect(reads).toBe(failedReads + 1);
});

test('an exact reaction link preserves the current practice URL parameters', async ({ page }) => {
  await loginAsMember(page);
  const event = notification('exact');
  await page.route(`**${inboxPath}*`, route => route.fulfill({ json: { enabled: true, items: [event], nextCursor: null } }));
  await page.route('**/api/practice/mindful-posts/post-exact*', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/reactions')
    ? { enabled: true, items: [], nextCursor: null }
    : { post: { id: event.postId, kind: event.kind, nickname: 'Tôi', content: 'Bài quán chiếu riêng được chọn', createdAt: event.createdAt, reactionCount: 1, viewerReacted: false, isOwn: true, status: 'published' }, notification: event } }));
  await page.goto('/tu-tap'); await settleClient(page);
  // Kiểm tra contract gộp URL; việc giữ player/tool thật được kiểm tra trong luồng tích hợp riêng.
  await page.evaluate(() => history.replaceState(history.state, '', '/tu-tap?action=rosary&article=existing&chap=2#position'));
  await page.locator('.notification-bell-btn').click(); await page.locator('.mindful-item').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('communityReaction')).toBe('exact');
  const target = new URL(page.url());
  expect(target.searchParams.get('communityPost')).toBe('post-exact');
  expect(target.searchParams.get('action')).toBe('rosary'); expect(target.searchParams.get('article')).toBe('existing');
  expect(target.searchParams.get('chap')).toBe('2'); expect(target.hash).toBe('#position');
});

test('a late old-account response cannot enter a newly resolved account inbox', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T03:00:00Z') });
  await page.addInitScript(() => {
    const runtime = window as unknown as { CapacitorCustomPlatform: { name: string }; Capacitor: Record<string, unknown> };
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
    localStorage.setItem('quangtu_active_url', 'https://quangtu.vn');
  });
  let owner = 'a'; let release!: () => void; let reads = 0;
  const oldResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { authenticated: true, csrfToken: 'test-csrf', user: { id: owner, role: 'user', displayName: owner === 'a' ? 'Account A' : 'Account B' }, expiresAt: owner === 'a' ? '2026-11-09T03:01:30Z' : '2026-11-09T04:00:00Z' } });
    if (path === inboxPath) {
      reads++; const captured = owner;
      if (captured === 'a') await oldResponse;
      await route.fulfill({ json: { enabled: true, items: [notification(captured, 'repentance', captured === 'a' ? 'Private old nickname A' : 'Current nickname B')], nextCursor: null } }).catch(() => {});
      return;
    }
    return route.fulfill({ json: path === '/api/presence' ? { enabled: false, activeCount: 0 } : [] });
  });
  await page.goto('/'); await expect(page.locator('.greeting-name')).toHaveText('Account A');
  await expect.poll(() => reads).toBe(1);
  owner = 'b'; await page.clock.fastForward(90_001);
  await expect(page.locator('.greeting-name')).toHaveText('Account B');
  await expect.poll(() => reads).toBe(2);
  release(); await page.locator('.notification-bell-btn').click();
  await expect(page.locator('.mindful-item')).toContainText('Current nickname B');
  await expect(page.locator('.notification-popover')).not.toContainText('Private old nickname A');
  expect(reads).toBe(2);
});
