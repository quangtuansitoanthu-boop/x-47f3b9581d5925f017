import { expect, test } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';
import type { ModerationQueueItem } from '../../src/lib/contracts/community-moderation';

const comment: ModerationQueueItem = {
  id: '71', kind: 'comments', revision: 3, submittedAt: '2026-11-04T03:00:00Z',
  displayName: 'Thành viên chờ duyệt', avatarUrl: '', content: 'Nội dung cần xem xét', articleId: 'kinh-duy-ma-cat',
  moderationStatus: 'pending', member: { id: 'member-review', name: 'Thành viên chờ duyệt', role: 'user', status: 'active', isSelf: false },
};

test('moderation keeps rejection reason on failure and never submits duplicate decisions', async ({ page }) => {
  await loginAsAdmin(page);
  let writes = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/admin/community/moderation?*', route => route.fulfill({ json: { items: [comment], nextCursor: null } }));
  await page.route('**/api/admin/community/moderation/comments/71', async route => {
    writes++;
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({ action: 'reject', revision: 3, reason: 'Cần chỉnh sửa nội dung' });
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: { code: 'unavailable', message: 'Chưa cập nhật được' } } });
  });
  await page.goto('/admin/community');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await moderation.getByRole('button', { name: 'Xem nội dung & ngữ cảnh', exact: true }).click();
  await expect(moderation.getByText('Nội dung cần xem xét', { exact: true }).last()).toBeVisible();
  await moderation.getByRole('button', { name: 'Từ chối', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Từ chối nội dung', exact: true });
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  expect(writes).toBe(0);
  await dialog.getByLabel('Lý do từ chối').fill('Cần chỉnh sửa nội dung');
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Đang xử lý…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release!();
  await expect(dialog.getByRole('alert')).toContainText('Chưa cập nhật được');
  await expect(dialog.getByLabel('Lý do từ chối')).toHaveValue('Cần chỉnh sửa nội dung');
  expect(writes).toBe(1);
});

test('admin community exposes the approved moderation queues with bounded empty pages', async ({ page }) => {
  await loginAsAdmin(page);
  const reads: string[] = [];
  await page.route('**/api/admin/community/moderation?*', async route => {
    reads.push(new URL(route.request().url()).searchParams.get('kind')!);
    await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto('/admin/community');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await expect(moderation).toBeVisible();
  await expect(moderation.getByRole('button', { name: 'Bình luận chờ duyệt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(moderation.getByText('Không có nội dung chờ xử lý', { exact: true })).toBeVisible();
  await moderation.getByRole('button', { name: 'Tên/ảnh công khai chờ duyệt', exact: true }).click();
  await expect.poll(() => reads).toEqual(['comments', 'profiles']);
  await moderation.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  await expect.poll(() => reads).toEqual(['comments', 'profiles', 'reports']);
  await expect(moderation.getByRole('button', { name: 'Trang sau', exact: true })).toBeDisabled();
});

test('reported content hides through its target revision and resolves the report separately', async ({ page }) => {
  await loginAsAdmin(page);
  const writes: Array<{ path: string; body: unknown }> = [];
  const report: ModerationQueueItem = {
    ...comment, id: 'report-1', kind: 'reports', revision: 5, content: 'Báo cáo cần xử lý', reportReason: 'spam',
    target: { ...comment, kind: 'comments', moderationStatus: 'approved' },
  };
  await page.route('**/api/admin/community/moderation?*', route => route.fulfill({ json: { items: [report], nextCursor: null } }));
  await page.route('**/api/admin/community/moderation/*/*', async route => {
    writes.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.fulfill({ json: { updated: true } });
  });
  await page.goto('/admin/community');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await moderation.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  await moderation.getByRole('button', { name: 'Xem nội dung & ngữ cảnh', exact: true }).click();
  await moderation.getByRole('button', { name: 'Ẩn nội dung vi phạm', exact: true }).click();
  const hide = page.getByRole('dialog', { name: 'Ẩn nội dung vi phạm?', exact: true });
  await hide.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => writes).toEqual([{ path: '/api/admin/community/moderation/comments/71', body: { action: 'hide', revision: 3 } }]);
  await expect(hide).toHaveCount(0);
  await moderation.getByRole('button', { name: 'Xem nội dung & ngữ cảnh', exact: true }).click();
  await moderation.getByRole('button', { name: 'Đánh dấu đã xử lý', exact: true }).click();
  await page.getByRole('dialog', { name: 'Đánh dấu báo cáo đã xử lý?', exact: true }).getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toEqual({ path: '/api/admin/community/moderation/reports/report-1', body: { action: 'resolve', revision: 5 } });
});

test('moderation pagination reuses its principal cache and keeps stale decisions blocked', async ({ page }) => {
  await loginAsAdmin(page);
  const reads: string[] = [];
  await page.route('**/api/admin/community/moderation?*', async route => {
    const after = new URL(route.request().url()).searchParams.get('after') || '';
    reads.push(after);
    await route.fulfill({ json: { items: [{ ...comment, id: after ? '72' : '71' }], nextCursor: after ? null : 'cursor-2' } });
  });
  let writes = 0;
  await page.route('**/api/admin/community/moderation/comments/71', async route => {
    writes++;
    await route.fulfill({ status: 409, json: { error: { code: 'conflict' } } });
  });
  await page.goto('/admin/community');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await moderation.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect.poll(() => reads).toEqual(['', 'cursor-2']);
  await moderation.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await moderation.getByRole('button', { name: 'Xem nội dung & ngữ cảnh', exact: true }).click();
  await moderation.getByRole('button', { name: 'Duyệt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Duyệt nội dung này?', exact: true });
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Nội dung đã được thay đổi');
  await expect(dialog.getByRole('button', { name: 'Xác nhận', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Tải lại hàng đợi', exact: true })).toBeVisible();
  expect(writes).toBe(1);
  expect(reads).toEqual(['', 'cursor-2']);
});

test('session loss clears moderation context and closes a private rejection draft', async ({ page }) => {
  await loginAsAdmin(page);
  await page.route('**/api/admin/community/moderation?*', route => route.fulfill({ json: { items: [comment], nextCursor: null } }));
  await page.goto('/admin/community');
  await settleClient(page);
  const moderation = page.getByRole('region', { name: 'Kiểm duyệt nội dung' });
  await moderation.getByRole('button', { name: 'Xem nội dung & ngữ cảnh', exact: true }).click();
  await moderation.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Lý do từ chối').fill('Bản nháp riêng');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('quangtu:session-changed', {
    detail: { authenticated: false, user: null, csrfToken: null, expiresAt: null },
  })));
  await expect(page.getByRole('dialog', { name: 'Từ chối nội dung', exact: true })).toHaveCount(0);
  await expect(moderation).not.toContainText(comment.content);
  await expect(moderation.getByRole('alert')).toContainText('Bạn không có quyền truy cập');
});
