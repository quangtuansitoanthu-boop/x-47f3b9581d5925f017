import { expect, test, type Page } from '@playwright/test';
import { loginAsMember, settleClient } from './runtime-helpers';
import { principalStorageKey } from '../../src/lib/browser/principal-storage';

async function openNativeChant(page: Page) {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => {
    const state = { texts: [] as string[], failPrepare: false, autoFinish: false, start: null as null | ((event: { id: string }) => void), finish: null as null | ((result: { canceled?: boolean }) => void) };
    Object.assign(window, {
      __practiceSpeech: state,
      Capacitor: {
        PluginHeaders: [{ name: 'ReaderSpeech', methods: [
          ...['prepare', 'speak', 'stop', 'removeListener'].map(name => ({ name, rtype: 'promise' })),
          { name: 'addListener', rtype: 'callback' },
        ] }],
        nativeCallback(_plugin: string, _method: string, _options: unknown, callback: (event: { id: string }) => void) {
          state.start = callback;
          return 'practice-speech-listener';
        },
        async nativePromise(_plugin: string, method: string, options: { id: string; text: string }) {
          if (method === 'prepare' && state.failPrepare) throw { code: 'MISSING_VOICE' };
          if (method === 'speak') {
            state.texts.push(options.text);
            state.start?.({ id: options.id });
            return new Promise(resolve => { state.finish = resolve; if (state.autoFinish) queueMicrotask(() => resolve({})); });
          }
          if (method === 'stop') state.finish?.({ canceled: true });
          return {};
        },
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
  });
  await page.goto('/tu-tap');
  await settleClient(page);
  await page.locator('button.tt-mode-card--kinh').click();
  await page.locator('.tt-grid').getByText('Kinh kiểm thử E2E', { exact: true }).click();
  await page.getByRole('button', { name: /Bắt Đầu Công Phu/i }).click();
  await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
  await expect(page.getByText(/^(Nguyện hương\.|Nguyện đem công đức này\.)$/u)).toBeVisible();
  await page.context().setOffline(true);
  await page.evaluate(() => {
    const cap = (window as unknown as { Capacitor: { isNativePlatform: () => boolean; getPlatform: () => string } }).Capacitor;
    cap.isNativePlatform = () => true;
    cap.getPlatform = () => 'android';
  });
}

async function nativeTextCount(page: Page) {
  return page.evaluate(() => (window as unknown as { __practiceSpeech: { texts: string[] } }).__practiceSpeech.texts.length);
}

test('native Android model chant plays without Web Speech and completes only after native speech', async ({ page }) => {
  await openNativeChant(page);
  await page.getByRole('button', { name: '🔊 Nghe tụng mẫu' }).click();
  await expect.poll(() => nativeTextCount(page)).toBe(1);
  await expect(page.getByRole('button', { name: '⏹ Dừng tụng mẫu' })).toBeVisible();
  await page.evaluate(() => {
    const state = (window as unknown as { __practiceSpeech: { autoFinish: boolean; finish: (result: object) => void } }).__practiceSpeech;
    state.autoFinish = true;
    state.finish({});
  });
  await expect(page.locator('.tt-rosary-feedback[role="status"]')).toContainText('Đã nghe trọn phần tụng mẫu.');
});

test('stopping a native chant does not claim full completion and allows retry', async ({ page }) => {
  await openNativeChant(page);
  await page.getByRole('button', { name: '🔊 Nghe tụng mẫu' }).click();
  await expect.poll(() => nativeTextCount(page)).toBe(1);
  await page.getByRole('button', { name: '⏹ Dừng tụng mẫu' }).click();
  await expect(page.locator('.tt-rosary-feedback[role="status"]')).toContainText('Đã dừng tụng mẫu; phiên này không được ghi nhận là nghe trọn vẹn.');
  const operations = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]') as Array<{ kind: string; payload: { evidenceSummary?: { sequential?: boolean } } }>, principalStorageKey('e2e-member', 'quangtu_practice_session_outbox_v1'));
  expect(operations.filter(op => op.kind === 'complete').some(op => op.payload.evidenceSummary?.sequential === false)).toBe(true);
  await page.getByRole('button', { name: '🔊 Nghe tụng mẫu' }).click();
  await expect.poll(() => nativeTextCount(page)).toBe(2);
});

test('missing native voice shows actionable feedback and can be retried', async ({ page }) => {
  await openNativeChant(page);
  await page.evaluate(() => { (window as unknown as { __practiceSpeech: { failPrepare: boolean } }).__practiceSpeech.failPrepare = true; });
  await page.getByRole('button', { name: '🔊 Nghe tụng mẫu' }).click();
  await expect(page.locator('.tt-rosary-feedback[role="status"]')).toContainText('Cài đặt Android');
  expect(await nativeTextCount(page)).toBe(0);
  const pending = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]') as Array<{ clientSessionId: string }>, principalStorageKey('e2e-member', 'quangtu_practice_session_outbox_v1'));
  expect(pending.filter(op => op.clientSessionId.startsWith('practice:model_chant:'))).toHaveLength(0);
  await page.evaluate(() => { (window as unknown as { __practiceSpeech: { failPrepare: boolean } }).__practiceSpeech.failPrepare = false; });
  await page.getByRole('button', { name: '🔊 Nghe tụng mẫu' }).click();
  await expect.poll(() => nativeTextCount(page)).toBe(1);
});
