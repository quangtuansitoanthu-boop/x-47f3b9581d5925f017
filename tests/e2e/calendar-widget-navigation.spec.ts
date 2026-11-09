import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('warm calendar widget links select their week while preserving manual week browsing', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T05:00:00Z'));
  await page.goto('/');
  await settleClient(page);
  const calendar = page.locator('.weekly-lunar-strip');
  await expect(calendar.locator('.day-col[aria-selected="true"] .day-solar-num')).toHaveText('1');

  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/?calendarDate=2026-12-01#home-calendar';
    document.body.append(link);
    link.click();
    link.remove();
  });
  await expect(page).toHaveURL(/calendarDate=2026-12-01/);
  await expect(calendar.locator('.day-col[aria-selected="true"] .day-solar-num')).toHaveText('1');
  await expect(page.locator('.art-solar-text')).toContainText('01/12/2026');
  const selectedWeek = await calendar.locator('.day-solar-num').allTextContents();
  await calendar.getByRole('button', { name: 'Tuần sau', exact: true }).click();
  await expect(calendar.locator('.day-col[aria-selected="true"]')).toHaveCount(0);
  await calendar.getByRole('button', { name: 'Tuần trước', exact: true }).click();
  await expect(calendar.locator('.day-solar-num')).toHaveText(selectedWeek);
  await expect(calendar.locator('.day-col[aria-selected="true"] .day-solar-num')).toHaveText('1');
});

test('same-URL widget calendar intent restores the date after manual selection without an API request', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T05:00:00Z'));
  await page.goto('/?calendarDate=2026-11-01#home-calendar');
  await settleClient(page);
  const calendar = page.locator('.weekly-lunar-strip');
  await calendar.getByRole('button', { name: 'Tuần sau', exact: true }).click();
  await calendar.locator('.day-col').last().click();
  await expect(page.locator('.art-solar-text')).toContainText('08/11/2026');

  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('quangtu:calendar-widget-date', {
    detail: { date: '2026-11-01' },
  })));
  await expect(page.locator('.art-solar-text')).toContainText('01/11/2026');
  await expect(calendar.locator('.day-col[aria-selected="true"] .day-solar-num')).toHaveText('1');
  expect(requests).toEqual([]);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('quangtu:calendar-widget-date', {
    detail: { date: '2026-02-30' },
  })));
  await expect(page.locator('.art-solar-text')).toContainText('01/11/2026');
});
