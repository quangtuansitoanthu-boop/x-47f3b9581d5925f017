import { expect, test, type Page } from '@playwright/test';
import { loginAsMember, settleClient, TEST_MEMBER_ID } from './runtime-helpers';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';

const key = principalStorageKey(TEST_MEMBER_ID, 'tt_practice_logs_v1');
const campaign = { id: 'manual-error-goal', title: 'Chiến dịch thử lỗi', description: '', metric: 'count', goalValue: 100, contributionValue: 0, memberCount: 1, joined: true, status: 'active', startsAt: '2026-01-01', endsAt: '2099-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const savedLog = { id: 1760000000000, type: 'Chép kinh', count: 7, date: '2026-11-02', created: '2026-11-02T01:00:00Z', note: 'Không làm mất công phu', campaignId: campaign.id, campaignTitle: campaign.title };

async function setup(page: Page, seed: boolean) {
  await loginAsMember(page);
  if (seed) await page.addInitScript(({ key, log }) => localStorage.setItem(key, JSON.stringify([log])), { key, log: savedLog });
  let attempts = 0;
  let failing = true;
  await page.route('**/api/practice/campaigns**', async route => {
    if (new URL(route.request().url()).pathname === '/api/practice/campaigns') {
      await route.fulfill({ json: { enabled: true, campaigns: [campaign] } });
    } else if (new URL(route.request().url()).pathname === `/api/practice/campaigns/${campaign.id}/contribute`) {
      attempts += 1;
      await route.fulfill(failing
        ? { status: 503, json: { error: { message: 'Campaign write failed' } } }
        : { json: { contributed: true, contributionValue: 7, deleted: true } });
    } else await route.continue();
  });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('button.tt-mode-card--tracker').click();
  return { attempts: () => attempts, recover: () => { failing = false; } };
}

async function acknowledgeCampaignError(page: Page) {
  const notification = page.getByRole('dialog', { name: 'Thông báo', exact: true });
  await expect(notification.getByText('Campaign write failed', { exact: true })).toBeVisible();
  await notification.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(notification).not.toBeVisible();
}

test('failed manual campaign save keeps the form draft and reports the error without automatic retry', async ({ page }) => {
  const state = await setup(page, false);
  await page.getByRole('button', { name: '+ Ghi nhận', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Ghi nhận tu tập thủ công', exact: true });
  await form.locator('#practice-log-campaign').selectOption(campaign.id);
  await form.locator('#practice-log-count').fill('7');
  await form.locator('#practice-log-note').fill('Giữ bản nháp khi lỗi');
  await form.getByRole('button', { name: 'Ghi nhận 🙏', exact: true }).click();
  await expect.poll(() => state.attempts()).toBe(1);
  await acknowledgeCampaignError(page);
  await expect(form).toBeVisible();
  await expect(form.locator('#practice-log-note')).toHaveValue('Giữ bản nháp khi lỗi');
  await expect(form.locator('#practice-log-count')).toHaveValue('7');
  expect(state.attempts()).toBe(1);
  state.recover();
  await form.getByRole('button', { name: 'Ghi nhận 🙏', exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(state.attempts()).toBe(2);
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), key);
  expect(logs.filter((log: { note: string }) => log.note === 'Giữ bản nháp khi lỗi')).toHaveLength(1);
});

test('cancel never deletes and a failed campaign deletion retains the saved local record', async ({ page }) => {
  const state = await setup(page, true);
  const tracker = page.getByRole('dialog', { name: 'Công phu của tôi', exact: true });
  await tracker.getByRole('button', { name: 'Xóa mục này', exact: true }).first().click();
  const confirmation = page.getByRole('dialog', { name: 'Xóa Mục Công Phu?', exact: true });
  await confirmation.getByRole('button', { name: 'Hủy', exact: true }).click();
  expect(state.attempts()).toBe(0);
  await tracker.getByRole('button', { name: 'Xóa mục này', exact: true }).first().click();
  await confirmation.getByRole('button', { name: 'Xóa mục này', exact: true }).click();
  await expect.poll(() => state.attempts()).toBe(1);
  await acknowledgeCampaignError(page);
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), key);
  expect(logs).toContainEqual(savedLog);
  await expect(tracker.getByText('Không làm mất công phu', { exact: true })).toBeVisible();
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Xóa mục này', exact: true })).toBeEnabled();
  expect(state.attempts()).toBe(1);
  state.recover();
  // Lỗi giữ nguyên xác nhận và các ID còn lại để thử lại, kể cả khi xóa cả nhóm.
  await confirmation.getByRole('button', { name: 'Xóa mục này', exact: true }).click();
  await expect.poll(() => state.attempts()).toBe(2);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').some((log: { id: number }) => log.id === 1760000000000), key)).toBe(false);
  await expect(confirmation).not.toBeVisible();
});
