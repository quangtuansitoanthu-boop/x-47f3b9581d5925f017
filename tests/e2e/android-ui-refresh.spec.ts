import { expect, test } from '@playwright/test';

test('greeting, calendar, and a single quote follow the requested order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const action = page.locator('.home-greeting-header .greeting-btn');
  await expect(action).toBeVisible();
  await expect(page.locator('.home-container > :first-child')).toHaveClass(/\bhome-greeting-header\b/);
  await expect(page.locator('.home-container > :nth-child(2)')).toHaveClass(/\bpbb-compact\b/);
  await expect(page.locator('.home-container > :nth-child(3)')).toHaveClass(/\bhome-calendar\b/);
  await expect(page.locator('.home-calendar + .home-daily-reminders + .daily-dhammapada-card')).toHaveCount(1);
  await expect(page.locator('.daily-dhammapada-card')).toHaveCount(1);
  await expect(page.locator('.home-continue')).toHaveCount(0);
  await action.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  expect(await action.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
});

test('feast portraits are date-specific while ordinary days use scenery and justified reminders', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-02-17T05:00:00Z'));
  // Chọn cùng ngày cho cả server và browser; clock của page không đổi ngày trên Worker SSR.
  await page.goto('/?calendarDate=2026-02-17');
  const calendar=page.locator('.buddhist-daily-art-card');
  await expect(calendar.locator('img')).toHaveAttribute('src','/images/le-phat/di-lac.webp');
  await expect(calendar.locator('.art-shuffle-btn')).toHaveCount(0);
  await expect(page.locator('.home-daily-reminders .daily-reminder-message')).toHaveCSS('text-align','justify');
  await page.clock.setFixedTime(new Date('2026-02-18T05:00:00Z'));
  await page.goto('/?calendarDate=2026-02-18');
  await expect(calendar.locator('img')).toHaveAttribute('src',/^\/images\/calendar\/[^/]+\.webp$/);
  await expect(calendar.locator('.art-shuffle-btn')).toBeVisible();
  expect(await page.locator('.global-presence-pill').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
});

test('calendar artwork changes and remains readable at narrow widths in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const calendar = page.locator('.buddhist-daily-art-card');
  await expect(calendar).toBeVisible();
  await calendar.scrollIntoViewIfNeeded();
  const before = await calendar.locator('img').getAttribute('src');
  await calendar.getByRole('button', { name: /Đổi hình nền|Change zen background/ }).click();
  await expect(calendar.locator('img')).not.toHaveAttribute('src', before!);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(calendar.locator('.art-huge-day')).toBeVisible();
    await expect(calendar.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}/);
    expect(await calendar.evaluate((element) => {
      const panel = element.querySelector('.art-left-panel')!.getBoundingClientRect();
      const image = element.querySelector('.art-visual')!.getBoundingClientRect();
      const button = element.querySelector('.art-shuffle-btn')!;
      return panel.right <= image.left && button.closest('.art-footer') !== null;
    })).toBe(true);
  }
});

test('home settles without continuously running decorative animations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.effect?.getTiming().iterations === Infinity).length), { timeout: 5000 }).toBe(0);
});

test('each homepage collection fills six cards on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const portals = page.locator('.core-practice-portals');
  for (const name of ['Tu tập', 'Kinh sách', 'Pháp thoại']) {
    await portals.getByRole('button', { name, exact: true }).click();
    await expect(portals.locator('.portal-card')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
