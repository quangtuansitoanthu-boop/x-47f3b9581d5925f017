import { test, expect } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

test('mobile library promotes most viewed and opens an accessible Top 10', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/kinh-sach');
  await settleClient(page);
  await expect(page.locator('.art-title').first()).toHaveText('BÀI PDF KIỂM THỬ E2E');
  const top = page.getByRole('button', { name: 'Top 10', exact: true });
  await top.click();
  const dialog = page.getByRole('dialog', { name: 'Top 10 sách được xem nhiều nhất' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('li').first()).toContainText('Bài PDF kiểm thử E2E');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.artifacts/community-mobile-top-ten.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(top).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(top).toBeVisible();
  expect((await top.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.art-title').first()).toHaveText('BÀI PDF KIỂM THỬ E2E');
  await top.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('li').first()).toContainText('Bài PDF kiểm thử E2E');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(top).toBeFocused();
});

test('authenticated comments support replies with server-owned role labels', async ({ page }) => {
  await loginAsAdmin(page);
  const creation = await page.evaluate(async () => {
    const session = await fetch('/api/session').then((r) => r.json());
    const response = await fetch('/api/articles/e2e-public/comments', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
      body: JSON.stringify({ noi_dung: 'Bình luận gốc kiểm thử', role: 'user', ten: 'Giả danh' }),
    });
    if (!response.ok) throw new Error(`comment status ${response.status}`);
    const root = await response.json();
    const publicResponse = await fetch('/api/articles/e2e-public/comments', { credentials: 'omit' });
    if (!publicResponse.ok) throw new Error(`public comments status ${publicResponse.status}`);
    const publicRows = await publicResponse.json();
    const ownResponse = await fetch('/api/articles/e2e-public/comments?includeOwn=1');
    if (!ownResponse.ok) throw new Error(`own comments status ${ownResponse.status}`);
    const ownRows = await ownResponse.json();
    let cursor: string | null = null;
    let target: { id: string; revision: number } | undefined;
    do {
      const params = new URLSearchParams({ kind: 'comments', limit: '50' });
      if (cursor) params.set('after', cursor);
      const queueResponse = await fetch(`/api/admin/community/moderation?${params}`);
      if (!queueResponse.ok) throw new Error(`moderation queue status ${queueResponse.status}`);
      const queue = await queueResponse.json();
      target = queue.items.find((item: { id: string }) => String(item.id) === String(root.id));
      cursor = queue.nextCursor;
    } while (!target && cursor);
    if (!target) throw new Error('The new pending comment is missing from the moderation queue');
    const approval = await fetch(`/api/admin/community/moderation/comments/${root.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
      body: JSON.stringify({ action: 'approve', revision: target.revision }),
    });
    if (!approval.ok) throw new Error(`comment approval status ${approval.status}`);
    return { root, publiclyVisibleWhilePending: publicRows.some((row: { id: number }) => String(row.id) === String(root.id)),
      ownPending: ownRows.find((row: { id: number }) => String(row.id) === String(root.id)) };
  });
  const root = creation.root;
  expect(root.role).toBe('admin');
  expect(root.moderationStatus).toBe('pending');
  expect(creation.publiclyVisibleWhilePending).toBe(false);
  expect(creation.ownPending).toMatchObject({ id: root.id, moderationStatus: 'pending', isOwnProfile: true });
  await page.goto('/kinh-sach');
  await settleClient(page);
  await page.getByRole('button', { name: 'Đọc ngay Bài viết kiểm thử E2E', exact: true }).click();
  await expect(page.locator('.comments .comment-role').first()).toHaveText('QTV');
  await page.locator('.comments .comment-reply-button').first().click();
  const form = page.getByRole('form', { name: 'Gửi bình luận' });
  await expect(form.locator('.reply-context')).toContainText('Quản trị viên E2E');
  await form.locator('textarea').fill('Phản hồi qua giao diện');
  await form.getByRole('button', { name: 'Gửi bình luận', exact: true }).click();
  await expect(page.locator('.comment-reply').last()).toContainText('Phản hồi qua giao diện');
  await expect(page.locator('.comment-reply').last().locator('.moderation-status')).toHaveText('Đang chờ duyệt');
  await expect(page.locator('.comments')).not.toContainText('e2e-admin@example.com');
  await page.reload();
  await settleClient(page);
  await expect(page.locator('.comment-reply').last()).toContainText('Phản hồi qua giao diện');
  await expect(page.locator('.comment-reply').last().locator('.moderation-status')).toHaveText('Đang chờ duyệt');
});

test('actual track playback counts once until completion and immediately counts replay on mobile', async ({ page }) => {
  test.setTimeout(60_000);
  // Match a fresh server aggregate at the start; production deliberately caches
  // totals for 30s in HTTP and three days locally, updated by acknowledged plays.
  await page.route('**/api/album-plays', route => route.continue());
  await loginAsAdmin(page);
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.Audio = new Proxy(NativeAudio, {
      construct(target, args) {
        const audio = Reflect.construct(target, args) as HTMLAudioElement;
        (window as any).__playbackAudio = audio;
        return audio;
      },
    });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/phap-thoai');
  await settleClient(page);
  const initialPlays = await page.evaluate(async () =>
    (await fetch('/api/album-plays', { cache: 'no-store' }).then((response) => response.json()))
      .find((album: { albumId: string }) => album.albumId === 'e2e-talk')?.playCount ?? 0);
  await expect(page.locator('.pt-card-meta')).toContainText(`${new Intl.NumberFormat('vi-VN').format(initialPlays)} lượt phát`);
  await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E', exact: true }).click();
  const counted = page.waitForResponse((r) => r.url().endsWith('/api/talks/e2e-talk/plays') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Phát Tiếng mõ kiểm thử', exact: true }).click();
  expect((await counted).status()).toBe(200);
  await expect.poll(async () => page.evaluate(async () => (await fetch('/api/album-plays', { cache: 'no-store' }).then((r) => r.json()))[0]?.playCount)).toBe(initialPlays + 1);
  const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
  await player.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await player.getByRole('button', { name: 'Phát', exact: true }).click();
  await expect(player.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch('/api/album-plays', { cache: 'no-store' }).then((r) => r.json()))[0]?.playCount)).toBe(initialPlays + 1);
  // Accelerate real decoding instead of synthesizing ended or seeking through
  // the local asset server (which does not provide byte-range responses).
  await page.evaluate(() => { ((window as any).__playbackAudio as HTMLAudioElement).playbackRate = 16; });
  await expect.poll(() => page.evaluate(() => ((window as any).__playbackAudio as HTMLAudioElement).ended), { timeout: 35_000 }).toBe(true);
  await expect(player.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();
  const replay = page.waitForResponse((r) => r.url().endsWith('/api/talks/e2e-talk/plays') && r.request().method() === 'POST');
  await player.getByRole('button', { name: 'Phát', exact: true }).click();
  expect((await replay).status()).toBe(200);
  await expect.poll(async () => page.evaluate(async () => (await fetch('/api/album-plays', { cache: 'no-store' }).then((r) => r.json()))[0]?.playCount)).toBe(initialPlays + 2);
  await page.goto('/phap-thoai');
  await settleClient(page);
  await page.getByRole('button', { name: 'Top 10', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Top 10 album được nghe nhiều nhất' });
  await expect(dialog).toContainText('Pháp thoại kiểm thử E2E');
  await expect(dialog).toContainText(`${new Intl.NumberFormat('vi-VN').format(initialPlays + 2)} lượt phát`);
  await dialog.getByRole('button', { name: /Pháp thoại kiểm thử E2E/ }).click();
  await expect(page.locator('.pt-as-album-title')).toHaveText('Pháp thoại kiểm thử E2E');
});
