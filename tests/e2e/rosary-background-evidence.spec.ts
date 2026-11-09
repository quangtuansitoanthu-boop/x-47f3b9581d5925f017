import { expect, test, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';

const outboxKey = 'quangtu_principal_v1:anonymous:quangtu_practice_session_outbox_v1';
const countKey = 'quangtu_principal_v1:anonymous:tt_rosary_count';
const logsKey = 'quangtu_principal_v1:anonymous:tt_practice_logs_v1';

async function visibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate(state => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function openRosary(page: Page) {
  await page.route('**/api/**', route => route.abort('failed'));
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
}

interface QueuedOperation {
  kind: string;
  clientSessionId: string;
  payload: { evidenceSummary?: { acceptedCount?: number; minimumIntervalMs?: number; localLogId?: number; practiceType?: string } };
}
const operations = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]') as QueuedOperation[], outboxKey);

test('background checkpoints actual accepted beads once and foreground continues with a separate evidence session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openRosary(page);
  const tap = page.getByRole('button', { name: 'Niệm một hạt', exact: true });
  await tap.click();
  await page.waitForTimeout(450);
  await tap.click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('2/108');
  const initial = await operations(page);
  expect(initial.filter(item => item.kind === 'start')).toHaveLength(1);
  expect(initial.filter(item => item.kind === 'complete')).toHaveLength(0);

  await visibility(page, 'hidden');
  const checkpoint = await operations(page);
  const completed = checkpoint.filter(item => item.kind === 'complete');
  expect(completed).toHaveLength(1);
  expect(completed[0].clientSessionId).toBe(initial[0].clientSessionId);
  expect(completed[0].payload.evidenceSummary).toMatchObject({ acceptedCount: 2, minimumIntervalMs: 400 });
  const savedLogs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]') as { id: number; type: string; count: number }[], logsKey);
  expect(savedLogs).toHaveLength(1);
  expect(savedLogs[0]).toMatchObject({ type: 'Niệm danh hiệu', count: 2 });
  expect(savedLogs[0].id).toBeGreaterThan(0);
  expect(completed[0].payload.evidenceSummary).toMatchObject({
    localLogId: savedLogs[0].id,
    practiceType: savedLogs[0].type,
    acceptedCount: savedLogs[0].count,
  });
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('2');
  await visibility(page, 'hidden');
  expect((await operations(page)).filter(item => item.kind === 'complete')).toHaveLength(1);

  await visibility(page, 'visible');
  await page.waitForTimeout(450);
  await tap.click();
  await expect(page.locator('.tt-rosary__cycle')).toContainText('3/108');
  const continued = await operations(page);
  const starts = continued.filter(item => item.kind === 'start');
  expect(starts).toHaveLength(2);
  expect(starts[1].clientSessionId).not.toBe(starts[0].clientSessionId);
  await visibility(page, 'hidden');
  const allCompleted = (await operations(page)).filter(item => item.kind === 'complete');
  expect(allCompleted).toHaveLength(2);
  expect(allCompleted.map(item => item.payload.evidenceSummary?.acceptedCount)).toEqual([2, 1]);
  expect(errors).toEqual([]);
});

test('a background checkpoint survives reload without replaying the previous evidence as a new session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => {
    expect(dialog.type()).toBe('beforeunload');
    await dialog.accept();
  });
  await openRosary(page);
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  await visibility(page, 'hidden');
  const saved = await operations(page);
  expect(saved.filter(item => item.kind === 'complete')).toHaveLength(1);
  await page.reload();
  await settleClient(page);
  expect(await page.evaluate(key => localStorage.getItem(key), countKey)).toBe('1');
  expect(await operations(page)).toEqual(saved);
  expect(errors).toEqual([]);
});
