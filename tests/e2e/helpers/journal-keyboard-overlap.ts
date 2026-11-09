import { expect, test } from '@playwright/test';
import { settleClient } from '../runtime-helpers';

export function registerJournalKeyboardCases() {
    for (const width of [375, 667, 768, 900]) {
      for (const dark of [false, true]) {
        test(`resized journal viewport keeps final line above navigation ${width} ${dark ? 'dark' : 'light'}`, async ({ page }, info) => {
          await page.setViewportSize({ width, height: 900 });
          await page.addInitScript(value => {
            localStorage.setItem('tt_reflection_guide_seen_v1', '1');
            localStorage.setItem('tutam_dark_mode', value ? '1' : '0');
          }, dark);
          await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session'
            ? { authenticated: false, user: null, csrfToken: null, expiresAt: null }
            : new URL(route.request().url()).pathname === '/api/presence' ? { enabled: false, activeCount: 0 } : [] }));
          await page.goto('/tu-tap'); await settleClient(page);
          await page.locator('.tt-mode-card--reflection').click();
          if (width === 900) {
            // Native shells keep the bottom navigation in wide/landscape layouts too.
            await page.evaluate(() => { document.documentElement.dataset.nativeApp = 'true'; });
          }
          // Model adjustResize: the keyboard leaves a short layout viewport.
          await page.setViewportSize({ width, height: width === 375 ? 420 : 300 });
          const fields = page.locator('.personal-journal .journal-columns textarea');
          const navigation = page.locator('.qts-bottom-nav');
          await expect(navigation).toBeVisible();
          for (const index of [0, 1]) {
            const editor = fields.nth(index);
            await editor.fill(`${'Con nhìn lại lời nói và việc làm trong ngày. '.repeat(80)}Dòng đang gõ cuối cùng.`);
            await editor.evaluate((node: HTMLTextAreaElement) => {
              node.focus();
              node.setSelectionRange(node.value.length, node.value.length);
              node.scrollTop = node.scrollHeight;
              // Reproduce the obscured endpoint even if a browser reserves extra focus space.
              window.scrollBy({ top: node.getBoundingClientRect().bottom - innerHeight, behavior: 'instant' });
            });
            const geometry = await editor.evaluate((node: HTMLTextAreaElement) => {
              const rect = node.getBoundingClientRect();
              const style = getComputedStyle(node);
              return {
                finalLineBottom: rect.top + node.clientTop + node.scrollHeight - node.scrollTop - parseFloat(style.paddingBottom),
                top: rect.top, height: rect.height,
              };
            });
            const nav = (await navigation.boundingBox())!;
            expect(geometry.finalLineBottom, JSON.stringify({ geometry, nav })).toBeLessThanOrEqual(nav.y);
            expect(geometry.finalLineBottom).toBeGreaterThan(0);
            expect(geometry.height).toBeGreaterThanOrEqual(280);
            await page.screenshot({ path: info.outputPath(`journal-field-${index}-viewport.png`) });
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        });
      }
    }
}
