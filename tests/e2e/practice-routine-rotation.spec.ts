import { expect, test } from '@playwright/test';
import { useNativeApiWithLocalBackend } from './runtime-helpers';

test.afterEach(async ({ page }, info) => {
  if (info.title.startsWith('bowing principal settlement')) await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('routine rotates the requested rituals, keeps scripture choices and opens bowing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-10-26T01:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session' ? { authenticated: false, user: null, csrfToken: null, expiresAt: null } : [] }));
  await page.route('**/api/articles?**', route => route.fulfill({ json: [
    { id: 'tt_1781274943336', tieu_de: 'NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI', danh_muc: 'TRÌ CHÚ' },
    { id: 'tt_1781275267452', tieu_de: 'NGHI THỨC TRÌ TỤNG THẦN CHÚ THỦ LĂNG NGHIÊM', danh_muc: 'TRÌ CHÚ' },
    { id: 'tt_1781615695204', tieu_de: 'NGHI THỨC SÁM HỐI OAN GIA TRÁI CHỦ', danh_muc: 'NGHI THỨC KHÁC' },
    { id: 'unrelated', tieu_de: 'NGHI THỨC SÁM HỐI THAI NHI', danh_muc: 'NGHI THỨC KHÁC' },
    { id: 'sutra', tieu_de: 'KINH ĐỊA TẠNG', danh_muc: 'KINH PHẬT' },
    { id: 'unrelated-sutra', tieu_de: 'KINH TRƯỜNG BỘ', danh_muc: 'KINH PHẬT' },
  ] }));
  await page.goto('/tu-tap');
  await page.waitForSelector('[data-mounted="1"]');
  await page.getByRole('button', { name: /^Thời khóa gợi ý/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Thời khóa gợi ý', exact: true });
  const steps = dialog.locator('.practice-recommendations__grid article');
  await expect(steps).toHaveCount(3);
  await expect(steps.first()).toContainText('Ngày 17/9 âm lịch');
  await expect(steps.nth(1)).toContainText('KINH ĐỊA TẠNG');
  await expect(steps.nth(2)).toContainText('NGHI THỨC SÁM HỐI OAN GIA TRÁI CHỦ');
  await expect(steps.nth(2).getByRole('button', { name: 'Sám hối', exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('NGHI THỨC SÁM HỐI THAI NHI');
  await expect(dialog).not.toContainText('KINH TRƯỜNG BỘ');
  await dialog.screenshot({ path: 'plans/2026-10-25-remaining-app-audit/round-4/routine-updated-390-light.png' });
  const reads: string[] = [];
  page.on('request', request => {
    if (/\/api\/(?:articles|data\/)/.test(request.url())) reads.push(request.url());
  });
  await dialog.getByRole('button', { name: 'Buổi tối', exact: true }).click();
  await expect(steps.nth(2)).toContainText('NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI');
  expect(reads).toEqual([]);
  await steps.first().getByRole('button', { name: 'Lễ Phật', exact: true }).click();
  await expect(page.locator('[data-practice=bowing]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-practice=bowing]')).not.toBeVisible();
  await expect(page.locator('.tt-mode-card--rec')).toBeVisible();
});

test('Back from recommended bowing retains the count when local saving fails and allows one successful retry', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T01:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith('tt_practice_logs_v1') && document.documentElement.dataset.failBowingSave === '1') {
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session'
    ? { authenticated: false, user: null, csrfToken: null, expiresAt: null } : [] }));
  await page.goto('/tu-tap');
  await page.waitForSelector('[data-mounted="1"]');
  await page.getByRole('button', { name: /^Thời khóa gợi ý/ }).click();
  const routine = page.getByRole('dialog', { name: 'Thời khóa gợi ý', exact: true });
  await routine.locator('.practice-recommendations__grid article').first().getByRole('button', { name: 'Lễ Phật', exact: true }).click();
  await page.locator('#lp-bell-select').selectOption('none');
  await page.getByRole('button', { name: /BẮT ĐẦU ĐẢNH LỄ/ }).click();
  await page.locator('.lp-fullscreen-counter').click();
  await page.evaluate(() => { document.documentElement.dataset.failBowingSave = '1'; });
  await page.goBack();
  const confirmation = page.getByRole('dialog', { name: 'Ghi nhận công phu Lễ Phật', exact: true });
  await expect(confirmation.getByRole('alert')).toContainText('Số lần lạy được giữ nguyên');
  await expect(confirmation.getByRole('spinbutton', { name: 'Số lần đảnh lễ', exact: true })).toHaveValue('1');
  await expect(routine).not.toBeVisible();
  await expect(page.locator('.lp-fullscreen-screen')).toBeVisible();
  await page.evaluate(() => { delete document.documentElement.dataset.failBowingSave; });
  await confirmation.getByRole('button', { name: /Ghi nhận 1 lạy/ }).click();
  await expect(page.locator('.lp-fullscreen-screen')).not.toBeVisible();
  await expect(page.locator('.tt-mode-card--rec')).toBeVisible();
  const saved = await page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.endsWith('tt_practice_logs_v1'))
    .flatMap(key => JSON.parse(localStorage.getItem(key) || '[]')));
  expect(saved.filter((log: { type: string; count: number }) => log.type === 'Lễ Phật' && log.count === 1)).toHaveLength(1);
});

for (const failFirstSave of [false, true]) test(`bowing principal settlement preserves A five bows exactly once and credits B zero (storage failure=${failFirstSave})`, async ({ page, baseURL }) => {
  const now = new Date('2026-11-04T00:00:00Z');
  await page.clock.install({ time: now });
  await page.setViewportSize({ width: 390, height: 844 });
  await useNativeApiWithLocalBackend(page);
  const headers = { 'access-control-allow-origin': new URL(baseURL || 'http://localhost:8787').origin, 'access-control-allow-credentials': 'true' };
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'quangtu_principal_v1:bowing-a:tt_practice_logs_v1'
        && document.documentElement.dataset.failPrincipalBowingSave === '1') {
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  const account = (id: string, expiresAt: string) => ({ authenticated: true,
    user: { id, email: `${id}@example.test`, displayName: id, avatarUrl: '', role: 'user' },
    csrfToken: `fixture-${id}`, expiresAt });
  const accounts = {
    a: account('bowing-a', '2026-11-04T00:01:00Z'),
    b: account('bowing-b', '2026-11-04T00:02:00Z'),
    returnedA: account('bowing-a', '2026-11-04T01:00:00Z'),
  };
  let phase: keyof typeof accounts = 'a';
  await page.route('**/api/**', route => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: { ...headers,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': route.request().headers()['access-control-request-headers'] || 'content-type,x-csrf-token',
    } })
    : route.fulfill({ headers, json: new URL(route.request().url()).pathname === '/api/session' ? accounts[phase] : [] }));
  const initialSession = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
  await page.goto('/tu-tap');
  expect(await (await initialSession).json()).toEqual(accounts.a);
  await page.waitForSelector('[data-mounted="1"]');
  await page.clock.runFor(32);
  await page.locator('.tt-mode-card--le-phat').click();
  await page.locator('#lp-bell-select').selectOption('none');
  await page.locator('.lp__action-btn--start').click();
  const counter = page.locator('.lp-fullscreen-counter');
  await expect(counter).toContainText('0 lạy');
  for (let index = 0; index < 5; index++) await counter.click();
  await expect(counter).toContainText('5 lạy');
  if (failFirstSave) await page.evaluate(() => { document.documentElement.dataset.failPrincipalBowingSave = '1'; });
  phase = 'b';
  const switchToB = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
  await page.clock.runFor(60_000);
  expect(await (await switchToB).json()).toEqual(accounts.b);
  await page.clock.runFor(32);
  await expect(page.locator('.lp-fullscreen-screen')).not.toBeVisible();

  const logs = () => page.evaluate(() => {
    const read = (principal: string) => JSON.parse(localStorage.getItem(`quangtu_principal_v1:${principal}:tt_practice_logs_v1`) || '[]')
      .filter((log: { type: string }) => log.type === 'Lễ Phật');
    return { a: read('bowing-a'), b: read('bowing-b') };
  });
  expect((await logs()).b).toEqual([]);
  if (failFirstSave) expect((await logs()).a).toEqual([]);
  // Component Lễ Phật vẫn mount khi đóng; B không được mở lại bộ đếm đang giữ của A.
  await page.locator('.tt-mode-card--le-phat').click();
  if (!await page.locator('.lp-fullscreen-screen').isVisible()) {
    await page.locator('#lp-bell-select').selectOption('none');
    await page.locator('.lp__action-btn--start').click();
  }
  await expect(counter).toContainText('0 lạy');
  if (failFirstSave) {
    await page.evaluate(() => { delete document.documentElement.dataset.failPrincipalBowingSave; });
    phase = 'returnedA';
    const returnToA = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session');
    await page.clock.runFor(60_000);
    expect(await (await returnToA).json()).toEqual(accounts.returnedA);
    await page.clock.runFor(32);
    await page.locator('.tt-mode-card--le-phat').click();
    if (!await page.locator('.lp-fullscreen-screen').isVisible()) {
      await page.locator('#lp-bell-select').selectOption('none');
      await page.locator('.lp__action-btn--start').click();
    }
    const displayedA = async () => Number((await counter.innerText()).match(/\d+/u)?.[0] ?? 0);
    await expect.poll(async () => (await logs()).a.reduce((sum: number, log: { count: number }) => sum + log.count, 0) + await displayedA()).toBe(5);
    if (await displayedA() === 5) {
      await page.locator('.lp-fullscreen-finish-btn').click();
      await page.getByRole('dialog', { name: 'Ghi nhận công phu Lễ Phật', exact: true }).getByRole('button', { name: /Ghi nhận 5 lạy/ }).click();
    }
  }
  await expect.poll(async () => (await logs()).a).toEqual([expect.objectContaining({ type: 'Lễ Phật', count: 5 })]);
  expect((await logs()).b).toEqual([]);
});
