import { expect, test } from '@playwright/test';
import { beginScriptureCopying } from './runtime-helpers';

test('reference reading pauses, resumes without restarting and remains usable when collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => {
    const spoken: string[] = [];
    let paused = 0, resumed = 0, lastRate = 1;
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      text: string; lang = ''; rate = 1; pitch = 1; volume = 1; voice: unknown = null;
      onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    } });
    Object.defineProperty(window, '__copySpeech', { value: { spoken, get lastRate() { return lastRate; }, get paused() { return paused; }, get resumed() { return resumed; } } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'vi-VN', name: 'Default', default: true }],
      speak: (utterance: SpeechSynthesisUtterance) => { if (utterance.text) { lastRate = utterance.rate; spoken.push(utterance.text); queueMicrotask(() => utterance.onstart?.({} as SpeechSynthesisEvent)); } },
      pause: () => { paused++; }, resume: () => { resumed++; }, cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {}
    } });
  });
  await page.goto('/tu-tap/chep-kinh'); await beginScriptureCopying(page);
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tốc độ đọc', exact: true }).selectOption({ value: '0.3' });
  await page.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });
  await editor.focus();
  await page.getByRole('button', { name: 'Đọc để chép', exact: true }).click();
  await expect(editor).toBeFocused();
  await expect(page.getByText('Đang đọc kinh mẫu', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __copySpeech: { lastRate: number } }).__copySpeech.lastRate)).toBe(0.3);
  await expect(page.getByRole('button', { name: 'Dừng đọc', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dừng đọc', exact: true }).click();
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click();
  await expect(page.locator('#copy-source-text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đọc tiếp', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dừng đọc', exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const state = (window as unknown as { __copySpeech: { spoken: string[]; paused: number; resumed: number } }).__copySpeech;
    return { count: state.spoken.length, paused: state.paused, resumed: state.resumed };
  })).toEqual({ count: 1, paused: 1, resumed: 1 });
  await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Cài đặt chép kinh', exact: true });
  await expect(settings).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Tốc độ đọc', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Tốc độ đọc', exact: true }).selectOption({ value: '0.3' });
  await expect(page.getByRole('combobox', { name: 'Tốc độ đọc', exact: true })).toHaveValue('0.3');
  await settings.getByRole('button', { name: 'Xám', exact: true }).click();
  await expect(page.getByTestId('copying-page')).toHaveAttribute('data-paper', 'gray');
  await expect(page.getByRole('option', { name: /Giọng Nam|Giọng Nữ/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Khoảng cách dòng', exact: true }).selectOption({ value: '1.9' });
  await settings.getByRole('button', { name: 'Đóng tùy chọn', exact: true }).click();
  await expect(editor).toHaveCSS('line-height', '38px');
  await expect(page.locator('.editor-panel')).toHaveCSS('background-color', 'rgb(238, 237, 230)');
  await page.reload();
  await expect(page.getByTestId('copying-page')).toHaveAttribute('data-paper', 'gray');
});

for (const width of [375, 1440]) for (const dark of [false, true]) {
  test(`paper selection preserves writing and needs no cloud request (${width}, ${dark})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem('tutam_dark_mode', value ? '1' : '0'), dark);
    const cloudRequests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/practice/copying') cloudRequests.push(request.method()); });
    await page.goto('/tu-tap/chep-kinh'); await beginScriptureCopying(page);
    const editor = page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });
    await editor.pressSequentially('Nam mô');
    const before = await editor.textContent();
    await page.getByRole('button', { name: 'Tùy chọn và bản đã lưu', exact: true }).click();
    for (const [label, color] of [['Trắng', 'rgb(255, 255, 255)'], ['Kem', 'rgb(251, 244, 230)'], ['Xám', 'rgb(238, 237, 230)']]) {
      const choice = page.getByRole('button', { name: label, exact: true });
      await choice.click();
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.source-panel')).toHaveCSS('background-color', color);
      await expect(page.locator('.editor-panel')).toHaveCSS('background-color', color);
      expect(await editor.textContent()).toBe(before);
    }
    expect(cloudRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('paper-options.png') });
  });
}
