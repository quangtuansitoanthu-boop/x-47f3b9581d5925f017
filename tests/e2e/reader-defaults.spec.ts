import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient, choosePdfOnline } from './runtime-helpers';

test.beforeEach(async ({ page }) => { await loginAsMember(page); });

test('an explicit light preference keeps warm paper even with a dark OS preference', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('tutam_dark_mode')) localStorage.setItem('tutam_dark_mode', '0'); });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-cream/);
  await expect(page.locator('.reader-modal')).toHaveCSS('background-color', 'rgb(244, 236, 216)');
  await page.getByRole('button', { name: 'Nền giấy Trắng', exact: true }).click();
  await page.reload();
  await settleClient(page);
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-white/);

  await page.goto('/?article=e2e-pdf');
  await settleClient(page);
  await choosePdfOnline(page);
  const warm = page.getByTitle('Chế độ nền ấm', { exact: true });
  await expect(warm).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pdf-shell')).toHaveClass(/sepia/);
  await warm.click();
  await expect(warm).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await settleClient(page);
  await expect(warm).toHaveAttribute('aria-pressed', 'false');
});

test('an explicitly saved dark site preference is preserved', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-dark/);
});

test('without a saved theme, the reader follows a dark system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader-scroll')).toHaveClass(/bg-dark/);
});

for (const appTheme of ['0', '1']) {
  test(`reader italic guidance stays readable on every paper with app theme ${appTheme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value), appTheme);
    await page.goto('/?article=e2e-public');
    await settleClient(page);
    const reader = page.locator('.reader-modal');
    await expect(reader.locator('.reader-content')).toBeVisible();
    const papers = appTheme === '1' ? ['Tối', 'Be nhạt'] : ['Trắng', 'Be nhạt', 'Xám'];
    for (const paper of papers) {
      await page.getByRole('button', { name: `Nền giấy ${paper}`, exact: true }).click();
      // Fixture text exercises the real reader CSS without changing stored content.
      const ratio = await reader.evaluate(modal => {
        const content = modal.querySelector('.reader-content')!;
        let sample = content.querySelector<HTMLElement>('[data-contrast-probe]');
        if (!sample) {
          sample = document.createElement('em');
          sample.dataset.contrastProbe = '';
          sample.textContent = '(3 lần)';
          content.append(sample);
        }
        const channels = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const luminance = (rgb: number[]) => rgb.map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const ink = luminance(channels(getComputedStyle(sample).color));
        const background = luminance(channels(getComputedStyle(modal).backgroundColor));
        return (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05);
      });
      expect(ratio, `italic guidance on ${paper}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}
