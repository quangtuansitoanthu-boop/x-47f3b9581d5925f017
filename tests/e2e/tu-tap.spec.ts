import { expect, test, type Page } from '@playwright/test';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { loginAsMember, loginAsAdmin, settleClient, logoutThroughAccount } from './runtime-helpers';

const anonymousStorageKey = (key: string) => principalStorageKey(null, key);
const memberStorageKey = (key: string) => principalStorageKey('e2e-member', key);

test('practice headings and italic guidance follow the selected paper rather than the app theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tutam_dark_mode', '1'));
  await page.goto('/tu-tap?article=e2e-practice&mode=practice');
  await settleClient(page);
  const practice = page.locator('.tt-practice');
  await expect(practice).toBeVisible();
  for (const paper of ['Tối', 'Trắng', 'Xám']) {
    await practice.getByRole('button', { name: paper, exact: true }).click();
    const ratios = await practice.evaluate(panel => {
      const content = panel.querySelector('.ttp-content')!;
      const probe = document.createElement('section');
      probe.innerHTML = '<h2>TIÊU ĐỀ KIỂM THỬ</h2><em>(3 lần)</em>';
      content.append(probe);
      try {
        const luminance = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => {
          channel /= 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const background = luminance(getComputedStyle(panel).backgroundColor);
        return [...probe.children].map(element => {
          const ink = luminance(getComputedStyle(element).color);
          return (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05);
        });
      } finally { probe.remove(); }
    });
    for (const ratio of ratios) expect(ratio, `practice text on ${paper}`).toBeGreaterThanOrEqual(4.5);
  }
});

async function gotoPractice(page: Page): Promise<void> {
  await page.goto('/tu-tap');
  await settleClient(page);
}

const deliveredEvidence = new WeakMap<Page, Array<{ clientSessionId: string; kind: string }>>();

test.beforeEach(async ({ page }) => {
  const delivered: Array<{ clientSessionId: string; kind: string }> = [];
  deliveredEvidence.set(page, delivered);
  page.on('response', (response) => {
    const request = response.request();
    if (request.method() !== 'POST' || !response.ok()) return;
    const path = new URL(response.url()).pathname;
    if (path === '/api/practice/sessions') {
      delivered.push({ clientSessionId: request.postDataJSON().clientSessionId, kind: 'start' });
    } else if (path.startsWith('/api/practice/sessions/') && path.endsWith('/complete')) {
      delivered.push({ clientSessionId: decodeURIComponent(path.split('/')[4]), kind: 'complete' });
    }
  });
});

async function evidenceOperationKinds(page: Page, activityType: string): Promise<string[]> {
  const queued = await page.evaluate(({ key, prefix }) => {
    const operations = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ clientSessionId?: string; kind?: string }>;
    return operations
      .filter((operation) => operation.clientSessionId?.startsWith(prefix))
      .map((operation) => ({ clientSessionId: String(operation.clientSessionId), kind: String(operation.kind) }));
  }, {
    key: memberStorageKey('quangtu_practice_session_outbox_v1'),
    prefix: `practice:${activityType}:`,
  });
  const delivered = (deliveredEvidence.get(page) ?? [])
    .filter((operation) => operation.clientSessionId?.startsWith(`practice:${activityType}:`));
  const operations = new Map([...delivered, ...queued].map((operation) => [
    `${operation.clientSessionId}:${operation.kind}`, operation.kind,
  ]));
  return [...operations.values()];
}

test.describe('Tu Tập lifecycle parity', () => {
  test('keeps a deferred account-A cloud pull out of the guest UI after real logout', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440-light', 'Principal lifecycle runs once outside visual baselines.');
    await loginAsAdmin(page, 'e2e-practice-logout-session-token');
    const userA = await page.evaluate(async () => {
      const response = await fetch('/api/session', { cache: 'no-store' });
      return String((await response.json()).user?.id ?? '');
    });
    expect(userA).not.toBe('');

    const guestLog = {
      id: 222,
      date: '2026-09-04',
      type: 'Tụng kinh',
      count: 222,
      note: 'guest-only',
      created: '2026-09-04T08:00:00.000Z',
    };
    const accountLog = {
      id: 999,
      date: '2026-09-04',
      type: 'Tụng kinh',
      count: 999,
      note: 'account-a-only',
      created: '2026-09-04T09:00:00.000Z',
    };
    const guestLogsKey = anonymousStorageKey('tt_practice_logs_v1');
    const guestTrackerKey = anonymousStorageKey('ttTrackerOpen');
    const accountLogsKey = principalStorageKey(userA, 'tt_practice_logs_v1');
    await page.evaluate(({ logsKey, log, trackerKey }) => {
      localStorage.setItem(logsKey, JSON.stringify([log]));
      localStorage.setItem(trackerKey, '1');
    }, {
      logsKey: guestLogsKey,
      log: guestLog,
      trackerKey: guestTrackerKey,
    });

    let releaseSync!: () => void;
    const syncRelease = new Promise<void>((resolve) => { releaseSync = resolve; });
    let markSyncSeen!: () => void;
    const syncSeen = new Promise<void>((resolve) => { markSyncSeen = resolve; });
    let markSyncReleased!: () => void;
    const syncReleased = new Promise<void>((resolve) => { markSyncReleased = resolve; });
    const syncWrites: unknown[] = [];
    await page.route('**/api/sync', async (route) => {
      if (route.request().method() !== 'GET') {
        syncWrites.push(route.request().postDataJSON());
        await route.continue();
        return;
      }
      markSyncSeen();
      await syncRelease;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bookmarks: [],
          listened_history: [],
          practice_logs: [accountLog],
          pt_album_positions: {},
          pt_player_state: null,
          pt_recent_albums: [],
        }),
      });
      markSyncReleased();
    });

    await gotoPractice(page);
    await syncSeen;

    await logoutThroughAccount(page);
    await gotoPractice(page);
    await settleClient(page);
    if (!await page.locator('#practice-tracker-body').isVisible()) await page.locator('button.tt-mode-card--tracker').click();
    await expect(page.getByText('222 biến', { exact: true })).toBeVisible();
    await expect(page.getByText('999 biến', { exact: true })).toHaveCount(0);

    releaseSync();
    await syncReleased;
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), accountLogsKey))
      .toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), guestLogsKey)).toBe(JSON.stringify([guestLog]));
    await expect(page.getByText('222 biến', { exact: true })).toBeVisible();
    await expect(page.getByText('999 biến', { exact: true })).toHaveCount(0);
    expect(syncWrites).toEqual([]);

    await expect(page).toHaveURL('/tu-tap?action=cong-phu');
  });

  test('admin edits a practice article in the shared legacy-style modal', async ({ page }) => {
    await loginAsAdmin(page);
    await gotoPractice(page);
    await page.goto('/admin/tu-tap');
    const edit = page.getByRole('row', { name: /Kinh kiểm thử E2E/ }).getByRole('button', { name: 'Chỉnh sửa', exact: true });
    await expect(edit).toBeVisible();
    await edit.click();
    const editor = page.getByRole('dialog', { name: /Sửa bài viết/i });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel(/Tiêu đề bài viết/i)).not.toHaveValue('');
    await expect(page).toHaveURL(/\/admin\/tu-tap$/u);
  });

  test('authenticated member can open the private verified progress dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.goto('/tien-do-tu-tap');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Tiến độ tu tập', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Nhật lịch 365 ngày' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Quyền riêng tư cộng đồng' })).toBeVisible();
  });

  test('tracker retains accessible compact controls', async ({ page }) => {
    await loginAsMember(page);
    await gotoPractice(page);
    await settleClient(page);
    const trackerHeader = page.locator('.tt-mode-card--tracker');
    await trackerHeader.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog', { name: 'Công phu của tôi' })).toBeVisible();

    const trackerBody = page.locator('#practice-tracker-body');
    await expect(trackerBody).toBeVisible();
    await expect(trackerBody.getByRole('button', { name: 'Hôm nay' })).toBeVisible();
    await expect(trackerBody.getByText('Hoạt động gần đây')).toBeVisible();
    await expect(trackerBody.getByRole('button', { name: 'Xem mục cũ' })).toBeVisible();
    await expect(trackerBody.getByRole('link', { name: 'Tiến độ xác minh →' })).toHaveAttribute('href', '/tien-do-tu-tap');
    await expect(trackerBody.getByRole('button', { name: /Ghi nhận công phu/i })).toHaveCount(0);
    await expect(trackerBody.getByRole('button', { name: '+ Ghi nhận', exact: true })).toHaveCount(1);
    await expect(trackerBody.locator('.tt-tracker__stats article')).toHaveCount(3);
    await expect(trackerBody.getByRole('button', { name: 'Tháng này' })).toHaveAttribute('aria-pressed', 'true');
    await trackerBody.getByRole('button', { name: 'Hôm nay' }).click();
    await expect(trackerBody.getByRole('button', { name: 'Hôm nay' })).toHaveAttribute('aria-pressed', 'true');

    await trackerBody.getByRole('button', { name: '7 ngày gần nhất' }).click();
    await expect(trackerBody.getByRole('button', { name: '7 ngày gần nhất' })).toHaveAttribute('aria-pressed', 'true');
    await expect(trackerBody.getByText('Ngày có công phu', { exact: true })).toBeVisible();

    const trackerHeight = await page.locator('.tt-tracker__card').evaluate((element) => element.getBoundingClientRect().height);
    await trackerBody.getByRole('button', { name: 'Xem mục cũ' }).click();
    const historyDialog = page.getByRole('dialog', { name: 'Lịch sử công phu' });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByText('Bạn chưa ghi nhận công phu nào.')).toBeVisible();
    expect(await page.locator('.tt-tracker__card').evaluate((element) => element.getBoundingClientRect().height)).toBe(trackerHeight);
    await historyDialog.getByRole('button', { name: 'Đóng' }).click();
    await expect(historyDialog).toHaveCount(0);
  });

  test('duplicate preview opens share one request and retry recovers after a failure', async ({ page }) => {
    await loginAsMember(page);
    let requestCount = 0;
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>(resolve => releaseFirst = resolve);
    await page.route(/\/api\/data\/baiviet\?/, async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await firstPending;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"temporary"}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'practice-latest',
          tieu_de: 'Bài tu tập phản hồi mới nhất',
          danh_muc: 'KINH PHẬT',
          ngay_dang: '2026-07-29',
          anh_url: '',
          tac_gia: 'E2E',
          tags: '',
          has_muc_luc: false,
          noi_dung: '<p>Nội dung mới nhất</p>',
          tap_tieu_de: '[]',
        }]),
      });
    });

    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    const cardTitle = page.locator('.tt-card-title').first();
    await cardTitle.dblclick();
    await expect.poll(() => requestCount).toBe(1);
    releaseFirst();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(requestCount).toBe(1);
    await page.getByRole('button', { name: /Thử lại/u }).click();
    await expect(page.getByRole('heading', { name: 'Bài tu tập phản hồi mới nhất' })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole('heading', { name: 'Bài tu tập phản hồi mới nhất' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('article network failure presents a working retry action', async ({ page }) => {
    await loginAsMember(page);
    let shouldFail = true;
    await page.route(/\/api\/data\/baiviet\?/, async (route) => {
      if (shouldFail) {
        shouldFail = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"temporary"}' });
      } else {
        await route.continue();
      }
    });
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-card-title').first().click();
    const error = page.getByRole('alert');
    await expect(error).toContainText('Không thể tải bài tu tập');
    await error.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByRole('button', { name: /Bắt Đầu Công Phu/i })).toBeVisible();
    await expect(error).toHaveCount(0);
  });

  test('article preview and table of contents match the production reader anatomy', async ({ page }) => {
    await loginAsMember(page);
    await page.setViewportSize({ width: 1914, height: 863 });
    await page.route(/\/api\/data\/baiviet\?/, async (route) => {
      const requestedId = new URL(route.request().url()).searchParams.get('id')?.replace(/^eq\./u, '');
      expect(requestedId).toBeTruthy();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: requestedId,
          tieu_de: 'KINH ĐẠI THỪA CÔNG ĐỨC TẠO TƯỢNG PHẬT',
          danh_muc: 'KINH PHẬT',
          ngay_dang: '2026-07-08',
          anh_url: '',
          tac_gia: 'Quang Từ',
          tags: '',
          has_muc_luc: true,
          noi_dung: '',
          tap_tieu_de: JSON.stringify(['LỜI GIỚI THIỆU', 'QUYỂN THƯỢNG', 'QUYỂN HẠ'])
        }])
      });
    });
    await page.route(/\/api\/data\/tap_noi_dung\?/, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('so_thu_tu')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ so_thu_tu: 0, tieu_de: 'LỜI GIỚI THIỆU', noi_dung: '<p>Nội dung lời giới thiệu.</p>' }])
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { so_thu_tu: 0, tieu_de: 'LỜI GIỚI THIỆU', tom_tat: '' },
          { so_thu_tu: 1, tieu_de: 'QUYỂN THƯỢNG', tom_tat: '' },
          { so_thu_tu: 2, tieu_de: 'QUYỂN HẠ', tom_tat: '' }
        ])
      });
    });

    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-card').first().click();

    const topbar = page.locator('.qts-route-topbar');
    await expect(topbar.getByRole('button', { name: 'Quay lại' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'KINH ĐẠI THỪA CÔNG ĐỨC TẠO TƯỢNG PHẬT' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bắt Đầu Công Phu/ })).toBeVisible();
    await expect(page.locator('.tt-preview__toc-list button')).toHaveCount(3);
    await expect(page.getByText('Nhấn vào phần để đọc nội dung')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Giảm cỡ chữ' })).toHaveCount(0);
    const preview = await page.locator('.tt-preview__wrap').boundingBox();
    expect(preview!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const header = await topbar.boundingBox();
    expect(preview!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.getByRole('button', { name: /LỜI GIỚI THIỆU/ }).click();
    await expect(page.getByText('Nội dung lời giới thiệu.')).toBeVisible();
    const chapterUrl = new URL(page.url());
    const selectedArticleId = chapterUrl.searchParams.get('article');
    expect(selectedArticleId).toBeTruthy();
    expect(chapterUrl.searchParams.get('chap')).toBe('0');
    await page.locator('.tt-reader-back-btn').click();
    await expect(page.locator('.tt-preview__toc-list button')).toHaveCount(3);
    await expect(page.getByText('Nội dung lời giới thiệu.')).not.toBeVisible();
    await expect(page).toHaveURL(url => url.pathname === '/tu-tap'
      && url.searchParams.get('article') === selectedArticleId
      && url.searchParams.get('muc') === 'kinh' && !url.searchParams.has('chap'));
    await topbar.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page.locator('.tt-grid')).toBeVisible();
    await expect(page).toHaveURL('/tu-tap?muc=kinh');
    await expect(page.getByRole('heading', { name: '📖 Tụng, Đọc Kinh', exact: true })).toBeVisible();
    await topbar.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page).toHaveURL('/tu-tap');
    await expect(page.getByRole('heading', { name: 'Chế Độ Tu Tập' })).toBeVisible();
    await expect(topbar.locator('.tt-topbar-title')).toHaveText('🙏 Chế Độ Tu Tập');
  });

  test('active practice reader matches the legacy full-screen anatomy', async ({ page }) => {
    await loginAsMember(page);
    await page.setViewportSize({ width: 1908, height: 862 });
    await page.addInitScript(() => {
      localStorage.removeItem('ttr_fab_pos');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_fs', '15');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_practice_bg', 'cream');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_practice_bold', '0');
    });
    await page.route(/\/api\/data\/baiviet\?/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'practice-session-parity',
          tieu_de: 'KINH ĐẠI THỪA CÔNG ĐỨC TẠO TƯỢNG PHẬT',
          danh_muc: 'KINH PHẬT',
          ngay_dang: '2026-07-08',
          anh_url: '',
          tac_gia: 'Quang Từ',
          tags: '',
          has_muc_luc: true,
          noi_dung: '',
          tap_tieu_de: JSON.stringify(['LỜI GIỚI THIỆU', 'QUYỂN THƯỢNG', 'QUYỂN HẠ'])
        }])
      });
    });
    await page.route(/\/api\/data\/tap_noi_dung\?/, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('so_thu_tu')) {
        const index = Number(url.searchParams.get('so_thu_tu')?.replace('eq.', '') ?? 0);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            so_thu_tu: index,
            tieu_de: index === 0 ? 'LỜI GIỚI THIỆU' : `PHẨM ${index + 1}`,
            noi_dung: Array.from({ length: 80 }, (_, paragraph) => `Đoạn ${paragraph + 1}: Người tu tập giữ tâm an định, đọc chậm và rõ từng lời.`).join('\n\n')
          }])
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { so_thu_tu: 0, tieu_de: 'LỜI GIỚI THIỆU', tom_tat: '' },
          { so_thu_tu: 1, tieu_de: 'QUYỂN THƯỢNG', tom_tat: '' },
          { so_thu_tu: 2, tieu_de: 'QUYỂN HẠ', tom_tat: '' }
        ])
      });
    });

    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-card').first().click();
    await page.getByRole('button', { name: /Bắt Đầu Công Phu/ }).click();
    await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u })
      .getByRole('button', { name: 'Bắt đầu 🙏' }).click();

    const practice = page.getByRole('region', { name: 'Tu Tập & Niệm Phật' });
    await expect(practice).toBeVisible();
    await expect(practice.locator('.ttp-header-title')).toHaveText('KINH ĐẠI THỪA CÔNG ĐỨC TẠO TƯỢNG PHẬT');
    await expect(practice.getByText('🙏 Đang tu tập')).toBeVisible();
    await expect(practice.getByRole('heading', { name: 'LỜI GIỚI THIỆU' })).toBeVisible();
    await expect(practice.getByText('15px')).toBeVisible();
    await expect(practice.locator('.ttp-bg-swatch')).toHaveCount(4);
    await expect(practice.getByRole('combobox', { name: 'Cuộn', exact: true })).toHaveValue('0.5');
    await practice.locator('.tt-practice__toggle').click();
    await expect(practice.getByRole('button', { name: '-1', exact: true })).toBeVisible();
    await expect(practice.getByRole('button', { name: '+1', exact: true })).toBeVisible();
    await expect(practice.getByRole('button', { name: '🪘 Mõ' })).toBeVisible();
    await expect(practice.locator('.ttr-action-music')).toBeVisible();
    await expect(practice.getByRole('button', { name: '🔊 Nghe tụng mẫu' })).toBeVisible();

    const content = practice.locator('.ttp-scroll-area');
    const headerBounds = await practice.locator('.ttp-header').boundingBox();
    const toolbarBounds = await practice.locator('.ttp-reader-bar').boundingBox();
    expect(toolbarBounds!.y).toBeGreaterThanOrEqual(headerBounds!.y + headerBounds!.height);
    expect((await content.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(practice.locator('.ttp-content')).toHaveCSS('font-family', /Bookerly/);

    await page.evaluate(() => window.scrollTo({ behavior: 'instant', top: 0 }));
    const autoScroll = practice.locator('.ttp-auto-scroll');
    await autoScroll.click();
    await expect(autoScroll).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(2);
    await practice.locator('.ttp-content').hover();
    await page.mouse.wheel(0, 60);
    await expect(autoScroll).toHaveAttribute('aria-pressed', 'false');

    await practice.getByRole('button', { name: 'A+', exact: true }).click();
    await expect(practice.getByText('16px')).toBeVisible();
    await practice.getByRole('button', { name: 'Xám', exact: true }).click();
    await expect(practice.locator('.ttp-body')).toHaveCSS('background-color', 'rgb(232, 232, 232)');
  });

  test('start and exit confirmations preserve practice and record the confirmed count once', async ({ page }) => {
    await loginAsMember(page);
    await page.addInitScript(() => localStorage.setItem('quangtu_principal_v1:e2e-member:tt_practice_logs_v1', '[]'));
    await gotoPractice(page);
    await expect(page.getByRole('heading', { name: 'Chế Độ Tu Tập' })).toBeVisible();
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-grid').getByText('Kinh kiểm thử E2E', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kinh kiểm thử E2E' })).toBeVisible();
    await page.getByRole('button', { name: /Bắt Đầu Công Phu/i }).click();
    const startDialog = page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u });
    await expect(startDialog).toBeVisible();
    await startDialog.getByRole('button', { name: 'Chưa vội' }).click();
    await expect(page.getByText('🙏 Đang tu tập')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('quangtu_principal_v1:e2e-member:tt_practice_logs_v1'))).toBe('[]');
    await page.getByRole('button', { name: /Bắt Đầu Công Phu/i }).click();
    await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
    await expect(page.getByText('🙏 Đang tu tập')).toBeVisible();
    await page.locator('.tt-practice__toggle').click();
    await page.getByRole('button', { name: '+1', exact: true }).click();
    await expect(page.getByText('Đã tụng 1 biến 🙏')).toBeVisible();

    await page.getByRole('button', { name: 'Hồi hướng & Thoát', exact: true }).click();
    const exitDialog = page.getByRole('dialog', { name: 'Kết Thúc Công Phu?' });
    await expect(exitDialog).toContainText('Bạn đã tụng 1 biến');
    await exitDialog.getByRole('button', { name: 'Tiếp tục tu' }).click();
    await expect(page.getByText('Đã tụng 1 biến 🙏')).toBeVisible();

    await page.getByRole('button', { name: 'Hồi hướng & Thoát', exact: true }).click();
    await page.getByRole('dialog', { name: 'Kết Thúc Công Phu?' }).getByRole('button', { name: 'Hồi hướng & Thoát' }).click();
    await expect(page.getByRole('button', { name: 'Bắt Đầu Công Phu', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tu Tập & Niệm Phật', exact: true })).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quangtu_principal_v1:e2e-member:tt_practice_logs_v1') || '[]')))
      .toEqual([expect.objectContaining({ count: 1, type: 'Tụng kinh', note: 'Kinh kiểm thử E2E - Khai kinh' })]);
    await expect.poll(() => evidenceOperationKinds(page, 'scripture')).toEqual(['start', 'complete']);
  });

  test('practice exposes guided meditation presets, bundled audio and deterministic preparation', async ({ page }) => {
    await loginAsMember(page);
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-grid').getByText('Kinh kiểm thử E2E', { exact: true }).click();
    await page.getByRole('button', { name: /Bắt Đầu Công Phu/i }).click();
    await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();

    const speed = page.getByRole('combobox', { name: 'Cuộn', exact: true });
    await expect(speed.locator('option')).toHaveText(['Rất chậm', 'Chậm', 'Vừa', 'Nhanh']);
    await speed.selectOption('2');
    await expect(speed).toHaveValue('2');

    await page.getByRole('button', { name: 'Hồi hướng & Thoát', exact: true }).click();
    await page.getByRole('dialog', { name: 'Kết Thúc Công Phu?' }).getByRole('button', { name: 'Hồi hướng & Thoát' }).click();
    await gotoPractice(page);
    await settleClient(page);
    await page.locator('button.tt-mode-card--thien').click();
    const chooser = page.getByRole('dialog', { name: 'Thiền có hướng dẫn' });
    await expect(chooser.getByText('30 giây chuẩn bị · 3 tiếng chuông bắt đầu · 3 tiếng chuông kết thúc')).toBeVisible();
    for (const minutes of [15, 30, 45, 60]) {
      await expect(chooser.getByRole('button', { name: `${minutes} phút` })).toBeVisible();
    }
    await expect(chooser.getByRole('button', { name: 'Tùy chọn' })).toBeVisible();
    const musicTab = chooser.getByRole('tab', { name: 'Nhạc thiền', exact: true });
    await musicTab.click();
    await expect(musicTab).toHaveAttribute('aria-selected', 'true');
    const music = chooser.getByRole('tabpanel', { name: 'Nhạc thiền', exact: true });
    await expect(music.getByRole('button')).toHaveCount(4);
    for (const label of [
      'Không phát nhạc',
      'Nhạc Thiền 1 — Tĩnh lặng',
      'Nhạc Thiền 2 — Thanh tịnh',
      'Nhạc Thiền 3 — An lạc'
    ]) {
      await expect(music.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    const selectedMusic = music.getByRole('button', { name: 'Nhạc Thiền 3 — An lạc', exact: true });
    await selectedMusic.click();
    await expect(selectedMusic).toHaveAttribute('aria-pressed', 'true');
    await chooser.getByRole('tab', { name: 'Âm thanh', exact: true }).click();
    await chooser.getByRole('checkbox', { name: 'Bật nhịp mõ đều' }).check();
    await expect(chooser.getByRole('button', { name: 'Chậm 40–50 BPM' })).toBeVisible();
    await expect(chooser.getByRole('button', { name: 'Vừa 60–70 BPM' })).toBeVisible();
    await expect(chooser.getByRole('button', { name: 'Nhanh 90–108 BPM' })).toBeVisible();
    await chooser.getByRole('button', { name: 'Nhanh 90–108 BPM' }).click();
    await expect(chooser.getByText('Nhịp chính xác:')).toContainText('99 BPM');
    await chooser.getByRole('button', { name: 'Bắt đầu thiền' }).click();

    const meditation = page.getByRole('region', { name: 'Thiền có hướng dẫn' });
    await expect(meditation.getByText('Chuẩn bị thân tâm')).toBeVisible();
    await expect(meditation.getByLabel('Còn 00:30')).toBeVisible();
    await expect(meditation.getByText('🎵 Có nhạc nền')).toBeVisible();
    await expect(meditation.getByText('🪘 Mõ 99 BPM')).toBeVisible();
    await meditation.getByRole('button', { name: 'Tạm dừng' }).click();
    await expect(meditation.getByText('Đang tạm dừng', { exact: true })).toBeVisible();
    await meditation.getByRole('button', { name: 'Tiếp tục' }).click();
    await meditation.getByRole('button', { name: 'Kết thúc sớm' }).click();
    await expect(meditation.getByText('Thời thiền đã kết thúc')).toBeVisible();
    await meditation.getByRole('button', { name: 'Hoàn tất' }).click();
    await expect(meditation).toHaveCount(0);
    await expect.poll(() => evidenceOperationKinds(page, 'meditation')).toEqual(['start', 'complete']);
  });

  test('model chant records one honest automatic evidence pair after natural playback', async ({ page }) => {
    await loginAsMember(page);
    await page.addInitScript(() => {
      class FakeUtterance {
        lang = '';
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onstart: (() => void) | null = null;
        rate = 1;
        text: string;

        constructor(text: string) {
          this.text = text;
        }
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices() { return [{ name: 'Test Vietnamese', lang: 'vi-VN' }]; },
          addEventListener() {},
          removeEventListener() {},
          cancel() {},
          pause() {},
          resume() {},
          speak(utterance: FakeUtterance) {
            utterance.onstart?.();
            setTimeout(() => utterance.onend?.(), 20);
          },
        },
      });
    });
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-grid').getByText('Kinh kiểm thử E2E', { exact: true }).click();
    await page.getByRole('button', { name: /Bắt Đầu Công Phu/i }).click();
    await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();

    await page.getByRole('button', { name: '🔊 Nghe tụng mẫu' }).click();
    await expect(page.locator('.tt-rosary-feedback[role="status"]')).toContainText('Đã nghe trọn phần tụng mẫu.');
    await expect.poll(() => evidenceOperationKinds(page, 'model_chant')).toEqual(['start', 'complete']);
  });

  test('starting a multi-chapter practice preloads the next chapter without changing the active chapter', async ({ page }) => {
    await loginAsMember(page);
    const requestedChapterIndexes: number[] = [];
    page.on('request', (request) => {
      if (!request.url().includes('/api/data/tap_noi_dung?') || !request.url().includes('so_thu_tu=eq.')) return;
      const match = request.url().match(/so_thu_tu=eq\.(\d+)/);
      if (match) requestedChapterIndexes.push(Number(match[1]));
    });

    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-grid').getByText('Kinh kiểm thử E2E', { exact: true }).click();
    await page.getByRole('button', { name: /Bắt Đầu Công Phu/i }).click();
    await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();

    await expect(page.getByText('1 / 2')).toBeVisible();
    await expect.poll(() => requestedChapterIndexes).toContain(1);
    await expect(page.getByText('Nguyện hương.')).toBeVisible();
  });

  test('practice FAB drags, snaps to an edge and persists a viewport-safe position', async ({ page }) => {
    await loginAsMember(page);
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--kinh').click();
    await page.locator('.tt-grid').getByText('Kinh kiểm thử E2E', { exact: true }).click();
    await page.getByRole('button', { name: /Bắt Đầu Công Phu/i }).click();
    await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();

    const toggle = page.locator('.tt-practice__toggle');
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(40, 180, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(320);

    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), memberStorageKey('ttr_fab_pos'));
    expect(saved).toEqual(expect.objectContaining({ x: 8 }));
    expect(saved.y).toBeGreaterThanOrEqual(8);
  });

  test('rosary preserves an existing daily total and persists accepted interactions', async ({ page }) => {
    await loginAsMember(page);
    await page.addInitScript(() => localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_count', '107'));
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--chuoi').click();
    await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
    const rosary = page.getByRole('region', { name: 'Chế độ lần chuỗi' });
    await expect(rosary.getByText('107', { exact: true })).toBeVisible();
    const swipe = rosary.locator('.tt-rosary__swipe');
    for (let count = 108; count <= 109; count += 1) {
      await swipe.scrollIntoViewIfNeeded();
      const visible = await swipe.evaluate(element => {
        const rect = element.getBoundingClientRect();
        let left = Math.max(0, rect.left);
        let right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top);
        let bottom = Math.min(innerHeight, rect.bottom);
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const bounds = ancestor.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, bounds.left);
            right = Math.min(right, bounds.right);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
          }
        }
        return { x: (left + right) / 2, top, bottom, width: right - left };
      });
      expect(visible.width).toBeGreaterThan(0);
      expect(visible.bottom - visible.top).toBeGreaterThan(120);
      await page.mouse.move(visible.x, visible.bottom - 20);
      await page.mouse.down();
      await page.mouse.move(visible.x, visible.top + 20, { steps: 5 });
      await page.mouse.up();
      await expect(rosary.getByText(String(count), { exact: true })).toBeVisible();
      await page.waitForTimeout(420);
    }
    await expect(rosary.getByLabel('Tiến độ mục tiêu 11 phần trăm')).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), memberStorageKey('tt_rosary_count'))).toBe('109');
  });

  test('rosary offers supported sizes, phrases and circular daily goals', async ({ page }) => {
    await loginAsMember(page);
    await page.setViewportSize({ width: 1918, height: 863 });
    await page.addInitScript(() => {
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_count', '5');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_dir', 'up');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_sound', '0');
    });
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--chuoi').click();
    await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();

    const rosary = page.getByRole('region', { name: 'Chế độ lần chuỗi' });
    await expect(rosary).toBeVisible();
    await expect(rosary.getByRole('button', { name: 'Quay lại tu tập' })).toBeVisible();
    await expect(rosary.getByRole('button', { name: 'Đặt lại' })).toBeVisible();
    await expect(rosary.getByRole('button', { name: /Ghi nhận công phu/i })).toHaveCount(0);
    await rosary.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
    await expect(rosary.getByLabel('Vuốt lên để tăng')).toBeChecked();
    await expect(rosary.getByText('⬇️ Vuốt xuống', { exact: true })).toBeVisible();
    await expect(rosary.getByText('⬆️ Vuốt lên', { exact: true })).toBeVisible();
    await expect(rosary.getByText('🪘 Âm thanh', { exact: true })).toBeVisible();
    await expect(rosary.getByText('5', { exact: true })).toHaveCSS('font-size', '52px');
    const appFont = await page.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--font-app').replace(/['"]/g, '').replace(/\s+/g, ' ').trim());
    expect(appFont).toContain('San Francisco Web');
    await expect.poll(() => rosary.getByText('5', { exact: true })
      .evaluate(element => getComputedStyle(element).fontFamily
        .replace(/['"]/g, '').replace(/\s+/g, ' ').trim())).toBe(appFont);
    await expect(rosary.getByText('5/108', { exact: true })).toBeVisible();
    await expect(rosary.locator('.tt-rosary__phrase')).toHaveText('Nam mô A Di Đà Phật');
    await expect(rosary.getByLabel('Tiến độ mục tiêu 1 phần trăm')).toBeVisible();
    await expect(rosary.locator('.tt-rosary__bead')).toHaveCount(7);

    const sizes = rosary.getByRole('combobox', { name: 'Số hạt trong chuỗi' });
    await sizes.click();
    const sizePicker = page.getByRole('dialog', { name: 'Chuỗi', exact: true });
    await expect(sizePicker.locator('.rosary-select__option')).toHaveText(['18 hạt', '27 hạt', '54 hạt', '108 hạt']);
    await sizePicker.getByRole('button', { name: '18 hạt', exact: true }).click();
    const goals = rosary.getByRole('combobox', { name: 'Mục tiêu niệm' });
    await goals.click();
    const goalPicker = page.getByRole('dialog', { name: 'Mục tiêu', exact: true });
    await expect(goalPicker.locator('.rosary-select__option')).toHaveText(['1.000', '3.000', '10.000']);
    await goalPicker.getByRole('button', { name: '3.000', exact: true }).click();
    const phrases = rosary.getByRole('combobox', { name: 'Danh hiệu trì niệm' });
    await phrases.click();
    const phrasePicker = page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true });
    await expect(phrasePicker.locator('.rosary-select__option')).toHaveText([
      'Nam mô A Di Đà Phật',
      'Nam mô Quán Thế Âm Bồ Tát',
      'Nam mô Bổn Sư Thích Ca Mâu Ni Phật',
      'Nam mô Địa Tạng Vương Bồ Tát',
      'Nam mô Dược Sư Lưu Ly Quang Vương Phật',
      'Nam mô Đại Trí Văn Thù Sư Lợi Bồ Tát',
      'Nam mô Đại Hạnh Phổ Hiền Bồ Tát',
      'Nam mô Đại Thế Chí Bồ Tát',
      'Nam mô Chuẩn Đề Vương Bồ Tát',
      'Án Ma Ni Bát Mê Hồng',
      'Diệt Định Nghiệp Chân Ngôn',
      'Tâm Chú Lăng Nghiêm',
      'Ngũ Đại Tâm Chú Lăng Nghiêm',
    ]);
    await phrasePicker.getByRole('button', { name: 'Nam mô Quán Thế Âm Bồ Tát', exact: true }).click();
    await expect(rosary.getByText('5/18', { exact: true })).toBeVisible();
    const mantra = 'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha';
    await phrases.click();
    await phrasePicker.getByRole('button', { name: 'Diệt Định Nghiệp Chân Ngôn', exact: true }).click();
    await expect(rosary.locator('.tt-rosary__phrase')).toHaveText(mantra);
    await rosary.locator('.tt-rosary__swipe').click();
    await expect(rosary.getByText('6/18', { exact: true })).toBeVisible();
    await expect(rosary.getByText('6', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 844 });
    for (const phrase of [
      'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.',
      'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim',
    ]) {
      await phrases.click();
      await phrasePicker.getByRole('button', { name: phrase.split(' — ')[0], exact: true }).click();
      await expect(rosary.locator('.tt-rosary__phrase')).toHaveText(phrase);
      await page.screenshot({ path: `.cache/rosary-mantra-${phrase.startsWith('Ngũ') ? 'five' : 'heart'}-375.png` });
    }
    await expect(rosary.getByLabel('Tiến độ mục tiêu 0 phần trăm')).toBeVisible();
  });

  test('rosary interactions are rate-limited and optional feedback failures never block counting', async ({ page }) => {
    await loginAsMember(page);
    // Cô lập lịch sử từ ca khác; vẫn gửi start/complete thật để kiểm tra bằng chứng.
    await page.route('**/api/practice/sessions*', route => route.request().method() === 'GET'
      ? route.fulfill({ json: { sessions: [] } })
      : route.continue());
    await page.addInitScript(() => {
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_count', '0');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_dir', 'up');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_sound', '0');
      localStorage.setItem('quangtu_principal_v1:e2e-member:tt_practice_logs_v1', '[]');
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
        constructor() { throw new Error('audio unavailable'); }
      }});
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => {
        throw new Error('haptics unavailable');
      }});
    });
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--chuoi').click();
    await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();

    const rosary = page.getByRole('region', { name: 'Chế độ lần chuỗi' });
    await expect(rosary.getByRole('button', { name: /Ghi nhận công phu/i })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('quangtu_principal_v1:e2e-member:tt_practice_logs_v1'))).toBe('[]');

    const swipe = rosary.locator('.tt-rosary__swipe');
    const tap = async () => {
      const box = await swipe.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.up();
    };

    // Gửi hai tap trong cùng lượt trình duyệt: round-trip Playwright/GPU có thể vượt 400ms.
    // Không đổi đồng hồ hay owner; các ca vuốt/tap khác vẫn dùng input chuột thật.
    const rapidElapsed = await swipe.evaluate(element => {
      const box = element.getBoundingClientRect();
      const start = performance.now();
      for (const pointerId of [31, 32]) {
        const options = { bubbles: true, pointerId, isPrimary: true, button: 0,
          clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
        element.dispatchEvent(new PointerEvent('pointerdown', options));
        element.dispatchEvent(new PointerEvent('pointerup', options));
      }
      return performance.now() - start;
    });
    expect(rapidElapsed).toBeLessThan(400);
    await expect(rosary.getByText('1', { exact: true })).toBeVisible();
    await page.waitForTimeout(420);
    await rosary.getByRole('button', { name: 'Tùy chọn', exact: true }).click();
    await rosary.getByLabel('Vuốt xuống để tăng').click();
    await rosary.getByRole('checkbox', { name: 'Bật âm thanh khi đếm' }).check();
    await tap();
    await expect(rosary.getByText('2', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), memberStorageKey('tt_rosary_count'))).toBe('2');
    await rosary.getByRole('button', { name: 'Kết thúc phiên' }).click();
    await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
    await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
    await expect.poll(() => evidenceOperationKinds(page, 'rosary')).toEqual(['start', 'complete']);
  });

  test('finishing a rosary opened from the catalog returns to the catalog', async ({ page }) => {
    await loginAsMember(page);
    await page.addInitScript(() => localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_count', '6'));
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--chuoi').click();
    await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
    const rosary = page.getByRole('region', { name: 'Chế độ lần chuỗi' });
    await expect(rosary.getByText('6', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
    await page.getByRole('button', { name: 'Chốt sổ và thoát', exact: true }).click();
    await page.getByRole('button', { name: 'Về Tu tập', exact: true }).click();
    await expect(rosary).toHaveCount(0);
    await expect(page.locator('button.tt-mode-card--chuoi')).toBeVisible();
  });

  test('rosary reset requires explicit confirmation', async ({ page }) => {
    await loginAsMember(page);
    await page.addInitScript(() => localStorage.setItem('quangtu_principal_v1:e2e-member:tt_rosary_count', '12'));
    await gotoPractice(page);
    await page.locator('button.tt-mode-card--chuoi').click();
    await page.getByRole('dialog', { name: 'Bắt Đầu Lần Hạt?' }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
    const rosary = page.getByRole('region', { name: 'Chế độ lần chuỗi' });
    await rosary.getByRole('button', { name: 'Đặt lại' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đặt lại bộ đếm?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.screenshot({ path: '.cache/rosary-reset-confirm.png' });
    await dialog.getByRole('button', { name: 'Hủy' }).click();
    await expect(rosary.getByText('12', { exact: true })).toBeVisible();
    await rosary.getByRole('button', { name: 'Đặt lại' }).click();
    await page.getByRole('dialog', { name: 'Đặt lại bộ đếm?' }).getByRole('button', { name: 'Đồng ý' }).click();
    await expect(rosary.getByText('0', { exact: true })).toBeVisible();
  });
});
