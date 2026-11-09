import { expect, test } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';

for (const [field, label] of [
  ['leaderboardOptIn', 'Tham gia bảng xếp hạng'],
  ['presenceOptIn', 'Hiện khi đang tu tập'],
] as const) {
  test(`${field} keeps the requested state while saving and rolls back a failed save`, async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/tien-do-tu-tap');
    await settleClient(page);
    const session = await (await page.request.get('/api/session')).json();
    const original = await (await page.request.get('/api/practice/progress')).json();
    const control = page.getByRole('checkbox', { name: new RegExp(label, 'u') });
    await expect(control).toBeChecked({ checked: original.profile[field] });
    let release = () => {};
    try {
      for (const fail of [true, false]) {
        let started!: () => void;
        const requestStarted = new Promise<void>(resolve => started = resolve);
        const requestReleased = new Promise<void>(resolve => release = resolve);
        let patches = 0;
        await page.route('**/api/practice/progress', async route => {
          if (route.request().method() !== 'PATCH') return route.continue();
          patches += 1;
          started();
          await requestReleased;
          if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Không thể lưu lúc này.' }) });
          return route.continue();
        });
        await control.setChecked(!original.profile[field]);
        await requestStarted;
        await expect(control).toBeDisabled();
        await expect(control).toBeChecked({ checked: !original.profile[field] });
        expect(patches).toBe(1);
        const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/practice/progress' && response.request().method() === 'PATCH');
        release();
        await saved;
        await expect(control).toBeEnabled();
        await expect(control).toBeChecked({ checked: fail ? original.profile[field] : !original.profile[field] });
        expect(patches).toBe(1);
        await page.unroute('**/api/practice/progress');
      }
      await page.reload();
      await settleClient(page);
      await expect(control).toBeChecked({ checked: !original.profile[field] });
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
      const restored = await page.request.patch('/api/practice/progress', {
        data: original.profile,
        headers: { 'x-csrf-token': session.csrfToken, origin: new URL(page.url()).origin },
      });
      expect(restored.ok()).toBeTruthy();
    }
  });
}
