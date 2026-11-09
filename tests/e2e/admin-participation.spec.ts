import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsMember, settleClient } from './runtime-helpers';
import { participationCopy } from '../../src/lib/i18n/participation';

const at='2026-11-09T03:00:00.000Z';
const row=(index=0,module='five')=>({ownerId:`fixture-${index}`,name:`Tài khoản mẫu ${index}`,email:`fixture-${index}@example.test`,module,event:'started',at,syncedAt:at});
for(const viewport of [{width:375,height:812},{width:1440,height:1000}]) {
  for(const mode of ['light','dark'] as const) {
    test(`${viewport.width} ${mode}: participation filters and cached account detail`,async({page})=>{
      const language=mode==='dark'?'en':'vi';const copy=participationCopy[language];
      await page.setViewportSize(viewport);
      await page.addInitScript(({mode,language})=>{localStorage.setItem('tutam_dark_mode',mode==='dark'?'1':'0');localStorage.setItem('tutam_locale',language);},{mode,language});
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      await loginAsAdmin(page);
      const requests:string[]=[];
      await page.route('**/api/admin/practice-participation?*',async route=>{
        const url=new URL(route.request().url());requests.push(url.search);
        if(url.searchParams.has('owner')) return route.fulfill({json:{rows:[row(0),row(0,'mantra')],next:null}});
        return route.fulfill({json:{rows:url.searchParams.get('account')==='missing@example.test'?[]:[row(0)],next:null}});
      });
      await page.goto('/admin/practice-participation');await settleClient(page);
      const main=page.locator('.ap-participation');
      await expect(main.getByRole('heading',{name:copy.title,exact:true})).toBeVisible();
      await expect(main.locator('tbody tr')).toHaveCount(1);expect(requests).toHaveLength(1);
      await main.locator('select').first().selectOption('precepts');
      await main.locator('input').fill('fixture-0@example.test');
      await page.waitForTimeout(850);expect(requests).toHaveLength(1);
      await main.getByRole('button',{name:copy.apply,exact:true}).click();
      await expect.poll(()=>requests.length).toBe(2);
      expect(new URLSearchParams(requests[1]).get('module')).toBe('precepts');
      await main.locator('.participation-account').click();
      await expect(main.locator('.participation-modules li')).toHaveCount(15);
      await expect(main.getByText(copy.missing,{exact:true})).toHaveCount(13);
      await expect(main.locator('.participation-person h2')).toBeFocused();
      expect(requests).toHaveLength(3);
      await main.getByRole('button',{name:copy.back,exact:true}).click();
      await expect(main.locator('input')).toHaveValue('fixture-0@example.test');
      await expect(main.getByRole('heading',{name:copy.list,exact:true})).toBeFocused();
      expect(requests).toHaveLength(3);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.screenshot({path:`.cache/participation-implemented-${viewport.width}-${mode}.png`,fullPage:true});
      await main.locator('input').fill('missing@example.test');await main.getByRole('button',{name:copy.apply,exact:true}).click();
      await expect(main.getByText(copy.empty,{exact:true})).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
test('cursor pagination, unavailable state and retry',async({page})=>{
  await loginAsAdmin(page);let unavailable=false;
  await page.route('**/api/admin/practice-participation?*',async route=>{
    if(unavailable) return route.fulfill({status:503,json:{error:'participation_unavailable'}});
    const next=new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({json:{rows:next?[row(20)]:Array.from({length:20},(_,i)=>row(i)),next:next?null:JSON.stringify([at,'fixture-19','five'])}});
  });
  await page.goto('/admin/practice-participation');await settleClient(page);
  const main=page.locator('.ap-participation');
  await expect(main.locator('tbody tr')).toHaveCount(20);
  await main.getByRole('button',{name:'Trang sau',exact:true}).click();await expect(main.locator('tbody tr')).toHaveCount(1);
  await expect(main.getByText('fixture-20@example.test',{exact:true})).toBeVisible();
  await main.getByRole('button',{name:'Trang trước',exact:true}).click();await expect(main.locator('tbody tr')).toHaveCount(20);
  unavailable=true;await main.getByRole('button',{name:'Làm mới',exact:true}).click();
  await expect(main.getByRole('alert')).toContainText(participationCopy.vi.unavailable);
  unavailable=false;await main.getByRole('button',{name:'Thử lại',exact:true}).click();await expect(main.locator('tbody tr')).toHaveCount(20);
});
test('real local API connects account metadata to admin and rejects member reads',async({page})=>{
  await loginAsMember(page);
  expect((await page.request.get('/api/admin/practice-participation')).status()).toBe(403);
  await loginAsAdmin(page);
  const session=await (await page.request.get('/api/session')).json();
  const response=await page.request.post('/api/practice/participation',{headers:{origin:'http://localhost:8787','x-csrf-token':session.csrfToken},data:{ownerId:session.user.id,items:[{module:'five',event:'started',at:new Date().toISOString()}]}});
  expect(response.status()).toBe(200);
  await page.goto('/admin/practice-participation');await settleClient(page);
  const main=page.locator('.ap-participation');
  await expect(main.locator('tbody')).toContainText(session.user.id);
  await main.locator('.participation-account').first().click();
  await expect(main.locator('.participation-modules li')).toHaveCount(15);
});
