import { expect, test } from '@playwright/test';
import { solarToLunar } from '../../src/lib/components/lunar/lunar-calendar';

test('personal event date-only draft survives reopen and calendar tabs preserve the chosen date', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 6, 10));
  await page.route('**/api/**', route => route.abort('failed'));
  await page.goto('/');
  await page.locator('.personal-add-first-btn').click();
  await page.locator('#pem-select-day').selectOption('6');
  await page.locator('#pem-select-month').selectOption('3');
  await page.keyboard.press('Escape');
  await page.locator('.personal-add-first-btn').click();
  await expect(page.locator('#pem-select-day')).toHaveValue('6');
  await expect(page.locator('#pem-select-month')).toHaveValue('3');
  await page.getByRole('tab', { name: '☀️ Nhập theo Dương lịch' }).click();
  const solarDay = Number(await page.locator('#pem-solar-day').inputValue());
  const solarMonth = Number(await page.locator('#pem-solar-month').inputValue());
  expect(solarToLunar(solarDay, solarMonth, 2026)).toMatchObject({ day: 6, month: 3 });
  await page.getByRole('tab', { name: '🌙 Nhập theo Âm lịch' }).click();
  await expect(page.locator('#pem-select-day')).toHaveValue('6');
  await expect(page.locator('#pem-select-month')).toHaveValue('3');
});

test.describe('personal anniversary validation and current date', () => {
  test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
  for (const locale of ['vi', 'en']) {
    test(`missing fields show an alert, focus the field and never save (${locale})`, async ({ page }, info) => {
      await page.setViewportSize({ width: locale === 'vi' ? 375 : 1440, height: 900 });
      await page.clock.setFixedTime(new Date('2026-11-06T17:30:00Z'));
      await page.addInitScript(lang => {
        localStorage.setItem('tutam_locale', lang);
        localStorage.setItem('tutam_dark_mode', lang === 'vi' ? '0' : '1');
      }, locale);
      let writes = 0;
      await page.route('**/api/**', route => {
        if (route.request().method() === 'POST' && new URL(route.request().url()).pathname === '/api/personal-events') writes++;
        return route.abort('failed');
      });
      await page.goto('/');
      await page.locator('.personal-add-first-btn').click();
      await expect(page.locator('#pem-select-day')).toHaveValue('29');
      await expect(page.locator('#pem-select-month')).toHaveValue('9');
      const submit = page.locator('.pem-form button[type="submit"]');
      await page.locator('#pem-input-title').fill('   ');
      await submit.click();
      const alert = page.locator('[data-app-message]');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(locale === 'vi' ? 'Tên ngày lễ / Sự kiện' : 'Event Name / Title');
      await alert.screenshot({ path: info.outputPath('missing-title.png') });
      await alert.getByRole('button').click();
      await expect(page.locator('#pem-input-title')).toBeFocused();
      await expect(page.locator('.pem-list')).toHaveCount(0);
      await page.locator('#pem-input-title').fill('Ngày thử nghiệm');
      await page.getByRole('tab', { name: locale === 'vi' ? '☀️ Nhập theo Dương lịch' : '☀️ Solar Input' }).click();
      await expect(page.locator('#pem-solar-day')).toHaveValue('7');
      await expect(page.locator('#pem-solar-month')).toHaveValue('11');
      await page.locator('#pem-solar-day').selectOption('31');
      await page.locator('#pem-solar-month').selectOption('2');
      await submit.click();
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(locale === 'vi' ? 'Ngày dương lịch không hợp lệ' : 'Invalid solar date');
      await alert.getByRole('button').click();
      await expect(page.locator('#pem-solar-day')).toBeFocused();
      await expect(page.locator('#pem-input-title')).toHaveValue('Ngày thử nghiệm');
      await expect(page.locator('.pem-list')).toHaveCount(0);
      expect(writes).toBe(0);
      // A valid date saves with an empty optional note through the existing owner.
      await page.locator('#pem-solar-day').selectOption('7');
      await page.locator('#pem-solar-month').selectOption('11');
      await submit.click();
      await expect(page.locator('.pem-list')).toContainText('Ngày thử nghiệm');
    });
  }
});

test('keeps failed anniversary writes, retries with CSRF, and isolates the next account', async ({ page }) => {
  let failWrites = true;
  let account = 'events-qa-A';
  let remoteEvents: unknown[] = [];
  const writes: Array<{ headers: Record<string, string>; body: any }> = [];
  const session = (id: string) => ({ authenticated: true, user: { id, email: 'qa@example.test', displayName: 'Quang Từ', avatarUrl: '', role: 'user' }, csrfToken: 'real-test-csrf', expiresAt: '2099-01-01T00:00:00Z' });
  await page.addInitScript((saved) => {
    // This fixture restores a native cache; web SSR trusts its server cookie.
    const runtime = window as unknown as { Capacitor?: Record<string, unknown>; CapacitorCustomPlatform: { name: string } };
    runtime.CapacitorCustomPlatform = { name: 'android' };
    runtime.Capacitor = { ...runtime.Capacitor, isNativePlatform: () => true };
    if (!localStorage.getItem('tutam_native_session')) localStorage.setItem('tutam_native_session', JSON.stringify(saved));
    localStorage.setItem('tutam_locale', 'vi');
  }, session(account));
  await page.route('**/api/session', route => route.fulfill({ json: session(account) }));
  await page.route('**/api/personal-events', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { events: account === 'events-qa-A' ? remoteEvents : [], revision: remoteEvents.length ? 1 : 0 } });
    const body = route.request().postDataJSON();
    writes.push({ headers: route.request().headers(), body });
    if (failWrites) return route.fulfill({ status: 500, json: { error: 'unavailable' } });
    remoteEvents = body.events;
    return route.fulfill({ json: { ok: true, revision: 1 } });
  });
  await page.goto('/');
  await page.locator('.personal-add-first-btn').click();
  await page.locator('#pem-input-title').fill('Kỷ niệm riêng của A');
  await page.locator('.pem-form button[type="submit"]').click();
  await expect(page.locator('.pem-list')).toContainText('Kỷ niệm riêng của A');
  await expect(page.locator('.pem-dialog')).toContainText('Chưa đồng bộ được');
  expect(writes).toHaveLength(1);
  expect(writes[0].headers['x-csrf-token']).toBe('real-test-csrf');
  expect(writes[0].body.ownerId).toBe('events-qa-A');
  failWrites = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect.poll(() => remoteEvents.length).toBe(1);
  await expect(page.locator('.pem-dialog')).not.toContainText('Chưa đồng bộ được');
  account = 'events-qa-B';
  await page.evaluate(saved => localStorage.setItem('tutam_native_session', JSON.stringify(saved)), session(account));
  await page.reload();
  await page.locator('.personal-add-first-btn').click();
  await expect(page.locator('.pem-list')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('tutam_personal_lunar_events:v2:user:events-qa-A'))).toContain('Kỷ niệm riêng của A');
});
