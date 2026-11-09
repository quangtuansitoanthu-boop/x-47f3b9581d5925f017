import {expect,test} from '@playwright/test';
import {settleClient} from './runtime-helpers';
for(const width of [411,900])for(const dark of [false,true]){
  test(`journal caret follows first IME resize without manual scroll-to-end ${width} ${dark}`,async({page})=>{
    await page.setViewportSize({width,height:814});
    await page.addInitScript(dark=>{localStorage.setItem('tt_reflection_guide_seen_v1','1');localStorage.setItem('tutam_dark_mode',dark?'1':'0');},dark);
    await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/session'?{authenticated:false,user:null,csrfToken:null,expiresAt:null}:new URL(route.request().url()).pathname==='/api/presence'?{enabled:false,activeCount:0}:[]}));
    await page.goto('/tu-tap');await settleClient(page);
    await page.evaluate(()=>{document.documentElement.dataset.nativeApp='true';});
    await page.locator('.tt-mode-card--reflection').click();
    const fields=page.locator('.personal-journal .journal-columns textarea');
    for(const index of [0,1]){
      await page.setViewportSize({width,height:814});
      const field=fields.nth(index),value='Con nhìn lại lời nói và việc làm trong ngày. '.repeat(40)+'Dòng đang gõ cuối cùng.';
      await field.fill(value);
      await field.press('Control+End');
      await page.setViewportSize({width,height:526});
      await field.evaluate((node:HTMLTextAreaElement)=>{
        node.focus();node.setSelectionRange(node.value.length,node.value.length);
        // Model the real Android first-focus scroll measured on Pixel_7: the UA leaves padding hidden.
        node.scrollTop=Math.max(0,node.scrollHeight-node.clientHeight-parseFloat(getComputedStyle(node).paddingBottom));
        window.scrollBy({top:node.getBoundingClientRect().bottom-innerHeight,behavior:'instant'});
        window.dispatchEvent(new Event('resize'));
      });
      await expect.poll(async()=>field.evaluate((node:HTMLTextAreaElement)=>{
        const rect=node.getBoundingClientRect(),style=getComputedStyle(node),nav=document.querySelector('.qts-bottom-nav')!.getBoundingClientRect();
        return rect.top+node.clientTop+node.scrollHeight-node.scrollTop-parseFloat(style.paddingBottom)-nav.top;
      })).toBeLessThanOrEqual(0);
      await expect(field).toHaveValue(value);
      await expect.poll(()=>field.evaluate((node:HTMLTextAreaElement)=>node.selectionEnd)).toBe(value.length);
    }
  });
}
