import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

const version = 'a'.repeat(64);
const cover = 'https://media.quangtu.vn/covers/test-update.webp';
const row = (id: string, category: string, extra = {}) => ({ id, tieu_de: id, danh_muc: category, trang_thai: 'Hoàn thành', updated_at: '2026-10-26T12:00:00Z', anh_url: cover, ...extra });
const items = [
  { kind: 'article', group: 'book', mode: 'full', version, row: row('new-book', 'SÁCH', { has_muc_luc: 1 }) },
  { kind: 'article', group: 'scripture', mode: 'full', version, row: row('new-sutra', 'KINH PHẬT', { tieu_de: 'Kinh kiểm thử mới' }) },
  { kind: 'article', group: 'ritual', mode: 'full', version, row: row('new-ritual', 'NGHI THỨC') },
  { kind: 'article', group: 'pdf', mode: 'shell', version, row: row('new-pdf', 'SÁCH', { pdf_url: 'https://test.invalid/never-download.pdf' }) },
  { kind: 'talk', group: 'talk', mode: 'shell', version, row: { id: 'new-talk', tieu_de: 'Album mới', visibility: 'public', anh_dai_dien: cover, tracks: [{ title: 'Bài mới', url: 'https://test.invalid/never-download.mp3' }] } },
];

test('a missing CDN cover falls back to the native media API and completes the offline ritual', async ({ page }) => {
  const origin = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
  const ritual = { kind: 'article', group: 'ritual', mode: 'full', version,
    row: row('missing-cover-ritual', 'TRÌ CHÚ', { anh_url: '/api/media/covers/missing-cdn.webp#pos=50%25%2024%25' }) };
  let mediaRequests = 0;
  let catalogOrigin = '';
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/content-updates') return route.fulfill({ json: [] });
    const action = url.searchParams.get('action');
    if (!action || action === 'catalog') catalogOrigin = url.origin;
    return route.fulfill({ json: action === 'estimate'
      ? [{ id: ritual.row.id, bytes: 12000, chapters: 0, illustrated: false }]
      : action === 'article' ? { article: { ...ritual.row, noi_dung: '<p>Nội dung nghi thức đầy đủ</p>' }, chapters: [], next: null }
      : { items: [ritual], articlesNext: null, talksNext: null } });
  });
  await page.route('**/covers/missing-cdn.webp', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname !== '/api/media/covers/missing-cdn.webp') return route.fulfill({ status: 404 });
    mediaRequests++;
    return route.fulfill({ headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' },
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGAAAAABJRU5ErkJggg==', 'base64') });
  });
  await page.goto('/'); await settleClient(page);
  await page.evaluate((remote) => {
    const win = window as unknown as { androidBridge: object; Capacitor?: { isNativePlatform: () => boolean } };
    win.androidBridge = {};
    win.Capacitor = { ...win.Capacitor, isNativePlatform: () => true };
    localStorage.setItem('quangtu_active_url', 'https://quangtu.vn');
  }, origin);
  expect(mediaRequests).toBe(0);
  await page.locator('#content-updates button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Nội dung sẵn sàng cập nhật');
  expect(catalogOrigin).toBe(origin);
  expect(mediaRequests).toBe(0);
  await dialog.getByRole('button', { name: 'Tải nội dung', exact: true }).click();
  await expect(dialog).toContainText('Đã cập nhật: 1');
  await expect(dialog).not.toContainText('Chưa tải hoàn tất');
  expect(mediaRequests).toBe(1);
  expect(await page.evaluate(async () => {
    const packages = await caches.open('tutam-content-packages-v1');
    const index = await (await packages.match('https://tutam-cache.local/content-packages/index'))!.json();
    const images = await caches.open('tutam-public-covers-v1');
    const cover = await images.match('/covers/missing-cdn.webp');
    return index.some((item: { row: { id: string } }) => item.row.id === 'missing-cover-ritual') && Boolean(cover && (await cover.blob()).size);
  })).toBe(true);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.unroute('**/covers/missing-cdn.webp');
  let imageReads = 0;
  await page.route('**/covers/missing-cdn.webp', route => { imageReads++; return route.abort('failed'); });
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap?muc=tri-chu');
  await settleClient(page);
  const card = page.locator('.tt-card').filter({ hasText: 'missing-cover-ritual' });
  await card.scrollIntoViewIfNeeded();
  const image = card.locator('img.tt-card-img');
  await expect(image).toHaveAttribute('src', /^blob:/u);
  await expect(image).toHaveCSS('object-position', '50% 24%');
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(imageReads).toBe(0);
  await page.reload();
  await settleClient(page);
  await card.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', /^blob:/u);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(imageReads).toBe(0);
});

test('one homepage action previews MB, downloads only the right payloads, and reopens a new sutra offline', async ({ page }, testInfo) => {
  const actions: string[] = [];
  const binary: string[] = [];
  await page.addInitScript(() => localStorage.setItem('tutam_locale', 'vi'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/content-updates') return route.fulfill({ json: [] });
    const action = url.searchParams.get('action') ?? 'catalog'; actions.push(action);
    if (action === 'catalog') return route.fulfill({ json: { items, articlesNext: null, talksNext: null } });
    if (action === 'estimate') return route.fulfill({ json: [
      { id: 'new-book', bytes: 2000000, chapters: 2, illustrated: true },
      { id: 'new-sutra', bytes: 200, chapters: 0, illustrated: false },
      { id: 'new-ritual', bytes: 200, chapters: 0, illustrated: false },
    ] });
    const item = items.find(item => item.row.id === url.searchParams.get('id'))!;
    return route.fulfill({ json: { article: { ...item.row, noi_dung: '<p>Nội dung offline đầy đủ</p>' + (item.row.id === 'new-book' ? '<img src="/covers/test-update.webp" alt="Minh họa mới">' : '') },
      chapters: item.row.id === 'new-book' ? [
        { id: '1', so_thu_tu: 0, tieu_de: 'Chương một', noi_dung: '<p>Chương một</p><img src="/covers/test-update.webp" alt="Minh họa mới">' }, { id: '2', so_thu_tu: 1, tieu_de: 'Chương hai', noi_dung: '<p>Chương hai</p>' },
      ] : [], next: null } });
  });
  await page.route('**/covers/test-update.webp', route => route.fulfill({
    status: 200, headers: { 'content-type': 'image/png', 'content-length': '68', 'access-control-allow-origin': '*' },
    body: route.request().method() === 'HEAD' ? '' : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGAAAAABJRU5ErkJggg==', 'base64'),
  }));
  page.on('request', request => { if (/never-download\.(pdf|mp3)/u.test(request.url())) binary.push(request.url()); });
  await page.goto('/'); await settleClient(page);
  const trigger = page.locator('#content-updates').getByRole('button', { name: 'Cập nhật nội dung' });
  await trigger.scrollIntoViewIfNeeded();
  expect(actions).toEqual([]);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Nội dung sẵn sàng cập nhật' });
  await expect(dialog).toContainText('MB');
  await expect(dialog).toContainText('Sách PDF · bìa và danh sách');
  await expect(dialog).toContainText('Album Pháp thoại · bìa và danh sách');
  expect(actions).toEqual(['catalog', 'estimate']);
  expect(binary).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await dialog.getByRole('button', { name: 'Tải nội dung', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('content-update-dialog.png') });
  await dialog.getByRole('button', { name: 'Tải nội dung', exact: true }).click();
  await expect(dialog).toContainText('Đã cập nhật: 5');
  expect(actions.filter(action => action === 'article')).toHaveLength(3);
  expect(binary).toEqual([]);
  const stored = await page.evaluate(async () => {
    const cache = await caches.open('tutam-content-packages-v1');
    return (await (await cache.match('https://tutam-cache.local/content-packages/index'))!.json()) as Array<{ mode: string; row: { id: string; noi_dung?: string } }>;
  });
  expect(stored).toHaveLength(5);
  expect(stored.find(item => item.row.id === 'new-pdf')!.row.noi_dung).toBeUndefined();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await trigger.click();
  await expect(dialog).toContainText('Không có nội dung mới cần tải.');
  expect(actions.filter(action => action === 'estimate')).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.unroute('**/api/**');
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/tu-tap?article=new-sutra');
  await expect(page.getByRole('heading', { name: 'Kinh kiểm thử mới', exact: true }).first()).toBeVisible();
  await page.unroute('**/covers/test-update.webp');
  let coverReads = 0;
  await page.route('**/covers/test-update.webp', route => { coverReads++; return route.abort('failed'); });
  await page.goto('/kinh-sach');
  await settleClient(page);
  const bookCard = page.locator('.art-card').filter({ hasText: 'new-book' });
  await bookCard.scrollIntoViewIfNeeded();
  await expect(bookCard.locator('.art-thumb img')).toHaveAttribute('src', /^blob:/u);
  await expect.poll(() => bookCard.locator('.art-thumb img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(coverReads).toBe(0);
  await page.goto('/kinh-sach?book=new-book');
  await page.locator('.reader-modal .toc-item').first().click();
  await expect(page.locator('.reader-content img[alt="Minh họa mới"]')).toHaveAttribute('src', /^blob:/u);
});

test('postponing the size dialog starts no package download and restores focus', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/content-updates') return route.fulfill({ json: [] });
    actions.push(url.searchParams.get('action') ?? 'catalog');
    return route.fulfill({ json: { items: [{ ...items[3], row: { ...items[3].row, anh_url: '' } }], articlesNext: null, talksNext: null } });
  });
  await page.goto('/'); await settleClient(page);
  const trigger = page.locator('#content-updates button');
  await trigger.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Để sau', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(actions).toEqual(['catalog']);
  expect(await page.evaluate(async () => (await caches.open('tutam-content-packages-v1')).match('https://tutam-cache.local/content-packages/index').then(Boolean))).toBe(false);
});

test('missing update API gives a specific server message and retry can recover', async ({ page }, testInfo) => {
  let calls = 0;
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname !== '/api/content-updates') return route.fulfill({ json: [] });
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 404, json: { error: { code: 'not_found' } } })
      : route.fulfill({ json: { items: [], articlesNext: null, talksNext: null } });
  });
  await page.goto('/'); await settleClient(page);
  const trigger = page.locator('#content-updates button');
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toHaveText('Chưa thể cập nhật nội dung');
  await expect(dialog.getByRole('alert')).toContainText('Máy chủ chưa hỗ trợ');
  await page.screenshot({ path: testInfo.outputPath('content-update-server-unavailable.png') });
  expect(calls).toBe(1);
  await dialog.getByRole('button', { name: 'Kiểm tra lại' }).click();
  await expect(dialog).toContainText('Không có nội dung mới cần tải.');
  expect(calls).toBe(2);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
