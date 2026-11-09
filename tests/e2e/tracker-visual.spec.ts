import { expect, test } from '@playwright/test';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { settleClient } from './runtime-helpers';

test.describe('Practice tracker visual parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ trackerKey, logsKey }) => {
      localStorage.setItem(trackerKey, '1');
      localStorage.setItem(logsKey, JSON.stringify([
        {
          id: 2,
          date: '2026-08-01',
          type: 'Thọ giới',
          count: 1,
          note: 'Bát quan trai giới',
          created: '2026-08-01T08:00:00.000Z',
        },
        {
          id: 1,
          date: '2026-07-31',
          type: 'Tụng kinh',
          count: 12,
          note: 'Kinh Địa Tạng',
          created: '2026-07-31T08:00:00.000Z',
        },
      ]));
    }, { trackerKey: principalStorageKey(null, 'ttTrackerOpen'), logsKey: principalStorageKey(null, 'tt_practice_logs_v1') });
  });

  test('expanded anatomy and history modal match the production contract', async ({ page }) => {
    await page.goto('/tu-tap');
    await settleClient(page);
    if (!await page.locator('#practice-tracker-body').isVisible()) await page.locator('button.tt-mode-card--tracker').click();

    await expect(page.locator('.tt-tracker__subtitle').filter({ hasText: 'Từng chút tinh tấn, mỗi ngày' })).toHaveText('Từng chút tinh tấn, mỗi ngày');
    await expect(page.getByRole('button', { name: 'Ghi nhận công phu', exact: true })).toHaveCount(0);

    const tracker = page.locator('.tt-tracker__card');
    const body = page.locator('#practice-tracker-body');
    await expect(body).toBeVisible();
    const appFont = await page.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--font-app').replace(/['"]/g, '').replace(/\s+/g, ' ').trim());
    expect(appFont).toContain('San Francisco Web');
    await expect.poll(() => tracker.evaluate(element => getComputedStyle(element).fontFamily
      .replace(/['"]/g, '').replace(/\s+/g, ' ').trim())).toBe(appFont);
    await expect(body.getByText('Kinh Địa Tạng', { exact:true })).toBeVisible();
    await expect(body.getByText('Bát quan trai giới', { exact:true })).toBeVisible();
    await expect(body.getByText('01/08/2026', { exact: true })).toBeVisible();
    await expect(body.getByText('31/07/2026', { exact: true })).toBeVisible();
    await expect(body.locator('.tt-tracker__summary')).not.toBeEmpty();

    const trackerHeight = await tracker.evaluate((element) => element.getBoundingClientRect().height);
    await body.getByRole('button', { name: 'Xem mục cũ' }).click();

    const dialog = page.getByRole('dialog', { name: 'Lịch sử công phu' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/12 biến/)).toBeVisible();
    await expect(dialog.getByText(/1 lần/)).toBeVisible();
    await expect(dialog.getByText('Kinh Địa Tạng')).toBeVisible();
    await expect(dialog.getByText('01/08/2026', { exact: true })).toBeVisible();
    await expect(dialog.getByText('31/07/2026', { exact: true })).toBeVisible();
    expect(await tracker.evaluate((element) => element.getBoundingClientRect().height)).toBe(trackerHeight);

    await dialog.getByRole('button', {name:'Đóng',exact:true}).click();
    await expect(dialog).toHaveCount(0);
  });

  test('tracker preserves existing history across responsive layouts', async ({ page }) => {
    await page.setViewportSize({ width: 769, height: 715 });
    await page.goto('/tu-tap');
    await settleClient(page);
    if (!await page.locator('#practice-tracker-body').isVisible()) await page.locator('button.tt-mode-card--tracker').click();

    const tracker = page.locator('.tt-tracker__card');
    await expect(tracker.getByRole('button', {name:'+ Ghi nhận',exact:true})).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ghi nhận công phu', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Ghi nhận công phu' })).toHaveCount(0);
    await expect(tracker.getByRole('link', { name: 'Tiến độ xác minh →' })).toHaveAttribute('href', '/tien-do-tu-tap');

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(tracker.getByRole('button', {name:'+ Ghi nhận',exact:true})).toBeVisible();
    await tracker.getByRole('button', { name: 'Xem mục cũ' }).click();
    const history = page.getByRole('dialog', { name: 'Lịch sử công phu' });
    await expect(history).toContainText('Lịch sử tu tập tự động và thủ công được lưu trữ an toàn trên thiết bị của bạn.');
    await history.getByRole('button', { name: 'Đóng' }).click();
    const storedLogs = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), principalStorageKey(null, 'tt_practice_logs_v1'));
    expect(storedLogs).toHaveLength(2);
  });
});


test('approved tracker actions and manual form stay reachable without saving cancelled drafts', async ({ page }) => {
  const key = principalStorageKey(null, 'tt_practice_logs_v1');
  const writes: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && path !== '/api/presence' && ['POST','PUT','PATCH','DELETE'].includes(request.method())) writes.push(path);
  });
  for (const viewport of [{width:320,height:568},{width:375,height:360},{width:667,height:375},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    await page.goto('/tu-tap');
    await settleClient(page);
    await page.locator('button.tt-mode-card--tracker').click();
    const tracker = page.getByRole('dialog', {name:'Công phu của tôi',exact:true});
    const record = tracker.getByRole('button', {name:'+ Ghi nhận',exact:true});
    const progress = tracker.getByRole('link', {name:'Tiến độ xác minh →',exact:true});
    await expect(record).toBeVisible();
    await expect(progress).toHaveAttribute('href','/tien-do-tu-tap');
    const first = (await record.boundingBox())!;
    const second = (await progress.boundingBox())!;
    expect(Math.abs(first.y-second.y)).toBeLessThan(1);
    expect(Math.abs(first.height-second.height)).toBeLessThan(1);
    expect(first.height).toBeGreaterThanOrEqual(44);
    for (const control of [record,progress]) expect(await control.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const colors = await record.evaluate(() => {
      const probe = document.createElement('span');
      document.body.append(probe);
      const resolve = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const result = { rest: resolve('--gold'), hover: resolve('--gold2') };
      probe.remove();
      return result;
    });
    // Khi đổi khổ màn/modal, vị trí chuột cũ có thể trùng nút mới xuất hiện.
    await page.mouse.move(0, 0);
    await expect.poll(() => record.evaluate(el => el.matches(':hover'))).toBe(false);
    await expect(record).toHaveCSS('background-color', colors.rest);
    await record.hover();
    await expect(record).toHaveCSS('background-color', colors.hover);
    await page.mouse.move(0, 0);
    await expect(record).toHaveCSS('background-color', colors.rest);
    const before = await page.evaluate(k=>localStorage.getItem(k),key);
    await record.click();
    const form = page.getByRole('dialog',{name:'Ghi nhận tu tập thủ công',exact:true});
    await expect(form).toBeVisible();
    const count=form.locator('#practice-log-count');
    await count.fill('0');
    await form.getByRole('button',{name:'Ghi nhận 🙏',exact:true}).click();
    await expect(form).toBeVisible();
    expect(await count.evaluate(el => (el as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
    const note=form.locator('#practice-log-note');
    await note.fill('Bản nháp hủy — giữ nguyên dữ liệu đã lưu.');
    await note.scrollIntoViewIfNeeded();
    await note.focus();
    await expect(note).toBeFocused();
    if (viewport.width === 375 && viewport.height === 360) {
      await page.screenshot({ path: test.info().outputPath('manual-short.png') });
    }
    for (const control of [form.getByRole('button',{name:'Hủy',exact:true}),form.getByRole('button',{name:'Ghi nhận 🙏',exact:true})]) {
      const box=(await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
    }
    await form.getByRole('button',{name:'Hủy',exact:true}).click();
    await expect(form).toHaveCount(0);
    await expect(record).toBeFocused();
    expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(before);
    await tracker.getByRole('button',{name:'Quay lại Tu Tập',exact:true}).click();
  }
  expect(writes).toEqual([]);
});

test('English tracker actions remain single-line on a small phone', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_locale','en'));
  await page.setViewportSize({width:320,height:568});
  await page.goto('/tu-tap'); await settleClient(page);
  await page.locator('button.tt-mode-card--tracker').click();
  const record=page.getByRole('button',{name:'+ Record',exact:true});
  const progress=page.getByRole('link',{name:'Verified progress →',exact:true});
  await expect(record).toBeVisible(); await expect(progress).toBeVisible();
  for(const control of [record,progress]) expect(await control.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
