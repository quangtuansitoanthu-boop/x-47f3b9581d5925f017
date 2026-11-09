import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`journal icon tools preserve the other field and require confirmation ${width} ${dark}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('tt_reflection_guide_seen_v1', '1');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => { (window as Window & { copiedText?: string }).copiedText = text; },
      } });
    });
    await page.goto('/tu-tap'); await settleClient(page);
    await page.evaluate(dark => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, dark);
    await page.locator('.tt-mode-card--reflection').click();
    const cards = page.locator('.personal-journal .journal-columns > section');
    const fields = cards.locator('textarea');
    for (const card of await cards.all()) {
      await expect(card.getByRole('button', { name: 'Sao chép nội dung', exact: true })).toBeDisabled();
      await expect(card.getByRole('button', { name: 'Xoá hết', exact: true })).toBeDisabled();
    }
    const first = 'Nội dung riêng ô thứ nhất.\nGiữ nguyên dấu và dòng.', second = 'Nội dung riêng ô thứ hai.';
    await fields.nth(0).fill(first); await fields.nth(1).fill(second);
    const writes: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
    });
    for (const [index, value] of [[0, first], [1, second]] as const) {
      const card = cards.nth(index);
      await card.getByRole('button', { name: 'Sao chép nội dung', exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(value);
      await expect(page.getByRole('status').filter({ hasText: 'Đã sao chép.' })).toBeVisible();
      const expand = card.getByRole('button', { name: 'Toàn màn hình', exact: true });
      await expect(expand).toHaveText('');
      await expand.click();
      const zen = page.locator('dialog.zen-overlay');
      await expect(zen).toBeVisible(); await expect(zen.locator('textarea')).toHaveValue(value);
      await zen.getByRole('button', { name: /Thu nhỏ/u }).first().click();
      await card.getByRole('button', { name: 'Xoá hết', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Xoá hết nội dung?', exact: true });
      await expect(confirm).toContainText('Bạn muốn xoá hết dữ liệu trong ô hiện có?');
      await confirm.getByRole('button', { name: 'Hủy', exact: true }).click();
      await expect(fields.nth(index)).toHaveValue(value);
    }
    await cards.nth(0).getByRole('button', { name: 'Xoá hết', exact: true }).click();
    await page.getByRole('dialog', { name: 'Xoá hết nội dung?', exact: true }).getByRole('button', { name: 'Xoá hết', exact: true }).click();
    await expect(fields.nth(0)).toHaveValue(''); await expect(fields.nth(1)).toHaveValue(second);
    const buttons = await cards.locator('.editor-tools button').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height };
    }));
    expect(buttons.every(button => button.width >= 44 && button.height >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
  });
}
