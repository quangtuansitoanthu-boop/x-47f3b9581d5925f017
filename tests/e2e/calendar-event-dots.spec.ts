import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

// 17/02/2026 là Mùng 1 Tết: Thập trai, vía Di Lặc, Thọ Khang và lễ cá nhân minh họa cùng ngày.
const personal = { id: 'calendar-dot-personal', title: 'Kỷ niệm kiểm thử', type: 'gia-dinh', calendarMode: 'solar', solarDay: 17, solarMonth: 2, lunarDay: 1, lunarMonth: 1, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z' };

test('practice reminder remains usable across midnight when its collapsed preference storage is blocked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-02-16T16:58:00Z') });
  await page.addInitScript(() => {
    const key = 'tutam_thaptrai_collapsed_date';
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new DOMException('Preference storage blocked', 'SecurityError');
      return getItem.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Preference storage blocked', 'SecurityError');
      return setItem.call(this, name, value);
    };
    Storage.prototype.removeItem = function (name) {
      if (name === key) throw new DOMException('Preference storage blocked', 'SecurityError');
      return removeItem.call(this, name);
    };
  });
  await page.goto('/tu-tap');
  await settleClient(page);
  const banner = page.locator('.tt-event-banner .thap-trai-banner');
  await expect(banner).toHaveAttribute('aria-expanded', 'false');
  await banner.click();
  await expect(banner.locator('.banner-sub-text')).toContainText('29/12');
  await banner.click();
  await expect(banner).toHaveAttribute('aria-expanded', 'false');
  await banner.click();
  await expect(banner).toHaveAttribute('aria-expanded', 'true');
  await page.clock.fastForward(120_200);
  await expect(banner).toHaveAttribute('aria-expanded', 'false');
  await banner.click();
  await expect(banner.locator('.banner-sub-text')).toContainText('1/1');
  await expect(banner.locator('.daily-reminder-message')).toContainText('Di Lặc');
  expect(errors).toEqual([]);
});

for (const resume of [false, true]) {
  test(`practice reminder updates its lunar date without remounting after ${resume ? 'foreground resume' : 'midnight'}`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-02-16T16:58:00Z') });
    await page.goto('/tu-tap');
    await settleClient(page);
    const banner = page.locator('.tt-event-banner .thap-trai-banner');
    await banner.click();
    await expect(banner).toHaveAttribute('aria-expanded', 'true');
    await expect(banner.locator('.banner-sub-text')).toContainText('29/12');
    if (resume) {
      // Simulate suspended native timers: foreground must refresh from the actual calendar date.
      await page.clock.setSystemTime(new Date('2026-02-17T05:00:00Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    } else {
      await page.clock.fastForward(120_200);
    }
    await expect(banner).toHaveAttribute('aria-expanded', 'false');
    await banner.click();
    await expect(banner.locator('.banner-sub-text')).toContainText('1/1');
    await expect(banner.locator('.daily-reminder-message')).toContainText('Di Lặc');
    await expect(banner.locator('.daily-reminder-message')).not.toContainText('29/12');
    await banner.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tutam_thaptrai_collapsed_date'))).toBe('2026-02-17');
  });
}

for (const dark of [false, true]) {
  test(`home calendar keeps all event categories visible in week and month, dark=${dark}`, async ({ page }, info) => {
    await page.clock.setFixedTime(new Date('2026-02-17T05:00:00Z'));
    await page.setViewportSize({ width: 375, height: 844 });
    await page.addInitScript(({ dark, personal }) => {
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
      localStorage.setItem('tutam_personal_lunar_events', JSON.stringify([personal]));
    }, { dark, personal });
    await page.goto('/');
    await settleClient(page);
    const calendar = page.locator('.weekly-lunar-strip');
    for (const mode of ['week', 'month'] as const) {
      if (mode === 'month') await calendar.locator('.strip-expand-btn').click();
      const cells = calendar.locator(mode === 'week' ? '.day-col' : '.month-day-cell');
      const solarSelector = mode === 'week' ? '.day-solar-num' : '.month-cell-solar';
      const target = cells.filter({ has: page.locator(solarSelector).filter({ hasText: /^17$/ }) });
      await expect(target).toHaveCount(1);
      for (const color of ['gold', 'orange', 'purple', 'red']) await expect(target.locator(`.dot-${color}`)).toHaveCount(1);
      const next = cells.filter({ has: page.locator(solarSelector).filter({ hasText: /^18$/ }) });
      for (const color of ['gold', 'orange', 'purple', 'red']) await expect(next.locator(`.dot-${color}`)).toHaveCount(0);
      await calendar.screenshot({ path: info.outputPath(`${mode}-${dark ? 'dark' : 'light'}.png`) });
      expect(await calendar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await calendar.locator('.strip-expand-btn').click();
    await page.evaluate(() => {
      localStorage.setItem('tutam_personal_lunar_events', '[]');
      window.dispatchEvent(new CustomEvent('quangtu:personal-events-changed'));
    });
    await expect(calendar.locator('.day-col .dot-purple')).toHaveCount(0);
  });
}

for (const dark of [false, true]) {
  test(`personal solar anniversary 18 November is marked after saving and reloading, dark=${dark}`, async ({ page }, info) => {
    await page.clock.setFixedTime(new Date('2026-11-02T05:00:00Z'));
    await page.setViewportSize({ width: 375, height: 844 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
    await page.goto('/');
    await settleClient(page);
    await page.locator('.personal-add-first-btn').click();
    await page.locator('#pem-input-title').fill('Lễ cá nhân kiểm thử 18/11');
    await page.getByRole('tab', { name: /Nhập theo Dương lịch/ }).click();
    await page.locator('#pem-solar-day').selectOption('18');
    await page.locator('#pem-solar-month').selectOption('11');
    await page.locator('#pem-solar-freq').selectOption('yearly');
    await page.locator('.pem-form button[type="submit"]').click();
    await page.locator('.pem-close-btn').click();
    const calendar = page.locator('.weekly-lunar-strip');
    for (const restored of [false, true]) {
      if (restored) { await page.reload(); await settleClient(page); }
      await calendar.locator('.strip-expand-btn').click();
      const target = calendar.locator('.month-day-cell').filter({ has: page.locator('.month-cell-solar').filter({ hasText: /^18$/ }) });
      await expect(target.locator('.dot-purple')).toBeVisible();
      expect(await target.locator('.dot-purple').evaluate(element => {
        const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0;
      })).toBe(true);
    }
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await calendar.evaluate(element => element.scrollIntoView({ block: 'center' }));
      await calendar.screenshot({ path: info.outputPath(`personal-18-nov-${width}-${dark ? 'dark' : 'light'}.png`) });
    }
    await page.goto('/?calendarDate=2026-11-18#home-calendar');
    await settleClient(page);
    await expect(calendar.locator('.day-col[aria-selected="true"] .dot-purple')).toBeVisible();
  });
}
