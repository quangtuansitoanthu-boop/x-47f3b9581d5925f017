import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const width of [375, 1440]) {
  for (const dark of [false, true]) {
    test(`approved rosary picker: ${width}px, dark=${dark}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
      await page.goto('/tu-tap');
      await settleClient(page);
      await page.locator('.tt-mode-card--chuoi').click();
      await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
      await page.locator('.tt-rosary__options-bar button').click();
      const trigger = page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true });
      const apiRequests: string[] = [];
      page.on('request', request => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/api/') && path !== '/api/presence') apiRequests.push(`${request.method()} ${path}`);
      });
      await trigger.click();
      const picker = page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true });
      await expect(picker).toBeVisible();
      await expect(picker.getByRole('button', { name: 'Nam mô A Di Đà Phật', exact: true })).toHaveCSS('font-weight', '700');
      await expect(picker.getByRole('searchbox')).toHaveCount(0);
      await expect(picker.locator('.rosary-select__option')).toHaveCount(13);
      await page.screenshot({ path: info.outputPath('approved-picker.png'), animations: 'disabled' });
      if (width === 375) {
        const anchor = await trigger.boundingBox();
        expect(anchor!.width).toBeGreaterThan(330);
      }
      await page.keyboard.press('ArrowUp');
      await expect(picker.getByRole('button', { name: 'Ngũ Đại Tâm Chú Lăng Nghiêm', exact: true })).toBeFocused();
      await page.keyboard.press('Home');
      await expect(picker.getByRole('button', { name: 'Nam mô A Di Đà Phật', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(450);
      await expect(page.locator('.tt-rosary__cycle')).toContainText('0/108');
      await picker.getByRole('button', { name: 'Thêm tùy chọn mới', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(picker.getByRole('button', { name: 'Đóng bảng chọn', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(picker.getByRole('button', { name: 'Thêm tùy chọn mới', exact: true })).toBeFocused();
      const rect = await picker.locator('.rosary-select__panel').boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(845);
      if (width === 375) expect(rect!.y + rect!.height).toBeGreaterThanOrEqual(843);
      else {
        const anchor = await trigger.boundingBox();
        expect(rect!.y).toBeGreaterThanOrEqual(anchor!.y + anchor!.height);
      }
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(apiRequests).toEqual([]);
      await trigger.press('ArrowDown');
      await expect(picker).toBeVisible();
      // Cùng sự kiện cancel mà modal stack phát ra khi bấm Back Android.
      await picker.evaluate(dialog => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
      await expect(picker).toHaveCount(0);
      await expect(page.locator('.tt-rosary-modal')).toBeVisible();
      expect(apiRequests).toEqual([]);
      await trigger.click();
      await picker.getByRole('button', { name: 'Nam mô Đại Hạnh Phổ Hiền Bồ Tát', exact: true }).click();
      await expect(trigger).toContainText('Nam mô Đại Hạnh Phổ Hiền Bồ Tát');
      await expect(page.locator('#tt-rosary-phrase')).toHaveText('Nam mô Đại Hạnh Phổ Hiền Bồ Tát');
      await trigger.click();
      await expect(picker.getByRole('button', { name: 'Nam mô Đại Hạnh Phổ Hiền Bồ Tát', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await picker.getByRole('button', { name: 'Thêm tùy chọn mới', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Danh hiệu hoặc câu chú tùy chọn', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Niệm một hạt', exact: true })).toBeDisabled();
    });
  }
}

for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
  test(`short rosary selectors remain usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/tu-tap');
    await settleClient(page);
    await page.locator('.tt-mode-card--chuoi').click();
    await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
    await page.locator('.tt-rosary__options-bar button').click();
    for (const field of [
      { name: 'Số hạt trong chuỗi', title: 'Chuỗi', choice: '54 hạt', summary: '54' },
      { name: 'Mục tiêu niệm', title: 'Mục tiêu', choice: '3.000', summary: '3.000' },
    ]) {
      const trigger = page.getByRole('combobox', { name: field.name, exact: true });
      await trigger.click();
      const picker = page.getByRole('dialog', { name: field.title, exact: true });
      const choice = picker.getByRole('button', { name: field.choice, exact: true });
      await expect(choice).toBeVisible();
      expect(await choice.evaluate(element => {
        const r = element.getBoundingClientRect();
        return r.height >= 44 && r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      })).toBe(true);
      await choice.click();
      await expect(trigger).toContainText(field.choice);
      await expect(page.locator('.tt-rosary__options-bar p')).toContainText(field.summary);
    }
  });
}
