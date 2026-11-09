import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

for (const leftoverPdf of [false, true]) {
test(`chaptered books keep their text reader without file export (leftover PDF: ${leftoverPdf})`, async ({ page }, testInfo) => {
  const origin = process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787';
  expect(['localhost', '127.0.0.1']).toContain(new URL(origin).hostname);
  await loginAsAdmin(page);
  const { csrfToken } = await (await page.request.get('/api/session')).json();
  const id = randomUUID();
  const title = `Sách ảnh ${id}`;
  const headers = { 'x-csrf-token': csrfToken, origin };
  const imagePath = '/assets/branding/tu-tap-logo.png';
  const webpPath = `/epub-test-${id}.webp`;
  const webp = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
    canvas.getContext('2d')!.fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/webp').split(',')[1];
  });
  await page.route(`**${webpPath}`, (route) => route.fulfill({ contentType: 'image/webp', body: Buffer.from(webp, 'base64') }));
  const created = await page.request.post('/api/articles', { headers, data: {
    id, tieu_de: title, tac_gia: 'Kiểm thử', noi_dung: '<p>Lời mở đầu giữ nguyên.</p>',
    danh_muc: 'SÁCH KHUYẾN THIỆN', has_muc_luc: true, so_tap: 2, trang_thai: 'Hoàn thành',
    pdf_url: leftoverPdf ? '/assets/pdfs/bai-viet-mau-gieo-nhan-lanh.pdf' : '',
  } });
  expect(created.ok()).toBeTruthy();
  try {
    const saved = await page.request.put(`/api/admin/books/${id}/chapters`, { headers, data: { chapters: [
      { tieu_de: 'Chương một', noi_dung: `<p>Trước ảnh</p><img src="${imagePath}" alt="Ảnh một"><p>Sau ảnh</p>` },
      { tieu_de: 'Chương hai', noi_dung: `<img src="${imagePath}"><img src="${webpPath}"><p>Kết thúc</p>` },
    ] } });
    expect(saved.ok()).toBeTruthy();
    let imageFetches = 0;
    page.on('request', (request) => { if (request.resourceType() === 'fetch' && request.url().includes(imagePath)) imageFetches++; });
    await page.goto(`/?article=${id}`);
    await settleClient(page);
    const reader = page.locator('.reader-modal');
    await expect(reader).toHaveAccessibleName(title);
    await expect(reader).toContainText('Chương hai');
    await expect(reader.locator('.pdf-shell')).toHaveCount(0);
    expect(imageFetches).toBe(0);
    await expect(reader.locator('.download-gate')).toHaveCount(0);
    await reader.getByRole('button', { name: /Chương một/ }).click();
    await expect(reader.locator('.reader-content')).toContainText('Trước ảnh');
    await expect(reader.locator('.reader-content img').first()).toHaveAttribute('src', imagePath);
    await reader.locator('.reader-back').click();
    await reader.getByRole('button', { name: /Chương hai/ }).click();
    await expect(reader.locator('.reader-content')).toContainText('Kết thúc');
    await expect(reader.locator('.reader-content img')).toHaveCount(2);
    await expect(reader.locator('.pdf-shell')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
    await expect(reader.getByRole('region', { name: 'Công cụ đọc', exact: true })).toBeVisible();
    await expect(reader.getByRole('button', { name: /EPUB/ })).toHaveCount(0);
  } finally {
    testInfo.setTimeout(testInfo.timeout + 5_000);
    await page.context().setOffline(false);
    const removed = await page.request.delete(`/api/articles/${id}`, { headers });
    expect(removed.ok()).toBeTruthy();
  }
});
}
