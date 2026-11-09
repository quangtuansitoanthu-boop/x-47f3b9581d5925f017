import { expect, test } from '@playwright/test';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';
import { readFileSync } from 'node:fs';
import { loginAsMember, loginAsAdmin, settleClient, logoutThroughAccount } from './runtime-helpers';

const memberStorageKey = (key: string) => principalStorageKey('e2e-member', key);
const offlineTalks = JSON.parse(readFileSync('src/lib/data/offline-talks.json', 'utf8')) as Array<{ id: string; tieu_de: string }>;
// Logout revokes the real session; each configured project owns its fixture.
const audioPrincipalSessions = new Map([
  ['mobile-390-light', 'e2e-audio-logout-mobile-390-light-session-token'],
  ['mobile-390-dark', 'e2e-audio-logout-mobile-390-dark-session-token'],
  ['desktop-1440-light', 'e2e-audio-logout-session-token'],
  ['desktop-1440-dark', 'e2e-audio-logout-desktop-1440-dark-session-token'],
]);

test.describe('Pháp Thoại public and download contracts', () => {
  test('guides listeners to offline download without starting a download', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);
    const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    await card.getByRole('button', { name: 'Xem chi tiết album Pháp thoại kiểm thử E2E' }).click();
    const dialog = page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' });
    const notice = dialog.getByRole('complementary', { name: 'Nghe pháp thoại ngoại tuyến' });
    await expect(notice).toBeVisible();
    let downloadRequests = 0;
    page.on('request', (request) => {
      if (/\/api\/(?:downloads\/access|audio\/drive\/)/u.test(request.url())) downloadRequests++;
    });
    await expect(notice.getByRole('button')).toHaveCount(0);
    await expect(notice.locator('.album-offline-hand')).toBeVisible();
    await dialog.getByRole('button', { name: 'Tải Offline', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Tải album để nghe offline?' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Có, tải offline' })).toBeEnabled();
    const surface = await confirmation.evaluate(element => {
      const style = getComputedStyle(element);
      const buttons = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect());
      return { filter: style.backdropFilter, marked: element.hasAttribute('data-dialog-glass'), token: style.getPropertyValue('--dialog-surface-filter'), reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches, widths: buttons.map(button => button.width), heights: buttons.map(button => button.height) };
    });
    expect(surface).toMatchObject({ filter: expect.stringContaining('blur('), marked: true, reduced: false });
    if (page.viewportSize()!.width <= 600) {
      expect(Math.abs(surface.widths[0] - surface.widths[1])).toBeLessThanOrEqual(1);
      expect(Math.min(...surface.heights)).toBeGreaterThanOrEqual(44);
    }
    await confirmation.screenshot({ path: test.info().outputPath('offline-confirm-glass.png') });
    expect(downloadRequests).toBe(0);
    await confirmation.getByRole('button', { name: 'Để sau' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Tải Offline', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Tải Offline', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(page.locator('.audio-offline-modal-backdrop')).toHaveCount(0);
    expect(downloadRequests).toBe(0);
    const bounds = await notice.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: `test-results/offline-notice-${page.viewportSize()!.width}-${test.info().project.name}.png` });
  });

  test('shows packaged Drive MB without metadata API or audio requests', async ({ page }) => {
    await loginAsMember(page);
    const album = offlineTalks.find(item => item.id === 'pt_1781885335376')!;
    await page.route(/\/api\/talks(?:\?|$)/u, route => route.fulfill({ json: [album] }));
    let requests = 0;
    page.on('request', request => {
      if (/\/api\/(?:talks\/[^/]+\/download-size|audio\/drive\/|downloads\/access)/u.test(request.url())) requests++;
    });
    await page.goto('/phap-thoai');
    await settleClient(page);
    const card = page.locator('.pt-card').filter({ hasText: album.tieu_de });
    await card.locator('.pt-card-thumb').click();
    await page.getByRole('dialog', { name: album.tieu_de, exact: true }).getByRole('button', { name: 'Tải Offline', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Tải album để nghe offline?' });
    await expect(confirmation).toContainText(/45[,.]8\s*MB/u);
    expect(requests).toBe(0);
    await confirmation.screenshot({ path: test.info().outputPath('packaged-album-size.png') });
    await confirmation.getByRole('button', { name: 'Để sau' }).click();
    expect(requests).toBe(0);
  });

  test('keeps the glass app prompt above the album when clipboard access is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { throw new Error('Clipboard unavailable in this test'); },
      } });
    });
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);
    const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    await card.locator('.pt-card-thumb').click();
    const album = page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E', exact: true });
    await album.locator('.pt-as-share-btn').click();
    const prompt = page.locator('dialog[data-app-message]');
    await expect(prompt).toBeVisible();
    await expect(prompt.locator('input')).toHaveValue(/\/phap-thoai\?album=/u);
    await expect(prompt.locator('input')).toBeFocused();
    expect(await prompt.evaluate(element => getComputedStyle(element).backdropFilter)).toContain('blur(');
    await prompt.screenshot({ path: test.info().outputPath('app-prompt-glass.png') });
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await expect(album).toBeVisible();
    await expect(album.locator('.pt-as-share-btn')).toBeFocused();
  });

  test('shows MB before confirming and starts the transfer only after consent', async ({ page }) => {
    await loginAsMember(page);
    await page.route(/\/api\/talks(?:\?|$)/u, (route) => route.fulfill({ json: [{
      id: 'e2e-sized-talk', tieu_de: 'Album dung lượng kiểm thử', chu_de: 'Pháp ngữ',
      tracks: [{ title: 'Bài kiểm thử', url: 'https://archive.org/download/e2e-sized/track.mp3' }],
      visibility: 'public',
    }] }));
    let metadataRequests = 0;
    let mediaRequests = 0;
    await page.route('https://archive.org/metadata/e2e-sized/files', (route) => {
      metadataRequests++;
      return route.fulfill({ json: { result: [{ name: 'track.mp3', size: '2500000' }] } });
    });
    await page.route('https://archive.org/download/e2e-sized/track.mp3', (route) => {
      mediaRequests++;
      return route.fulfill({ body: 'test audio', contentType: 'audio/mpeg' });
    });
    await page.goto('/phap-thoai');
    await settleClient(page);
    await page.getByRole('button', { name: 'Xem chi tiết album Album dung lượng kiểm thử' }).click();
    await page.getByRole('button', { name: 'Tải Offline', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Tải album để nghe offline?' });
    await expect(confirmation).toContainText('2,5 MB');
    const confirmationBounds = await confirmation.boundingBox();
    expect(confirmationBounds).not.toBeNull();
    expect(Math.abs(confirmationBounds!.x + confirmationBounds!.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
    expect(Math.abs(confirmationBounds!.y + confirmationBounds!.height / 2 - page.viewportSize()!.height / 2)).toBeLessThan(2);
    expect(metadataRequests).toBe(1);
    expect(mediaRequests).toBe(0);
    await page.screenshot({ path: `test-results/offline-confirm-${test.info().project.name}.png` });
    await confirmation.getByRole('button', { name: 'Có, tải offline' }).click();
    await expect.poll(() => mediaRequests).toBe(1);
    await expect(confirmation).toHaveCount(0);
  });

  test('keeps playback active when navigating away from Pháp Thoại', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);

    const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    const homeLink = page.locator('.nav-logo[href="/"]');
    await card.getByRole('button', { name: /^Phát album / }).click();
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();

    // The final catalog row must be reachable above the docked player.
    await expect.poll(() => page.locator('.qts-shell').evaluate(shell => {
      const bar = document.querySelector('.pt-mini-player')!;
      const reserved = parseFloat(getComputedStyle(shell).paddingBottom) + parseFloat(getComputedStyle(document.body).paddingBottom);
      return reserved >= Math.ceil(bar.getBoundingClientRect().height + parseFloat(getComputedStyle(bar).bottom));
    })).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const catalogBottom = await page.locator('.album-grid').evaluate(grid => grid.getBoundingClientRect().bottom);
    expect(catalogBottom).toBeLessThanOrEqual((await player.boundingBox())!.y + 1);

    await homeLink.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('dialog', { name: 'Rời Pháp thoại?' })).toHaveCount(0);
    await expect(player).toContainText('Tiếng mõ kiểm thử');
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
    await expect(page.locator('.qts-shell')).toHaveClass(/qts-shell--audio-active/);
    await expect.poll(() => page.locator('.qts-shell').evaluate(shell => {
      const bar = document.querySelector('.pt-mini-player')!;
      return parseFloat(getComputedStyle(shell).paddingBottom) + parseFloat(getComputedStyle(document.body).paddingBottom)
        >= Math.ceil(bar.getBoundingClientRect().height + parseFloat(getComputedStyle(bar).bottom));
    })).toBe(true);
    await player.getByRole('button', { name: 'Ẩn khung phát âm thanh', exact: true }).click();
    const restore = page.getByRole('complementary', { name: 'Khôi phục thanh phát Pháp Thoại', exact: true });
    await expect(restore).toBeVisible();
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => restore.evaluate(bar => {
        const shell = bar.closest('.qts-shell')!;
        return parseFloat(getComputedStyle(shell).paddingBottom) + parseFloat(getComputedStyle(document.body).paddingBottom)
          >= Math.ceil(bar.getBoundingClientRect().height + parseFloat(getComputedStyle(bar).bottom));
      })).toBe(true);
    }
  });

  test('keeps playback mounted through browser Back navigation', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/');
    await settleClient(page);
    await page.locator('a[href="/phap-thoai"]:visible').first().click();
    await expect(page).toHaveURL(/\/phap-thoai$/);

    const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    await card.getByRole('button', { name: /^Phát album / }).click();
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();

    await page.evaluate(() => history.back());
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('dialog', { name: 'Rời Pháp thoại?' })).toHaveCount(0);
    await expect(player).toContainText('Tiếng mõ kiểm thử');
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
  });

  test('keeps playback mounted through browser Forward navigation', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/');
    await settleClient(page);
    await page.locator('a[href="/phap-thoai"]:visible').first().click();
    await expect(page).toHaveURL(/\/phap-thoai$/);
    await page.locator('.nav-logo[href="/"]').click();
    await expect(page).toHaveURL('/');
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(/\/phap-thoai$/);

    const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    await card.getByRole('button', { name: /^Phát album / }).click();
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();

    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('dialog', { name: 'Rời Pháp thoại?' })).toHaveCount(0);
    await expect(player).toContainText('Tiếng mõ kiểm thử');
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
  });

  test('clears persistent playback and isolates subsequent writes when the principal changes off-route', async ({ page }, testInfo) => {
    const rawToken = audioPrincipalSessions.get(testInfo.project.name);
    if (!rawToken) throw new Error(`Missing audio principal fixture for project: ${testInfo.project.name}`);
    await loginAsAdmin(page, rawToken);
    const userA = await page.evaluate(async () => {
      const response = await fetch('/api/session', { cache: 'no-store' });
      return String((await response.json()).user?.id ?? '');
    });
    expect(userA).not.toBe('');

    await page.goto('/phap-thoai');
    await settleClient(page);
    const album = page.locator('article').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    await album.getByRole('button', { name: /^Phát album / }).click();
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
    await page.locator('.nav-logo[href="/"]').click();
    await expect(page).toHaveURL('/');
    await expect(player).toContainText('Tiếng mõ kiểm thử');

    const userAStateKey = principalStorageKey(userA, 'tutam_pt_state');
    const userARecentKey = principalStorageKey(userA, 'tutam_recent_albums');
    const guestStateKey = principalStorageKey(null, 'tutam_pt_state');
    const guestRecentKey = principalStorageKey(null, 'tutam_recent_albums');
    await logoutThroughAccount(page);

    await expect(player).toHaveCount(0);
    const isolated = await page.evaluate((keys) => ({
      guestRecent: localStorage.getItem(keys.guestRecent),
      guestState: localStorage.getItem(keys.guestState),
      userARecent: localStorage.getItem(keys.userARecent),
      userAState: localStorage.getItem(keys.userAState),
    }), {
      guestRecent: guestRecentKey,
      guestState: guestStateKey,
      userARecent: userARecentKey,
      userAState: userAStateKey,
    });
    expect(JSON.parse(isolated.userAState ?? '{}').albumId).toBe('e2e-talk');
    expect(JSON.parse(isolated.userARecent ?? '[]')).toContain('e2e-talk');
    expect(isolated.guestState).toBeNull();
    expect(isolated.guestRecent).toBeNull();

    await page.locator('a[href="/phap-thoai"]:visible').first().click();
    await expect(page).toHaveURL(/\/phap-thoai$/);
    const guestAlbum = page.locator('article').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    await guestAlbum.getByRole('button', { name: /^Phát album / }).click();
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
    const afterGuestWrite = await page.evaluate((keys) => ({
      guestState: localStorage.getItem(keys.guestState),
      userAState: localStorage.getItem(keys.userAState),
    }), { guestState: guestStateKey, userAState: userAStateKey });
    expect(afterGuestWrite.userAState).toBe(isolated.userAState);
  });

  test('saved album position opens the legacy resume prompt with every dismissal path', async ({ page }) => {
    await loginAsMember(page);
    test.setTimeout(60_000);
    const savedPosition = {
      albumId: 'e2e-talk',
      trackIndex: 0,
      pos: 10,
      savedAt: Date.now(),
      albumTitle: 'Pháp thoại kiểm thử E2E',
      trackTitle: 'Tiếng mõ kiểm thử',
    };

    await page.goto('/phap-thoai');
    await settleClient(page);

    const saveResumePosition = () => page.evaluate((position) => {
      localStorage.setItem(position.key, JSON.stringify(position.value));
    }, {
      key: memberStorageKey(`tutam_pt_pos_${savedPosition.albumId}`),
      value: savedPosition,
    });
    const openAlbum = async () => {
      await saveResumePosition();
      await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E' }).click();
      await expect(page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' })).toBeVisible();
      const prompt = page.getByRole('dialog', { name: 'Tiếp tục nghe pháp thoại' });
      await expect(prompt).toBeVisible();
      return prompt;
    };
    const closeAlbum = async () => {
      await page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' })
        .getByRole('button', { name: 'Quay lại' }).click();
    };

    let prompt = await openAlbum();
    await expect(prompt).toBeFocused();
    await expect(prompt).toContainText('Đang nghe dở: Tiếng mõ kiểm thử');
    await expect(prompt).toContainText('Đến phút 0:10');
    await expect(prompt).toHaveCSS('transition-duration', '0.28s, 0.28s');
    const promptBox = await prompt.boundingBox();
    const viewport = page.viewportSize()!;
    expect(promptBox?.width).toBeCloseTo(340, 0);
    if (viewport.width <= 768) {
      expect(promptBox!.y + promptBox!.height / 2).toBeCloseTo(viewport.height / 2, 0);
    } else {
      expect(viewport.height - promptBox!.y - promptBox!.height).toBeCloseTo(90, 0);
    }
    await expect(prompt.getByRole('button', { name: 'Không, nghe từ đầu' })).toBeVisible();
    await expect(prompt.getByRole('button', { name: 'Có, nghe tiếp ▶' })).toBeVisible();
    await prompt.getByRole('button', { name: 'Đóng đề nghị nghe tiếp' }).click();
    await expect(prompt).toHaveCount(0);
    await closeAlbum();

    prompt = await openAlbum();
    await prompt.getByRole('button', { name: 'Có, nghe tiếp ▶' }).click();
    await expect(prompt).toHaveCount(0);
    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    await expect(player).toContainText('Tiếng mõ kiểm thử');
    const progress = player.getByRole('slider', { name: 'Vị trí phát' });
    await closeAlbum();

    await saveResumePosition();
    await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E' }).click();
    await expect(page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' })).toBeVisible();
    await page.waitForTimeout(700);
    await expect(page.getByRole('dialog', { name: 'Tiếp tục nghe pháp thoại' })).toHaveCount(0);
    await closeAlbum();
    await player.getByRole('button', { name: 'Tạm dừng' }).click();

    prompt = await openAlbum();
    await prompt.getByRole('button', { name: 'Không, nghe từ đầu' }).click();
    await expect(prompt).toHaveCount(0);
    await expect(progress).toHaveValue('0');
    const albumDialog = page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' });
    await albumDialog.getByRole('button', { name: 'Phát Tiếng mõ kiểm thử' }).click();
    await expect(player).toContainText('0:00');
    await closeAlbum();
    await player.getByRole('button', { name: 'Tạm dừng' }).click();

    prompt = await openAlbum();
    // openAlbum already proves it is visible. Observe automatic dismissal
    // without racing a visibility assertion against the 15-second deadline.
    await expect(prompt).toHaveCount(0, { timeout: 20_000 });
    await expect(progress).toHaveValue('0');
    await expect(page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' })).toBeVisible();
    await closeAlbum();

    await saveResumePosition();
    const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    await card.getByRole('button', { name: /^Phát album / }).click();
    await expect(card).toHaveClass(/now-playing/);
    await expect(player).toContainText('Tiếng mõ kiểm thử');
    await player.getByRole('button', { name: 'Tạm dừng' }).click();

    await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      const position = raw ? JSON.parse(raw) : {};
      localStorage.setItem(key, JSON.stringify({ ...position, pos: 9.9, savedAt: Date.now() }));
    }, memberStorageKey('tutam_pt_pos_e2e-talk'));
    await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E' }).click();
    await expect(page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' })).toBeVisible();
    await page.waitForTimeout(700);
    await expect(page.getByRole('dialog', { name: 'Tiếp tục nghe pháp thoại' })).toHaveCount(0);
    await closeAlbum();

    await saveResumePosition();
    await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E' }).click();
    await closeAlbum();
    await page.waitForTimeout(700);
    await expect(page.getByRole('dialog', { name: 'Tiếp tục nghe pháp thoại' })).toHaveCount(0);
  });

  test('album row keeps portrait artwork, publication date and readable metadata at every viewport', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);

    const card = page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    const thumb = card.locator('.pt-card-thumb');
    await expect(card).toBeVisible();
    await expect(card.locator('.pt-card-topic')).toBeVisible();
    await expect(card.locator('.pt-card-date')).toBeVisible();
    await expect(card.locator('.pt-card-date')).toContainText('31/07/2026');
    await expect(card.locator('.pt-card-meta')).toContainText('lượt phát');
    await expect(card.locator('.pt-card-meta-count')).toHaveText('♫ 1 bài');
    const metadataRows = card.locator('.pt-card-meta-row');
    await expect(metadataRows).toHaveCount(2);
    await expect(metadataRows.nth(0)).toContainText('Chưa xác định');
    await expect(metadataRows.nth(1)).toContainText('lượt phát');
    await expect(card.getByRole('button', { name: /^Phát album / })).toBeVisible();

    const [cardBox, thumbBox] = await Promise.all([card.boundingBox(), thumb.boundingBox()]);
    expect(cardBox).not.toBeNull();
    expect(thumbBox).not.toBeNull();
    expect(thumbBox!.width).toBeCloseTo(80, 0);
    expect(thumbBox!.height).toBeGreaterThanOrEqual(120);
    expect(cardBox!.width).toBeCloseTo((await page.locator('.album-grid').boundingBox())!.width, 0);
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const [primaryMetadata, secondaryMetadata] = await Promise.all([
      metadataRows.nth(0).boundingBox(), metadataRows.nth(1).boundingBox(),
    ]);
    expect(primaryMetadata).not.toBeNull();
    expect(secondaryMetadata).not.toBeNull();
    expect(secondaryMetadata!.y).toBeGreaterThanOrEqual(primaryMetadata!.y + primaryMetadata!.height);
    expect(secondaryMetadata!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(secondaryMetadata!.x + secondaryMetadata!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);

    await card.getByRole('button', { name: /^Phát album / }).click();
    await expect(card).toHaveClass(/now-playing/);
  });

  test('album card body opens detail with pointer and keyboard without hijacking direct playback', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);

    const albumName = 'Pháp thoại kiểm thử E2E';
    const card = page.locator('.pt-card').filter({ hasText: albumName });
    const dialog = page.getByRole('dialog', { name: albumName });
    const bodyOpener = card.getByRole('button', { name: `Xem chi tiết album ${albumName}` });
    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    const titleBox = await card.locator('.pt-card-title').boundingBox();
    expect(titleBox).not.toBeNull();

    await page.mouse.click(
      titleBox!.x + titleBox!.width / 2,
      titleBox!.y + titleBox!.height / 2,
    );
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Quay lại' }).click();

    await bodyOpener.focus();
    await bodyOpener.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Quay lại' }).click();
    await expect(bodyOpener).toBeFocused();

    await card.getByRole('button', { name: /^Phát album / }).click();
    await expect(card).toHaveClass(/now-playing/);
    await expect(dialog).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();

    await bodyOpener.focus();
    await bodyOpener.press('Space');
    await expect(dialog).toBeVisible();
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Quay lại' }).click();
  });

  test('album detail matches the production full-screen anatomy', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);

    await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E' }).click();
    const albumScreen = page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' });
    await expect(albumScreen).toBeVisible();
    await expect(albumScreen.getByRole('button', { name: 'Quay lại' })).toBeVisible();
    await expect(albumScreen.getByRole('button', { name: /Yêu thích/ })).toBeVisible();
    await expect(albumScreen.getByRole('button', { name: /Chia sẻ/ })).toBeVisible();
    await expect(albumScreen.getByRole('button', { name: /Tải Offline/ })).toBeVisible();
    await expect(albumScreen.locator('.pt-as-track-dl-btn')).toBeVisible();
    await expect(albumScreen.locator('.pt-as-album-banner')).toContainText('Pháp thoại kiểm thử E2E');
    await expect(albumScreen.locator('.pt-as-track-item')).toHaveCount(1);
    await expect(albumScreen).toHaveCSS('transform', 'none');

    const box = await albumScreen.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.x).toBeCloseTo(0, 0);
    expect(box?.y).toBeCloseTo(0, 0);
    expect(box?.width).toBeCloseTo(viewport!.width, 0);
    const bottomNav = page.locator('.qts-bottom-nav');
    const navBox = await bottomNav.isVisible() ? await bottomNav.boundingBox() : null;
    expect(Math.abs(box!.height - (navBox ? navBox.y : viewport!.height))).toBeLessThanOrEqual(1);

    const trackItem = albumScreen.locator('.pt-as-track-item');
    const trackMain = albumScreen.locator('.pt-as-track-main');
    const trackDownload = albumScreen.locator('.pt-as-track-dl-btn');
    await expect(trackItem).toHaveCSS('gap', '8px');
    await expect(trackItem).toHaveCSS('padding', viewport!.width <= 600 ? '8px 10px' : '9px 12px');
    await expect(trackMain).toHaveCSS('padding', '0px');
    expect((await trackDownload.boundingBox())?.height).toBeCloseTo(34, 0);

    if (viewport!.width > 480) {
      const [headerBox, actionRowBox, actionBox, bannerBox] = await Promise.all([
        albumScreen.locator('.pt-as-header').boundingBox(),
        albumScreen.locator('.pt-as-header-row2').boundingBox(),
        albumScreen.locator('.pt-as-btn-offline').boundingBox(),
        albumScreen.locator('.pt-as-album-banner').boundingBox(),
      ]);
      expect(headerBox!.height).toBeGreaterThanOrEqual(100);
      expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(bannerBox!.y + 1);
      // Giữ vùng chạm tối thiểu 44px theo AGENTS 4.6, không ép về bố cục 38px cũ.
      expect(actionRowBox!.height).toBeGreaterThanOrEqual(44);
      expect(actionRowBox!.height).toBeLessThanOrEqual(headerBox!.height);
      expect(actionBox!.height).toBeGreaterThanOrEqual(44);
      expect(actionBox!.height).toBeLessThanOrEqual(actionRowBox!.height);
      await expect(albumScreen.locator('.pt-as-album-info')).toContainText('lượt phát');
      expect(bannerBox!.height).toBeGreaterThanOrEqual(80);
    }

    await albumScreen.locator('.pt-as-track-item').click();
    await expect(albumScreen.locator('.pt-as-track-item')).toHaveClass(/active/);
    await expect(page.getByRole('region', { name: 'Trình phát Pháp Thoại' })).toBeVisible();
  });

  test('member can browse and start playback', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);

    await expect(page.getByRole('heading', { name: 'Kho Pháp Thoại' })).toBeVisible();
    const filters = page.getByRole('button', { name: 'Tìm kiếm và bộ lọc', exact: true });
    await expect(filters).toHaveAttribute('aria-expanded', 'false');
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: /Tất cả/i })).toBeVisible();

    const album = page.locator('article').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    await expect(album).toBeVisible();
    await album.getByRole('button', { name: /^Phát album / }).click();
    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    await expect(player).toContainText('Tiếng mõ kiểm thử');
    const thumb = player.locator('.pt-mp-thumb');
    const artwork = player.locator('.pt-mp-art-img');
    await expect(artwork).toBeVisible();
    await expect(artwork).toHaveCSS('position', 'absolute');
    await expect(artwork).toHaveCSS('object-position', '35% 70%');
    expect(await artwork.boundingBox()).toEqual(await thumb.boundingBox());
    if ((page.viewportSize()?.width ?? 0) <= 480) {
      await expect(player.getByLabel('Âm lượng')).toBeHidden();
      await expect(player.getByRole('button', { name: 'Hẹn giờ tắt' })).toBeHidden();
    } else {
      await expect(player.getByLabel('Âm lượng')).toBeVisible();
      await expect(player.getByRole('button', { name: 'Hẹn giờ tắt' })).toBeVisible();
      await player.getByRole('button', { name: 'Hẹn giờ tắt' }).click();
      await expect(player.getByRole('menu', { name: 'Hẹn giờ tắt nhạc' })).toBeVisible();
      const headingBox = await page.getByRole('heading', { name: 'Kho Pháp Thoại' }).boundingBox();
      expect(headingBox).not.toBeNull();
      // Dialog ở top layer nhận cú bấm ngoài menu; không bấm xuyên lớp modal vào heading.
      await page.mouse.click(headingBox!.x + headingBox!.width / 2, headingBox!.y + headingBox!.height / 2);
      await expect(player.getByRole('menu', { name: 'Hẹn giờ tắt nhạc' })).toHaveCount(0);
    }
  });

  test('failed mini-player artwork reveals the legacy music-note fallback', async ({ page }) => {
    await loginAsMember(page);
    await page.route('**/assets/branding/tu-tap-logo.png', (route) => route.abort());
    await page.goto('/phap-thoai');
    await settleClient(page);
    const album = page.locator('article').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    await album.getByRole('button', { name: /^Phát album / }).click();

    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    await expect(player.locator('.pt-mp-art-img')).toHaveCount(0);
    await expect(player.locator('.pt-mp-thumb > span')).toBeVisible();
  });

  test('exposes seek controls and application-wide keyboard shortcuts', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/phap-thoai');
    await settleClient(page);
    const album = page.locator('article').filter({ hasText: 'Pháp thoại kiểm thử E2E' });
    await album.getByRole('button', { name: /^Phát album / }).click();

    const player = page.getByRole('region', { name: 'Trình phát Pháp Thoại' });
    await expect(player).toBeVisible();
    const progress = player.getByRole('slider', { name: 'Vị trí phát' });
    await player.getByRole('button', { name: 'Tạm dừng' }).click();
    await progress.fill('1');

    const expand = player.getByRole('button', {name:'Mở rộng trình phát Pháp Thoại',exact:true});
    const detail = page.getByRole('dialog',{name:'Chi tiết trình phát Pháp Thoại'});
    let controls = player;
    if (await expand.isVisible()) {
      await expand.click();
      await expect(detail).toBeVisible();
      controls = detail;
    }
    await controls.getByRole('button', { name: 'Lùi 10 giây' }).click();
    await expect(progress).toHaveValue('0');
    await controls.getByRole('button', { name: 'Tua tới 30 giây' }).click();
    await expect(progress).toHaveValue('30');
    if (await detail.isVisible()) await detail.getByRole('button',{name:'Thu nhỏ trình phát',exact:true}).click();

    await page.locator('#main-content').focus();
    await page.keyboard.press('Space');
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
    await page.keyboard.press('m');
    await expect(player.getByRole('status')).toHaveText('Âm thanh đang tắt');
    if ((page.viewportSize()?.width ?? 0) > 480) {
      await expect(player.getByRole('button', { name: 'Bật âm' })).toBeVisible();
    }

    const search = page.getByRole('searchbox').first();
    await search.focus();
    await page.keyboard.press('Space');
    await expect(player.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();
  });

  test('guest album access opens the same OAuth login as the shared shell', async ({ page }) => {
    await page.goto('/');
    await settleClient(page);

    await page.getByRole('button', { name: 'Đăng nhập ngay', exact: true }).click();
    await expect(page).toHaveURL(/\/ca-nhan\?tab=account/);
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng Facebook', exact: true })).toBeVisible();

    await page.goto('/phap-thoai');
    await settleClient(page);

    await page.getByRole('button', { name: 'Mở album Pháp thoại kiểm thử E2E' }).click();
    const albumDialog = page.getByRole('dialog', { name: 'Pháp thoại kiểm thử E2E' });
    await expect(albumDialog).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('quangtu:login-required')));
    await expect(page).toHaveURL(/\/ca-nhan\?tab=account/);
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng Facebook', exact: true })).toBeVisible();
  });
});

test.describe('Pháp Thoại admin async editing', () => {
  test('save keeps its original draft and does not mark later edits as saved', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/phap-thoai');
    await settleClient(page);
    await page.getByRole('button', { name: 'Tạo album', exact: true }).click();

    const originalTitle = `Album snapshot ${Date.now()}`;
    const laterTitle = `${originalTitle} — chỉnh trong lúc lưu`;
    await page.getByLabel('Tên album').fill(originalTitle);
    await page.getByLabel('ID').fill(`talk-${Date.now()}`);
    await page.getByLabel(/Danh sách track/).fill('Bài snapshot | content/e2e-snapshot.mp3');

    let releaseSave!: () => void;
    let saveStarted!: () => void;
    const saveGate = new Promise<void>((resolve) => releaseSave = resolve);
    const saveRequestStarted = new Promise<void>((resolve) => saveStarted = resolve);
    await page.route('**/api/talks', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      saveStarted();
      await saveGate;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'e2e-snapshot-album' }] }),
      });
    });

    const createRequest = page.waitForRequest((request) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/talks'
    );
    const editorModal = page.locator('.editor');
    await editorModal.getByRole('button', { name: 'Tạo album', exact: true }).click();
    await saveRequestStarted;
    await expect(editorModal.locator('select')).toBeDisabled();
    await editorModal.getByLabel('Tên album').fill(laterTitle);

    releaseSave();
    const payload = (await createRequest).postDataJSON();
    expect(payload.tieu_de).toBe(originalTitle);

    await expect(editorModal.getByRole('status').filter({ hasText: 'Đã tạo album mới.' })).toBeVisible();
    await expect(editorModal.getByLabel('Tên album')).toHaveValue(laterTitle);
    await expect(editorModal.locator('.dirty-status')).toHaveText('Có thay đổi chưa lưu.');
  });
});
