import {writeFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {loginAsAdmin,settleClient} from './runtime-helpers';
import {inspectHorizontalOverflow} from './ios-overflow-helpers';
test.use({browserName:'webkit',isMobile:true,hasTouch:true,contextOptions:{reducedMotion:'reduce'}});
for(const width of [320,375,844]) test(`iOS admin surfaces and long account identity ${width}px`,async({page},info)=>{
  test.setTimeout(90000);await page.setViewportSize({width,height:812});
  await page.addInitScript(()=>{localStorage.setItem('tutam_locale','vi');localStorage.setItem('tutam_ui_font_scale','1.2');});
  await loginAsAdmin(page);
  const actual=await(await page.request.get('/api/session')).json();
  await page.route('**/api/session',route=>route.fulfill({json:{...actual,user:{...actual.user,
    displayName:'An'.repeat(40)+' Quản trị',email:'a'.repeat(60)+'@example.com'}}}));
  const report:Array<{route:string;geometry:Awaited<ReturnType<typeof inspectHorizontalOverflow>>}>=[];
  for(const route of ['/admin','/admin/books','/admin/tu-tap','/admin/phap-thoai','/admin/members','/admin/settings','/admin/community','/admin/practice','/admin/analytics']){
    await page.goto(route,{waitUntil:'domcontentloaded'});await settleClient(page);
    await expect(page.locator('.admin-shell')).toBeVisible();
    report.push({route,geometry:await inspectHorizontalOverflow(page)});
  }
  await page.screenshot({path:info.outputPath('admin-header.png'),animations:'disabled'});
  await page.locator('.session-status').click();await expect(page.locator('.account-dialog')).toBeVisible();
  report.push({route:'admin-account-dialog',geometry:await inspectHorizontalOverflow(page)});
  await page.screenshot({path:info.outputPath('admin-account.png'),animations:'disabled'});
  await writeFile(info.outputPath('admin-overflow.json'),JSON.stringify(report,null,2));
  expect(report.filter(row=>row.geometry.documentWidth>row.geometry.viewport+2||row.geometry.findings.length)).toEqual([]);
});
