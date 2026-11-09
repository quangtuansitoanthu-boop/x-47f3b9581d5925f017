import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { LOCAL_ONLY_PROXY } from './global-network-guard';
import { loginAsAdmin, loginAsMember, settleClient } from './runtime-helpers';

test('local D1 delivers prayers and rejoicing only to the post owner, without duplicate notifications', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90_000);
  const origin = new URL(baseURL!).origin;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tt_reflection_guide_seen_v1', '1');
  });
  await loginAsMember(page);
  const sender = await browser.newContext({ baseURL, proxy: LOCAL_ONLY_PROXY });
  try {
    const senderPage = await sender.newPage();
    await loginAsAdmin(senderPage);
    const csrf = async (request: APIRequestContext) => {
      const response = await request.get('/api/session');
      expect(response.ok()).toBe(true);
      const session = await response.json();
      expect(session.authenticated).toBe(true);
      return { origin, 'x-csrf-token': session.csrfToken };
    };
    const recipientHeaders = await csrf(page.request);
    const senderHeaders = await csrf(sender.request);
    const posts: Array<{ id: string; kind: string; content: string }> = [];
    for (const kind of ['repentance', 'good_deed'] as const) {
      const content = `${kind === 'repentance' ? 'Bài sám hối kiểm thử' : 'Việc thiện kiểm thử'} ${'chánh niệm '.repeat(30)}`;
      const response = await page.request.post('/api/practice/mindful-posts', {
        headers: recipientHeaders,
        data: { clientPostId: randomUUID(), kind, nickname: 'Đồng Tu Nhận Lời', content },
      });
      expect(response.ok(), await response.text()).toBe(true);
      const { post } = await response.json();
      posts.push(post);
    }
    const prayers = { nickname: 'Đồng Tu Cầu Nguyện', templateId: 'tam-bao' };
    const rejoicing = { nickname: 'Đồng Tu Tùy Hỷ', templateId: 'hoan-hy' };
    for (const [index, body] of [prayers, rejoicing].entries()) {
      const response = await sender.request.post(`/api/practice/mindful-posts/${posts[index].id}/reactions`, { headers: senderHeaders, data: body });
      expect(response.ok(), await response.text()).toBe(true);
    }
    const repeated = await sender.request.post(`/api/practice/mindful-posts/${posts[0].id}/reactions`, { headers: senderHeaders, data: prayers });
    expect(repeated.ok()).toBe(true);
    const inbox = await page.request.get('/api/practice/mindful-notifications');
    expect(inbox.ok()).toBe(true);
    const received = (await inbox.json()).items.filter((item: { postId: string }) => posts.some(post => post.id === item.postId));
    expect(received).toHaveLength(2);
    expect(new Set(received.map((item: { id: string }) => item.id)).size).toBe(2);
    const senderInbox = await sender.request.get('/api/practice/mindful-notifications');
    expect(senderInbox.ok()).toBe(true);
    expect((await senderInbox.json()).items.some((item: { postId: string }) => posts.some(post => post.id === item.postId))).toBe(false);

    // Setup uses real local D1; the browser budget starts with the recipient UI.
    const requests: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/practice/mindful-')) requests.push(path);
    });
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/practice/mindful-notifications');
    await page.goto('/tu-tap');
    await settleClient(page); await loaded;
    await page.locator('.notification-bell-btn').click();
    const prayerItem = page.locator('.notification-item').filter({ hasText: prayers.nickname });
    const rejoiceItem = page.locator('.notification-item').filter({ hasText: rejoicing.nickname });
    await expect(prayerItem).toHaveCount(1);
    await expect(rejoiceItem).toHaveCount(1);
    await expect(prayerItem).toHaveClass(/unread/u);
    await page.locator('.notification-popover').screenshot({ path: info.outputPath('received-account-notifications.png'), animations: 'disabled' });
    expect(requests.filter(path => path === '/api/practice/mindful-notifications')).toHaveLength(1);

    let prayerUrl = '';
    for (const [index, nickname] of [prayers.nickname, rejoicing.nickname].entries()) {
      if (index) await page.locator('.notification-bell-btn').click();
      await page.locator('.notification-item').filter({ hasText: nickname }).click();
      const dialog = page.locator('dialog.mindful-reactions');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.target-post')).toContainText(posts[index].content);
      await expect(dialog).toContainText(nickname);
      expect(new URL(page.url()).searchParams.get('communityPost')).toBe(posts[index].id);
      if (!index) prayerUrl = page.url();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page).not.toHaveURL(/communityPost=/u);
    }
    expect(requests.filter(path => path === '/api/practice/mindful-notifications')).toHaveLength(1);
    const beforeRead = requests.length;
    await page.locator('.notification-bell-btn').click();
    await expect(page.locator('.notification-item').filter({ hasText: prayers.nickname })).not.toHaveClass(/unread/u);
    await expect(page.locator('.notification-item').filter({ hasText: rejoicing.nickname })).not.toHaveClass(/unread/u);
    expect(requests).toHaveLength(beforeRead);
    await page.locator('.close-popover-btn').click();

    const removed = await page.request.delete(`/api/practice/mindful-posts/${posts[0].id}`, { headers: recipientHeaders });
    expect(removed.ok()).toBe(true);
    await page.goto(prayerUrl);
    await expect(page.locator('dialog.mindful-reactions [role=alert]')).toHaveText('Bài chia sẻ không còn khả dụng hoặc không thuộc tài khoản hiện tại.');
    await expect(page.locator('dialog.mindful-reactions .target-post')).toHaveCount(0);
  } finally { await sender.close(); }
});
