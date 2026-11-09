import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const dark of [false, true]) {
  test(`reader tools keep font controls and close back to the book dark=${dark}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(value => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', value ? '1' : '0');
    }, dark);
    const article = { id: 'reader-ui-test', tieu_de: 'Sách kiểm tra công cụ', noi_dung: `<p>${'Nội dung đọc thử. '.repeat(100)}</p>`, danh_muc: 'SÁCH KHUYẾN THIỆN', tags: [], tac_gia: 'Quang Từ', has_muc_luc: 0, visibility: 'public' };
    await page.route(/\/api\/(?:data\/baiviet|articles)(?:[/?]|$)/, route => route.fulfill({ json: [article] }));
    await page.goto('/?article=reader-ui-test');
    await settleClient(page);
    const reader = page.getByRole('dialog', { name: 'Sách kiểm tra công cụ', exact: true });
    await expect(reader).toBeVisible();
    const toggle = reader.getByRole('button', { name: 'Công cụ', exact: true });
    await toggle.click();
    const tools = reader.getByRole('region', { name: 'Công cụ đọc', exact: true });
    await expect(tools).toBeVisible();
    for (const name of ['Đánh dấu', 'Nghe', 'Chia sẻ', 'Cuộn']) await expect(tools.locator('.action-label').filter({ hasText: new RegExp(`^${name}$`) })).toBeVisible();
    const before = parseInt(await tools.locator('.font-size').innerText(), 10);
    await tools.getByRole('button', { name: 'Chữ lớn hơn', exact: true }).click();
    expect(parseInt(await tools.locator('.font-size').innerText(), 10)).toBeGreaterThan(before);
    await page.screenshot({ path: info.outputPath('reader-tools.png'), animations: 'disabled' });
    await reader.getByRole('button', { name: 'Đóng công cụ', exact: true }).click();
    await expect(tools).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(reader).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(toggle).toBeHidden();
    await expect(reader.getByRole('button', { name: 'Chữ lớn hơn', exact: true })).toBeVisible();
  });
}
