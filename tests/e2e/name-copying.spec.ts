import { expect, test } from '@playwright/test';
import { loginAsMember } from './runtime-helpers';

for (const theme of ['light', 'dark']) {
  test(`name-copying sample text remains readable (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value), theme === 'dark' ? '1' : '0');
    await page.goto('/tu-tap/chep-danh-hieu');
    const input = page.locator('#name-line-0');
    await expect(input).toBeVisible();
    const ratio = await input.evaluate(element => {
      const placeholder = getComputedStyle(element, '::placeholder');
      const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
      const ink = rgb(placeholder.color);
      const paper = rgb(getComputedStyle(element).backgroundColor);
      const alpha = Number(placeholder.opacity) * (ink[3] ?? 1);
      const actualInk = ink.slice(0, 3).map((value, index) => alpha * value + (1 - alpha) * paper[index]);
      const luminance = (channels: number[]) => channels.slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const foreground = luminance(actualInk), background = luminance(paper);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: test.info().outputPath(`name-copying-sample-${theme}.png`) });
  });
}

test('valid name copying shows a check and advances after Vietnamese composition finishes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap/chep-danh-hieu', { waitUntil: 'domcontentloaded' });
  const first = page.locator('#name-line-0');
  const second = page.locator('#name-line-1');
  await expect(first).toBeEnabled();
  for (const incorrect of ['nam mo a di da phat', 'Nam mô A Di Đà Phát', 'Nam mô Địa Tạng Vương Bồ Tát']) {
    await first.fill(incorrect);
    await expect(page.getByRole('img', { name: 'Đạt chuẩn', exact: true })).toHaveCount(0);
    await expect(page.locator('.name-copying .total')).toContainText('0 danh hiệu');
    await first.press('Enter');
    await expect(first).toBeFocused();
  }
  await first.fill('Nam mô A Di Đà');
  await expect(first).toBeFocused();
  await expect(page.getByRole('img', { name: 'Đạt chuẩn', exact: true })).toHaveCount(0);
  await first.dispatchEvent('compositionstart');
  await first.evaluate((input: HTMLInputElement) => {
    input.value = 'Nam mô A Di Đà Phật';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await expect(first).toBeFocused();
  await first.dispatchEvent('compositionend');
  await expect(page.getByRole('img', { name: 'Đạt chuẩn', exact: true })).toHaveCount(1);
  await expect(second).toBeFocused();
  await second.fill('nam mô a di đà phật');
  await expect(page.locator('#name-line-2')).toBeFocused();
  await expect(page.getByRole('img', { name: 'Đạt chuẩn', exact: true })).toHaveCount(2);
  await expect(page.locator('.name-copying .total')).toContainText('2 danh hiệu');
  await first.fill('Nam mô A Di Đà Phát');
  await expect(page.getByRole('img', { name: 'Đạt chuẩn', exact: true })).toHaveCount(1);
  await expect(page.locator('.name-copying .total')).toContainText('1 danh hiệu');
  await first.press('Enter');
  await expect(first).toBeFocused();
  await first.fill('Nam mô A Di Đà Phật');
  await expect(page.getByRole('img', { name: 'Đạt chuẩn', exact: true })).toHaveCount(2);
});

test('name copying works offline and blocks pasted text without losing drafts', async ({ page, context }) => {
  await page.goto('/tu-tap/chep-danh-hieu');
  const first = page.locator('#name-line-0');
  await expect(first).toBeEnabled();
  await context.setOffline(true);
  await first.fill('Nam mô A Di Đà Phật');
  await page.locator('#name-line-1').dispatchEvent('paste');
  await expect(page.locator('.name-copying')).toContainText('không dán hoặc kéo thả');
  await expect(first).toHaveValue('NAM MÔ A DI ĐÀ PHẬT');
  await expect(page.locator('#name-line-1')).toHaveValue('');
  await context.setOffline(false);
  await page.reload();
  await expect(first).toHaveValue('NAM MÔ A DI ĐÀ PHẬT');
});

test('corrupt name copying data stays untouched and disables editing', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('quangtu_principal_v1:anonymous:tt_name_copying_draft_v1', '{broken');
  });
  await page.goto('/tu-tap/chep-danh-hieu');
  await expect(page.locator('.name-copying')).toContainText('Không đọc được bản chép đã lưu');
  await expect(page.locator('#name-line-0')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('quangtu_principal_v1:anonymous:tt_name_copying_draft_v1'))).toBe('{broken');
});

test('name copying uses the app English locale', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'en'));
  await page.goto('/tu-tap/chep-danh-hieu');
  await expect(page.getByRole('heading', { name: 'Copy Buddha and Bodhisattva Names' })).toBeVisible();
  await expect(page.locator('.name-copying .guide')).toContainText('including Vietnamese accents');
  await expect(page.locator('#name-line-0')).toBeEnabled();
  await page.locator('#name-line-0').fill('Nam mô A Di Đà Phật');
  await expect(page.locator('.name-copying .total')).toContainText('1 sacred names copied');
});

test('name copying keeps guest and member drafts separate across sign-in and sign-out', async ({ page, context }) => {
  await page.goto('/tu-tap/chep-danh-hieu');
  const first = page.locator('#name-line-0');
  await expect(first).toBeEnabled();
  await first.fill('Nam mô khách');
  await loginAsMember(page);
  await page.reload();
  await expect(first).toHaveValue('');
  await first.fill('Nam mô thành viên');
  await context.clearCookies();
  await page.reload();
  await expect(first).toHaveValue('NAM MÔ KHÁCH');
  await loginAsMember(page);
  await page.reload();
  await expect(first).toHaveValue('NAM MÔ THÀNH VIÊN');
});

test('failed local saving keeps the entered text and shows an error', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.endsWith(':tt_name_copying_draft_v1')) throw new DOMException('Full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.goto('/tu-tap/chep-danh-hieu');
  const first = page.locator('#name-line-0');
  await expect(first).toBeEnabled();
  await first.fill('Nam mô A Di Đà Phật');
  await expect(first).toHaveValue('NAM MÔ A DI ĐÀ PHẬT');
  await expect(page.locator('.name-copying .error')).toContainText('Không thể lưu bản chép');
});

test('name copying leaves space for the native header when the viewport shrinks', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap/chep-danh-hieu');
  await expect(page.locator('#name-line-0')).toBeEnabled();
  await page.evaluate(() => document.documentElement.dataset.nativeApp = 'true');
  await expect.poll(async () => {
    const header = await page.locator('.tt-topbar').boundingBox();
    const content = await page.locator('.name-copying h1').boundingBox();
    return content!.y >= header!.y + header!.height;
  }).toBe(true);
  await page.setViewportSize({ width: 375, height: 500 });
  await page.locator('#name-line-0').fill('Nam mô A Di Đà Phật');
  await expect(page.locator('#name-line-1')).toBeFocused();
  const input = await page.locator('#name-line-1').boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).boundingBox();
  expect(input!.y + input!.height).toBeLessThanOrEqual(nav!.y);
});

test('name copying rolls over successive rounds from a post-reset draft, retains receipts and makes no practice requests', async ({ page }) => {
  await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
  const entry = page.getByRole('link', { name: /Chép danh hiệu Phật, Bồ Tát/ });
  await expect(page.locator('.tt-group-block').filter({ has: entry }).getByRole('heading', { name: 'Biên chép công đức', exact: true })).toBeVisible();
  expect(await entry.evaluate(element => element.previousElementSibling?.classList.contains('tt-mode-card--copying'))).toBe(true);
  await expect(entry).toHaveCSS('text-decoration-line', 'none');
  await expect(page.locator('a[href="/tu-tap/chep-kinh"]')).toHaveCSS('text-decoration-line', 'none');
  await entry.click();
  await expect(page.locator('#name-line-0')).toBeEnabled();
  const requests: string[] = [];
  page.on('request', request => { if (/\/api\/(practice|session|data\/user_sync_data)/.test(request.url())) requests.push(request.url()); });
  const total = page.locator('.name-copying .total');
  const phrase = 'Nam mô A Di Đà Phật';
  const completeTwo = async () => {
    await page.locator('#name-line-0').fill(phrase);
    await page.locator('#name-line-1').fill(phrase);
    await page.getByRole('button', { name: 'Hoàn thành', exact: true }).click();
    await page.getByRole('dialog', { name: 'Xác nhận hoàn thành?', exact: true })
      .getByRole('button', { name: 'Hoàn thành & Ghi nhận', exact: true }).click();
    await expect(page.locator('#name-line-0')).toHaveValue('');
    await expect(total).toContainText('2 danh hiệu');
  };
  await completeTwo();
  const oldLogs = await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]'));
  expect(oldLogs).toEqual([expect.objectContaining({ type: 'Chép danh hiệu', count: 2 })]);
  const oldId = oldLogs[0].id as number;
  const epoch = '971ac732-e60a-43ec-8d8d-12ad593b59c0';
  // Post-reset storage fixture: the exported reset operation is unit-tested.
  // There is no reset button in the current UI; exercise its restored state here.
  await page.evaluate(({ oldId, epoch }) => {
    const prefix = 'quangtu_principal_v1:anonymous:';
    const draft = JSON.parse(localStorage.getItem(`${prefix}tt_name_copying_draft_v1`)!);
    for (const phrase of Object.keys(draft.completed)) {
      draft.completed[phrase] = 0;
      draft.lines[phrase] = draft.lines[phrase].map(() => '');
    }
    draft.completionEpoch = epoch;
    localStorage.setItem(`${prefix}tt_name_copying_draft_v1`, JSON.stringify(draft));
    localStorage.setItem(`${prefix}tt_practice_logs_v1`, '[]');
    localStorage.setItem(`${prefix}tt_deleted_practice_logs_v1`, JSON.stringify([String(oldId)]));
  }, { oldId, epoch });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#name-line-0')).toBeEnabled();
  await expect(total).toContainText('0 danh hiệu');
  await completeTwo();
  const newLogs = await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]'));
  expect(newLogs).toEqual([expect.objectContaining({ type: 'Chép danh hiệu', count: 2 })]);
  expect(newLogs[0].id).not.toBe(oldId);
  await expect(page.locator('#name-copying-title option')).toHaveCount(10);
  await page.locator('#name-line-0').fill('sai danh hiệu');
  await expect(total).toContainText('2 danh hiệu');
  await page.locator('#name-line-0').fill(phrase);
  await page.locator('#name-line-0').press('Enter');
  await expect(page.locator('#name-line-1')).toBeFocused();
  for (let i = 1; i < 107; i++) await page.locator(`#name-line-${i}`).fill(phrase);
  await page.locator('#name-line-107').focus();
  await page.locator('#name-line-107').dispatchEvent('compositionstart');
  await page.locator('#name-line-107').evaluate((input: HTMLInputElement, phrase) => {
    input.value = phrase;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: phrase }));
  }, phrase);
  await expect(page.locator('#name-line-107')).toHaveValue(phrase);
  await page.locator('#name-line-107').dispatchEvent('compositionend', { data: phrase });
  await expect(total).toContainText('110 danh hiệu');
  await expect(page.locator('#name-line-0')).toHaveValue('');
  await expect(page.locator('#name-line-0')).toBeFocused();
  await page.locator('#name-line-0').fill(phrase);
  await expect(total).toContainText('111 danh hiệu');
  for (let i = 1; i < 108; i++) await page.locator(`#name-line-${i}`).fill(phrase);
  await expect(total).toContainText('218 danh hiệu');
  await expect(page.locator('#name-line-107')).toHaveValue('');
  const completed = await page.evaluate(() => {
    const prefix = 'quangtu_principal_v1:anonymous:';
    return {
      logs: JSON.parse(localStorage.getItem(`${prefix}tt_practice_logs_v1`) || '[]'),
      deleted: JSON.parse(localStorage.getItem(`${prefix}tt_deleted_practice_logs_v1`) || '[]'),
      draft: JSON.parse(localStorage.getItem(`${prefix}tt_name_copying_draft_v1`) || 'null'),
    };
  });
  expect(completed.logs.map((log: { count: number }) => log.count).sort((a: number, b: number) => a - b)).toEqual([2, 108, 108]);
  expect(completed.logs.some((log: { id: number }) => log.id === oldId)).toBe(false);
  expect(completed.deleted).toContain(String(oldId));
  expect(completed.draft.completionEpoch).toBe(epoch);
  await page.getByRole('combobox', { name: 'Chọn danh hiệu' }).selectOption('Nam mô Dược Sư Lưu Ly Quang Vương Phật');
  await page.locator('#name-line-0').fill('Nam mô Dược Sư');
  await page.getByRole('combobox', { name: 'Chọn danh hiệu' }).selectOption(phrase);
  await expect(page.locator('#name-line-0')).toHaveValue('');
  expect(requests).toEqual([]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(total).toContainText('218 danh hiệu');
  await page.getByRole('combobox', { name: 'Chọn danh hiệu' }).selectOption('Nam mô Dược Sư Lưu Ly Quang Vương Phật');
  await expect(page.locator('#name-line-0')).toHaveValue('NAM MÔ DƯỢC SƯ');
  await page.getByRole('combobox', { name: 'Chọn danh hiệu' }).selectOption('Ôm Ma Ni Pát Mê Hùm');
  await page.locator('#name-line-0').fill('Ôm Ma Ni Pát Mê Hùm');
  await expect(page.locator('#name-line-0')).toHaveValue('ÔM MA NI PÁT MÊ HÙM');
  await expect(total).toContainText('219 danh hiệu');
});

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`name copying layout ${width} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(dark => localStorage.setItem('tutam_dark_mode', dark ? '1' : '0'), dark);
      await page.goto('/tu-tap/chep-danh-hieu', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#name-line-0')).toBeEnabled();
      await expect(page.locator('.name-copying .back')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Quay lại', exact: true })).toHaveCount(1);
      const contentBox = await page.locator('.name-copying h1').boundingBox();
      const headerBox = await page.locator('.tt-topbar').boundingBox();
      expect(contentBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/name-copying-${width}-${dark ? 'dark' : 'light'}.png` });
      await page.locator('#name-line-0').fill('nam mo a di da phat');
      await expect(page.getByRole('img', { name: 'Đạt chuẩn', exact: true })).toHaveCount(0);
      await expect(page.locator('.name-copying .total')).toContainText('0 danh hiệu');
      await page.locator('#name-line-0').fill('Nam mô A Di Đà Phật');
      await expect(page.locator('.name-copying .total')).toContainText('1 danh hiệu');
      await page.locator('#name-line-0').scrollIntoViewIfNeeded();
      const inputBox = await page.locator('#name-line-0').boundingBox();
      expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(844 - (width === 375 ? 62 : 0));
      await page.screenshot({ path: `test-results/name-copying-input-${width}-${dark ? 'dark' : 'light'}.png` });
      await page.locator('.tt-topbar .tt-back-btn').click();
      await expect(page).toHaveURL(/\/tu-tap$/);
      await page.goto('/tu-tap/chep-danh-hieu');
      await expect(page.locator('#name-line-0')).toHaveValue('NAM MÔ A DI ĐÀ PHẬT');
    });
  }
}
