import {expect,test} from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const [width, dark] of [[375, false], [375, true], [1440, false], [1440, true]] as const) test(`bowing keeps counts through setup, editing and browser back (${width}, ${dark ? 'dark' : 'light'})`, async ({ page }) => {
 await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
 await page.setViewportSize({ width, height: 844 });
 await page.goto('/tu-tap');
 await settleClient(page);
 await page.locator('.tt-mode-card--le-phat').click();
 await page.locator('#lp-bell-select').selectOption('none');
 await page.locator('.lp__action-btn--start').click();
 const counter = page.locator('.lp-fullscreen-counter');
 await expect(counter).toHaveCSS('-webkit-tap-highlight-color', 'rgba(0, 0, 0, 0)');
 await expect(counter).toHaveCSS('touch-action', 'manipulation');
 await counter.click();
 await page.keyboard.press('Space');
 await page.locator('.lp-fullscreen-portrait-wrap').click({ position: { x: 80, y: 200 } });
 await expect(counter).toContainText('3 lạy');
 await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true })));
 await expect(counter).toContainText('3 lạy');
 await expect(page.locator('.lp-fullscreen-portrait')).toHaveCSS('transform', 'none');
 await expect(page.locator('.lp-fullscreen-img')).toHaveCSS('filter', 'none');
 for (const button of [page.locator('.lp-fullscreen-back-btn'), page.locator('.lp-fullscreen-finish-btn')]) {
   expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 }
 await expect(page.locator('.lp-fullscreen-img')).toHaveClass(/loaded/);
 await expect(page.locator('.lp-fullscreen-screen')).toHaveCSS('opacity', '1');
 await page.screenshot({ path: `.cache/practice-main-bowing-${width}-${dark ? 'dark' : 'light'}.png` });
 await page.locator('.lp-fullscreen-back-btn').click();
 await page.locator('.lp__header-actions').getByRole('button', { name: 'Hoàn tất', exact: true }).click();
 await expect(page.locator('.lp__dialog-input')).toHaveValue('3');
 await page.getByRole('button', { name: 'Tiếp tục lễ Phật', exact: true }).click();
 await page.locator('.lp__action-btn--start').click();
 await expect(counter).toContainText('3 lạy');
 await page.goBack();
 await expect(page.locator('.lp-fullscreen-screen')).toHaveCount(0);
 await expect(page.getByText('🙏 Đã tự động ghi nhận 3 lạy', { exact: false })).toBeVisible();
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]').map((log: { count: number }) => log.count))).toEqual([3]);
 await page.locator('.tt-mode-card--le-phat').click();
 await page.locator('.lp__action-btn--start').click();
 await expect(counter).toContainText('0 lạy');
});

test('bowing edits a whole count and Escape asks before saving', async ({ page }) => {
 await page.goto('/tu-tap');
 await settleClient(page);
 await page.locator('.tt-mode-card--le-phat').click();
 await page.locator('.lp__header-actions').getByRole('button', { name: 'Hoàn tất', exact: true }).click();
 await page.locator('.lp__dialog-input').fill('4.8');
 await page.getByRole('button', { name: '✓ Ghi nhận 4.8 lạy', exact: true }).click();
 await expect(page.getByText('🙏 Đã tự động ghi nhận 4 lạy', { exact: false })).toBeVisible();
 await page.locator('.tt-mode-card--le-phat').click();
 await page.locator('.lp__action-btn--start').click();
 await page.locator('.lp-fullscreen-counter').click();
 await page.keyboard.press('Escape');
 await expect(page.locator('.lp__dialog-input')).toHaveValue('1');
 await page.getByRole('button', { name: 'Tiếp tục lễ Phật', exact: true }).click();
 await expect(page.locator('.lp-fullscreen-counter')).toContainText('1 lạy');
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:anonymous:tt_practice_logs_v1') || '[]').map((log: { count: number }) => log.count))).toEqual([4]);
});

for (const dark of [false,true]) test(`bowing counter records actual taps, continues and saves (${dark ? 'dark' : 'light'})`,async({page})=>{
 if(dark) await page.addInitScript(()=>localStorage.setItem('tutam_dark_mode','1'));
 await page.setViewportSize({width:375,height:812});
 await page.route('**/api/**',route=>route.abort('failed'));
 await page.goto('/tu-tap');
 await page.locator('.tt-mode-card--le-phat').click();
 await page.locator('.lp__action-btn--start').click();
 const counter=page.locator('.lp-fullscreen-counter');
 await expect(counter).toBeVisible();await expect(counter).toContainText('0 lạy');
 await counter.click();await counter.click();await counter.press('Enter');
 await expect(counter).toContainText('3 lạy');
 await page.locator('.lp-fullscreen-finish-btn').click();
 await expect(page.locator('.lp__dialog-input')).toHaveValue('3');
 await page.getByRole('button',{name:'Tiếp tục lễ Phật',exact:true}).click();
 await expect(counter).toContainText('3 lạy');
 const size=await counter.boundingBox();expect(size!.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.lp-fullscreen-finish-btn').click();
 await page.getByRole('button',{name:'✓ Ghi nhận 3 lạy',exact:true}).click();
 await expect(page.getByText('🙏 Đã tự động ghi nhận 3 lạy', {exact:false})).toBeVisible();
 await page.locator('.tt-mode-card--le-phat').click();
 await page.locator('.lp__action-btn--start').click();
 await expect(counter).toContainText('0 lạy');
});

