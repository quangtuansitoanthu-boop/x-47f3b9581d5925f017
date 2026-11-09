import { expect, test, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { PRECEPT_PRACTICE_COPY } from '../../src/lib/i18n/precept-practice-ui';
import type { CompanionState } from '../../src/lib/domain/practice/precept-companion';
import { EIGHT_PRECEPT_GUIDE_SECTIONS } from '../../src/lib/content/eight-precept-guide';
import { EIGHT_RECEIVING_RITE } from '../../src/lib/content/eight-precept-rite';
const copy = PRECEPT_PRACTICE_COPY.vi;
const companionKey = 'tutam_precept_companion_v1';
const legacyKey = 'tutam_thanh_tinh_v1';
const reflectionKey = 'tutam_precept_reflections_v1';
const legacy = {
  joined: true, joinedAt: '2026-10-20T03:00:00.000Z', cleanSince: '2026-10-20T03:00:00.000Z',
  longestStreakDays: 42, resistedUrgesCount: 9, pendingResistedCount: 0,
  lastCheckInDate: '2026-10-28', checkInDates: ['2026-10-28'], relapseHistory: [],
  hasRecentRelapse: false, consecutiveCheckInsSinceRelapse: 2,
};
const oldReflection = [{ date: '2026-10-27', answers: ['kept', 'kept', 'kept', 'kept', 'kept'] }];
test('completion requires relinquishment confirmation and the catalog banner follows the active session', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.clock.setFixedTime(new Date('2026-10-28T03:00:00Z'));
  const previous: CompanionState = { version: 1, days: [], conductDates: [], sessions: [{
    id: 'banner-session', startsAt: '2026-10-28T03:00:00Z', endsAt: '2026-10-29T03:00:00Z', status: 'active', answers: {},
  }] };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: companionKey, value: previous });
  await page.goto('/tu-tap'); await settleClient(page);
  const banner = page.getByRole('complementary', { name: copy.eightBannerActiveTitle, exact: true });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: copy.eightBannerOpen }).click();
  const screen = page.getByTestId('precept-practice-screen');
  await expect(screen.getByTestId('eight-active')).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await screen.getByRole('button', { name: copy.eightReviewAction, exact: true }).click();
  const finish = screen.getByRole('button', { name: copy.eightFinish, exact: true });
  await expect(finish).toBeDisabled();
  const ceremony = screen.getByTestId('eight-relinquishment');
  await expect(ceremony).toHaveAttribute('open', '');
  await expect(ceremony).toContainText(copy.eightRelinquishingRequired);
  const confirmation = screen.getByRole('checkbox', { name: copy.eightRelinquishingConfirmation, exact: true });
  await confirmation.check();
  await expect(finish).toBeEnabled();
  await confirmation.uncheck();
  await expect(finish).toBeDisabled();
  await confirmation.check();
  for (const fieldset of await screen.locator('fieldset').all()) await fieldset.locator('input').last().check();
  await finish.click();
  await confirmAction(page, copy.eightFinishConfirmTitle, copy.eightFinishConfirmAction);
  expect((await persisted(page)).sessions[0].status).toBe('ended');
  await screen.getByRole('button', { name: copy.close, exact: true }).click();
  await expect(page.getByRole('complementary', { name: copy.eightBannerElapsedTitle, exact: true })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: copy.eightBannerActiveTitle, exact: true })).toHaveCount(0);
});
test('all supplied guidance sections and the complete rite are reachable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto('/tu-tap?action=bat-quan-trai'); await settleClient(page);
  const screen = page.getByTestId('precept-practice-screen');
  const prepare = screen.getByTestId('eight-prepare');
  for (const summary of await prepare.locator('.eight-guide-group > summary').all()) await summary.click();
  const summaries = prepare.locator('.eight-guide-sections > details > summary');
  expect((await summaries.allTextContents()).map(value => value.trim()).sort()).toEqual(EIGHT_PRECEPT_GUIDE_SECTIONS.map(section => section.title[0]).sort());
  for (const summary of await summaries.all()) {
    await summary.click();
    await expect(summary.locator('..')).toHaveAttribute('open', '');
    await expect(summary.locator('..').locator('p').last()).toBeVisible();
  }
  expect(await screen.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await confirmGuidance(page);
  const last = EIGHT_RECEIVING_RITE.at(-1)!;
  expect(last.kind).not.toBe('verse');
  if (last.kind !== 'verse') await expect(screen.getByTestId('eight-rite')).toContainText(last.text[0]);
  await expect(screen.getByRole('button', { name: copy.eightStartRecord, exact: true })).toBeDisabled();
});
for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`eight-precept instructions stay readable with guide styles (${width}, ${dark ? 'dark' : 'light'})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value), dark ? '1' : '0');
    await page.goto('/tu-tap?action=bat-quan-trai');
    await settleClient(page);
    // Tái hiện CSS toàn cục còn lại sau khi người dùng đã mở trang Hướng dẫn.
    await page.addStyleTag({ path: 'src/lib/styles/guide-page.css' });
    const screen = page.getByTestId('precept-practice-screen');
    await confirmGuidance(page);
    const rite = screen.getByTestId('eight-rite');
    const headings = rite.getByRole('heading', { level: 3 });
    expect(await headings.count()).toBeGreaterThan(0);
    for (const heading of await headings.all()) {
      const box = await heading.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(250);
    }
    for (const paragraph of await rite.locator('.eight-rite-content p').all()) {
      const box = await paragraph.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(250);
    }
    expect(await screen.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await screen.getByRole('checkbox').check();
    await expect(screen.getByRole('button', { name: copy.eightStartRecord, exact: true })).toBeEnabled();
  });
}
async function confirmGuidance(page: Page) {
  const prepare = page.getByTestId('eight-prepare');
  await prepare.getByRole('checkbox', { name: copy.eightGuidanceConfirmation, exact: true }).check();
  await prepare.getByRole('button', { name: copy.next, exact: true }).click();
  await expect(page.getByTestId('eight-rite')).toBeVisible();
}
async function persisted(page: Page): Promise<CompanionState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), companionKey);
}
async function confirmAction(page: Page, title: string, action: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}
async function startEight(page: Page) {
  await page.getByTestId('precept-practice-screen').getByRole('button', { name: copy.eightStartRecord, exact: true }).click();
  await confirmAction(page, copy.eightStartConfirmTitle, copy.eightStartConfirmAction);
  await expect(page.getByTestId('eight-active')).toBeVisible();
}
async function open(page: Page, mode: 'daily' | 'eight' = 'daily') {
  await page.getByRole('button', { name: mode === 'daily' ? /Giữ giới thanh tịnh/ : /Thọ Bát quan trai giới/ }).click();
  const screen = page.getByTestId('precept-practice-screen');
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('tablist')).toHaveCount(mode === 'daily' ? 1 : 0);
  if (mode === 'daily') await expect(screen.getByRole('tab')).toHaveText([copy.guidanceTab, copy.observanceTab]);
  await expect(screen.locator('.precepts-panel')).toHaveCount(mode === 'daily' ? 1 : 0);
  await expect(screen.locator('.eight-panel')).toHaveCount(mode === 'eight' ? 1 : 0);
}
async function switchEntry(page: Page, mode: 'daily' | 'eight') {
  await page.getByTestId('precept-practice-screen').getByRole('button', { name: copy.close, exact: true }).click();
  await expect(page.getByTestId('precept-practice-screen')).toHaveCount(0);
  await open(page, mode);
}
async function measureCatalogPresence(page: Page, advanceDay: boolean): Promise<number> {
  const browser = page.context().browser();
  if (!browser) throw new Error('Presence baseline requires the configured browser.');
  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined, serviceWorkers: 'block' });
  try {
    const control = await context.newPage();
    const presence: string[] = [];
    await control.clock.setFixedTime(new Date('2026-10-28T03:00:00Z'));
    await control.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/presence') presence.push(route.request().method());
      await route.fulfill({ json: path === '/api/session'
        ? { authenticated: false, csrfToken: null, user: null, expiresAt: null } : [] });
    });
    await control.goto(`${process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787'}/tu-tap`);
    await settleClient(control);
    await expect.poll(() => presence.length).toBeGreaterThan(0);
    if (advanceDay) await control.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
    await control.evaluate(() => window.dispatchEvent(new Event('focus')));
    await control.waitForTimeout(300);
    expect(presence.every(method => method === 'POST')).toBe(true);
    return presence.length;
  } finally { await context.close(); }
}
async function expectLocalFeatureBudget(requests: string[], before: number, baseline: number, info: import('@playwright/test').TestInfo) {
  const observed = requests.slice(before);
  const presence = observed.filter(request => request === 'POST /api/presence');
  expect(observed.filter(request => request !== 'POST /api/presence')).toEqual([]);
  expect(presence.length).toBeLessThanOrEqual(baseline);
  await info.attach('request-budget', { contentType: 'application/json', body: JSON.stringify({
    catalogIdleAndFocusPresenceBaseline: baseline, totalHttpAfterHydration: observed.length,
    existingRootPresence: presence.length, featureHttp: observed.length - presence.length, observed,
  }) });
}
test('catalog offers daily precepts, eight-precept observance and abstinence as separate entries', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page);
  for (const name of [/Giữ giới thanh tịnh/, /Thọ Bát quan trai giới/, /Tiết dục bảo thân/]) {
    await expect(page.locator('.tt-mode-card').filter({ has: page.locator('.tt-mode-title').filter({ hasText: name }) })).toHaveCount(1);
  }
  await open(page, 'daily');
  await expect(page.locator('.precepts-panel')).toBeVisible();
  await switchEntry(page, 'eight');
  await expect(page.getByTestId('eight-prepare')).toBeVisible();
  await expect(page.getByTestId('precept-practice-screen').getByRole('heading', { name: copy.tabEight, exact: true })).toBeVisible();
});

test('eight-precept deep link opens its standalone panel without daily tabs', async ({ page }) => {
  await page.goto('/tu-tap?action=bat-quan-trai'); await settleClient(page);
  const screen = page.getByTestId('precept-practice-screen');
  await expect(screen).toBeVisible();
  await expect(screen.getByTestId('eight-prepare')).toBeVisible();
  await expect(screen.locator('.precepts-panel')).toHaveCount(0);
  await expect(screen.getByRole('tablist')).toHaveCount(0);
});

test('guidance and ceremony each require confirmation before starting an observance', async ({ page }) => {
  await page.goto('/tu-tap?action=bat-quan-trai'); await settleClient(page);
  const screen = page.getByTestId('precept-practice-screen');
  const prepare = screen.getByTestId('eight-prepare');
  const next = prepare.getByRole('button', { name: copy.next, exact: true });
  await expect(next).toBeDisabled();
  await expect(screen.getByTestId('eight-rite')).toHaveCount(0);
  await confirmGuidance(page);
  const start = screen.getByRole('button', { name: copy.eightStartRecord, exact: true });
  await expect(start).toBeDisabled();
  await expect(screen.getByTestId('eight-active')).toHaveCount(0);
  expect(await persisted(page)).toBeNull();
  await screen.getByRole('button', { name: copy.back, exact: true }).click();
  await expect(prepare).toBeVisible();
  await prepare.getByRole('checkbox').uncheck();
  await expect(next).toBeDisabled();
  await confirmGuidance(page);
  await expect(start).toBeDisabled();
  await screen.getByRole('checkbox').check();
  await expect(start).toBeEnabled();
  await screen.getByRole('checkbox').uncheck();
  await expect(start).toBeDisabled();
  await screen.getByRole('checkbox').check();
  await start.click();
  await confirmAction(page, copy.eightStartConfirmTitle, copy.eightStartConfirmAction);
  await expect(screen.getByTestId('eight-active')).toBeVisible();
  expect((await persisted(page)).sessions).toHaveLength(1);
});

test('an existing active observance resumes without repeating preparation or changing stored data', async ({ page }) => {
  const previous: CompanionState = {
    version: 1, days: [], conductDates: [],
    sessions: [{ id: 'installed-app-session', startsAt: '2026-10-28T03:00:00Z', endsAt: '2026-10-29T03:00:00Z', status: 'active', answers: { life: 'kept' } }],
  };
  await page.clock.setFixedTime(new Date('2026-10-28T10:00:00Z'));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: companionKey, value: previous });
  await page.goto('/tu-tap?action=bat-quan-trai'); await settleClient(page);
  const screen = page.getByTestId('precept-practice-screen');
  await expect(screen.getByTestId('eight-active')).toBeVisible();
  await expect(screen.getByTestId('eight-prepare')).toHaveCount(0);
  await expect(screen.getByTestId('eight-rite')).toHaveCount(0);
  expect(await persisted(page)).toEqual(previous);
  await expect(screen.getByRole('button', { name: copy.eightReviewAction, exact: true })).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await screen.getByRole('button', { name: copy.eightReviewAction, exact: true }).click();
  await expect(screen.locator('input[name="eight-life"]').first()).toBeChecked();
  await expect(screen.getByRole('button', { name: copy.eightFinish, exact: true })).toBeDisabled();
});
for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`companion keeps partial records local and legacy data intact (${width}, ${dark ? 'dark' : 'light'})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const presenceBaseline = await measureCatalogPresence(page, true);
    await page.clock.setFixedTime(new Date('2026-10-28T03:00:00Z'));
    await page.addInitScript(({ legacy, oldReflection, dark }) => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
      localStorage.setItem('tutam_thanh_tinh_v1', JSON.stringify(legacy));
      localStorage.setItem('tutam_precept_reflections_v1', JSON.stringify(oldReflection));
      localStorage.setItem('tutam_precept_companion_v1', JSON.stringify({ version: 1, sessions: [], conductDates: [], days: [
        { group: 'five', date: '2026-10-28', answers: { life: 'kept' } },
        { group: 'ten', date: '2026-10-28', answers: { kindness: 'review' } },
      ] }));
    }, { legacy, oldReflection, dark });
    const requests: string[] = [];
    await page.route('**/api/**', async route => {
      requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      await route.fulfill({ json: new URL(route.request().url()).pathname === '/api/session'
        ? { authenticated: false, csrfToken: null, user: null, expiresAt: null } : [] });
    });
    await page.goto('/tu-tap'); await settleClient(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
    const before = requests.length;
    await open(page);
    const screen = page.getByTestId('precept-practice-screen');
    await expect(screen.getByRole('tab', { name: copy.guidanceTab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(screen.locator('.source-badge')).toHaveCount(0);
    await screen.getByRole('tab', { name: copy.observanceTab, exact: true }).click();
    await screen.locator('.legacy-records > summary').click();
    await expect(screen.getByTestId('history-five')).toContainText(copy.kept);
    await expect(screen.getByTestId('history-ten')).toContainText(copy.review);
    expect((await persisted(page)).days).toEqual([
      { group: 'five', date: '2026-10-28', answers: { life: 'kept' } },
      { group: 'ten', date: '2026-10-28', answers: { kindness: 'review' } },
    ]);
    await switchEntry(page, 'eight');
    await expect(screen.getByTestId('eight-prepare')).toBeVisible();
    await switchEntry(page, 'daily');
    await screen.getByRole('tab', { name: copy.observanceTab, exact: true }).click();
    await screen.locator('.legacy-records > summary').click();
    await expect(screen.getByTestId('history-five')).toContainText(copy.kept);
    expect((await persisted(page)).conductDates).toEqual([]);
    expect((await persisted(page)).sessions).toEqual([]);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), legacyKey)).toEqual(legacy);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), reflectionKey)).toEqual(oldReflection);
    await expect(screen.locator('a[href*="giacngo"], a[href*="http"]')).toHaveCount(0);
    await expect(screen.getByText(/Giác Ngộ|giacngo\.vn/)).toHaveCount(0);
    expect(await screen.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('companion-daily.png'), fullPage: true });
    await switchEntry(page, 'eight');
    await confirmGuidance(page);
    const rite = screen.getByTestId('eight-rite');
    await expect(rite.getByRole('button', { name: copy.eightStartRecord, exact: true })).toBeDisabled();
    await rite.getByRole('checkbox', { name: copy.voluntaryConfirmation, exact: true }).check();
    await startEight(page);
    await expect(screen.getByTestId('eight-active')).toBeVisible();
    const started = (await persisted(page)).sessions;
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ status: 'active', answers: {}, startsAt: '2026-10-28T03:00:00.000Z', endsAt: '2026-10-29T03:00:00.000Z' });
    await page.screenshot({ path: info.outputPath('companion-eight-active.png'), fullPage: true });
    await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(screen.getByTestId('eight-active')).toBeVisible();
    expect((await persisted(page)).sessions[0].status).toBe('active');
    await screen.getByRole('button', { name: copy.eightReviewAction, exact: true }).click();
    await screen.locator('input[name="eight-life"]').first().check();
    for (const fieldset of await screen.locator('fieldset').all()) {
      if (!(await fieldset.locator('input:checked').count())) await fieldset.locator('input').last().check();
    }
    await screen.getByRole('checkbox', { name: copy.eightRelinquishingConfirmation, exact: true }).check();
    await screen.getByRole('button', { name: copy.eightFinish, exact: true }).click();
    await confirmAction(page, copy.eightFinishConfirmTitle, copy.eightFinishConfirmAction);
    await expect(screen.getByTestId('eight-ended')).toBeVisible();
    await expect(screen.getByTestId('eight-completed')).toHaveCount(0);
    const ended = await persisted(page);
    expect(ended.sessions[0]).toMatchObject({ id: started[0].id, status: 'ended', answers: { life: 'kept' } });
    expect(ended.days).toEqual([
      { group: 'five', date: '2026-10-28', answers: { life: 'kept' } },
      { group: 'ten', date: '2026-10-28', answers: { kindness: 'review' } },
    ]);
    expect(ended.conductDates).toEqual([]);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), legacyKey)).toEqual(legacy);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), reflectionKey)).toEqual(oldReflection);
    await expect(screen.getByText(/Giác Ngộ|giacngo\.vn/)).toHaveCount(0);
    await page.waitForTimeout(300);
    await expectLocalFeatureBudget(requests, before, presenceBaseline, info);
  });
}

for (const storageFails of [false, true]) test(`abstinence check-in credits only conduct after durable save (${storageFails ? 'storage failure' : 'success'})`, async ({ page }) => {
  const previous = { ...legacy, lastCheckInDate: '2026-10-27', checkInDates: ['2026-10-27'] };
  await page.clock.setFixedTime(new Date('2026-10-28T03:00:00Z'));
  await page.addInitScript(previous => {
    localStorage.setItem('tutam_locale', 'vi');
    localStorage.setItem('tutam_thanh_tinh_v1', JSON.stringify(previous));
  }, previous);
  const sync: string[] = [];
  const apiRequests: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    apiRequests.push(`${route.request().method()} ${path}`);
    if (path === '/api/thanh-tinh/sync') sync.push(route.request().postData() ?? '');
    await route.fulfill({ json: path === '/api/session'
      ? { authenticated: false, csrfToken: 'local-e2e-csrf', user: null, expiresAt: null }
      : { participantCount: 0, totalUrgesResisted: 0, totalDaysClean: 0 } });
  });
  await page.goto('/tu-tap'); await settleClient(page);
  await page.getByRole('button', { name: /Tiết dục bảo thân/ }).click();
  await expect(page.locator('.tt-tab-btn')).toHaveCount(6);
  await page.locator('.btn-checkin').click();
  const confirm = page.locator('.btn-confirm-checkin');
  await expect(confirm).toBeVisible();
  await expect(page.locator('.abstinence-overview')).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.dataset.e2eOscillators = '0';
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      document.documentElement.dataset.e2eOscillators = String(Number(document.documentElement.dataset.e2eOscillators) + 1);
      return original.call(this);
    };
  });
  if (storageFails) await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key === 'tutam_thanh_tinh_v1') throw new DOMException('e2e quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await confirm.click();
  if (storageFails) {
    await expect(page.locator('.btn-checkin')).toBeVisible();
    await expect(page.locator('.btn-checkin')).toBeEnabled();
    await expect(page.locator('.btn-checkin')).toContainText('Hôm nay tôi đã giữ trọn thanh tịnh');
    await expect(page.locator('.storage-error')).toBeVisible();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), legacyKey)).toEqual(previous);
    expect(await persisted(page)).toBeNull();
    await page.waitForTimeout(300);
    expect(sync).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute('data-e2e-oscillators', '0');
  } else {
    await expect(page.locator('.btn-checkin')).toBeVisible();
    await expect(page.locator('.btn-checkin')).toBeEnabled();
    await expect(page.locator('.btn-checkin')).toHaveClass(/\bchecked-in\b/);
    await expect(page.locator('.btn-checkin')).toContainText('Hôm nay bạn đã điểm danh thanh tịnh');
    expect((await persisted(page)).conductDates).toEqual(['2026-10-28']);
    expect((await persisted(page)).days).toEqual([]);
    expect((await persisted(page)).sessions).toEqual([]);
    await expect.poll(() => sync.length).toBe(1);
    const beforeRepeat = await page.evaluate(({ legacyKey, companionKey }) => {
      document.documentElement.dataset.e2eRepeatWrites = '0';
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key: string, value: string) {
        if (key === legacyKey || key === companionKey) {
          document.documentElement.dataset.e2eRepeatWrites = String(Number(document.documentElement.dataset.e2eRepeatWrites) + 1);
        }
        return original.call(this, key, value);
      };
      return {
        legacy: localStorage.getItem(legacyKey), companion: localStorage.getItem(companionKey),
        oscillators: document.documentElement.dataset.e2eOscillators,
      };
    }, { legacyKey, companionKey });
    const beforeRepeatRequests = [...apiRequests];
    await page.locator('.btn-checkin').click();
    await page.locator('.btn-checkin').click();
    await expect(page.locator('.btn-confirm-checkin')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(apiRequests).toEqual(beforeRepeatRequests);
    expect(sync).toHaveLength(1);
    await expect(page.locator('html')).toHaveAttribute('data-e2e-repeat-writes', '0');
    expect(await page.evaluate(({ legacyKey, companionKey }) => ({
      legacy: localStorage.getItem(legacyKey), companion: localStorage.getItem(companionKey),
      oscillators: document.documentElement.dataset.e2eOscillators,
    }), { legacyKey, companionKey })).toEqual(beforeRepeat);
    expect((await persisted(page)).conductDates).toEqual(['2026-10-28']);
    await page.locator('.thanh-tinh-overlay .btn-back').click();
    await expect(page.locator('.thanh-tinh-overlay')).toHaveCount(0);
    await open(page);
    const screen = page.getByTestId('precept-practice-screen');
    await screen.getByRole('tab', { name: copy.observanceTab, exact: true }).click();
    await screen.locator('.legacy-records > summary').click();
    await expect(screen.getByTestId('history-five')).toContainText(copy.kept);
    await expect(screen.getByTestId('history-ten')).toContainText(copy.kept);
    await expect(screen.locator('.source-badge')).toHaveCount(2);
    await switchEntry(page, 'eight');
    await expect(screen.getByTestId('eight-prepare')).toBeVisible();
    expect((await persisted(page)).sessions).toEqual([]);
  }
});


test('ending an observance early records cancellation without completing unreported precepts', async ({ page }, info) => {
  const presenceBaseline = await measureCatalogPresence(page, false);
  await page.clock.setFixedTime(new Date('2026-10-28T03:00:00Z'));
  const requests: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${path}`);
    await route.fulfill({ json: path === '/api/session' ? { authenticated: false, csrfToken: null, user: null } : [] });
  });
  await page.goto('/tu-tap'); await settleClient(page);
  const before = requests.length;
  await open(page);
  const screen = page.getByTestId('precept-practice-screen');
  await switchEntry(page, 'eight');
  await confirmGuidance(page);
  await screen.getByRole('checkbox', { name: copy.voluntaryConfirmation, exact: true }).check();
  await startEight(page);
  await expect(screen.getByRole('button', { name: copy.eightReviewAction, exact: true })).toHaveCount(0);
  await screen.getByRole('button', { name: copy.eightCancelTracking, exact: true }).click();
  await confirmAction(page, copy.eightCancelTracking, copy.eightFinishConfirmAction);
  await expect(screen.getByTestId('eight-ended')).toBeVisible();
  expect((await persisted(page)).sessions[0]).toMatchObject({ status: 'cancelled', answers: {} });
  expect((await persisted(page)).days).toEqual([]);
  expect((await persisted(page)).conductDates).toEqual([]);
  await page.waitForTimeout(300);
  await expectLocalFeatureBudget(requests, before, presenceBaseline, info);
});

test('browser Back closes the new practice entry and Forward restores it', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page);
  await open(page);
  await page.goBack();
  await expect(page.getByTestId('precept-practice-screen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Giữ giới thanh tịnh/ })).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId('precept-practice-screen')).toBeVisible();
  await expect(page.getByTestId('precept-practice-screen').locator('.precepts-panel')).toBeVisible();
  await expect(page.getByTestId('precept-practice-screen').getByRole('tab')).toHaveText([copy.guidanceTab, copy.observanceTab]);
});

test('Forward restores eight-precept mode after closing its catalog entry', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page);
  await open(page, 'eight');
  await page.getByTestId('precept-practice-screen').getByRole('button', { name: copy.close, exact: true }).click();
  await expect(page.getByTestId('precept-practice-screen')).toHaveCount(0);
  await page.goForward();
  const screen = page.getByTestId('precept-practice-screen');
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('heading', { name: copy.tabEight, exact: true })).toBeVisible();
  await expect(screen.locator('.eight-panel')).toHaveCount(1);
  await expect(screen.locator('.precepts-panel')).toHaveCount(0);
  await expect(screen.getByRole('tablist')).toHaveCount(0);
  await page.goBack();
  await expect(screen).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Thọ Bát quan trai giới/ })).toBeVisible();
  await open(page, 'daily');
  await expect(screen.locator('.precepts-panel')).toBeVisible();
  await expect(screen.locator('.eight-panel')).toHaveCount(0);
});

test('eight-precept completion waits for 24 hours and celebrates all kept precepts', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T03:00:00Z'));
  await page.goto('/tu-tap?action=bat-quan-trai'); await settleClient(page);
  const screen = page.getByTestId('precept-practice-screen');
  await confirmGuidance(page);
  await screen.getByRole('checkbox').check();
  await startEight(page);
  await expect(screen.getByRole('button', { name: copy.eightReviewAction, exact: true })).toHaveCount(0);
  expect((await persisted(page)).sessions[0].status).toBe('active');
  await page.clock.setFixedTime(new Date('2026-10-29T02:59:59Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(screen.getByRole('button', { name: copy.eightReviewAction, exact: true })).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await screen.getByRole('button', { name: copy.eightReviewAction, exact: true }).click();
  for (const fieldset of await screen.locator('fieldset').all()) await fieldset.locator('input').first().check();
  const finish = screen.getByRole('button', { name: copy.eightFinish, exact: true });
  await expect(finish).toBeDisabled();
  await screen.getByRole('checkbox', { name: copy.eightRelinquishingConfirmation, exact: true }).check();
  await expect(finish).toBeEnabled();
  await page.clock.setFixedTime(new Date('2026-10-29T02:59:59Z'));
  await finish.click();
  await expect(screen.getByTestId('eight-reflection')).toBeVisible();
  expect((await persisted(page)).sessions[0].status).toBe('active');
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    document.documentElement.dataset.eightFailSave = '1';
    Storage.prototype.setItem = function(storageKey: string, value: string) {
      if (storageKey === key && document.documentElement.dataset.eightFailSave === '1') throw new DOMException('e2e quota', 'QuotaExceededError');
      return original.call(this, storageKey, value);
    };
  }, companionKey);
  await finish.click();
  await confirmAction(page, copy.eightFinishConfirmTitle, copy.eightFinishConfirmAction);
  await expect(screen.getByRole('alert')).toHaveText(copy.saveError);
  await expect(screen.getByTestId('eight-completed')).toHaveCount(0);
  expect((await persisted(page)).sessions[0].status).toBe('active');
  await page.evaluate(() => { document.documentElement.dataset.eightFailSave = '0'; });
  await finish.click();
  await confirmAction(page, copy.eightFinishConfirmTitle, copy.eightFinishConfirmAction);
  await expect(screen.getByTestId('eight-completed')).toContainText(copy.eightCompletedNote);
  expect((await persisted(page)).sessions[0].status).toBe('ended');
});

test('an elapsed observance with a precept to review does not report successful observance', async ({ page }) => {
  const previous: CompanionState = {
    version: 1, days: [], conductDates: [],
    sessions: [{ id: 'review-session', startsAt: '2026-10-28T03:00:00Z', endsAt: '2026-10-29T03:00:00Z', status: 'active', answers: {
      life: 'kept', property: 'kept', celibacy: 'kept', speech: 'kept', sobriety: 'kept', meal: 'kept', entertainment: 'kept', bed: 'review',
    } }],
  };
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: companionKey, value: previous });
  await page.goto('/tu-tap?action=bat-quan-trai'); await settleClient(page);
  const screen = page.getByTestId('precept-practice-screen');
  await screen.getByRole('button', { name: copy.eightReviewAction, exact: true }).click();
  await screen.getByRole('checkbox', { name: copy.eightRelinquishingConfirmation, exact: true }).check();
  await screen.getByRole('button', { name: copy.eightFinish, exact: true }).click();
  await confirmAction(page, copy.eightFinishConfirmTitle, copy.eightFinishConfirmAction);
  await expect(screen.getByTestId('eight-ended')).toBeVisible();
  await expect(screen.getByTestId('eight-incomplete')).toBeVisible();
  await expect(screen.getByTestId('eight-completed')).toHaveCount(0);
  expect((await persisted(page)).sessions[0]).toMatchObject({ status: 'ended', answers: previous.sessions[0].answers });
});

test('partial eight-precept reflection survives reload without ending the active observance', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T03:00:00Z'));
  await page.goto('/tu-tap'); await settleClient(page);
  await open(page);
  let screen = page.getByTestId('precept-practice-screen');
  await switchEntry(page, 'eight');
  await confirmGuidance(page);
  await screen.getByRole('checkbox', { name: copy.voluntaryConfirmation, exact: true }).check();
  await startEight(page);
  await page.clock.setFixedTime(new Date('2026-10-29T03:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await screen.getByRole('button', { name: copy.eightReviewAction, exact: true }).click();
  await screen.locator('input[name="eight-celibacy"]').first().check();
  const beforeSave = (await persisted(page)).sessions[0];
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    document.documentElement.dataset.eightPartialFail = '1';
    Storage.prototype.setItem = function(storageKey: string, value: string) {
      if (storageKey === key && document.documentElement.dataset.eightPartialFail === '1') throw new DOMException('e2e quota', 'QuotaExceededError');
      return original.call(this, storageKey, value);
    };
  }, companionKey);
  const save = screen.getByTestId('eight-reflection').getByRole('button', { name: copy.saveChanges, exact: true });
  await save.click();
  await expect(screen.getByRole('alert')).toHaveText(copy.saveError);
  await expect(screen.getByTestId('eight-reflection')).toBeVisible();
  await expect(screen.locator('input[name="eight-celibacy"]').first()).toBeChecked();
  expect((await persisted(page)).sessions[0]).toEqual(beforeSave);
  await expect(screen.getByTestId('eight-completed')).toHaveCount(0);
  await page.evaluate(() => { document.documentElement.dataset.eightPartialFail = '0'; });
  await save.click();
  await expect(screen.getByTestId('eight-active')).toBeVisible();
  await expect(screen.getByRole('status')).toHaveText(copy.saveSuccess);
  const saved = (await persisted(page)).sessions[0];
  expect(saved).toMatchObject({ status: 'active', templateId: 'bqt-home-guide-v1', answers: { celibacy: 'kept' } });
  await page.reload(); await settleClient(page);
  // Reload có thể khôi phục màn hình từ history hoặc quay về danh mục; dữ liệu phải giữ nguyên.
  if (!(await page.getByTestId('precept-practice-screen').isVisible())) await open(page, 'eight');
  screen = page.getByTestId('precept-practice-screen');
  await switchEntry(page, 'eight');
  await expect(screen.getByTestId('eight-active')).toBeVisible();
  expect((await persisted(page)).sessions[0]).toEqual(saved);
  await screen.getByRole('button', { name: copy.eightReviewAction, exact: true }).click();
  await expect(screen.locator('input[name="eight-celibacy"]').first()).toBeChecked();
  await expect(screen.getByTestId('eight-reflection').locator('input:checked')).toHaveCount(1);
  expect((await persisted(page)).days).toEqual([]);
  expect((await persisted(page)).conductDates).toEqual([]);
});

