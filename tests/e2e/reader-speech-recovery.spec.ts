import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';
import { renderReaderContent } from '../../src/lib/components/reader/content-renderer';

test.beforeEach(async ({page}, testInfo) => {
  const guest = testInfo.title.startsWith('ebook Listen') || testInfo.title.startsWith('canceling Listen');
  if (!guest) await loginAsMember(page);
  await page.addInitScript(() => {
    const utterances: any[] = [];
    (window as any).__speech = utterances;
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class {
      text:string;lang='';rate=1;onstart:any;onend:any;onerror:any;
      constructor(text:string){this.text=text;}
    }});
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>[{lang:'vi-VN',name:'Vietnamese'}],
      speak:(item:any)=>{utterances.push(item);setTimeout(()=>item.onstart?.(),0);},
      cancel:()=>{},pause:()=>{},resume:()=>{},addEventListener:()=>{},removeEventListener:()=>{}
    }});
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/kinh-sach');
  expect(await (await page.request.get('/api/session')).json()).toMatchObject(guest ? { authenticated: false } : { authenticated: true, user: { displayName: 'Thành viên E2E' } });
});

test('ebook Listen waits for a lazy chapter and stops on chapter navigation',async({page})=>{
  await page.context().clearCookies();
  const chapterResponse = await page.request.get('/api/articles/e2e-ebook/chapters?order=so_thu_tu.asc&limit=5000');
  expect(chapterResponse.ok()).toBe(true);
  const chapters = await chapterResponse.json();
  const expectedSpeech = renderReaderContent(String(chapters[0].noi_dung)).replace(/<[^>]+>/gu, '').trim();
  expect(expectedSpeech).not.toBe('');
  let chapterRequests=0;
  await page.route('**/api/articles/e2e-ebook/chapters?**',async route=>{
    chapterRequests++;
    await new Promise(resolve=>setTimeout(resolve,350));
    await route.continue();
  });
  await page.goto('/?article=e2e-ebook');await settleClient(page);
  await expect(page.getByRole('dialog',{name:'Sách nhiều tập E2E'})).toBeVisible();
  const reader=page.locator('.reader-modal'); // Its accessible name becomes the active chapter title.
  await reader.getByRole('button',{name:'Công cụ',exact:true}).click();
  await expect(reader.locator('.reader-toolbar').getByRole('button', { name: 'Chia sẻ', exact: true })).toBeVisible();
  await expect(reader.locator('.download-gate')).toHaveCount(0);
  await reader.locator('.action-label').filter({hasText:/^Nghe$/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__speech.filter((item:any)=>item.text).map((item:any)=>item.text).join(' '))).toContain(expectedSpeech);
  await expect(reader.getByRole('region',{name:'Công cụ đọc',exact:true}).getByRole('button',{name:'Dừng',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(chapterRequests).toBeGreaterThan(0);
  await reader.getByRole('button',{name:'Đóng công cụ'}).click();
  await reader.locator('.reader-back').click();
  expect(await page.evaluate(()=>document.querySelectorAll('.tts-word.active').length)).toBe(0);
});

test('PDF Listen reads extracted page text with selected settings and stops when changing page',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('tutam_read_tts_speed','1.2'));
  await page.goto('/?article=e2e-pdf');await settleClient(page);
  await page.getByRole('button',{name:'Đọc online',exact:true}).click();
  const reader=page.getByRole('dialog',{name:'Bài PDF kiểm thử E2E'});
  await reader.getByRole('button',{name:'Công cụ',exact:true}).click();
  await expect(reader.locator('.primary-offline-group').getByTitle('Chia sẻ bài viết')).toBeVisible();
  await expect(reader.locator('.download-gate')).toHaveCount(0);
  const firstPage=reader.getByRole('spinbutton',{name:'Số trang PDF'});
  await firstPage.fill('1');await firstPage.press('Enter');
  await reader.getByTitle('Đọc trang hiện tại').click();
  await expect(reader.getByTitle('Dừng đọc trang')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__speech.find((item:any)=>item.text)?.rate)).toBe(1.2);
  const input=reader.getByRole('spinbutton',{name:'Số trang PDF'});
  await input.fill('3');await input.press('Enter');
  await expect(reader.getByTitle('Đọc trang hiện tại')).toHaveAttribute('aria-pressed','false');
});

test('canceling Listen while the chapter list is loading prevents a late utterance and shares that request', async ({ page }) => {
  await page.context().clearCookies();
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let requests = 0;
  await page.route('**/api/articles/e2e-ebook/chapters?**', async route => {
    requests++;
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/?article=e2e-ebook');
    await settleClient(page);
    const reader = page.locator('.reader-modal');
    await reader.getByRole('button', { name: 'Công cụ', exact: true }).click();
    await reader.locator('.action-label').filter({ hasText: /^Nghe$/ }).click();
    await reader.locator('.reader-toolbar button[aria-busy="true"]').click();
    release();
    await expect(reader.locator('.toc-item')).toHaveCount(2);
    expect(requests).toBe(1);
    expect(await page.evaluate(() => (window as any).__speech.filter((item: any) => item.text))).toHaveLength(0);
  } finally { release(); }
});

test('a deep linked book remains open with its verified SSR member session', async ({page}) => {
  await page.evaluate(()=>localStorage.removeItem('tutam_native_session'));
  await page.goto('/?article=e2e-ebook');
  await settleClient(page);
  expect(await (await page.request.get('/api/session')).json()).toMatchObject({ authenticated: true, user: { displayName: 'Thành viên E2E' } });
  await expect(page.getByRole('dialog',{name:'Sách nhiều tập E2E'})).toBeVisible();
  await expect(page).toHaveURL(/article=e2e-ebook/);
});
