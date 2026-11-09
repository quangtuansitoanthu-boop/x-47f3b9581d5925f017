import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('legacy practice slots with duplicate IDs remain editable without rewriting stored data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    if (!localStorage.getItem('tutam_practice_reminders_v1')) {
      localStorage.setItem('tutam_practice_reminders_v1', JSON.stringify({
        masterEnabled: true,
        dailySchedules: [
          { id: 'legacy-duplicate', label: 'Thời khóa thứ nhất', practice: 'Niệm Phật', time: '05:30', enabled: true, days: [1, 2] },
          { id: 'legacy-duplicate', label: 'Thời khóa thứ hai', practice: 'Trì chú', time: '19:30', enabled: true, days: [3, 4] },
        ],
      }));
    }
  });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/ca-nhan?tab=settings');
  await settleClient(page);
  await page.locator('#settings-daily > summary').click();
  const slots = page.locator('.reminder-slot-card');
  await expect(slots).toHaveCount(2);
  await expect(slots.nth(0).locator('.reminder-practice-input')).toHaveValue('Niệm Phật');
  await expect(slots.nth(1).locator('.reminder-practice-input')).toHaveValue('Trì chú');
  await slots.nth(1).locator('.reminder-practice-input').fill('Tụng kinh');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).dailySchedules.map((slot: { practice: string }) => slot.practice))).toEqual(['Niệm Phật', 'Tụng kinh']);
  await slots.nth(0).getByRole('button', { name: 'Xóa khung giờ', exact: true }).click();
  await expect(slots).toHaveCount(1);
  await expect(slots.nth(0).locator('.reminder-practice-input')).toHaveValue('Tụng kinh');
  await page.reload();
  await settleClient(page);
  await page.locator('#settings-daily > summary').click();
  await expect(slots).toHaveCount(1);
  await expect(slots.nth(0).locator('.reminder-practice-input')).toHaveValue('Tụng kinh');
});

for (const theme of ['light', 'dark'] as const) {
  test(`settings disclosures preserve drafts, stored data and request budget (${theme})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', theme === 'dark' ? '1' : '0');
      localStorage.setItem('tutam_read_fontsize', '21');
      localStorage.setItem('tutam_read_font', 'literata');
      localStorage.setItem('tutam_pdf_paper_mode', 'sepia');
    }, { theme });
    const requests: string[] = [];
    await page.route('**/api/**', route => {
      requests.push(new URL(route.request().url()).pathname);
      return route.abort('failed');
    });
    await page.goto('/ca-nhan?tab=settings');
    await settleClient(page);
    await expect(page.locator('.settings-section')).toHaveCount(6);
    await expect(page.locator('.settings-section[open]')).toHaveCount(0);
    await page.locator('.settings-hub').screenshot({ path: testInfo.outputPath(`collapsed-${theme}.png`) });
    await expect.poll(() => requests.includes('/api/presence')).toBe(true);
    const snapshot = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) =>
      key.startsWith('tutam_read_') || key === 'tutam_pdf_paper_mode' || key === 'tutam_practice_reminders_v1' || key.includes('personal'))));
    const stored = await snapshot();
    const initialRequests = requests.filter(path => path !== '/api/presence');

    const lunarSummary = page.locator('#settings-lunar > summary');
    await lunarSummary.focus();
    await lunarSummary.press('Enter');
    await expect(page.locator('#settings-lunar')).toHaveAttribute('open', '');
    await lunarSummary.press('Enter');
    await expect(page.locator('.settings-section[open]')).toHaveCount(0);

    await page.locator('#settings-personal > summary').click();
    const timing = page.locator('.personal-timing');
    await timing.locator('input[type="number"]').fill('7');
    await timing.evaluate(element => element.setAttribute('data-draft-marker', 'same-owner'));
    await page.locator('#settings-reading > summary').click();
    await expect(page.locator('.settings-section[open]')).toHaveCount(1);
    await expect(timing).toBeHidden();
    await expect(page.locator('.cn-preview-box')).toHaveCSS('font-size', '21px');
    await page.locator('#settings-personal > summary').click();
    await expect(timing).toHaveAttribute('data-draft-marker', 'same-owner');
    await expect(timing.locator('input[type="number"]')).toHaveValue('7');
    await expect(timing.getByRole('button', { name: 'Lưu cài đặt', exact: true })).toBeVisible();

    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const id of ['lunar', 'personal', 'daily', 'sound', 'display', 'reading']) {
        const group = page.locator(`#settings-${id}`);
        if (!await group.evaluate(el => el.hasAttribute('open'))) await group.locator(':scope > summary').click();
        await expect(page.locator('.settings-section[open]')).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const controls = await group.getByRole('button').evaluateAll(buttons => buttons.map(button => {
          const box = button.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }));
        expect(controls.length).toBeGreaterThan(0);
        for (const box of controls) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        if (width === 375 || id === 'reading') {
          await group.screenshot({ path: testInfo.outputPath(`${id}-${width}-${theme}.png`), animations: 'disabled' });
        }
      }
    }
    expect(await snapshot()).toEqual(stored);
    expect(requests.filter(path => path !== '/api/presence')).toEqual(initialRequests);

    await page.locator('#settings-lunar > summary').click();
    await page.getByRole('button', { name: 'Nhắc ngày Thập Trai (10 ngày ăn chay âm lịch)', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).lunar.thapTrai)).toBe(false);
    await page.getByRole('button', { name: 'Bật thông báo nhắc nhở tu tập', exact: true }).click();
    await expect(page.locator('#settings-lunar')).toHaveCount(0);
    await expect(page.locator('#settings-display')).toBeVisible();
    await page.getByRole('button', { name: 'Bật thông báo nhắc nhở tu tập', exact: true }).click();
    await expect(page.locator('#settings-lunar')).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tutam_practice_reminders_v1')!).lunar.thapTrai)).toBe(false);
  });
}
