import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`interface text size persists without resizing navigation or reading at ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height:900 });
      await page.emulateMedia({ colorScheme:dark ? 'dark' : 'light' });
      await page.addInitScript(() => {
        localStorage.setItem('tutam_locale', 'vi');
        localStorage.setItem('tutam_read_fontsize', '21');
        localStorage.setItem('tt_fs', '22');
      });
      await page.route('**/api/**', route => route.abort('failed'));
      await page.goto('/ca-nhan?tab=settings');
      await page.locator('#settings-display > summary').click();
      const row = page.getByRole('group', { name:'Cỡ chữ giao diện', exact:true });
      const increase = row.getByRole('button', { name:'Tăng cỡ chữ giao diện' });
      const decrease = row.getByRole('button', { name:'Giảm cỡ chữ giao diện' });
      const expectReadingSize = async () => {
        // WebKit tạm dừng transition của nội dung trong details đang đóng.
        // Đo trang đọc sau khi mở đúng nhóm, rồi quay về cỡ chữ giao diện.
        await page.locator('#settings-reading > summary').click();
        await expect(page.locator('.cn-preview-box')).toHaveCSS('font-size', '21px');
        await page.locator('#settings-display > summary').click();
      };
      await expect(row.locator('output')).toHaveText('100%');
      await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
      const navSize = await page.locator('.qts-bottom-nav__item').first().evaluate(element => getComputedStyle(element).fontSize);
      await expectReadingSize();
      await increase.click();
      await expect(row.locator('output')).toHaveText('110%');
      await increase.click();
      await expect(row.locator('output')).toHaveText('120%');
      await expect(increase).toBeDisabled();
      expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBeCloseTo(16.8, 2);
      await expectReadingSize();
      expect(await page.locator('.qts-bottom-nav__item').first().evaluate(element => getComputedStyle(element).fontSize)).toBe(navSize);
      expect(await page.evaluate(() => [localStorage.getItem('tutam_read_fontsize'), localStorage.getItem('tt_fs')])).toEqual(['21', '22']);
      const controls = await row.locator('button').evaluateAll(elements => elements.every(element => {
        const box = element.getBoundingClientRect();
        return box.width >= 44 && box.height >= 44 && element.scrollWidth <= element.clientWidth + 1;
      }));
      expect(controls).toBe(true);
      await expect(row.getByRole('region', { name:'Khung minh họa cỡ chữ' })).toBeVisible();
      await expect(row).toContainText('không thực hiện chức năng');
      await expect(row.getByRole('button', { name:'Tạo ảnh', exact:true })).toHaveCount(0);
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({ path:testInfo.outputPath('settings-ui-size-120.png') });
      await page.reload();
      await page.locator('#settings-display > summary').click();
      await expect(row.locator('output')).toHaveText('120%');
      await decrease.click(); await decrease.click(); await decrease.click();
      await expect(row.locator('output')).toHaveText('90%');
      await expect(decrease).toBeDisabled();
      await row.getByRole('button', { name:'Mặc định', exact:true }).click();
      await expect(row.locator('output')).toHaveText('100%');
      expect(await page.evaluate(() => localStorage.getItem('tutam_ui_font_scale'))).toBe('1');
      await page.screenshot({ path:testInfo.outputPath('settings-ui-size-default.png') });
    });
  }
}

test('fresh settings follow device appearance and preserve a manual theme after reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme:'dark' });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/ca-nhan?tab=settings');
      await page.locator('#settings-display > summary').click();
  const choices = page.locator('.cn-theme-toggle-group');
  await expect(choices.getByRole('button', { name:/Tự động theo hệ thống/ })).toHaveClass(/active/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme:'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await choices.getByRole('button', { name:/Giao diện Tối/ }).click();
  await page.reload();
      await page.locator('#settings-display > summary').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(choices.getByRole('button', { name:/Giao diện Tối/ })).toHaveClass(/active/);
  await choices.getByRole('button', { name:/Giao diện Sáng/ }).click();
  await page.emulateMedia({ colorScheme:'dark' });
  await page.reload();
      await page.locator('#settings-display > summary').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(choices.getByRole('button', { name:/Giao diện Sáng/ })).toHaveClass(/active/);
});
