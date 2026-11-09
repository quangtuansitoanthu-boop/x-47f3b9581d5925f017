import { expect, test, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';

const cacheKey = 'quangtu_album_plays_cache';
const syncKey = 'quangtu_album_plays_last_sync_time';
const threeDays = 72 * 60 * 60 * 1000;
const saved = [{ albumId: 'e2e-play-cache', playCount: 42 }];
const updated = [{ albumId: 'e2e-play-cache', playCount: 108 }];
const counter = (page: Page) => page.locator('.pt-card').filter({ hasText: 'Album cache kiểm thử' }).locator('.pt-card-meta-plays');

async function prepare(page: Page, age: number) {
  await page.addInitScript(({ cacheKey, syncKey, saved, age }) => {
    if (localStorage.getItem(cacheKey) !== null) return;
    localStorage.setItem(cacheKey, JSON.stringify(saved));
    localStorage.setItem(syncKey, String(Date.now() - age));
  }, { cacheKey, syncKey, saved, age });
  await page.route(/\/api\/talks(?:\?|$)/u, route => route.fulfill({ json: [{
    id: 'e2e-play-cache', tieu_de: 'Album cache kiểm thử', visibility: 'public',
    chu_de: 'Pháp ngữ', tracks: [{ title: 'Bài thử', url: '/assets/audio/tieng-mo.m4a' }],
  }] }));
}

test('persisted totals survive cold reloads without a GET until three days expire', async ({ page }) => {
  await prepare(page, threeDays - 60_000);
  let reads = 0;
  await page.route('**/api/album-plays', route => { reads++; return route.fulfill({ json: updated }); });
  await page.goto('/phap-thoai'); await settleClient(page);
  await expect(counter(page)).toContainText('42 lượt phát');
  await page.reload(); await settleClient(page);
  await expect(counter(page)).toContainText('42 lượt phát');
  expect(reads).toBe(0);
  await page.evaluate(({ syncKey, threeDays }) => localStorage.setItem(syncKey, String(Date.now() - threeDays)), { syncKey, threeDays });
  await page.reload(); await settleClient(page);
  await expect(counter(page)).toContainText('108 lượt phát');
  expect(reads).toBe(1);
  await page.reload(); await settleClient(page);
  await expect(counter(page)).toContainText('108 lượt phát');
  expect(reads).toBe(1);
});

test('expired totals stay visible while a new aggregate is loading', async ({ page }) => {
  await prepare(page, threeDays);
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route('**/api/album-plays', async route => {
    reads++;
    await ready;
    await route.fulfill({ json: updated });
  });
  try {
    await page.goto('/phap-thoai'); await settleClient(page);
    await expect.poll(() => reads).toBe(1);
    await expect(counter(page)).toContainText('42 lượt phát');
    expect(await page.evaluate(key => localStorage.getItem(key), cacheKey)).toBe(JSON.stringify(saved));
    release();
    await expect(counter(page)).toContainText('108 lượt phát');
    expect(await page.evaluate(key => localStorage.getItem(key), cacheKey)).toBe(JSON.stringify(updated));
  } finally { release(); }
});

test('failed refresh keeps the old totals and date, then retries on a later launch', async ({ page }) => {
  await prepare(page, threeDays);
  let reads = 0;
  let succeed = false;
  await page.route('**/api/album-plays', route => {
    reads++;
    return route.fulfill({ status: succeed ? 200 : 503, json: succeed ? updated : { error: 'unavailable' } });
  });
  await page.goto('/phap-thoai'); await settleClient(page);
  await expect(counter(page)).toContainText('42 lượt phát');
  await expect.poll(() => reads).toBe(1);
  const stamp = await page.evaluate(key => localStorage.getItem(key), syncKey);
  await page.reload(); await settleClient(page);
  await expect(counter(page)).toContainText('42 lượt phát');
  await expect.poll(() => reads).toBe(2);
  expect(await page.evaluate(key => localStorage.getItem(key), syncKey)).toBe(stamp);
  succeed = true;
  await page.reload(); await settleClient(page);
  await expect(counter(page)).toContainText('108 lượt phát');
  expect(reads).toBe(3);
});
