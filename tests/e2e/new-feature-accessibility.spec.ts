import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import type { PracticeProgressData } from '../../src/lib/browser/practice-community';
import { loginAsAdmin, loginAsMember, settleClient } from './runtime-helpers';

const quoteText = 'Đoạn trích dẫn dài giúp kiểm tra khả năng đọc và thao tác bằng bàn phím trên màn hình nhỏ. '.repeat(35);

async function recordObservation(testInfo: TestInfo, page: Page, name: string, observation: unknown): Promise<void> {
  console.info(`[ui-regression:${name}] ${JSON.stringify(observation)}`);
  await testInfo.attach(name, { body: JSON.stringify(observation, null, 2), contentType: 'application/json' });
  const screenshot = testInfo.outputPath(`${name}-render.png`);
  await page.screenshot({ path: screenshot });
  await testInfo.attach(`${name}-render`, { path: screenshot, contentType: 'image/png' });
}

async function withLongQuote(page: Page, run: (edit: Locator) => Promise<void>): Promise<void> {
  await loginAsAdmin(page);
  const origin = new URL(page.url()).origin;
  expect(['localhost', '127.0.0.1', '[::1]'], 'Annotation fixtures must use a disposable local runtime').toContain(new URL(origin).hostname);
  const response = await page.request.get('/api/session');
  expect(response.ok()).toBe(true);
  const session = await response.json();
  const headers = { 'X-CSRF-Token': session.csrfToken, Origin: origin };
  const id = `e2e-dialog-${randomUUID()}`;
  const note = `Kiểm tra hộp thoại ${id}`;
  const created = await page.request.post('/api/reading/annotations', {
    headers,
    data: {
      id,
      idempotencyKey: id,
      anchorStatus: 'active',
      color: 'yellow',
      contentId: 'e2e-public',
      contentKind: 'article',
      contentVersion: 'e2e-dialog-v1',
      contextBefore: '',
      contextAfter: '',
      locator: { start: 0, end: quoteText.length },
      note,
      quoteText,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  try {
    await page.goto('/trich-dan-cua-toi');
    await settleClient(page);
    const quote = page.locator('.quotes-list article').filter({ hasText: note });
    await expect(quote).toHaveCount(1);
    await run(quote.getByRole('button', { name: 'Sửa', exact: true }));
  } finally {
    const deleted = await page.request.delete(`/api/reading/annotations/${encodeURIComponent(id)}`, { headers });
    expect(deleted.ok(), `Failed to clean local quote ${id}: ${deleted.status()}`).toBe(true);
  }
}

async function expectFocusInside(container: Locator, description: string): Promise<void> {
  await expect.soft.poll(() => container.evaluate((element) => element.contains(document.activeElement)), {
    message: description,
    timeout: 1_500,
  }).toBe(true);
}

async function expectTabWrap(page: Page, container: Locator, first: Locator, last: Locator): Promise<void> {
  await last.focus();
  await page.keyboard.press('Tab');
  await expect.soft(first, 'Tab at the last control returns to the first control').toBeFocused({ timeout: 1_500 });
  await expectFocusInside(container, 'Forward Tab stays inside the overlay');
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect.soft(last, 'Shift+Tab at the first control returns to the last control').toBeFocused({ timeout: 1_500 });
  await expectFocusInside(container, 'Backward Tab stays inside the overlay');
}

test.describe('New feature keyboard and viewport accessibility', () => {
  for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    test(`long quote keeps dialog and actions in the ${viewport.width}x${viewport.height} viewport`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await withLongQuote(page, async (edit) => {
        await edit.click();
        const dialog = page.getByRole('dialog', { name: 'Sửa trích dẫn' });
        await expect(dialog).toBeVisible();
        const geometry = await dialog.evaluate((element) => ({
          dialog: element.getBoundingClientRect().toJSON(),
          actions: element.querySelector('.dialog-actions')!.getBoundingClientRect().toJSON(),
          viewport: { width: innerWidth, height: innerHeight },
        }));
        await recordObservation(testInfo, page, 'quote-viewport', geometry);
        expect.soft(geometry.dialog.top, 'The dialog starts inside the viewport').toBeGreaterThanOrEqual(0);
        expect.soft(geometry.dialog.bottom, 'The long quote does not push the dialog below the viewport').toBeLessThanOrEqual(viewport.height);
        expect.soft(geometry.actions.top, 'Actions stay visible above the lower viewport edge').toBeGreaterThanOrEqual(0);
        expect.soft(geometry.actions.bottom, 'Save and cancel remain reachable without scrolling the background').toBeLessThanOrEqual(viewport.height);
        expect.soft(geometry.dialog.right).toBeLessThanOrEqual(viewport.width);
        expect.soft(geometry.dialog.left).toBeGreaterThanOrEqual(0);
      });
    });
  }

  test('long quote editor owns focus, wraps Tab, closes on Escape and restores its opener', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withLongQuote(page, async (edit) => {
      await edit.click();
      const dialog = page.getByRole('dialog', { name: 'Sửa trích dẫn' });
      await expect(dialog).toBeVisible();
      await recordObservation(testInfo, page, 'quote-initial-focus', await dialog.evaluate((element) => ({
        inside: element.contains(document.activeElement),
        activeText: document.activeElement?.textContent?.trim(),
      })));
      await expectFocusInside(dialog, 'Opening the quote editor moves focus inside');
      await expectTabWrap(page, dialog, dialog.getByRole('button', { name: 'Đóng', exact: true }), dialog.getByRole('button', { name: 'Lưu', exact: true }));
      await page.keyboard.press('Escape');
      await expect.soft(dialog, 'Escape dismisses the quote editor').toHaveCount(0, { timeout: 1_500 });
      await expect.soft(edit, 'Closing the quote editor restores the edit button').toBeFocused({ timeout: 1_500 });
    });
  });

  test('quote cancel, close and backdrop restore the page without saving discarded notes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withLongQuote(page, async (edit) => {
      const originalOverflow = await page.evaluate(() => document.body.style.overflow);
      const dialog = page.getByRole('dialog', { name: 'Sửa trích dẫn' });
      await edit.click();
      const originalNote = await dialog.getByRole('textbox', { name: 'Ghi chú' }).inputValue();
      await dialog.getByRole('textbox', { name: 'Ghi chú' }).fill('Ghi chú này phải bị hủy.');
      await page.locator('.quotes-search input').focus();
      await expectFocusInside(dialog, 'Background search cannot receive focus while the quote editor is open');
      await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(edit).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);

      await edit.click();
      await expect(dialog.getByRole('textbox', { name: 'Ghi chú' })).toHaveValue(originalNote);
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(edit).toBeFocused();

      await edit.click();
      await dialog.getByRole('heading', { name: 'Sửa trích dẫn' }).click();
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      await page.mouse.click(Math.max(0, bounds!.x - 5), 422);
      await expect(dialog).toHaveCount(0);
      await expect(edit).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
    });
  });

  test('meditation chooser and session retain focus through cancel, start and completion', async ({ page }, testInfo) => {
    await loginAsMember(page);
    await page.goto('/tu-tap');
    await settleClient(page);
    const opener = page.locator('button.tt-mode-card--thien');
    await opener.click();
    const chooser = page.getByRole('dialog', { name: 'Thiền có hướng dẫn' });
    await expectFocusInside(chooser, 'Opening the chooser moves focus inside');
    await page.keyboard.press('Shift+Tab');
    await expectFocusInside(chooser, 'Initial reverse Tab stays inside the chooser before a control has been focused');
    await opener.focus();
    await expectFocusInside(chooser, 'The background meditation opener cannot steal focus from its chooser');
    await expectTabWrap(page, chooser, chooser.getByRole('tab', { name: 'Thời gian', exact: true }), chooser.getByRole('button', { name: 'Bắt đầu thiền', exact: true }));
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
    await expect(opener).toBeFocused();

    await opener.click();
    await chooser.getByRole('button', { name: 'Bắt đầu thiền', exact: true }).click();
    const meditation = page.locator('.meditation-screen');
    await expect(meditation).toBeVisible();
    await expect(chooser).toHaveCount(0);
    await recordObservation(testInfo, page, 'meditation-initial-focus', await meditation.evaluate((element) => ({
      inside: element.contains(document.activeElement),
      activeText: document.activeElement?.textContent?.trim(),
    })));
    await expectFocusInside(meditation, 'Chooser teardown does not steal focus from the session');
    await expectTabWrap(page, meditation, meditation.getByRole('button', { name: 'Đổi nền', exact: true }), meditation.getByRole('button', { name: 'Tạm dừng', exact: true }));

    if (await page.evaluate(() => document.fullscreenEnabled)) {
      await meditation.getByRole('button', { name: 'Toàn màn hình', exact: true }).click();
      await expect.poll(() => meditation.evaluate((element) => document.fullscreenElement === element)).toBe(true);
      await expect(meditation.getByRole('button', { name: 'Thu nhỏ', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await meditation.getByRole('button', { name: 'Thu nhỏ', exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(meditation.getByText('Đang tạm dừng', { exact: true })).toBeVisible();
    await expect(meditation.getByRole('button', { name: 'Hoàn tất' })).toHaveCount(0);
    await meditation.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await meditation.getByRole('button', { name: 'Kết thúc sớm' }).click();
    await meditation.getByRole('button', { name: 'Hoàn tất' }).click();
    await expect(meditation).toHaveCount(0);
    await expect.soft(opener, 'Completing meditation restores the original catalog button').toBeFocused({ timeout: 1_500 });
  });

  test('meditation keeps the footer usable after rotating to 844x390 landscape', async ({ page }, testInfo) => {
    await loginAsMember(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tu-tap');
    await settleClient(page);
    await page.locator('button.tt-mode-card--thien').click();
    await page.getByRole('dialog', { name: 'Thiền có hướng dẫn' }).getByRole('button', { name: 'Bắt đầu thiền', exact: true }).click();
    const meditation = page.locator('.meditation-screen');
    await expect(meditation).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    const geometry = await meditation.evaluate((element) => ({
      screen: element.getBoundingClientRect().toJSON(),
      footer: element.querySelector('footer')!.getBoundingClientRect().toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
    }));
    await recordObservation(testInfo, page, 'meditation-landscape', geometry);
    expect.soft(geometry.footer.top, 'Footer starts within the landscape viewport').toBeGreaterThanOrEqual(0);
    expect(geometry.footer.bottom, 'Meditation controls fit inside the landscape viewport').toBeLessThanOrEqual(390);
    await meditation.getByRole('button', { name: 'Tạm dừng' }).click();
    await expect(meditation.getByText('Đang tạm dừng', { exact: true })).toBeVisible();
    await meditation.getByRole('button', { name: 'Tiếp tục' }).click();
    await meditation.getByRole('button', { name: 'Kết thúc sớm' }).click();
    await meditation.getByRole('button', { name: 'Hoàn tất' }).click();
    await expect(meditation).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`Facebook input and select have readable text in ${theme} theme`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((dark) => localStorage.setItem('tutam_dark_mode', dark ? '1' : '0'), theme === 'dark');
      await loginAsAdmin(page);
      await page.goto('/admin/settings');
      await settleClient(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const controls = page.locator('.facebook-settings-grid').locator('input,select');
      await expect(controls).toHaveCount(2);
      const contrast = await controls.evaluateAll((elements) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        const rgba = (color: string): number[] => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        };
        const luminance = (rgb: number[]): number => rgb.slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
        return elements.map((element) => {
          const style = getComputedStyle(element);
          const layers: number[][] = [];
          for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
            layers.unshift(rgba(getComputedStyle(ancestor).backgroundColor));
          }
          const composite = (base: number[], layer: number[]): number[] => base.map((channel, index) => channel * (1 - layer[3] / 255) + layer[index] * layer[3] / 255);
          const background = layers.reduce(composite, [255, 255, 255]);
          const foreground = composite(background, rgba(style.color));
          const a = luminance(foreground);
          const b = luminance(background);
          return { control: element.tagName, color: style.color, backgroundColor: style.backgroundColor, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        });
      });
      await recordObservation(testInfo, page, `facebook-${theme}-contrast`, contrast);
      for (const control of contrast) {
        expect.soft(control.contrast, `${control.control} text requires 4.5:1 contrast`).toBeGreaterThanOrEqual(4.5);
      }
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const service = page.getByRole('region', { name: 'Trạng thái dịch vụ', exact: true });
        const facebook = page.locator('.facebook-import-settings');
        const bounds = await Promise.all([service.boundingBox(), facebook.boundingBox()]);
        expect(bounds[0]).not.toBeNull();
        expect(bounds[1]).not.toBeNull();
        expect(bounds[1]!.x, `Facebook left aligns with service card at ${width}px`).toBeCloseTo(bounds[0]!.x, 0);
        expect(bounds[1]!.x + bounds[1]!.width, `Facebook right aligns with service card at ${width}px`)
          .toBeCloseTo(bounds[0]!.x + bounds[0]!.width, 0);
        await recordObservation(testInfo, page, `facebook-${theme}-alignment-${width}`, bounds);
      }
    });
  }

  test.describe('Daily practice details', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('keyboard and touch reveal all daily details from real progress data', async ({ page }, testInfo) => {
      await loginAsAdmin(page);
      const response = await page.request.get('/api/practice/progress');
      expect(response.ok()).toBe(true);
      const progress = await response.json() as PracticeProgressData;
      expect(progress.heatmap).toHaveLength(365);
      await page.goto('/tien-do-tu-tap');
      await settleClient(page);
      const journal = page.getByRole('region', { name: 'Nhật lịch 365 ngày', exact: true });
      const summary = journal.locator('summary').filter({ hasText: 'Chi tiết từng ngày' });
      const table = journal.getByRole('table', { name: `Phiên tu tập hợp lệ theo múi giờ ${progress.profile.timeZone}`, exact: true });
      await expect(table).toBeHidden();
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(table).toBeVisible();
      await expect(table.getByRole('rowheader')).toHaveCount(365);
      const day = progress.heatmap.at(-1)!;
      const [year, month, date] = day.date.split('-');
      const dateLabel = `${date}/${month}/${year}`;
      const row = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: dateLabel, exact: true }) });
      const format = new Intl.NumberFormat('vi-VN');
      await expect(row.getByRole('cell')).toHaveText([
        format.format(day.sessionCount),
        format.format(day.acceptedCount),
        format.format(Math.floor(day.acceptedDurationSeconds / 60)),
        day.active ? 'Có công phu' : 'Không có phiên hợp lệ',
      ]);
      await page.keyboard.press('Tab');
      const scroller = journal.getByRole('region', { name: 'Chi tiết nhật lịch theo ngày', exact: true });
      await expect(scroller).toBeFocused();
      await page.keyboard.press('PageDown');
      await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await summary.focus();
      await page.keyboard.press('Space');
      await expect(table).toBeHidden();
      await summary.tap();
      await expect(table).toBeVisible();
      await recordObservation(testInfo, page, 'practice-daily-details', {
        days: await table.getByRole('rowheader').count(),
        lastDate: dateLabel,
        lastDayValues: await row.getByRole('cell').allTextContents(),
      });
      expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390);
    });
  });

  test('a long campaign title names its progress and membership controls without mobile overflow', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await loginAsAdmin(page);
    const origin = new URL(page.url()).origin;
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(origin).hostname);
    const session = await (await page.request.get('/api/session')).json();
    const headers = { 'X-CSRF-Token': session.csrfToken, Origin: origin };
    const title = `Chiến dịch ${'Cùng tu tập và giữ chánh niệm '.repeat(3)}${randomUUID().slice(0, 8)}`;
    const response = await page.request.post('/api/practice/campaigns', {
      headers,
      data: {
        title,
        description: 'Chúng ta cùng duy trì thời khóa, đọc kinh và hồi hướng công đức. '.repeat(12),
        metric: 'count',
        goalValue: 108,
        startsAt: new Date(Date.now() - 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'active',
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const { campaign } = await response.json();
    try {
      await page.goto('/tien-do-tu-tap');
      await settleClient(page);
      const card = page.locator('.practice-campaigns article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      const bar = card.getByRole('progressbar', { name: title, exact: true });
      await expect(bar).toHaveAttribute('aria-valuetext', '0 trên 108 biến');
      await expect(bar).toHaveAttribute('value', '0');
      await expect(bar).toHaveAttribute('max', '108');
      await card.getByRole('button', { name: `Tham gia chiến dịch ${title}`, exact: true }).click();
      await expect(card.getByRole('button', { name: `Rời chiến dịch ${title}`, exact: true })).toBeVisible();
      await page.reload();
      await settleClient(page);
      await expect(card.getByRole('button', { name: `Rời chiến dịch ${title}`, exact: true })).toBeVisible();
      const geometry = await card.evaluate((element) => ({
        card: element.getBoundingClientRect().toJSON(),
        heading: element.querySelector('h3')!.getBoundingClientRect().toJSON(),
        pageWidth: document.body.scrollWidth,
        viewportWidth: innerWidth,
      }));
      await recordObservation(testInfo, page, 'campaign-accessibility', geometry);
      expect(geometry.pageWidth).toBeLessThanOrEqual(320);
      expect(geometry.heading.left).toBeGreaterThanOrEqual(geometry.card.left);
      expect(geometry.heading.right).toBeLessThanOrEqual(geometry.card.right);
      await card.getByRole('button', { name: `Rời chiến dịch ${title}`, exact: true }).click();
      await expect(card.getByRole('button', { name: `Tham gia chiến dịch ${title}`, exact: true })).toBeVisible();
    } finally {
      const deleted = await page.request.delete(`/api/practice/campaigns/${encodeURIComponent(campaign.id)}`, { headers });
      expect(deleted.ok(), `Failed to clean local campaign ${campaign.id}`).toBe(true);
    }
  });

  for (const route of ['/trich-dan-cua-toi', '/tien-do-tu-tap']) {
    test(`${route} omits unrelated content management actions for an authenticated admin`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loginAsAdmin(page);
      await page.goto(route);
      await settleClient(page);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await recordObservation(testInfo, page, 'personal-route-header', {
        route,
        createLinks: await page.getByRole('link', { name: 'Thêm bài viết', exact: true }).count(),
        importLinks: await page.getByRole('link', { name: 'Import JSON', exact: true }).count(),
      });
      await expect.soft(page.getByRole('link', { name: 'Thêm bài viết', exact: true })).toHaveCount(0, { timeout: 1_500 });
      await expect.soft(page.getByRole('link', { name: 'Import JSON', exact: true })).toHaveCount(0, { timeout: 1_500 });
      await page.goto('/ca-nhan?tab=account');
      await settleClient(page);
      await expect(page.locator('.cn-admin-hub__more')).toHaveAttribute('href', '/admin');
    });
  }
});
