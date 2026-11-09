import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { ROSARY_PHRASES } from '../../src/lib/domain/practice/guided-sessions';

test('English rosary selector keeps short names and the full canonical mantra', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'en'));
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin 🙏', exact: true }).click();
  await page.locator('.tt-rosary__options-bar button').click();
  const phrases = page.getByRole('combobox', { name: 'Name of recitation', exact: true });
  const mantra = 'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha';
  await phrases.click();
  const picker = page.getByRole('dialog', { name: 'Choose a recitation', exact: true });
  await expect(picker.locator('.rosary-select__option').first()).toHaveText('Namo Amitabha Buddha');
  const choice = picker.getByRole('button', { name: 'Diệt Định Nghiệp Chân Ngôn', exact: true });
  await expect(choice).toHaveAttribute('data-value', mantra);
  await choice.click();
  await expect(page.locator('.tt-rosary__phrase')).toHaveText(mantra);
  await expect(phrases).toHaveText('Diệt Định Nghiệp Chân Ngôn');
  await expect(page.locator('.tt-rosary__options-bar p')).toContainText('108');
  await expect(page.locator('.tt-rosary__options-bar p')).toContainText('1,000');
  await page.locator('.tt-rosary__options-bar button').click();
  await expect(phrases).toBeHidden();
  await expect(page.locator('.tt-rosary__phrase')).toHaveText(mantra);
  await expect(page.locator('.tt-rosary')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '.cache/practice-main-rosary-en-375.png' });
});

test('rosary choices show short names while the complete text remains below', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await page.locator('.tt-rosary__options-bar button').click();
  const phrases = page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true });
  for (const name of ['Diệt Định Nghiệp Chân Ngôn', 'Tâm Chú Lăng Nghiêm', 'Ngũ Đại Tâm Chú Lăng Nghiêm']) {
    const fullText = ROSARY_PHRASES.find(phrase => phrase.startsWith(`${name} — `));
    expect(fullText).toContain(' — ');
    await phrases.click();
    const choice = page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true }).getByRole('button', { name, exact: true });
    await expect(choice).toHaveAttribute('data-value', fullText!);
    await choice.click();
    await expect(phrases).toHaveText(name);
    await expect(page.locator('.tt-rosary__options-bar p')).toContainText('108');
    await expect(page.locator('.tt-rosary__options-bar p')).toContainText('1.000');
    await expect(page.locator('.tt-rosary__phrase')).toHaveText(fullText!);
  }
  await expect(page.locator('.tt-rosary')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '.cache/rosary-summary-short-name-1440-dark.png' });
});

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
  test(`rosary controls receive taps above the shared shell at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/tu-tap');
    await page.getByRole('button', { name: /^Lần tràng hạt Chuỗi/ }).click();
    await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
    const screen = page.getByRole('region', { name: 'Chế độ lần chuỗi', exact: true });
    await expect(screen).toBeVisible();
    for (const name of ['Quay lại tu tập', 'Kết thúc phiên', 'Vuốt, chạm chuỗi hạt hoặc dùng phím mũi tên để đếm hạt']) {
      const button = screen.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      expect(await button.evaluate(element => {
        const r = element.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1
          && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    await screen.getByRole('button', { name: 'Vuốt, chạm chuỗi hạt hoặc dùng phím mũi tên để đếm hạt', exact: true }).click();
    await expect(screen.getByText('1/108', { exact: true })).toBeVisible();
  });
}
