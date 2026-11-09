import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }, { width: 667, height: 375 }, { width: 1440, height: 900 }]) {
  test(`expanded player controls stay reachable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem('tutam_locale', 'vi');
      localStorage.setItem('quangtu_principal_v1:anonymous:quangtu_practice_session_outbox_v1', JSON.stringify([{
        id: 'start:pending-player', kind: 'start', clientSessionId: 'pending-player', queuedAt: new Date().toISOString(),
        payload: { clientSessionId: 'pending-player', activityType: 'meditation', targetDurationSeconds: 60,
          targetCount: null, sourceKind: null, sourceId: null, startedAt: new Date().toISOString(), idempotencyKey: 'pending-player' },
      }]));
    });
    await page.route('**/api/talks?**', route => route.fulfill({ json: [{
      id: 'e2e-talk', tieu_de: 'Pháp thoại kiểm thử E2E', mo_ta: 'Album kiểm tra bố cục',
      visibility: 'public', tracks: [{ title: 'Âm thanh kiểm thử', url: '/assets/audio/ambient/tieng-mua-roi.mp3', duration_sec: 60 }],
    }] }));
    await page.goto('/phap-thoai');
    await settleClient(page);
    await page.locator('.pt-card').filter({ hasText: 'Pháp thoại kiểm thử E2E' }).getByRole('button', { name: /^Phát album / }).click();
    const notice = page.locator('[data-practice-sync-status]');
    await expect(notice).toBeVisible();
    await expect.poll(async () => {
      const banner = await notice.boundingBox();
      const player = await page.locator('.pt-mini-player').boundingBox();
      return Boolean(banner && player && banner.y + banner.height <= player.y);
    }).toBe(true);
    expect((await notice.boundingBox())!.height).toBeLessThan(viewport.height / 2);
    await page.screenshot({ path: testInfo.outputPath('pending-sync-and-player.png') });
    await page.getByRole('button', { name: 'Mở rộng trình phát Pháp Thoại', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Chi tiết trình phát Pháp Thoại', exact: true });
    await expect(dialog).toBeVisible();
    const transport = dialog.locator('.pt-fp-controls-row');
    await transport.scrollIntoViewIfNeeded();
    const transportGeometry = await transport.evaluate(element => {
      const box = element.getBoundingClientRect();
      const first = element.querySelector('button')!.getBoundingClientRect();
      const last = element.querySelector('button:last-child')!.getBoundingClientRect();
      return { left: box.left, right: box.right, center: box.x + box.width / 2, controlsCenter: (first.left + last.right) / 2, viewport: innerWidth };
    });
    expect(transportGeometry.left).toBeGreaterThanOrEqual(0);
    expect(transportGeometry.right).toBeLessThanOrEqual(viewport.width);
    expect(transportGeometry.center).toBeCloseTo(transportGeometry.viewport / 2, 0);
    expect(transportGeometry.controlsCenter).toBeCloseTo(transportGeometry.center, 0);
    const play = dialog.getByRole('button', { name: 'Tạm dừng', exact: true });
    await play.scrollIntoViewIfNeeded();
    const accessible = await play.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    expect(accessible).toBe(true);
    await play.click();
    await expect(dialog.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();
    const timer = dialog.getByRole('button', { name: 'Hẹn giờ tắt nghe Pháp', exact: true });
    await timer.click();
    const option = dialog.getByRole('button', { name: '2 giờ', exact: true });
    await expect(option).toBeVisible();
    await option.click();
    await expect(timer).toContainText('2:00:00');
    const utilities = dialog.locator('.pt-fp-utilities');
    await utilities.scrollIntoViewIfNeeded();
    const utilityHeights = await utilities.locator('.pt-fp-pill-btn').evaluateAll(elements =>
      elements.map(element => element.getBoundingClientRect().height));
    expect(Math.max(...utilityHeights) - Math.min(...utilityHeights)).toBeLessThanOrEqual(1);
    const speed = dialog.getByRole('button', { name: 'Chọn tốc độ phát', exact: true });
    await speed.click();
    await expect(dialog.locator('.pt-fp-dropdown:not(.timer)')).toBeVisible();
    await page.keyboard.press('Escape');
    await timer.click();
    await expect(dialog.locator('.pt-fp-dropdown')).toHaveCount(1);
    await expect(dialog.locator('.pt-fp-dropdown.timer')).toBeVisible();
    const timerMenuBox = await dialog.locator('.pt-fp-dropdown.timer').boundingBox();
    expect(timerMenuBox).not.toBeNull();
    expect(timerMenuBox!.x).toBeGreaterThanOrEqual(0);
    expect(timerMenuBox!.x + timerMenuBox!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath('expanded-player-timer.png') });
    await page.keyboard.press('Escape');
    await expect(dialog.locator('.pt-fp-dropdown')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(timer).toBeFocused();
    await speed.click();
    const speedMenuBox = await dialog.locator('.pt-fp-dropdown:not(.timer)').boundingBox();
    expect(speedMenuBox).not.toBeNull();
    expect(speedMenuBox!.x).toBeGreaterThanOrEqual(0);
    expect(speedMenuBox!.x + speedMenuBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(speedMenuBox!.width).toBeCloseTo(timerMenuBox!.width, 0);
    await page.screenshot({ path: testInfo.outputPath('expanded-player-speed.png') });
    await dialog.getByRole('button', { name: '1.5×', exact: true }).click();
    await expect(speed).toContainText('1.5×');
    await expect(speed).toBeFocused();
    await speed.click();
    await dialog.locator('.rosary-select__dialog').click({ position: { x: 2, y: 2 } });
    await expect(dialog.locator('.pt-fp-dropdown')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Trình phát Pháp Thoại' })).toBeVisible();
  });
}
