import {writeFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {settleClient} from './runtime-helpers';
import {inspectHorizontalOverflow} from './ios-overflow-helpers';
test.use({browserName:'webkit',isMobile:true,hasTouch:true,contextOptions:{reducedMotion:'reduce'}});
for(const width of [320,375]) test(`iOS long album topic and track labels ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:812});
  await page.addInitScript(()=>{localStorage.setItem('tutam_locale','vi');localStorage.setItem('tutam_ui_font_scale','1.2');});
  await page.route('**/api/talks?**',route=>route.fulfill({json:[{id:'layout-long-album',tieu_de:'Bài giảng '+ 'An'.repeat(35),
    mo_ta:'Một bài giảng kiểm tra nhãn dài.',chu_de:'Chủ đề '+ 'PhậtPháp'.repeat(8),visibility:'public',
    created_at:'2026-11-07',tracks:[{title:'An'.repeat(60),url:'/layout-audio.wav'}]}]}));
  await page.goto('/phap-thoai');await settleClient(page);
  const card=page.locator('.pt-card').filter({hasText:'Bài giảng'});await expect(card).toBeVisible();
  await page.screenshot({path:info.outputPath('audio-card-long.png'),animations:'disabled'});
  const report=[{step:'card',geometry:await inspectHorizontalOverflow(page)}];
  await card.locator('.pt-card-thumb').click();await expect(page.locator('.pt-as-title')).toContainText('Bài giảng');
  await page.screenshot({path:info.outputPath('audio-album-long.png'),animations:'disabled'});
  report.push({step:'album',geometry:await inspectHorizontalOverflow(page)});
  await writeFile(info.outputPath('media-overflow.json'),JSON.stringify(report,null,2));
  expect(report.filter(row=>row.geometry.documentWidth>row.geometry.viewport+2||row.geometry.findings.length)).toEqual([]);
});
