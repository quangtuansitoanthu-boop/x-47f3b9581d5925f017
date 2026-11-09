import { expect, test, type Page } from '@playwright/test';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { loginAsAdmin, settleClient } from './runtime-helpers';

const customKey = 'tt_custom_rosary_phrases_v1';
const logsKey = principalStorageKey(null, 'tt_practice_logs_v1');

async function chooseNewPhrase(page: Page) {
  await page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true }).click();
  await page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true }).getByRole('button', { name: 'Thêm tùy chọn mới', exact: true }).click();
}

async function expectCustomChoices(page: Page, expected: number | string[]) {
  await page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true });
  const choices = picker.locator('[data-value^="custom:"]');
  if (typeof expected === 'number') await expect(choices).toHaveCount(expected);
  else await expect(choices).toContainText(expected);
  await picker.getByRole('button', { name: 'Đóng bảng chọn', exact: true }).click();
}

test('restored previous-day beads are recorded once and carried forward until the unfinished rosary ends', async ({ page }) => {
  await page.addInitScript(() => {
    // Reload phải dùng trạng thái ứng dụng đã lưu, không gieo lại số hạt ngày cũ.
    if (sessionStorage.getItem('rosary-rollover-fixture-seeded')) return;
    const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    localStorage.setItem('quangtu_principal_v1:anonymous:quangtu_guided_practice_settings_v1', JSON.stringify({
      rosaryDate: yesterday, rosaryPhrase: 'Nam mô A Di Đà Phật', rosarySize: 108, rosaryDailyGoal: 1000,
    }));
    localStorage.setItem('quangtu_principal_v1:anonymous:tt_rosary_count', '3');
    // Giữ bằng chứng đây là phần niệm mới chưa chốt, không phải tổng legacy đã được ghi sổ.
    localStorage.setItem('quangtu_principal_v1:anonymous:tt_rosary_completion_v1', JSON.stringify({
      date: yesterday, accounted: 0, pending: null, resetPending: false,
    }));
    sessionStorage.setItem('rosary-rollover-fixture-seeded', '1');
  });
  await page.goto('/tu-tap');
  await settleClient(page);
  const yesterday = await page.evaluate(() => new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(logs).toMatchObject([{ count: 3, date: yesterday, type: 'Niệm danh hiệu', note: 'Lần hạt: Nam mô A Di Đà Phật' }]);
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_rosary_count'))).toBe('3');
  await page.reload();
  await settleClient(page);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey)).toEqual(logs);
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_rosary_count'))).toBe('3');
  await openRosary(page, false);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('3/108');
  await beads(page, 1);
  await expect(page.locator('.tt-rosary__cycle')).toContainText('4/108');
  await finish(page);
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const settled = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(settled).toHaveLength(2);
  expect(settled).toEqual(expect.arrayContaining([
    ...logs,
    expect.objectContaining({ count: 1, date: today, type: 'Niệm danh hiệu', note: 'Lần hạt: Nam mô A Di Đà Phật' }),
  ]));
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_rosary_count'))).toBe('0');
});

test('rosary keeps the session when completion outbox is full and retries without duplicate logs', async ({ page }) => {
  const queueKey = principalStorageKey(null, 'quangtu_practice_session_outbox_v1');
  await openRosary(page);
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify(Array.from({ length: 999 }, (_, index) => ({
      id: `filler:${index}`, kind: 'start', clientSessionId: `filler:${index}`, payload: {},
    }))));
  }, queueKey);
  await beads(page, 1);
  await finish(page, false);
  await expect(page.getByRole('button', { name: 'Niệm một hạt', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey)).toMatchObject([{ count: 1 }]);
  const sessionId = await page.evaluate(key => {
    const operations = JSON.parse(localStorage.getItem(key) || '[]');
    const own = operations.filter((operation: { id: string }) => !operation.id.startsWith('filler:'));
    localStorage.setItem(key, JSON.stringify(own));
    return own[0].clientSessionId;
  }, queueKey);
  await finish(page);
  await expect(page.getByRole('button', { name: 'Niệm một hạt', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey)).toMatchObject([{ count: 1 }]);
  const operations = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), queueKey);
  expect(operations.filter((operation: { kind: string; clientSessionId: string }) => operation.kind === 'complete' && operation.clientSessionId === sessionId)).toHaveLength(1);
});

for (const dark of [false, true]) {
  test(`an unsaved custom recitation explains the blocked counter and becomes usable after saving, dark=${dark}`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
    await page.setViewportSize({ width: 375, height: 844 });
    await openRosary(page);
    await chooseNewPhrase(page);
    const help = page.locator('#tt-rosary-phrase');
    await expect(help).toContainText('Chưa có danh hiệu hợp lệ để lần hạt.');
    await expect(help).toContainText('Lưu vào danh sách lựa chọn');
    const count = page.getByRole('button', { name: 'Niệm một hạt', exact: true });
    await expect(count).toBeDisabled();
    const bead = page.getByRole('button', { name: 'Vuốt, chạm chuỗi hạt hoặc dùng phím mũi tên để đếm hạt', exact: true });
    await expect(bead).toHaveAccessibleDescription(/Chưa có danh hiệu hợp lệ/);
    await bead.click({ force: true });
    await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
    await page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true }).fill('Om Mani Padme Hum');
    await expect(count).toBeDisabled();
    await page.locator('.tt-rosary__options-bar button').click();
    await help.scrollIntoViewIfNeeded();
    await expect(help).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('unsaved-phrase-help.png') });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(help).toBeVisible();
    expect(await help.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 375, height: 844 });
    await page.locator('.tt-rosary__options-bar button').click();
    await page.getByRole('button', { name: /Lưu vào danh sách lựa chọn/ }).click();
    await expect(help).toHaveText('Om Mani Padme Hum');
    await expect(count).toBeEnabled();
    await beads(page, 1);
    await finish(page);
    const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
    expect(logs).toMatchObject([{ count: 1, note: 'Lần hạt: Om Mani Padme Hum' }]);
  });

  test(`custom controls fit a 375px phone with dark=${dark}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
    await openRosary(page);
    await chooseNewPhrase(page);
    const input = page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true });
    await expect(input).toBeVisible();
    expect(await input.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44;
    })).toBe(true);
    await page.screenshot({ path: info.outputPath('custom-phone.png'), animations: 'disabled' });
    await addPhrase(page, 'Om Mani Padme Hum trên điện thoại', 'Trì chú');
    await beads(page, 1);
    await finish(page);
    const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ count: 1, type: 'Trì chú' })]));
  });
}

test('an authenticated custom mantra reaches the existing session API successfully', async ({ page }) => {
  await loginAsAdmin(page);
  await openRosary(page);
  await addPhrase(page, 'Om Mani Padme Hum máy chủ', 'Trì chú');
  const started = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/practice/sessions');
  await beads(page, 3);
  expect((await started).ok()).toBe(true);
  const completed = page.waitForResponse(response => response.request().method() === 'POST'
    && /\/api\/practice\/sessions\/[^/]+\/complete$/.test(new URL(response.url()).pathname));
  await finish(page);
  expect((await completed).ok()).toBe(true);
});

async function openRosary(page: Page, navigate = true) {
  if (navigate) {
    await page.goto('/tu-tap');
    await settleClient(page);
  }
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  const toggle = page.locator('.tt-rosary__options-bar button');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

async function addPhrase(page: Page, text: string, type: string) {
  await chooseNewPhrase(page);
  await page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true }).fill(text);
  await page.getByRole('radio', { name: type, exact: true }).check();
  await page.getByRole('button', { name: /Lưu vào danh sách lựa chọn/ }).click();
}

async function beads(page: Page, count: number) {
  for (let index = 0; index < count; index += 1) {
    await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
    await page.waitForTimeout(450);
  }
}

async function finish(page: Page, succeeds = true) {
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
  if (succeeds) await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
  else {
    await expect(page.getByRole('alert')).toContainText('Chưa chốt sổ được');
    await page.getByRole('button', { name: 'Tiếp tục niệm', exact: true }).click();
  }
}

test('changing a phrase preserves the 400ms minimum between accepted beads', async ({ page }) => {
  await openRosary(page);
  await page.evaluate(() => {
    const state = window as unknown as { rosaryTestTime: number };
    state.rosaryTestTime = Math.ceil(performance.now());
    Object.defineProperty(performance, 'now', { configurable: true, value: () => state.rosaryTestTime });
  });
  const countKey = principalStorageKey(null, 'tt_rosary_count');
  const count = () => page.evaluate(key => Number(localStorage.getItem(key)), countKey);
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  expect(await count()).toBe(1);
  // Let the bead's independent 240ms visual animation finish; the tested clock stays fixed.
  await page.waitForTimeout(250);
  await page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true }).click();
  await page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true }).getByRole('button', { name: 'Nam mô Quán Thế Âm Bồ Tát', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { rosaryTestTime: number }).rosaryTestTime += 399; });
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  expect(await count()).toBe(1);
  await page.waitForTimeout(250);
  await page.evaluate(() => { (window as unknown as { rosaryTestTime: number }).rosaryTestTime += 1; });
  await page.getByRole('button', { name: 'Niệm một hạt', exact: true }).click();
  expect(await count()).toBe(2);
});

test('deleting the active phrase preserves its completed count and type', async ({ page }) => {
  await openRosary(page);
  await addPhrase(page, 'Om Mani Padme Hum xóa', 'Trì chú');
  await beads(page, 2);
  await page.getByRole('button', { name: /Xóa khỏi danh sách/ }).click();
  await finish(page);
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(logs).toEqual(expect.arrayContaining([
    expect.objectContaining({ count: 2, type: 'Trì chú', note: 'Lần hạt: Om Mani Padme Hum xóa' }),
  ]));
  await openRosary(page);
  await expectCustomChoices(page, 0);
});

test('corrupt restored settings do not attribute old counts to the default Buddha', async ({ page }) => {
  await page.addInitScript(({ settings, count }) => {
    localStorage.setItem(settings, '{broken');
    localStorage.setItem(count, '3');
  }, {
    settings: principalStorageKey(null, 'quangtu_guided_practice_settings_v1'),
    count: principalStorageKey(null, 'tt_rosary_count'),
  });
  await openRosary(page);
  await expect(page.getByRole('button', { name: 'Niệm một hạt', exact: true })).toBeDisabled();
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(logs).toEqual([]);
});

test('custom phrases retain separate counts and practice types when changed during a session', async ({ page }) => {
  await openRosary(page);
  await addPhrase(page, 'Nam mô Dược Sư Phật kiểm thử', 'Niệm danh hiệu');
  await expect(page.locator('.tt-rosary__phrase')).toHaveText('Nam mô Dược Sư Phật kiểm thử');
  await beads(page, 3);
  await addPhrase(page, 'Om Mani Padme Hum kiểm thử', 'Trì chú');
  await beads(page, 2);
  await finish(page);
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(logs).toEqual(expect.arrayContaining([
    expect.objectContaining({ count: 3, type: 'Niệm danh hiệu', note: 'Lần hạt: Nam mô Dược Sư Phật kiểm thử' }),
    expect.objectContaining({ count: 2, type: 'Trì chú', note: 'Lần hạt: Om Mani Padme Hum kiểm thử' }),
  ]));
  expect(logs.reduce((sum: number, log: { count: number }) => sum + log.count, 0)).toBe(5);
  await openRosary(page);
  await expect(page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true }))
    .toContainText('Om Mani Padme Hum kiểm thử');
});

test('custom storage failure keeps the draft and does not select or announce a saved item', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(':tt_custom_rosary_phrases_v1')) throw new DOMException('quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await openRosary(page);
  await addPhrase(page, 'Nam mô Dược Sư Phật chưa lưu', 'Niệm danh hiệu');
  await expect(page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true })).toContainText('Thêm tùy chọn mới');
  await expect(page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true }))
    .toHaveValue('Nam mô Dược Sư Phật chưa lưu');
  await expect(page.getByRole('button', { name: 'Niệm một hạt', exact: true })).toBeDisabled();
  await expectCustomChoices(page, 0);
  await expect(page.getByText(/Đã lưu.*chưa lưu/)).toHaveCount(0);
});

test('retrying a partially saved custom phrase does not create duplicate choices', async ({ page }) => {
  await openRosary(page);
  await chooseNewPhrase(page);
  await page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true }).fill('Danh hiệu lưu một phần');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(':quangtu_guided_practice_settings_v1')) throw new DOMException('quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: /Lưu vào danh sách lựa chọn/ }).click();
  await page.getByRole('button', { name: /Lưu vào danh sách lựa chọn/ }).click();
  await expectCustomChoices(page, 1);
  await expect(page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true })).toHaveValue('Danh hiệu lưu một phần');
  await expect(page.getByRole('button', { name: 'Niệm một hạt', exact: true })).toBeDisabled();
});

test('unsettled restored custom count keeps its readable phrase and type instead of a custom ID', async ({ page }) => {
  await page.addInitScript(({ key, settings, count, completion }) => {
    const id = 'cp_1793400000000_test';
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    localStorage.setItem(key, JSON.stringify([{ id, text: 'Om Mani Padme Hum khôi phục', type: 'Trì chú' }]));
    localStorage.setItem(settings, JSON.stringify({ rosaryPhrase: `custom:${id}`, rosaryDate: date }));
    localStorage.setItem(count, '3');
    // Có receipt mới chứng minh đây là số chưa chốt; số legacy thiếu receipt đã được baseline để tránh cộng lại.
    localStorage.setItem(completion, JSON.stringify({ date, accounted: 0, pending: null, resetPending: false }));
  }, {
    key: principalStorageKey(null, customKey),
    settings: principalStorageKey(null, 'quangtu_guided_practice_settings_v1'),
    count: principalStorageKey(null, 'tt_rosary_count'),
    completion: principalStorageKey(null, 'tt_rosary_completion_v1'),
  });
  await openRosary(page);
  await finish(page);
  const logs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), logsKey);
  expect(logs).toEqual(expect.arrayContaining([
    expect.objectContaining({ count: 3, type: 'Trì chú', note: 'Lần hạt: Om Mani Padme Hum khôi phục' }),
  ]));
});

test('principal invalidation clears custom choices and the owner draft before a guest adds a phrase', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify([{ id: 'cp_1793400000000_owner', text: 'Danh hiệu tài khoản A', type: 'Niệm danh hiệu' }]));
  }, principalStorageKey('e2e-google-admin', customKey));
  await loginAsAdmin(page);
  await openRosary(page);
  await expectCustomChoices(page, ['Danh hiệu tài khoản A']);
  await chooseNewPhrase(page);
  await page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true }).fill('Bản nháp tài khoản A');
  // Mobile kiểm lại phiên từ server khi trang được khôi phục; giữ nguyên route đang mở.
  await page.context().clearCookies();
  const refreshedSession = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session'
    && response.request().method() === 'GET' && response.status() === 200);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  expect(await (await refreshedSession).json()).toMatchObject({ authenticated: false });
  await openRosary(page, false);
  await expectCustomChoices(page, 0);
  await chooseNewPhrase(page);
  await expect(page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true })).toHaveValue('');
  await addPhrase(page, 'Danh hiệu khách B', 'Niệm danh hiệu');
  const guest = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), principalStorageKey(null, customKey));
  expect(guest.map((item: { text: string }) => item.text)).toEqual(['Danh hiệu khách B']);
});
