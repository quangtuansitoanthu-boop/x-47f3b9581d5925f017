import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.goto('/huong-dan#cong-cu-tu-tap', { waitUntil: 'networkidle' });
});

test('guide confirmation traps focus and Escape returns to its link without navigation', async ({ page }) => {
  const trigger = page.locator('#cong-cu-tu-tap .guide-link-card a[href="/tu-tap?mode=le-phat"]');
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.locator('.guide-confirm-dialog');
  await expect(dialog).toBeVisible();
  const cancel = dialog.locator('.guide-btn-cancel');
  const confirm = dialog.locator('.guide-btn-confirm');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/huong-dan#cong-cu-tu-tap$/);
});

test('guide confirmation native cancel and backdrop both close without following its destination', async ({ page }) => {
  const trigger = page.locator('#cong-cu-tu-tap .guide-link-card a[href="/tu-tap?mode=le-phat"]');
  await trigger.click();
  const modal = page.locator('.guide-confirm-scrim');
  await expect(modal).toBeVisible();
  await modal.evaluate((element) => element.dispatchEvent(new Event('cancel', { cancelable: true })));
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/huong-dan#cong-cu-tu-tap$/);

  await trigger.click();
  await expect(modal).toBeVisible();
  await modal.click({ position: { x: 4, y: 4 } });
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/huong-dan#cong-cu-tu-tap$/);
});

test('guide confirmation still follows the selected destination only after confirmation', async ({ page }) => {
  const trigger = page.locator('#cong-cu-tu-tap .guide-link-card a[href="/tu-tap?mode=le-phat"]');
  await trigger.click();
  await page.locator('.guide-confirm-dialog .guide-btn-confirm').click();
  await expect(page).toHaveURL(/\/tu-tap\?mode=le-phat$/);
  await expect(page.locator('.guide-confirm-scrim')).toHaveCount(0);
});
