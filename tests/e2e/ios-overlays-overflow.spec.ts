import {writeFile} from 'node:fs/promises';
import {expect,test} from '@playwright/test';
import {loginAsMember,settleClient,choosePdfOnline,openReaderTools} from './runtime-helpers';
import {inspectHorizontalOverflow} from './ios-overflow-helpers';
test.use({browserName:'webkit',isMobile:true,hasTouch:true,contextOptions:{reducedMotion:'reduce'}});

for(const width of [320,375]) test(`iOS populated overlays stay within ${width}px with large text`,async({page},info)=>{
  test.setTimeout(90000);
  await page.setViewportSize({width,height:812});
  await page.addInitScript(()=>{localStorage.setItem('tutam_locale','vi');localStorage.setItem('tutam_ui_font_scale','1.2');});
  await loginAsMember(page);
  const report:Array<{step:string;geometry:Awaited<ReturnType<typeof inspectHorizontalOverflow>>}>=[];
  const check=async(step:string)=>{
    await page.screenshot({path:info.outputPath(step+'.png'),animations:'disabled'});
    const geometry=await inspectHorizontalOverflow(page);
    report.push({step,geometry});
    await writeFile(info.outputPath('overlays.json'),JSON.stringify(report,null,2));
  };
  await page.goto('/'); await settleClient(page);
  await page.locator('.personal-add-first-btn,.personal-add-more-btn').first().click();
  await expect(page.locator('.pem-dialog')).toBeVisible(); await check('personal-event');
  for (const selector of ['.pem-close-btn', '.pem-submit-btn', '.pem-done-btn']) {
    const target = page.locator(selector);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    expect(box!.width, selector).toBeGreaterThanOrEqual(44);
    expect(box!.height, selector).toBeGreaterThanOrEqual(44);
    await expect(target).toBeInViewport();
  }
  await page.locator('.pem-close-btn').click();
  await page.locator('.notification-bell-btn').click();
  await expect(page.locator('.notification-popover')).toBeVisible(); await check('notifications');
  await page.locator('.close-popover-btn').click();
  await page.goto('/kinh-sach');await settleClient(page);
  await page.getByRole('button',{name:/Đọc ngay Bài viết kiểm thử E2E/}).click();
  await expect(page.locator('.reader-content')).not.toBeEmpty(); await check('text-reader');
  await page.keyboard.press('Escape');
  await page.goto('/kinh-sach?article=e2e-pdf');await settleClient(page);await choosePdfOnline(page);
  await openReaderTools(page);await check('pdf-reader');
  await page.locator('.pdf-offline-main-btn').click();
  await expect(page.getByRole('button',{name:'Tải về máy',exact:true})).toBeVisible();await check('pdf-offline-choice');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.goto('/phap-thoai');await settleClient(page);
  const album=page.locator('.pt-card').filter({hasText:'Pháp thoại kiểm thử E2E'});
  await album.locator('.pt-card-thumb').click();
  await expect(page.locator('.pt-as-title')).toContainText('Pháp thoại kiểm thử E2E');await check('audio-album');
  const failed=report.filter(row=>row.geometry.documentWidth>row.geometry.viewport+2||row.geometry.findings.length);
  expect(failed,'See overlays.json and screenshots').toEqual([]);
});
