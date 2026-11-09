import { expect, test, type Page } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { translations } from '../../src/lib/i18n/translations';

const tools = [
  { action: 'giu-gioi', card: '.tt-mode-card--precepts:not(.tt-mode-card--eight-precepts)', surface: '.precepts-panel' },
  { action: 'bat-quan-trai', card: '.tt-mode-card--eight-precepts', surface: '[data-testid="eight-prepare"]' },
  { action: 'thanh-tinh', card: '.tt-mode-card--thanh-tinh', surface: '.thanh-tinh-container' },
  { action: 'le-phat', card: '.tt-mode-card--le-phat', surface: '#lp-bell-select' },
  { action: 'meditation', card: '.tt-mode-card--thien', surface: '.meditation-chooser' },
  { action: 'rosary', card: '.tt-mode-card--chuoi', surface: '.practice-confirm' },
  { action: 'cong-phu', card: '.tt-mode-card--tracker', surface: '.tt-tracker__card' },
  { action: 'thoi-khoa', card: '.tt-mode-card--rec', surface: '.practice-recommendations' },
  { action: 'tiep-tuc-cong-phu', card: '.tt-mode-card--continue', surface: '.tt-continue-modal' },
] as const;
const companionKey = 'tutam_precept_companion_v1';
const previous = JSON.stringify({ version: 1, days: [{ group: 'five', date: '2026-10-27', answers: { life: 'kept' } }], sessions: [], conductDates: [] });

async function expectAction(page: Page, action: string | null) {
  await expect.poll(() => new URL(page.url()).searchParams.get('action')).toBe(action);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem('tutam_locale', 'vi');
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, { key: companionKey, value: previous });
});

for (const tool of tools) {
  test(`${tool.action} has a canonical catalog link, reloads once and follows Back/Forward`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 850 });
    let catalogs = 0;
    let catalogRevalidations = 0;
    const unexpectedCatalogRequests: string[] = [];
    const catalogRequestIds = new Set<string>();
    const cachedCatalogRequestIds = new Set<string>();
    const network = await page.context().newCDPSession(page);
    await network.send('Network.enable');
    network.on('Network.requestWillBeSent', event => {
      if (event.request.method === 'GET' && new URL(event.request.url).pathname === '/api/articles') {
        catalogRequestIds.add(event.requestId);
      }
    });
    network.on('Network.requestServedFromCache', event => {
      if (catalogRequestIds.has(event.requestId)) cachedCatalogRequestIds.add(event.requestId);
    });
    network.on('Network.responseReceived', event => {
      if (catalogRequestIds.has(event.requestId) && event.response.fromDiskCache) {
        cachedCatalogRequestIds.add(event.requestId);
      }
    });
    const expectCatalogBudget = () => {
      expect(catalogs, 'At most one application catalog fetch per document').toBeLessThanOrEqual(1);
      expect(catalogRevalidations, 'At most one browser background revalidation').toBeLessThanOrEqual(1);
      expect(unexpectedCatalogRequests).toEqual([]);
      expect([...catalogRequestIds].filter(id => !cachedCatalogRequestIds.has(id)).length,
        'At most one catalog request reaches the network per document').toBeLessThanOrEqual(1);
      if (catalogRevalidations > 0) {
        expect(cachedCatalogRequestIds.size, 'Background revalidation requires a proven browser cache hit').toBeGreaterThan(0);
      }
    };
    let campaignReads = 0;
    const requests: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path === '/api/articles') {
        if (request.method() !== 'GET') unexpectedCatalogRequests.push(`${request.method()} ${request.resourceType()}`);
        else if (request.resourceType() === 'fetch') catalogs += 1;
        else if (request.resourceType() === 'other') catalogRevalidations += 1;
        else unexpectedCatalogRequests.push(`${request.method()} ${request.resourceType()}`);
      }
      if (request.method() === 'GET' && path === '/api/practice/campaigns') campaignReads += 1;
      else if (path.startsWith('/api/practice/')) requests.push(`${request.method()} ${path}`);
    });
    await page.goto('/tu-tap'); await settleClient(page);
    const initialCampaignReads = campaignReads;
    expect(initialCampaignReads).toBeLessThanOrEqual(1);
    await page.locator(tool.card).click();
    await expectAction(page, tool.action);
    await expect(page.locator(tool.surface)).toBeVisible();
    expectCatalogBudget();
    expect(campaignReads).toBe(initialCampaignReads);
    expect(requests).toEqual([]);
    const historyLength = await page.evaluate(() => history.length);
    catalogs = 0;
    catalogRevalidations = 0;
    unexpectedCatalogRequests.length = 0;
    catalogRequestIds.clear();
    cachedCatalogRequestIds.clear();
    campaignReads = 0;
    await page.reload(); await settleClient(page);
    await expectAction(page, tool.action);
    await expect(page.locator(tool.surface)).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expectCatalogBudget();
    const reloadedCatalogs = catalogs;
    const reloadedCampaignReads = campaignReads;
    expect(reloadedCampaignReads).toBeLessThanOrEqual(1);
    await page.goBack();
    await expectAction(page, null);
    await expect(page.locator(tool.surface)).toBeHidden();
    await expect(page.locator(tool.card)).toBeVisible();
    await page.goForward();
    await expectAction(page, tool.action);
    await expect(page.locator(tool.surface)).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), companionKey)).toBe(previous);
    expect(requests).toEqual([]);
    expect(campaignReads).toBe(reloadedCampaignReads);
    expect(catalogs, 'Back and Forward reuse the existing application catalog').toBe(reloadedCatalogs);
    expectCatalogBudget();
    await network.detach();
  });
}

for (const [alias, action] of [
  ['?mode=meditation', 'meditation'], ['#thien-dinh', 'meditation'],
  ['?mode=rosary', 'rosary'], ['?screen=rosary', 'rosary'], ['?rosary=start', 'rosary'], ['#trang-hat', 'rosary'],
  ['?mode=lephat', 'le-phat'], ['?screen=le-phat', 'le-phat'], ['?le-phat=start', 'le-phat'],
  ['#giu-gioi', 'giu-gioi'], ['#bat-quan-trai', 'bat-quan-trai'], ['#thanh-tinh', 'thanh-tinh'],
] as const) {
  test(`legacy tool link ${alias} opens only one canonical ${action} entry`, async ({ page }) => {
    await page.goto(`/tu-tap${alias}`); await settleClient(page);
    const tool = tools.find(candidate => candidate.action === action)!;
    const activeRosary = action === 'rosary' && ['?mode=rosary', '?screen=rosary', '?rosary=start'].includes(alias);
    const surface = activeRosary ? '.tt-rosary' : tool.surface;
    await expectAction(page, action);
    await expect(page.locator(surface)).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    for (const key of ['mode', 'screen', 'rosary', 'le-phat']) expect(new URL(page.url()).searchParams.has(key)).toBe(activeRosary && key === 'mode');
    await page.goBack();
    await expectAction(page, null);
    await expect(page.locator(tool.card)).toBeVisible();
    await expect(page.locator(surface)).toBeHidden();
  });
}

test('category and article links preserve their existing parameters through Back and Forward', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page);
  await page.locator('.tt-mode-card--kinh').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('muc')).toBe('kinh');
  await page.goBack();
  await expect(page.locator('.tt-mode-card--kinh')).toBeVisible();
  await page.goForward();
  await expect.poll(() => new URL(page.url()).searchParams.get('muc')).toBe('kinh');
  await expect(page.locator('.tt-section-view[data-practice-route-back]')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Quay lại', exact: true })).toBeVisible();
  await page.locator('.tt-card-title').first().click();
  await expect(page.locator('.tt-preview')).toBeVisible();
  const articleId = new URL(page.url()).searchParams.get('article');
  expect(articleId).toBeTruthy();
  expect(new URL(page.url()).searchParams.get('muc')).toBe('kinh');
  await page.goBack();
  await expect(page.locator('.tt-section-view[data-practice-route-back]')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Quay lại', exact: true })).toBeVisible();
  await expect(page.locator('.tt-preview')).toHaveCount(0);
  await page.goForward();
  await expect(page.locator('.tt-preview')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('article')).toBe(articleId);
  expect(new URL(page.url()).searchParams.get('muc')).toBe('kinh');
});

test('rosary confirmation uses one link and keeps the accepted screen on reload', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await expectAction(page, 'rosary');
  const length = await page.evaluate(() => history.length);
  await page.locator('.practice-confirm').getByRole('button', { name: 'Chưa vội', exact: true }).click();
  await expectAction(page, null);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.locator('.practice-confirm').getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  await expect(page.locator('.tt-rosary')).toBeVisible();
  await expectAction(page, 'rosary');
  expect(await page.evaluate(() => history.length)).toBe(length);
  const phrase = page.getByRole('combobox', { name: 'Danh hiệu trì niệm', exact: true });
  await page.locator('.tt-rosary').getByRole('button', { name: 'Tùy chọn', exact: true }).click();
  const value = await phrase.innerText();
  await phrase.click();
  const picker = page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true });
  const selectedValue = await picker.locator('.rosary-select__option[aria-pressed="true"]').getAttribute('data-value');
  expect(selectedValue).toBeTruthy();
  await picker.press('Escape');
  await page.reload(); await settleClient(page);
  await expect(page.locator('.tt-rosary')).toBeVisible();
  await expect(page.locator('.practice-confirm')).toHaveCount(0);
  await expect(page.locator('.tt-rosary__settings')).toBeHidden();
  await page.locator('.tt-rosary').getByRole('button', { name: 'Tùy chọn', exact: true }).click();
  await expect(phrase).toHaveText(value);
  await phrase.click();
  await expect(picker.locator('.rosary-select__option[aria-pressed="true"]')).toHaveAttribute('data-value', selectedValue!);
  await picker.press('Escape');
});

test('meditation chooser and active session keep one URL while Back pauses safely', async ({ page }) => {
  await page.goto('/tu-tap'); await settleClient(page);
  await page.locator('.tt-mode-card--thien').click();
  await expectAction(page, 'meditation');
  await page.locator('.meditation-chooser').getByRole('button', { name: 'Hủy', exact: true }).click();
  await expectAction(page, null);
  await page.locator('.tt-mode-card--thien').click();
  const length = await page.evaluate(() => history.length);
  await page.locator('.meditation-chooser').getByRole('button', { name: translations.vi.practice.startMeditation, exact: true }).click();
  const screen = page.locator('.meditation-screen');
  await expect(screen).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack();
  await expectAction(page, 'meditation');
  await expect(screen.getByRole('button', { name: translations.vi.practice.resume, exact: true })).toBeVisible();
  await screen.getByRole('button', { name: translations.vi.practice.endEarly, exact: true }).click();
  await screen.getByRole('button', { name: translations.vi.practice.finish, exact: true }).click();
  await expectAction(page, null);
  await expect(screen).toHaveCount(0);
});

test('reloading a tool above an article keeps its chapter and practice return context without starting evidence', async ({ page }) => {
  // This ritual belongs to the bundled catalog, not the isolated local API seed.
  // Exercise the offline return-context contract explicitly, as chapter-navigation tests do.
  await page.route('**/api/**', route => route.abort('failed'));
  const writes: string[] = [];
  const readerRequests: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/practice/')) writes.push(request.url());
    if (/^\/api\/data\/(baiviet|tap_noi_dung)$/.test(new URL(request.url()).pathname)) readerRequests.push(request.url());
  });
  await page.goto('/tu-tap?article=tt_nghi_thuc_tri_chu_bao_khiep_an'); await settleClient(page);
  await expect(page.locator('.tt-preview')).toBeVisible();
  const title = await page.locator('.tt-preview__header h1').innerText();
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set('chap', '1');
    url.searchParams.set('mode', 'practice');
    history.replaceState({ ...history.state, practice: true, tuTapScreen: 'practice' }, '', url.toString());
    url.searchParams.set('action', 'giu-gioi');
    history.pushState({ ...history.state, tuTapAction: 'giu-gioi', tuTapScreen: 'precepts', tuTapPreceptMode: 'daily', tuTapReturnScreen: 'practice' }, '', url.toString());
  });
  const length = await page.evaluate(() => history.length);
  await page.reload(); await settleClient(page);
  await expect(page.getByTestId('precept-practice-screen')).toBeVisible();
  await expectAction(page, 'giu-gioi');
  expect(new URL(page.url()).searchParams.get('article')).toBe('tt_nghi_thuc_tri_chu_bao_khiep_an');
  expect(new URL(page.url()).searchParams.get('chap')).toBe('1');
  expect(await page.evaluate(() => history.state.tuTapReturnScreen)).toBe('practice');
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.getByTestId('precept-practice-screen').getByRole('button', { name: 'Đóng', exact: true }).click();
  await expectAction(page, null);
  await expect(page.locator('.tt-practice')).toBeVisible();
  await expect(page.locator('.tt-practice .ttp-header-title')).toHaveText(title.replace(/\s+/g, ' ').toLocaleUpperCase('vi'));
  await expect(page.locator('.tt-practice')).toContainText('Trước khi bắt đầu');
  expect(new URL(page.url()).searchParams.get('article')).toBe('tt_nghi_thuc_tri_chu_bao_khiep_an');
  expect(new URL(page.url()).searchParams.get('chap')).toBe('1');
  await expect(page.getByRole('dialog', { name: 'Kết Thúc Công Phu?', exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(readerRequests).toEqual([]);
  expect(await page.evaluate(key => localStorage.getItem(key), companionKey)).toBe(previous);
});
