import { expect, test } from '@playwright/test';

test('continue practice remains visible without saved progress and opening it makes no new requests', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 844 });
  let requests = 0;
  await page.route('**/api/**', route => {
    requests++;
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/session'
      ? { authenticated: false, user: null, csrfToken: null }
      : path === '/api/presence' ? { enabled: false, activeCount: 0 } : [] });
  });
  const initialPresence = page.waitForResponse(response => new URL(response.url()).pathname === '/api/presence');
  await page.goto('/tu-tap');
  await initialPresence;
  const card = page.locator('.tt-mode-card--continue');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Chưa có công phu đang dở');
  const before = requests;
  await card.click();
  const dialog = page.locator('.tt-continue-modal');
  await expect(dialog).toContainText('Chưa có công phu đang dở');
  await dialog.locator('.tt-modal-close').click();
  await expect(card).toBeVisible();
  expect(requests).toBe(before);
  await page.screenshot({ path: info.outputPath('continue-practice-restored.png') });
});

for (const locale of ['vi', 'en'] as const) for (const dark of [false, true]) {
  test(`companion dialogs share the journal layout and preserve actions (${locale}, ${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(({ locale, dark }) => {
      localStorage.setItem('tutam_locale', locale);
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
      localStorage.setItem('quangtu_principal_v1:anonymous:quangtu_reading_progress_v1', JSON.stringify([{
        contentKind: 'practice', contentId: 'companion-sutra', revision: 1, epoch: 1,
        deviceId: 'companion-test', deviceSequence: 1, position: { chapterId: '0' },
        total: 2, percent: 10, contentVersion: null, serverUpdatedAt: null,
        clientUpdatedAt: '2026-10-25T00:00:00Z',
      }]));
    }, { locale, dark });
    let apiRequests = 0;
    await page.route('**/api/**', route => {
      apiRequests++;
      const path = new URL(route.request().url()).pathname;
      const json = path === '/api/session' ? { authenticated: false, user: null, csrfToken: null, expiresAt: null }
        : path === '/api/articles' ? [{ id: 'companion-sutra', tieu_de: 'Kinh Địa Tạng Bồ Tát Bổn Nguyện',
          danh_muc: 'KINH PHẬT', trang_thai: 'Hoàn thành', has_muc_luc: true, so_tap: 2 }]
        : path === '/api/presence' ? { enabled: false, activeCount: 0 } : [];
      return route.fulfill({ json });
    });
    const initialPresence = page.waitForResponse(response => new URL(response.url()).pathname === '/api/presence');
    await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
    await initialPresence;
    await expect(page.locator('.tt-mode-card--continue')).toBeVisible();
    const requestsBeforeDialogs = apiRequests;
    await page.locator('.tt-mode-card--tracker').click();
    const reference = page.locator('.tt-tracker__card');
    await expect(reference).toBeVisible();
    const journal = (await reference.boundingBox())!;
    const background = await reference.evaluate(el => getComputedStyle(el).backgroundColor);
    const glassFilter = await reference.evaluate(el => getComputedStyle(el).backdropFilter);
    await reference.locator('.tt-tracker__recent-add').click();
    const manual = page.locator('[aria-labelledby="practice-log-title"]');
    await expect(manual).toBeVisible();
    await manual.locator('.tt-dialog-cancel').click();
    await expect(manual).toHaveCount(0);
    await expect(reference).toBeVisible();
    await page.locator('.tt-tracker__close').click();
    await page.locator('.tt-mode-card--rec').click();
    const routine = page.locator('.practice-recommendations');
    await expect(routine.locator('.practice-recommendations__scroll')).toBeVisible();
    expect(await routine.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(background);
    expect(await routine.evaluate(el => getComputedStyle(el).backdropFilter)).toBe(glassFilter);
    const routineBox = (await routine.boundingBox())!;
    expect(routineBox.width).toBeCloseTo(journal.width, 1);
    expect(routineBox.height).toBeCloseTo(journal.height, 1);
    const close = routine.locator('.tt-rec-toggle-btn');
    expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(close).toHaveAccessibleName(locale === 'vi' ? 'Quay lại Tu Tập' : 'Back to Practice Hub');
    await routine.getByRole('button', { name: locale === 'vi' ? 'Buổi tối' : 'Evening', exact: true }).click();
    await expect(routine.getByRole('button', { name: locale === 'vi' ? 'Buổi tối' : 'Evening', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await close.click();
    await expect(routine).toHaveCount(0);
    await page.locator('.tt-mode-card--continue').click();
    const continued = page.locator('.tt-continue-modal');
    await expect(continued.locator('.tt-continue-body')).toBeVisible();
    const continueBox = (await continued.boundingBox())!;
    expect(continueBox.width).toBeCloseTo(journal.width, 1);
    expect(continueBox.height).toBeCloseTo(journal.height, 1);
    expect(continueBox.x).toBeGreaterThanOrEqual(0);
    expect(continueBox.y + continueBox.height).toBeLessThanOrEqual(812);
    await expect(continued.locator('.tt-continue-card')).toHaveCount(1);
    for (const button of await continued.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(await button.evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThanOrEqual(44);
      // DOMRect có thể trả 43.999984 cho 44px; giữ ngưỡng 44 với độ chính xác 0.001 CSS px.
      expect(Number(box!.width.toFixed(3))).toBeGreaterThanOrEqual(44);
      expect(Number(box!.height.toFixed(3))).toBeGreaterThanOrEqual(44);
    }
    await continued.locator('.tt-modal-close').click();
    await expect(continued).toHaveCount(0);
    expect(apiRequests).toBe(requestsBeforeDialogs);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:quangtu_reading_progress_v1')!)[0].percent)).toBe(10);
  });
}
