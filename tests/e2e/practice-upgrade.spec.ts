import { expect, test, type Page, type Request } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { loginAsMember, settleClient, TEST_MEMBER_ID } from './runtime-helpers';
import { changePersonalSyncState, initialPersonalSyncState, PERSONAL_SYNC_INTERVAL_MS } from '../../src/lib/domain/practice/personal-sync-policy';

const prefix = `quangtu_principal_v1:${TEST_MEMBER_ID}:`;
const communityPath = '/api/practice/mindful-posts';
const publicReflection = (introduction: string) => `${introduction} ${'Tâm an. '.repeat(25)}`.trim();

async function captureMobile(page: Page, name: string) {
  await mkdir('.artifacts', { recursive: true });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.scrollTo(0, 0));
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `.artifacts/practice-upgrade-mobile-${name}.png`, fullPage: true, animations: 'disabled' });
}

function contentRequests(page: Page) {
  const requests: { method: string; path: string }[] = [];
  const record = (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith(communityPath) || path === '/api/practice/personal-settings') requests.push({ method: request.method(), path });
  };
  page.on('request', record);
  return requests;
}

test('guest sharing offers sign in and keeps the private draft without posting', async ({ page }) => {
  await page.goto('/tu-tap');
  await settleClient(page);
  await openPersonal(page);
  const requests = contentRequests(page);
  const content = publicReflection('Nội dung riêng chưa đăng');
  await page.getByRole('textbox', { name: 'Việc thiện lành đã làm', exact: true }).fill(content);
  const share = page.getByRole('button', { name: 'Chia sẻ việc lành', exact: true });
  await expect(share).toBeEnabled();
  await share.click();
  await expect(page).toHaveURL(/\/ca-nhan\?tab=account/u);
  expect(requests.filter(item => item.method === 'POST')).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_personal_reflections_v1'))).toContain(content);
});

test('first-visit guidance honours remembering and focuses private writing without content requests', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page);
  const requests = contentRequests(page);
  await page.locator('.tt-mode-card--reflection').click();
  const guide = page.getByTestId('reflection-guide');
  await expect(guide).toBeVisible();
  await guide.getByRole('checkbox').uncheck();
  await guide.getByRole('button', { name: 'Tôi đã hiểu, Bắt đầu quán chiếu →', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true });
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('tt_reflection_guide_seen_v1'))).toBeNull();
  await openHub(page);
  await openPersonal(page);
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('tt_reflection_guide_seen_v1'))).toBe('1');
  await page.reload(); await settleClient(page);
  await expect(editor).toBeVisible();
  await expect(guide).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('fewer than 50 words warns on manual save but keeps a private draft when leaving', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page); await openPersonal(page);
  const requests = contentRequests(page);
  const content = 'tâm '.repeat(49).trim();
  for (const label of ['Nhìn lại lỗi lầm & sám hối', 'Việc thiện lành đã làm']) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(content);
  }
  await expect(page.getByRole('button', { name: 'Gửi cộng đồng sám hối', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Chia sẻ việc lành', exact: true })).toBeDisabled();
  const save = page.getByRole('button', { name: 'Lưu riêng tư', exact: true }).first();
  await expect(save).toBeEnabled(); await save.click();
  const feedback = page.locator('dialog.app-dialog');
  await expect(feedback).toContainText('Cần tối thiểu 50 từ');
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_personal_reflections_v1'))).toBeNull();
  await feedback.getByRole('button').click();
  await openHub(page);
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_personal_reflections_v1') ?? '[]'));
  expect(entries).toEqual([expect.objectContaining({ repentance: content, goodDeeds: content })]);
  await expect(page.getByRole('dialog', { name: 'Xác nhận chia sẻ', exact: true })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('both private journal share actions require confirmation and cancel sends no request', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.route('**/api/practice/mindful-posts', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { post: { id: `confirmation-${body.kind}`, kind: body.kind, nickname: body.nickname, content: body.content,
      status: 'published', createdAt: new Date().toISOString(), reactionCount: 0, viewerReacted: false, isOwn: true } } });
  });
  await page.goto('/tu-tap');
  await settleClient(page);
  await openPersonal(page);
  await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).fill('Đồng Tu Xác Nhận');
  const requests = contentRequests(page);
  for (const item of [
    { label: 'Nhìn lại lỗi lầm & sám hối', share: 'Gửi cộng đồng sám hối' },
    { label: 'Việc thiện lành đã làm', share: 'Chia sẻ việc lành' },
  ]) {
    requests.length = 0;
    const content = publicReflection(`Nội dung kiểm tra ${item.share}`);
    await page.getByRole('textbox', { name: item.label, exact: true }).fill(content);
    const share = page.getByRole('button', { name: item.share, exact: true });
    await share.click();
    const confirmation = page.getByRole('dialog', { name: 'Xác nhận chia sẻ', exact: true });
    await expect(confirmation).toBeVisible();
    expect(requests).toEqual([]);
    await confirmation.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: item.label, exact: true })).toHaveValue(content);
    expect(requests).toEqual([]);
    await share.click();
    await expect(confirmation).toBeVisible();
    expect(requests).toEqual([]);
    const response = page.waitForResponse(result => new URL(result.url()).pathname === communityPath && result.request().method() === 'POST');
    await confirmation.getByRole('button', { name: 'Đồng ý chia sẻ', exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(confirmation).toHaveCount(0);
    expect(requests).toEqual([{ method: 'POST', path: communityPath }]);
  }
});

test('personal routines live in suggested routine and never expose an unsaved UUID', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await openPersonal(page);
  await expect(page.getByRole('button', { name: 'Khóa lễ', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tạo thời khóa mới', exact: true })).toHaveCount(0);
  await openHub(page);
  await page.getByRole('button', { name: /^Thời khóa gợi ý/u }).click();
  const dialog = page.getByRole('dialog', { name: 'Thời khóa gợi ý', exact: true });
  const requests = contentRequests(page);
  await dialog.getByRole('button', { name: 'Tạo thời khóa mới', exact: true }).click();
  const name = `Thời khóa thử ${Date.now()}`;
  await dialog.getByRole('textbox', { name: 'Tên thời khóa', exact: true }).fill(name);
  await dialog.getByRole('textbox', { name: 'Lời hồi hướng riêng', exact: true }).fill('Nguyện đem công đức này hướng về khắp tất cả.');
  await dialog.getByRole('button', { name: 'Lưu thời khóa', exact: true }).click();
  const picker = dialog.getByRole('combobox', { name: 'Thời khóa đã lưu', exact: true });
  await expect(picker).toHaveText(name);
  await dialog.getByRole('button', { name: 'Tạo thời khóa mới', exact: true }).click();
  await expect(picker).toHaveText('Thời khóa đã lưu');
  await dialog.getByRole('textbox', { name: 'Tên thời khóa', exact: true }).fill('Thời Khóa Sáng');
  await expect(picker).toHaveText('Thời khóa đã lưu');
  await picker.click();
  await page.getByRole('dialog', { name: 'Thời khóa đã lưu', exact: true }).getByRole('button', { name, exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Tên thời khóa', exact: true })).toHaveValue(name);
  expect(requests).toEqual([]);
  await captureMobile(page, 'routine-editor');
});

test('undeployed community is reported clearly without automatic retry requests', async ({ page }) => {
  await page.route('**/api/practice/mindful-posts?**', route => route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'API không tồn tại.' } } }));
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  const requests = contentRequests(page);
  await openCommunity(page);
  await expect(page.getByRole('alert')).toContainText('Máy chủ chưa sẵn sàng');
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByRole('alert')).toContainText('Máy chủ chưa sẵn sàng');
  await openPersonal(page);
  await expect(page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true })).toBeVisible();
});

async function openPersonal(page: Page) {
  if (await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).isVisible()) return;
  const journalTab = page.getByRole('button', { name: 'Sổ quán chiếu', exact: true });
  if (await journalTab.isVisible()) await journalTab.click();
  else {
    await openHub(page);
    await page.getByRole('button', { name: 'Quán chiếu việc thiện ác trong ngày', exact: true }).click();
  }
  const guide = page.getByTestId('reflection-guide');
  if (await guide.isVisible()) await guide.getByRole('button', { name: 'Tôi đã hiểu, Bắt đầu quán chiếu →', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true })).toBeVisible();
}

async function openHub(page: Page) {
  if (!await page.locator('.tt-mode-card--reflection').isVisible()) await page.locator('.tt-topbar .tt-back-btn').click();
  await expect(page.locator('.tt-mode-card--reflection')).toBeVisible();
}

async function openCommunity(page: Page) {
  await openPersonal(page);
  await page.getByRole('button', { name: 'Cộng đồng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cộng đồng tu học', exact: true })).toBeVisible();
}

test('merged reflection defers community requests and keeps private draft across inner tabs', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await expect(page.locator('.tt-mode-card--mindful')).toHaveCount(0);
  const requests = contentRequests(page);
  await openPersonal(page);
  expect(requests).toEqual([]);
  const input = page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true });
  await input.fill('Bản quán chiếu chưa bấm lưu');
  const tabs = page.locator('.personal-practice nav button');
  const widths = await tabs.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  expect(widths).toHaveLength(2);
  expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
  await openCommunity(page);
  await expect(page.locator('.mindful-community article').or(page.getByText('Chưa có bài chia sẻ.', { exact: true })).first()).toBeVisible();
  expect(requests.filter(request => request.method === 'GET')).toHaveLength(1);
  await openPersonal(page);
  await expect(input).toHaveValue('Bản quán chiếu chưa bấm lưu');
  await openCommunity(page);
  await expect(page.locator('.mindful-community')).toBeVisible();
  expect(requests.filter(request => request.method === 'GET')).toHaveLength(1);
});

test('reflection card supports header Back, browser Forward and reload without losing private writing', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  const requests = contentRequests(page);
  await openPersonal(page);
  const entry = `Quán chiếu giữ lại ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true }).fill(entry);
  await openHub(page);
  await page.goForward();
  await expect(page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true })).toHaveValue(entry);
  await page.reload();
  await settleClient(page);
  await expect(page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true })).toHaveValue(entry);
  expect(requests).toEqual([]);
});

test('new mobile cards share the companion grid and private reflection saves without content API calls', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await expect(page.locator('nav.tt-upgrade-tabs')).toHaveCount(0);
  const tabs = page.locator('.tt-modes-grid > .tt-mode-card--rec, .tt-modes-grid > .tt-mode-card--reflection');
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('.tt-mode-card--mindful')).toHaveCount(0);
  const boxes = await tabs.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, right: rect.right };
  }));
  expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThanOrEqual(1);
  expect(boxes.every(box => box.height >= 44 && box.right <= 376)).toBe(true);
  await openPersonal(page);
  const requests = contentRequests(page);
  const entry = publicReflection(`Ghi chép riêng E2E ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true }).fill(entry);
  await page.getByRole('textbox', { name: 'Việc thiện lành đã làm', exact: true }).fill('Nội dung thiện lành giữ riêng.');
  await page.getByRole('button', { name: 'Lưu riêng tư', exact: true }).first().click();
  const saved = page.locator('dialog.app-dialog');
  await expect(saved).toContainText('Đã lưu riêng trên thiết bị.');
  await saved.getByRole('button').click();
  expect(requests).toEqual([]);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), `${prefix}tt_personal_reflections_v1`);
  expect(stored.some((item: { repentance: string }) => item.repentance === entry)).toBe(true);
  await captureMobile(page, 'journal');
  await page.reload();
  await settleClient(page);
  await openPersonal(page);
  await expect(page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true })).toHaveValue(entry);
  expect(requests).toEqual([]);
});

test('sharing and template reaction each send one mutation without a feed refetch', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await openPersonal(page);
  const nickname = 'Đồng Tu E2E';
  const content = publicReflection(`Hôm nay tôi tập nói lời ôn hòa. E2E ${Date.now()}`);
  const privateGood = 'Đoạn việc thiện này không được gửi cùng bài sám hối.';
  await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).fill(nickname);
  await page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true }).fill(content);
  await page.getByRole('textbox', { name: 'Việc thiện lành đã làm', exact: true }).fill(privateGood);
  const requests = contentRequests(page);
  await page.getByRole('button', { name: 'Gửi cộng đồng sám hối', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Xác nhận chia sẻ', exact: true });
  await expect(confirmation).toBeVisible();
  expect(requests).toEqual([]);
  const submitted = page.waitForResponse(response => new URL(response.url()).pathname === communityPath && response.request().method() === 'POST');
  await confirmation.getByRole('button', { name: 'Đồng ý chia sẻ', exact: true }).click();
  const response = await submitted;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({ kind: 'repentance', nickname, content });
  expect(response.request().postData()).not.toContain(privateGood);
  await expect(page.getByRole('status').filter({ hasText: 'Đã chia sẻ lên cộng đồng.' })).toBeVisible();
  expect(requests).toEqual([{ method: 'POST', path: communityPath }]);
  await openCommunity(page);
  const article = page.locator('.mindful-community article').filter({ hasText: content });
  await expect(article).toBeVisible();
  await expect(article).toContainText(nickname);
  await expect(article).not.toContainText('Thành viên E2E');
  await expect(article).not.toContainText('e2e-member@example.com');
  requests.length = 0;
  await article.getByRole('button', { name: 'Gửi lời cầu nguyện', exact: true }).click();
  const reaction = page.getByRole('dialog', { name: 'Gửi lời cầu nguyện', exact: true });
  await reaction.getByRole('combobox', { name: 'Chọn lời mẫu', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Chọn lời mẫu', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: /Nguyện hồng ân Tam Bảo/u }).click();
  expect(requests).toEqual([]);
  const reacted = page.waitForResponse(result => new URL(result.url()).pathname.endsWith('/reactions') && result.request().method() === 'POST');
  await reaction.getByRole('button', { name: 'Gửi', exact: true }).click();
  expect((await reacted).ok()).toBe(true);
  await expect(article.getByRole('button', { name: 'Đã gửi lời cầu nguyện', exact: true })).toBeDisabled();
  await expect(article.getByRole('button', { name: 'Lời cầu nguyện · 1', exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ method: 'POST' });
  expect(requests[0].path).toMatch(/\/reactions$/u);
  await captureMobile(page, 'community');
});

test('dedication-only routine records one summary without counted practice logs', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  const routineId = `e2e-dedication-${Date.now()}`;
  const routineName = `Khóa lễ hồi hướng E2E ${Date.now()}`;
  await page.addInitScript(({ prefix, routineId, routineName }) => {
    const guard = `e2e-seeded:${routineId}`;
    if (sessionStorage.getItem(guard)) return;
    const key = `${prefix}tt_daily_routines_v1`;
    const prior = JSON.parse(localStorage.getItem(key) ?? '[]');
    prior.push({ id: routineId, name: routineName, updatedAt: new Date().toISOString(), steps: [{ id: 'dedication', kind: 'dedication', text: 'HỒI HƯỚNG CÔNG ĐỨC\nNguyện đem công đức này\nHướng về khắp tất cả\n(Đọc một lần)' }] });
    localStorage.setItem(key, JSON.stringify(prior));
    sessionStorage.setItem(guard, '1');
  }, { prefix, routineId, routineName });
  await page.goto('/tu-tap');
  await settleClient(page);
  const before = await page.evaluate(prefix => ({ logs: localStorage.getItem(`${prefix}tt_practice_logs_v1`), summaries: JSON.parse(localStorage.getItem(`${prefix}tt_routine_summaries_v1`) ?? '[]') }), prefix);
  await page.getByRole('button', { name: /^Thời khóa gợi ý/u }).click();
  await page.getByRole('combobox', { name: 'Thời khóa đã lưu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Thời khóa đã lưu', exact: true }).getByRole('button', { name: routineName, exact: true }).click();
  const requests = contentRequests(page);
  await page.getByRole('button', { name: 'Bắt đầu thời khóa', exact: true }).click();
  const reading = page.getByRole('dialog', { name: 'Hành trì thời khóa', exact: true });
  await expect(reading).toBeVisible();
  await expect(reading.getByText('Nguyện đem công đức này', { exact: true })).toBeVisible();
  await expect(reading.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
  await captureMobile(page, 'routine-open');
  await reading.getByRole('button', { name: 'Đã đọc xong', exact: true }).click();
  await expect(reading).toHaveCount(0);
  const after = await page.evaluate(prefix => ({ logs: localStorage.getItem(`${prefix}tt_practice_logs_v1`), summaries: JSON.parse(localStorage.getItem(`${prefix}tt_routine_summaries_v1`) ?? '[]') }), prefix);
  expect(after.logs).toBe(before.logs);
  expect(after.summaries).toHaveLength(before.summaries.length + 1);
  expect(after.summaries.filter((item: { note: string }) => item.note.startsWith(routineName))).toHaveLength(1);
  expect(requests).toEqual([]);
  await page.reload();
  await settleClient(page);
  await openPersonal(page);
  await expect(page.getByText('Thời khóa đã hoàn thành', { exact: true })).toBeVisible();
  const summaries = await page.evaluate(prefix => JSON.parse(localStorage.getItem(`${prefix}tt_routine_summaries_v1`) ?? '[]'), prefix);
  expect(summaries.filter((item: { note: string }) => item.note.startsWith(routineName))).toHaveLength(1);
});

test('48-hour dirty personal settings upload once and unchanged reload sends no GET or PUT', async ({ page }) => {
  await loginAsMember(page);
  const snapshot = { routines: [], nickname: 'Đồng Tu Đồng Bộ E2E' };
  const payload = JSON.stringify(snapshot);
  const policy = changePersonalSyncState(
    initialPersonalSyncState(JSON.stringify({ routines: [], nickname: '' })),
    payload,
    Date.now() - PERSONAL_SYNC_INTERVAL_MS - 1000,
  );
  const record = { policy, remoteRevision: 0, conflict: false, remote: null };
  const seedId = `e2e-personal-48h-${Date.now()}`;
  await page.addInitScript(({ prefix, snapshot, record, seedId }) => {
    if (sessionStorage.getItem(seedId)) return;
    localStorage.setItem(`${prefix}tt_personal_settings_v1`, JSON.stringify(snapshot));
    localStorage.setItem(`${prefix}tt_personal_settings_sync_v1`, JSON.stringify(record));
    sessionStorage.setItem(seedId, '1');
  }, { prefix, snapshot, record, seedId });
  const requests = contentRequests(page);
  type ServerReceipt = { status: number; body: { snapshot: typeof snapshot; revision: number } };
  let resolveReceipt!: (receipt: ServerReceipt) => void;
  const serverReceipt = new Promise<ServerReceipt>(resolve => { resolveReceipt = resolve; });
  let forwardedPuts = 0;
  // Forward the original browser request once to the real local D1-backed route.
  // Capture its body through APIResponse, avoiding Chromium's navigation body eviction.
  await page.route('**/api/practice/personal-settings', async route => {
    const upstream = await route.fetch({ maxRedirects: 0 });
    if (route.request().method() === 'PUT') {
      forwardedPuts += 1;
      resolveReceipt({ status: upstream.status(), body: await upstream.json() });
    }
    await route.fulfill({ response: upstream });
  });
  const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/practice/personal-settings' && response.request().method() === 'PUT');
  await page.goto('/tu-tap');
  await settleClient(page);
  const response = await uploaded;
  const receipt = await serverReceipt;
  const acknowledged = receipt.body;
  expect(response.ok()).toBe(true);
  expect(receipt.status).toBe(200);
  expect(forwardedPuts).toBe(1);
  expect(response.request().postDataJSON()).toEqual({ snapshot, revision: 0 });
  expect(acknowledged.snapshot).toEqual(snapshot);
  expect(acknowledged.revision).toBe(1);
  await expect.poll(async () => page.evaluate(key => {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return value.policy?.acknowledged === value.policy?.current && value.policy?.firstDirtyAt === null && value.remoteRevision === 1;
  }, `${prefix}tt_personal_settings_sync_v1`)).toBe(true);
  expect(requests).toEqual([{ method: 'PUT', path: '/api/practice/personal-settings' }]);
  requests.length = 0;
  await page.reload();
  await settleClient(page);
  await openPersonal(page);
  await expect(page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true })).toHaveValue(snapshot.nickname);
  expect(requests).toEqual([]);
  expect(forwardedPuts).toBe(1);
});

test('leaving the journal preserves its private draft without the removed restore controls or uploading it', async ({ page }) => {
  await loginAsMember(page);
  await page.goto('/tu-tap');
  await settleClient(page);
  await openPersonal(page);
  const note = `Bản nháp riêng cần giữ ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true }).fill(note);
  const requests = contentRequests(page);
  await expect(page.getByRole('button', { name: 'Khôi phục cài đặt từ máy chủ', exact: true })).toHaveCount(0);
  await openHub(page);
  await openPersonal(page);
  await expect(page.getByRole('textbox', { name: 'Nhìn lại lỗi lầm & sám hối', exact: true })).toHaveValue(note);
  const entries = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), `${prefix}tt_personal_reflections_v1`);
  expect(entries.some((entry: { repentance: string }) => entry.repentance === note)).toBe(true);
  expect(requests).toEqual([]);
});

test('real finite automatic rhythm settles 108 beads once after a paused tempo change without per-beat API requests', async ({ page }) => {
  // Chạy thực: bắt đầu 60 nhịp/phút, tạm dừng rồi đổi sang 80; kết thúc đủ 108 biến và ba tiếng chuông.
  // This timeout covers real media playback; the test does not seek or advance time.
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await page.locator('.tt-rosary__options-bar button').click();
  await page.getByRole('button', { name: 'Tự động gõ mõ', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Tốc độ', exact: true })).toContainText('60 nhịp/phút');
  await expect(page.getByRole('combobox', { name: 'Số biến trong phiên', exact: true })).toContainText('108 biến');
  const practiceRequests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/practice/')) practiceRequests.push(`${request.method()} ${path}`);
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Bắt đầu gõ mõ', exact: true }).click();
  await expect(page.locator('.tt-rosary__auto-status')).toContainText('Đang hành trì', { timeout: 15_000 });
  const anonymousPrefix = 'quangtu_principal_v1:anonymous:';
  await expect.poll(() => page.evaluate(key => Number(localStorage.getItem(key) ?? '0'), `${anonymousPrefix}tt_rosary_count`)).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
  await page.locator('.tt-rosary__options-bar button').click();
  await page.getByRole('combobox', { name: 'Tốc độ', exact: true }).click();
  await page.getByRole('dialog', { name: 'Tốc độ', exact: true }).getByRole('button', { name: 'Tinh tấn · 80 nhịp/phút', exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  const dedication = page.getByRole('dialog', { name: 'Hành trì thời khóa', exact: true });
  await expect(dedication).toBeVisible({ timeout: 110_000 });
  const result = await page.evaluate(prefix => ({
    count: localStorage.getItem(`${prefix}tt_rosary_count`),
    logs: JSON.parse(localStorage.getItem(`${prefix}tt_practice_logs_v1`) ?? '[]'),
    operations: JSON.parse(localStorage.getItem(`${prefix}quangtu_practice_session_outbox_v1`) ?? '[]'),
  }), anonymousPrefix);
  expect(result.count).toBe('108');
  expect(result.logs.filter((log: { type: string }) => log.type === 'Niệm danh hiệu')).toHaveLength(1);
  expect(result.logs.find((log: { type: string }) => log.type === 'Niệm danh hiệu')).toMatchObject({ count: 108 });
  expect(result.operations.filter((operation: { kind: string }) => operation.kind === 'start')).toHaveLength(1);
  expect(result.operations.filter((operation: { kind: string }) => operation.kind === 'complete')).toHaveLength(1);
  expect(practiceRequests).toEqual([]);
  await dedication.getByRole('button', { name: 'Đã đọc xong', exact: true }).click();
  const summary = page.getByRole('dialog', { name: 'Đã kết thúc phiên lần hạt', exact: true });
  await expect(summary).toBeVisible();
  await expect(summary.locator('.session-count')).toHaveText('108 biến');
  // Foreground refresh must not consume an ended media state a second time.
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const finalLogs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), `${anonymousPrefix}tt_practice_logs_v1`);
  expect(finalLogs).toEqual(result.logs);
  expect(practiceRequests).toEqual([]);
  expect(errors).toEqual([]);
});
