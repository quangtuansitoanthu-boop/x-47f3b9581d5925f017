import { expect, test } from '@playwright/test';
import { choosePdfOnline, settleClient } from './runtime-helpers';

for (const width of [375, 1440]) {
  test(`chrome cannot select text while search remains editable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/kinh-sach');
    await settleClient(page);

    const heading = page.locator('.library-title');
    await expect(heading).toHaveCSS('user-select', 'none');
    await heading.dblclick();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    const navLabel = page.locator('.qts-bottom-nav__item span').last();
    if (width === 375) await expect(navLabel).toHaveCSS('user-select', 'none');

    const search = page.locator('.search-input');
    await expect(search).toHaveCSS('user-select', 'text');
    await search.fill('Nội dung tìm kiếm');
    await search.press('ControlOrMeta+A');
    expect(await search.evaluate((element: HTMLInputElement) =>
      element.selectionEnd! - element.selectionStart!,
    )).toBe('Nội dung tìm kiếm'.length);
    await search.press('Backspace');
    await expect(search).toHaveValue('');
  });
}

test('book prose and its descendants retain real text selection', async ({ page }) => {
  await page.goto('/?article=e2e-public');
  await settleClient(page);
  const reader = page.getByRole('dialog', { name: 'Bài viết kiểm thử E2E', exact: true });
  await expect(reader).toBeVisible();
  const prose = reader.locator('.reader-content p').first();
  await expect(prose).toBeVisible();
  await expect(prose).toHaveCSS('user-select', 'text');
  await prose.dblclick();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim() ?? '')).not.toBe('');
  await expect(reader.locator('.reader-back')).toHaveCSS('user-select', 'none');
});

test('PDF text remains selectable while its toolbar is not', async ({ page }) => {
  await page.goto('/?article=e2e-pdf');
  await settleClient(page);
  await choosePdfOnline(page);
  const text = page.locator('.pdf-text-layer span').first();
  await expect(text).toBeAttached();
  await expect(text).toHaveCSS('user-select', 'text');
  await expect(page.locator('.reader-back')).toHaveCSS('user-select', 'none');
});

test('failed clipboard action keeps the guide address available to select manually', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => { throw new Error('clipboard_denied'); } },
  }));
  await page.goto('/huong-dan#bo-thi-may-nghe-phap');
  await settleClient(page);
  const section = page.locator('#bo-thi-may-nghe-phap');
  await expect(section).toHaveAttribute('open', '');
  const card = section.locator('.guide-link-card').filter({ hasText: 'Google Drive' });
  await card.getByRole('button', { name: 'Sao chép link', exact: true }).click();
  const address = card.locator('.guide-link-address');
  await expect(address).toBeVisible();
  await expect(address).toHaveCSS('user-select', 'text');
  await address.dblclick();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim() ?? '')).not.toBe('');
});
