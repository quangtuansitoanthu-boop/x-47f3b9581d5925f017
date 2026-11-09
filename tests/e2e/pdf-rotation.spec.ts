import { expect, test } from '@playwright/test';
import { choosePdfOnline, openReaderTools, settleClient } from './runtime-helpers';

test('PDF retains the selected spread after portrait navigation and rotation back to landscape', async ({ page }) => {
  await page.goto('/kinh-sach?article=e2e-pdf');
  await settleClient(page);
  await choosePdfOnline(page);
  const reader = page.getByRole('dialog', { name: 'Bài PDF kiểm thử E2E', exact: true });
  const input = reader.getByRole('spinbutton', { name: 'Số trang PDF' });
  await reader.getByRole('combobox', { name: 'Bố cục trang', exact: true }).selectOption('auto');
  await input.fill('3');
  await input.press('Enter');
  await expect(input).toHaveValue('2');
  await page.setViewportSize({ width: 390, height: 844 });
  await openReaderTools(page);
  await input.fill('3');
  await input.press('Enter');
  await expect(input).toHaveValue('3');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(input).toHaveValue('2');
  await expect(reader.locator('.pdf-spread[data-canonical-page="2"] .pdf-page')).toHaveCount(2);
  await page.waitForTimeout(500);
  await expect(input).toHaveValue('2');
});
