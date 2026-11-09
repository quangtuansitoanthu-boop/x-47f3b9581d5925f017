import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

for (const width of [320, 375, 800]) {
  test(`calendar date targets fit seven columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-11-01T05:00:00Z'));
    await page.goto('/');
    await settleClient(page);
    const calendar = page.locator('.weekly-lunar-strip');
    for (const mode of ['week', 'month']) {
      if (mode === 'month') await calendar.locator('.strip-expand-btn').click();
      const dates = calendar.getByRole('tab');
      const boxes = await dates.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      }));
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      if (mode === 'week') expect(boxes).toHaveLength(7);
      else expect(boxes.length).toBeGreaterThanOrEqual(28);
      await expect(calendar.getByRole('button', { name: mode === 'week' ? 'Tuần sau' : 'Tháng sau', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

test('calendar tabs support arrow and Home/End selection with visible focus in week and month views', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T05:00:00Z'));
  await page.goto('/');
  await settleClient(page);
  const calendar = page.locator('.weekly-lunar-strip');
  for (const mode of ['week', 'month']) {
    if (mode === 'month') await calendar.locator('.strip-expand-btn').click();
    const selected = calendar.getByRole('tab', { selected: true });
    await selected.focus();
    const firstLabel = await calendar.getByRole('tab').first().textContent();
    await page.keyboard.press('Home');
    await expect(selected).toBeFocused();
    await expect(selected).toHaveText(firstLabel!);
    const focusedOutline = await selected.evaluate(element => getComputedStyle(element).outlineStyle);
    expect(focusedOutline).not.toBe('none');
    const previousLabel = await selected.textContent();
    await page.keyboard.press('ArrowRight');
    await expect(selected).toBeFocused();
    await expect(selected).not.toHaveText(previousLabel!);
    await page.keyboard.press('ArrowLeft');
    await expect(selected).toBeFocused();
    await expect(selected).toHaveText(previousLabel!);
    const lastLabel = await calendar.getByRole('tab').last().textContent();
    await page.keyboard.press('End');
    await expect(selected).toBeFocused();
    await expect(selected).toHaveText(lastLabel!);
    expect(await calendar.locator('[role="tab"][tabindex="0"]').count()).toBe(1);
    if (mode === 'week') {
      const today = calendar.getByRole('button', { name: 'Hôm nay', exact: true });
      if (await today.isVisible()) await today.click();
    }
  }
});
