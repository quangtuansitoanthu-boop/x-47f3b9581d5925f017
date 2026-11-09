import {expect,test} from '@playwright/test';
test('guide finds current features and Drive provides browser and copy actions',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.route('**/api/**',route=>route.abort('failed'));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{sessionStorage.setItem('qa-copied-link',text);}}});window.open=(url?:string|URL)=>{sessionStorage.setItem('qa-opened-link',String(url));return null;};});
 await page.goto('/huong-dan#bo-thi-may-nghe-phap',{waitUntil:'domcontentloaded'});
 const section=page.locator('#bo-thi-may-nghe-phap');await expect(section).toHaveAttribute('open','');
 const card=section.locator('.guide-link-card').filter({hasText:'Google Drive'});
 await expect(card.getByRole('button',{name:'Mở Link',exact:false})).toBeVisible();
 await card.getByRole('button',{name:'Sao chép link',exact:true}).click();
 await expect(card.getByRole('status')).toHaveText('Đã sao chép link.');
 const copied=await page.evaluate(()=>sessionStorage.getItem('qa-copied-link'));expect(copied).toContain('drive.google.com/file/d/1QSNeYvzkTMsNorQ_23b3W1TIYrQekYeH/');
 await card.getByRole('button',{name:'Mở Link',exact:false}).click();expect(await page.evaluate(()=>sessionStorage.getItem('qa-opened-link'))).toBe(copied);
 await expect(page.locator('.guide-confirm-overlay')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

