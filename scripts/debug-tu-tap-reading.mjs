import { chromium } from '@playwright/test';

async function testScriptureReading() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
  });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    const text = `[BROWSER ${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    console.log(text);
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err));

  console.log('--- 1. Navigating to /tu-tap ---');
  await page.goto('http://127.0.0.1:4173/tu-tap', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check sections in Tu tap
  console.log('--- 2. Checking catalog articles ---');
  // Wait for cards or items
  await page.waitForSelector('.tt-catalog, .tt-hub, .tt-card, .tt-article-item', { timeout: 6000 }).catch(() => null);

  // List all visible articles or sections
  const articles = await page.$$eval('.tt-card, .tt-article-item, .tt-item, .tt-cat-card', els => 
    els.map(el => ({ text: el.innerText.trim().slice(0, 50), class: el.className }))
  );
  console.log('Found catalog elements:', articles.slice(0, 10));

  // If there are section cards (e.g. KINH PHẬT, TRÌ CHÚ)
  const firstClickable = await page.$('.tt-card, .tt-article-item, .tt-hub-card, .tt-cat-tab');
  if (firstClickable) {
    console.log('Clicking first item...');
    await firstClickable.click();
    await page.waitForTimeout(1500);
    console.log('URL after first click:', page.url());
  }

  // Let's see if an article card appears now
  const articleCard = await page.$('.tt-card, .tt-article-item, [data-article-id]');
  if (articleCard) {
    const cardTitle = await articleCard.innerText();
    console.log('Clicking article card:', cardTitle.slice(0, 40));
    await articleCard.click();
    await page.waitForTimeout(2000);
    console.log('URL after article click:', page.url());

    // Check if error banner appears
    const errorBanner = await page.$('.tt-load-error, [role="alert"]');
    if (errorBanner) {
      console.log('ERROR BANNER FOUND:', await errorBanner.innerText());
    } else {
      console.log('No error banner found.');
    }

    // Check preview / session view
    const previewEl = await page.$('.practice-preview, .tt-preview, .tt-reader, .tt-practice');
    console.log('Preview or reader element present:', Boolean(previewEl));
    const mainText = await page.textContent('main#main-content');
    console.log('Main content preview:', mainText?.slice(0, 150));

    // Check if chapters exist
    const chapterButtons = await page.$$('.tt-chapter-btn, .chapter-item, .toc-item, button.tt-ch-item');
    console.log('Found chapter buttons:', chapterButtons.length);
    if (chapterButtons.length > 0) {
      console.log('Clicking first chapter...');
      await chapterButtons[0].click();
      await page.waitForTimeout(2000);
      console.log('After chapter click, main text:', (await page.textContent('main#main-content'))?.slice(0, 150));
      const chapError = await page.$('.tt-load-error');
      if (chapError) {
        console.log('CHAPTER ERROR BANNER:', await chapError.innerText());
      }
    }
  }

  await browser.close();
}

testScriptureReading().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
