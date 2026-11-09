import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';
import { inspectHorizontalOverflow } from './ios-overflow-helpers';

test.use({ browserName: 'webkit', isMobile: true, hasTouch: true, contextOptions:{reducedMotion:'reduce'} });
const variants = [
  { width:320, height:812, locale:'vi', dark:false, scale:1.2 },
  { width:320, height:812, locale:'en', dark:true, scale:1.2 },
  { width:375, height:812, locale:'en', dark:true, scale:1.2 },
  { width:390, height:844, locale:'vi', dark:true, scale:1 },
  { width:430, height:932, locale:'en', dark:false, scale:1 },
  { width:844, height:390, locale:'vi', dark:false, scale:1.2 },
];
const routes = ['/', '/kinh-sach', '/phap-thoai', '/tu-tap', '/huong-dan', '/trich-dan-cua-toi', '/tien-do-tu-tap',
  '/chinh-sach-bao-mat', '/privacy-policy', '/ca-nhan', ...['account','settings','author','testimonials','feedback','guide','study-guide'].map(tab => '/ca-nhan?tab='+tab),
  '/tu-tap/chep-kinh','/tu-tap/chep-danh-hieu', ...['rosary','meditation','le-phat','thanh-tinh','giu-gioi','bat-quan-trai'].map(action=>'/tu-tap?action='+action)];

for (const variant of variants) test(`iOS interface overflow ${variant.width} ${variant.locale} ${variant.dark?'dark':'light'} font ${variant.scale}`, async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({width:variant.width,height:variant.height});
  await page.addInitScript(value=>{
    localStorage.setItem('tutam_locale',value.locale);
    localStorage.setItem('tutam_dark_mode',value.dark?'1':'0');
    localStorage.setItem('tutam_ui_font_scale',String(value.scale));
  },variant);
  const report: Array<{route:string; position:string; geometry:Awaited<ReturnType<typeof inspectHorizontalOverflow>>}> = [];
  const visited:string[]=[];
  const check = async (route:string) => {
    for(const position of ['top','middle','bottom']) {
      await page.evaluate(position=>window.scrollTo(0,position==='top'?0:document.documentElement.scrollHeight*(position==='middle'?0.5:1)),position);
      const geometry=await inspectHorizontalOverflow(page);
      if(geometry.documentWidth>geometry.viewport+2 || geometry.findings.length) {
        report.push({route,position,geometry});
        await page.screenshot({path:info.outputPath(`overflow-${report.length}.png`),animations:'disabled'});
      }
    }
    await writeFile(info.outputPath('overflow-report.json'),JSON.stringify(report,null,2));
    visited.push(route);
    await writeFile(info.outputPath('coverage.json'),JSON.stringify({variant,visited,inspections:visited.length*3},null,2));
  };
  page.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
  await loginAsMember(page);
  await page.goto('/');
  expect((await page.evaluate(async()=> (await (await fetch('/api/session')).json()).authenticated))).toBe(true);
  // Keep the shared local seed session alive for the next isolated browser
  // context; exercise client logout with a cleared cookie, not another test's DB row.
  await page.route('**/api/auth/logout',async route=>{
    await page.context().clearCookies({name:'quangtu_session'});
    await route.fulfill({json:{ok:true}});
  });
  for(const route of routes) {
    console.log('Inspecting',route);
    await page.goto(route,{waitUntil:'domcontentloaded',timeout:15000});
    if(route.includes('privacy')||route.includes('chinh-sach')) {
      await page.locator('#btn-'+variant.locale).click();
    }
    else { await page.waitForSelector('[data-mounted="1"]',{timeout:10000}); await settleClient(page);
      await expect(page.locator('html')).toHaveAttribute('lang',variant.locale); }
    await check(route);
    if(route==='/ca-nhan?tab=settings') {
      const summaries=page.locator('.settings-hub details > summary');
      for(let index=0;index<await summaries.count();index++) {
        await summaries.nth(index).click(); await check(route+'#section-'+index);
      }
    }
  }
  await page.goto('/ca-nhan?tab=account'); await settleClient(page);
  await page.locator('.cn-btn-logout').click();
  await page.locator('[role="alertdialog"] .cn-modal-actions button').last().click();
  await page.waitForURL(url=>url.pathname==='/',{waitUntil:'networkidle'});
  expect((await page.evaluate(async()=> (await (await fetch('/api/session')).json()).authenticated))).toBe(false);
  await check('after-logout');
  await loginAsMember(page);
  expect((await page.evaluate(async()=> (await (await fetch('/api/session')).json()).authenticated))).toBe(true);
  for(const route of ['/','/ca-nhan?tab=account','/ca-nhan?tab=settings','/kinh-sach','/tu-tap','/phap-thoai']) {
    await page.goto(route,{waitUntil:'domcontentloaded',timeout:15000}); await settleClient(page);
    if(route.includes('tab=account')) await expect(page.locator('.cn-btn-logout')).toBeVisible();
    await check('after-relogin '+route);
  }
  await writeFile(info.outputPath('overflow-report.json'),JSON.stringify(report,null,2));
  await page.screenshot({path:info.outputPath('interface-final.png'),animations:'disabled'});
  expect(report,'unexpected document or visible text overflow; see overflow-report.json').toEqual([]);
});
