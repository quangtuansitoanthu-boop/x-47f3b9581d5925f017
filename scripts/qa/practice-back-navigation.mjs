import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4178';
const output = 'tmp/practice-back-qa';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const locale of ['vi', 'en']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/api/**', route => route.abort());
    await context.addInitScript(locale => localStorage.setItem('tutam_locale', locale), locale);
    for (const [id, keyword] of [
      ['bao-khiep-an', locale === 'vi' ? 'Bảo Khiếp' : 'Treasure Chest'],
      ['dai-tuy-cau', locale === 'vi' ? 'thọ trì Đại Tùy Cầu' : 'Great Mahāpratisarā'],
    ]) {
      const page = await context.newPage();
      await page.goto(base);
      await page.locator('.daily-dhammapada-card').waitFor();
      await page.evaluate(() => { window.Capacitor = { ...window.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' }; });
      await page.locator('a[href="/tu-tap"]').last().click();
      await page.locator('.tt-mode-card--tri-chu').click();
      await page.locator('.tt-card').filter({ hasText: keyword }).click();
      await expect(page.locator('.tt-preview__toc-list button')).toHaveCount(2);
      const dismiss = page.getByRole('button', { name: locale === 'vi' ? 'Để sau' : 'Maybe later', exact: true });
      if (await dismiss.isVisible()) await dismiss.click();
      const topBack = { click: async () => {
        const readerBack = page.locator('.tt-reader-back-btn');
        if (await readerBack.isVisible()) await readerBack.click();
        else await page.locator('.qts-route-topbar .tt-back-btn').click();
      } };
      await page.locator('.tt-preview__toc-list button').first().click();
      await expect(page.locator('.tt-reader-chapter-title')).toContainText(locale === 'vi' ? 'Hướng dẫn' : 'Practice guide');
      await page.locator('.chapter-nav button').last().click();
      await expect(page.locator('.tt-reader-chapter-title')).toContainText(locale === 'vi' ? 'Nghi thức trì chú' : 'Recitation ritual');
      await topBack.click();
      await expect(page.locator('.tt-reader-chapter-title')).toContainText(locale === 'vi' ? 'Hướng dẫn' : 'Practice guide');
      await topBack.click();
      await expect(page.locator('.tt-preview__toc-list button')).toHaveCount(2);
      await page.locator('.tt-preview__toc-list button').last().click();
      await page.goBack();
      await expect(page.locator('.tt-preview__toc-list button')).toHaveCount(2);
      await page.locator('.tt-preview__toc-list button').last().click();
      await page.locator('.tt-reader-practice-btn').click();
      await page.locator('.practice-confirm__primary').click();
      await expect(page.locator('.tt-practice')).toBeVisible();
      const back = page.locator('.ttp-back');
      const shape = await back.evaluate(el => {
        const box = el.getBoundingClientRect(); const css = getComputedStyle(el);
        return { width: box.width, height: box.height, radius: css.borderRadius, border: css.borderTopWidth };
      });
      if (shape.width < 44 || shape.height < 44 || shape.width !== shape.height || shape.radius !== '50%' || parseFloat(shape.border) < 2) throw new Error(`Invisible back button: ${JSON.stringify(shape)}`);
      await page.screenshot({ path: `${output}/${locale}-${id}-practice.png` });
      await back.click();
      await page.locator('.practice-confirm__primary').click();
      await expect(page.locator('.tt-reader-chapter-title')).toContainText(locale === 'vi' ? 'Nghi thức trì chú' : 'Recitation ritual');
      await topBack.click();
      await expect(page.locator('.tt-preview__toc-list button')).toHaveCount(2);
      await topBack.click();
      await expect(page.locator('.tt-section-view')).toBeVisible();
      await expect(page.locator('.tt-card').filter({ hasText: keyword })).toBeVisible();
      await topBack.click();
      await expect(page.locator('.tt-mode-card--tri-chu')).toBeVisible();
      await topBack.click();
      await expect(page).toHaveURL(`${base}/`);
      results.push({ locale, id, headerBack: true, browserBack: true, practiceExit: true, sectionBack: true, shape });
      await page.close();
    }
    const page = await context.newPage();
    await page.goto(base);
    await page.locator('.daily-dhammapada-card').waitFor();
    await page.evaluate(() => { window.Capacitor = { ...window.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' }; });
    await page.locator('a[href="/tu-tap"]').last().click();
    for (const [mode, close] of [
      ['le-phat', '.lp__header-left .lp__hbtn'],
      ['thanh-tinh', '.thanh-tinh-overlay .btn-back'],
      ['chuoi', '.tt-rosary__back-btn'],
    ]) {
      await page.locator(`.tt-mode-card--${mode}`).click();
      if (mode === 'chuoi') await page.locator('.practice-confirm__primary').click();
      await page.locator(close).first().click();
      const discard = page.getByRole('button', { name: locale === 'vi' ? 'Thoát không lưu' : 'Exit without saving', exact: true });
      if (await discard.isVisible()) await discard.click();
      const confirm = page.locator('.practice-confirm__primary');
      if (await confirm.isVisible()) await confirm.click();
      await expect(page.locator('.tt-mode-card--tri-chu')).toBeVisible();
      await expect(page).toHaveURL(`${base}/tu-tap`);
      results.push({ locale, mode, backToPreviousScreen: true });
    }
    await page.close();
    await context.close();
  }
  fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`Passed ${results.length} navigation flows in Vietnamese and English.`);
} finally { await browser.close(); }
