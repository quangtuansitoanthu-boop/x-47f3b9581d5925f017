import { expect, test, type Page } from '@playwright/test';
import { loginAsMember, settleClient, useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
const postId = 'notification-post';
const reactionId = 'notification-reaction';
const targetParams = `communityPost=${postId}&communityReaction=${reactionId}`;

async function targetFixture(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const counts = { detail: 0, reactions: 0, feed: 0 };
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' };
  await page.route(url => url.pathname === '/api/practice/mindful-posts', async route => {
    counts.feed++; await route.fulfill({ headers, json: { enabled: true, items: [], nextCursor: null } });
  });
  await page.route(url => url.pathname === `/api/practice/mindful-posts/${postId}`, async route => {
    counts.detail++;
    expect(new URL(route.request().url()).searchParams.get('reactionId')).toBe(reactionId);
    await route.fulfill({ headers, json: {
      post: { id: postId, kind: 'repentance', nickname: 'Đồng Tu Nhận', content: 'Nội dung đúng bài được thông báo.',
        createdAt: new Date().toISOString(), reactionCount: 25, viewerReacted: false, isOwn: true, status: 'published' },
      notification: { id: reactionId, postId, kind: 'repentance', nickname: 'Đồng Tu Gửi', templateId: 'tam-bao',
        text: 'Lời cầu nguyện đúng từ thông báo, ngoài trang đầu.', createdAt: '2026-01-01T01:00:00.000Z' },
    } });
  });
  await page.route(url => url.pathname === `/api/practice/mindful-posts/${postId}/reactions`, async route => {
    counts.reactions++;
    await route.fulfill({ headers, json: { items: [{ nickname: 'Đồng Tu Mới', templateId: 'bo-de',
      text: 'Lời cầu nguyện mới nhất.', createdAt: new Date().toISOString() }], nextCursor: 'older-page' } });
  });
  return counts;
}

async function followNotification(page: Page, href: string) {
  await page.evaluate(value => {
    document.querySelector('[data-testid="notification-route-link"]')?.remove();
    const link = document.createElement('a'); link.href = value;
    link.textContent = 'Mở thông báo kiểm thử'; link.dataset.testid = 'notification-route-link'; document.body.append(link);
  }, href);
  // This synthetic link exercises SvelteKit navigation beneath the full-screen tool;
  // the separate bell suite covers clicking the real notification control.
  await page.getByTestId('notification-route-link').dispatchEvent('click');
}

test('cold and warm notification targets show the exact older reaction and reuse both cached requests', async ({ page, baseURL }) => {
  await loginAsMember(page); await useNativeApiWithLocalBackend(page);
  const counts = await targetFixture(page, baseURL!);
  await page.goto(`/tu-tap?${targetParams}`);
  const dialog = page.locator('.mindful-reactions');
  await expect(dialog).toContainText('Nội dung đúng bài được thông báo.');
  await expect(dialog.locator('.focused-reaction')).toContainText('ngoài trang đầu');
  await expect(dialog).toContainText('Lời cầu nguyện mới nhất.');
  expect(counts).toEqual({ detail: 1, reactions: 1, feed: 0 });
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page).not.toHaveURL(/communityPost=|communityReaction=/);
  await followNotification(page, `/tu-tap?${targetParams}`);
  await expect(dialog.locator('.focused-reaction')).toContainText('ngoài trang đầu');
  expect(counts).toEqual({ detail: 1, reactions: 1, feed: 0 });
});

for (const tool of [false, true]) {
  test(`cold ${tool ? 'tool and ' : ''}article context finishes restoration before its notification fetch`, async ({ page, baseURL }) => {
    await loginAsMember(page); await useNativeApiWithLocalBackend(page);
    const articles = await (await page.request.get('/api/data/baiviet?id=eq.e2e-practice&select=*')).json();
    const chapters = await (await page.request.get('/api/articles/e2e-practice/chapters?order=so_thu_tu.asc')).json();
    expect(articles).toEqual([expect.objectContaining({ id: 'e2e-practice' })]);
    await page.route('**/offline-bundled-articles.json', route => route.fulfill({ json: articles }));
    let release!: () => void, observed!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const restoring = new Promise<void>(resolve => { observed = resolve; });
    await page.route(url => url.pathname === '/api/data/tap_noi_dung'
      && url.searchParams.get('bai_viet_id') === 'eq.e2e-practice', async route => {
      observed(); await gate; await route.fulfill({ json: chapters });
    });
    const counts = await targetFixture(page, baseURL!);
    try {
      await page.goto(`/tu-tap?article=e2e-practice&${tool ? 'action=rosary&mode=rosary&' : ''}${targetParams}`);
      await restoring;
      expect(counts.detail).toBe(0);
      release();
      const dialog = page.locator('.mindful-reactions');
      await expect(dialog.locator('.focused-reaction')).toContainText('ngoài trang đầu');
      expect(counts).toEqual({ detail: 1, reactions: 1, feed: 0 });
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(page).not.toHaveURL(/communityPost=|communityReaction=/);
      await expect(page).toHaveURL(/article=e2e-practice/);
      if (tool) {
        await expect(page).toHaveURL(/action=rosary/);
        await expect(page.locator('.tt-rosary')).toBeVisible();
      } else await expect(page.locator('.tt-preview')).toBeVisible();
      expect(counts).toEqual({ detail: 1, reactions: 1, feed: 0 });
    } finally { release(); }
  });
}

test('a warm notification preserves the active rosary and all tool URL parameters', async ({ page, baseURL }) => {
  await loginAsMember(page); await useNativeApiWithLocalBackend(page);
  const counts = await targetFixture(page, baseURL!);
  await page.goto('/tu-tap?action=rosary&mode=rosary'); await settleClient(page);
  await expect(page.locator('.tt-rosary')).toBeVisible();
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  await followNotification(page, `/tu-tap?action=rosary&mode=rosary&${targetParams}`);
  const dialog = page.locator('.mindful-reactions');
  await expect(dialog.locator('.focused-reaction')).toContainText('ngoài trang đầu');
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page).toHaveURL(/action=rosary/); await expect(page).toHaveURL(/mode=rosary/);
  await expect(page).not.toHaveURL(/communityPost=|communityReaction=/);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('1/108');
  expect(counts).toEqual({ detail: 1, reactions: 1, feed: 0 });
});
