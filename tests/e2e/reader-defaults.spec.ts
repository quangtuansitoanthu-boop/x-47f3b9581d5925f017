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
  test(`reader imported ink and highlighted emphasis stay readable on every paper with app theme ${appTheme}`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value), appTheme);
    await page.goto('/?article=e2e-public');
    await settleClient(page);
    const reader = page.locator('.reader-modal');
    await expect(reader.locator('.reader-content')).toBeVisible();
    const papers = appTheme === '1' ? ['Tối', 'Be nhạt'] : ['Trắng', 'Be nhạt', 'Xám'];
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 375) await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
      for (const paper of papers) {
      await page.getByRole('button', { name: `Nền giấy ${paper}`, exact: true }).click();
      await expect(reader.locator('.reader-scroll')).toHaveCSS('color', await reader.evaluate(modal => getComputedStyle(modal).color));
      // Fixture text exercises the real reader CSS without changing stored content.
      const ratios = await reader.evaluate(modal => {
        const content = modal.querySelector('.reader-content')!;
        if (!content.querySelector('[data-contrast-probes]')) {
          const samples = document.createElement('div');
          samples.dataset.contrastProbes = '';
          samples.innerHTML = '<em data-contrast-probe="guidance">(3 lần)</em>'
            + '<p style="background-color:rgb(255,255,255);color:rgb(51,51,51)"><span data-contrast-probe="imported-paper">Kinh văn</span></p>'
            + '<span style="color:#ffffff" data-contrast-probe="imported-white">Lời giảng</span>'
            + '<div class="tt-converted-book"><p class="book-paragraph"><strong data-contrast-probe="converted-bold">Khuyên người niệm Phật</strong></p><aside class="footnote"><p class="note-label" data-contrast-probe="note-label">Chú thích</p><p><strong data-contrast-probe="note-bold">Lời giải</strong></p></aside><div class="boxed"><em data-contrast-probe="boxed-guidance">(Lời hướng dẫn)</em></div></div>'
            + '<mark data-reading-annotation="contrast-yellow" data-color="yellow"><strong data-contrast-probe="highlight-bold">Đoạn đã đánh dấu</strong> <em data-contrast-probe="highlight-italic">(3 lần)</em></mark>';
          // Các cặp màu nhập thực tế trong sách đóng offline phải theo nền giấy.
          for (const [index, style] of [
            'color:#ff0000', 'background-color:hsl(0,0%,100%)',
            'background-color:hsl(0,0%,100%);color:rgb(33,37,41)',
            'color:hsl(240,75%,60%)', 'color:#0000DE', 'color:rgb(255,0,0)',
            'background-color:rgb(255,255,255);color:rgb(51,51,51);font-size:15px',
            'color:rgb(33,37,41)', 'background-color:rgb(255,255,255);color:rgb(51,51,51)',
            'color:#dfb75c', 'text-align:center;color:#b45309;line-height:1.4',
          ].entries()) {
            const sample = document.createElement('span');
            sample.dataset.contrastProbe = `corpus-style-${index}`;
            sample.setAttribute('style', style);
            sample.textContent = 'Nội dung sách';
            samples.append(sample);
          }
          const nested = document.createElement('span');
          nested.dataset.contrastProbe = 'highlight-imported-style';
          nested.style.color = '#ffffff';
          nested.textContent = 'Chữ có màu trong đánh dấu';
          samples.querySelector('mark')!.append(nested);
          content.append(samples);
        }
        const channels = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const luminance = (rgb: number[]) => rgb.map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        return [...content.querySelectorAll<HTMLElement>('[data-contrast-probe]')].map(sample => {
          const ancestors: Element[] = [];
          for (let node: Element | null = sample; node; node = node.parentElement) ancestors.unshift(node);
          let paper = [255, 255, 255];
          for (const node of ancestors) {
            const rgba = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)!.map(Number);
            const alpha = rgba[3] ?? 1;
            paper = paper.map((channel, index) => rgba[index] * alpha + channel * (1 - alpha));
          }
          const ink = luminance(channels(getComputedStyle(sample).color));
          const background = luminance(paper);
          return { name: sample.dataset.contrastProbe, ratio: (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05) };
        });
      });
      await testInfo.attach(`contrast-${width}-${paper}`, { body: JSON.stringify(ratios), contentType: 'application/json' });
      for (const sample of ratios) expect.soft(sample.ratio, `${sample.name} on ${paper}, ${width}px`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
}
