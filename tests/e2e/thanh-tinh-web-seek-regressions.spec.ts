import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const path = '/assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3';
const recording = readFileSync(`assets${path.slice('/assets'.length)}`);
async function openAudio(page: Page) {
  const mediaRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('chu-lang-nghiem-dieu-am-tinh-tuan')) mediaRequests.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('tutam_locale', 'vi');
    const Original = window.Audio;
    window.Audio = class extends Original {
      constructor(src?: string) { super(src); if (src?.includes('chu-lang-nghiem')) (window as any).__seekAudio = this; }
    };
  });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap');
  await page.locator('button.tt-mode-card--thanh-tinh').click();
  expect(await page.evaluate(() => (window as any).__seekAudio)).toBeUndefined();
  expect(mediaRequests).toEqual([]);
  await page.locator('.btn-onboarding-join').click();
  expect(mediaRequests).toEqual([]);
  await page.locator('.tt-tab-btn').filter({ hasText: 'Nghe Chú' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__seekAudio?.duration)).toBeGreaterThan(1014);
  expect(await page.evaluate(() => (window as any).__seekAudio.duration)).toBeLessThan(1015);
  await expect.poll(() => page.evaluate(() => (window as any).__seekAudio?.currentTime)).toBeGreaterThan(0);
}
async function seek(page: Page, value: number) {
  await page.locator('.progress-slider').evaluate((el: HTMLInputElement, value) => {
    el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('web seek uses one local Blob for a source without byte ranges and preserves paused state', async ({ page }) => {
  let fullFetches = 0;
  await page.route(`**${path}*`, route => {
    if (!route.request().headers().range) fullFetches++;
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: recording });
  });
  await openAudio(page);
  expect(fullFetches).toBe(0);
  await page.locator('.btn-play-pause-main').click();
  await seek(page, 1010);
  await expect.poll(() => page.evaluate(() => (window as any).__seekAudio.currentTime)).toBeGreaterThanOrEqual(1010);
  expect(await page.evaluate(() => (window as any).__seekAudio.paused)).toBe(true);
  await seek(page, 400);
  await expect.poll(() => page.evaluate(() => (window as any).__seekAudio.currentTime)).toBe(400);
  expect(fullFetches).toBe(1);
  await page.locator('.btn-play-pause-main').click();
  await expect.poll(() => page.evaluate(() => (window as any).__seekAudio.currentTime)).toBeGreaterThan(400);
});

test('pause during a deferred web seek cancels playback and the latest seek wins', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let started = false;
  await page.route(`**${path}*`, async route => {
    if (!route.request().headers().range) { started = true; await gate; }
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: recording });
  });
  await openAudio(page);
  await seek(page, 700);
  await expect.poll(() => started).toBe(true);
  await seek(page, 900);
  await page.locator('.btn-play-pause-main').click();
  release();
  await expect.poll(() => page.evaluate(() => (window as any).__seekAudio.currentTime)).toBe(900);
  expect(await page.evaluate(() => (window as any).__seekAudio.paused)).toBe(true);
});

const checkInKey = 'tutam_thanh_tinh_v1';
const checkInFixture = {
  joined: true, joinedAt: '2026-10-29T03:00:00.000Z', cleanSince: '2026-10-20T03:00:00.000Z',
  longestStreakDays: 12, resistedUrgesCount: 4, pendingResistedCount: 0,
  lastCheckInDate: '2026-10-30', checkInDates: ['2026-10-29', '2026-10-30'],
  relapseHistory: [{ date: '2026-10-19T03:00:00.000Z', note: 'Lịch sử được giữ nguyên' }],
  hasRecentRelapse: false, consecutiveCheckInsSinceRelapse: 2,
  checkInRunStartedAt: '2026-10-29T03:00:00.000Z',
};

async function openCheckInOverview(page: Page, at: string) {
  await page.clock.install({ time: new Date(Date.parse(at) - 60_000) });
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem('tutam_locale', 'vi');
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  }, { key: checkInKey, state: checkInFixture });
  const syncs: string[] = [];
  await page.route('**/api/thanh-tinh/**', route => {
    if (new URL(route.request().url()).pathname === '/api/thanh-tinh/sync') syncs.push(route.request().postData() ?? '');
    return route.fulfill({ json: { participantCount: 1, totalUrgesResisted: 4, totalDaysClean: 12 } });
  });
  await page.goto('/tu-tap');
  await page.locator('button.tt-mode-card--thanh-tinh').click();
  await expect(page.locator('.btn-checkin')).toBeVisible();
  const loadedAt = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(loadedAt + 60_000));
  await page.clock.setSystemTime(new Date(Date.parse(at) - 1000));
  await page.clock.runFor(1000);
  return syncs;
}

async function readCheckInState(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), checkInKey);
}

for (const width of [375, 1440]) for (const dark of [false, true]) test(`abstinence check-in counts the next Vietnam day once and preserves elapsed history at ${width}px dark=${dark}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await page.addInitScript(dark => localStorage.setItem('tutam_dark_mode', dark ? '1' : '0'), dark);
  const syncs = await openCheckInOverview(page, '2026-10-30T16:59:55.000Z');
  await expect(page.locator('.streak-days-number')).toHaveText('2');
  await page.clock.runFor(10_000);
  await expect(page.locator('.streak-days-number')).toHaveText('2');
  await page.locator('.btn-checkin').click();
  await page.locator('.btn-confirm-checkin').click();
  await expect(page.locator('.streak-days-number')).toHaveText('3');
  await expect.poll(() => syncs.length).toBe(1);
  await page.locator('.btn-checkin').click();
  await expect(page.locator('.btn-confirm-checkin')).toHaveCount(0);
  expect(syncs).toHaveLength(1);
  const saved = await readCheckInState(page);
  expect(saved.lastCheckInDate).toBe('2026-10-31');
  expect(saved.checkInDates).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
  expect(saved.cleanSince).toBe(checkInFixture.cleanSince);
  expect(saved.relapseHistory).toEqual(checkInFixture.relapseHistory);
  expect(await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('.thanh-tinh-overlay');
    return !!screen && screen.scrollWidth <= screen.clientWidth + 1
      && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  })).toBe(true);
  const checkIn = page.locator('.btn-checkin');
  await checkIn.scrollIntoViewIfNeeded();
  expect(await checkIn.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44
      && button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await page.clock.runFor(300);
  await page.locator('.streak-circle-wrap').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`check-in-counter-${width}-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' });
  await page.locator('.checkin-rule-note').scrollIntoViewIfNeeded();
  await expect(page.locator('.checkin-rule-note')).toContainText('Không tự ghi nhận sa ngã');
  await page.screenshot({ path: info.outputPath(`check-in-note-${width}-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' });
});

test('abstinence missed day while open pauses the clock until a durable new check-in', async ({ page }) => {
  const syncs = await openCheckInOverview(page, '2026-10-30T03:00:00.000Z');
  await expect(page.locator('.streak-days-number')).toHaveText('2');
  await page.clock.setSystemTime(new Date('2026-11-01T03:00:00.000Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.streak-days-number')).toHaveText('0');
  await expect(page.locator('.streak-sub-clock')).toHaveText('00 giờ : 00 phút : 00 giây');
  await page.clock.runFor(10_000);
  await expect(page.locator('.streak-sub-clock')).toHaveText('00 giờ : 00 phút : 00 giây');
  expect(syncs).toHaveLength(0);
  const paused = await readCheckInState(page);
  expect(paused.cleanSince).toBe(checkInFixture.cleanSince);
  expect(paused.relapseHistory).toEqual(checkInFixture.relapseHistory);
  expect(paused.checkInDates).toEqual(checkInFixture.checkInDates);
  expect(paused.hasRecentRelapse).toBe(false);
  expect(paused.checkInRunStartedAt).toBeNull();
  await page.locator('.btn-checkin').click();
  await page.locator('.btn-confirm-checkin').click();
  await expect(page.locator('.streak-days-number')).toHaveText('1');
  await expect(page.locator('.streak-sub-clock')).toHaveText('00 giờ : 00 phút : 00 giây');
  await page.clock.runFor(5_000);
  await expect(page.locator('.streak-sub-clock')).toHaveText('00 giờ : 00 phút : 05 giây');
  await expect.poll(() => syncs.length).toBe(1);
  const restarted = await readCheckInState(page);
  expect(restarted.relapseHistory).toEqual(checkInFixture.relapseHistory);
  expect(restarted.cleanSince).toBe(checkInFixture.cleanSince);
  await expect(page.locator('.checkin-rule-note')).toContainText('Không tự ghi nhận sa ngã');
});

test('abstinence failed check-in save keeps the old count and sends no sync', async ({ page }) => {
  const syncs = await openCheckInOverview(page, '2026-10-31T03:00:00.000Z');
  await expect(page.locator('.streak-days-number')).toHaveText('2');
  const before = await readCheckInState(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(storageKey, value) {
      if (storageKey === key) throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, storageKey, value);
    };
  }, checkInKey);
  await page.locator('.btn-checkin').click();
  await page.locator('.btn-confirm-checkin').click();
  await expect(page.locator('.streak-days-number')).toHaveText('2');
  await expect(page.locator('.storage-error')).toBeVisible();
  expect(await readCheckInState(page)).toEqual(before);
  expect(syncs).toHaveLength(0);
});
