import { expect, test } from '@playwright/test';
import { settleClient } from '../runtime-helpers';

function journalCase(width: number, dark: boolean, locale: 'vi' | 'en', fallback = false) {
  test(`journal full-screen writing preserves drafts and modality (${width}, ${dark ? 'dark' : 'light'}, ${locale}, ${fallback ? 'fallback' : 'native dialog'})`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ dark, locale, fallback }) => {
      if (fallback) {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
      }
      localStorage.setItem('tutam_locale', locale);
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
      localStorage.setItem('tt_reflection_guide_seen_v1', '1');
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.endsWith(':tt_personal_reflections_v1')) throw new DOMException('Test quota failure', 'QuotaExceededError');
        original.call(this, key, value);
      };
    }, { dark, locale, fallback });
    const requests: string[] = [];
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      return route.fulfill({ json: path === '/api/session'
        ? { authenticated: false, user: null, csrfToken: null, expiresAt: null }
        : path === '/api/presence' ? { enabled: false, activeCount: 0 } : [] });
    });
    const presence = page.waitForResponse(response => new URL(response.url()).pathname === '/api/presence');
    await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' }); await presence;
    await settleClient(page);
    await page.locator('.tt-mode-card--reflection').click();
    const journal = page.locator('.personal-journal');
    const opener = journal.locator('.zen-open-btn').first();
    await expect(opener).toBeVisible();
    const before = requests.length;
    await opener.click();
    const dialog = page.locator('dialog.zen-overlay');
    const editor = dialog.locator('textarea');
    await expect(dialog).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(dialog.locator('.snippet-pill').first()).toHaveText(locale === 'en' ? '+ Actions' : '+ Thân');
    const content = 'Private draft remains on this device. '.repeat(20);
    await editor.fill(content);
    await dialog.locator('.zen-save-btn').click();
    const feedback = page.locator('dialog.app-dialog');
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText(locale === 'en' ? 'Unable to save' : 'Chưa lưu được');
    await feedback.getByRole('button').click();
    await expect(dialog.getByRole('status')).toContainText(locale === 'en' ? 'Unable to save' : 'Chưa lưu được');
    await expect(editor).toHaveValue(content);
    await expect(dialog.locator('.zen-stats')).toContainText(locale === 'en' ? 'characters' : 'ký tự');
    const geometry = await dialog.evaluate(node => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowing: [...node.querySelectorAll<HTMLElement>('*')].filter(item => !item.closest('.zen-quick-snippets') && item.scrollWidth > item.clientWidth + 1).map(item => ({
        tag: item.tagName, className: item.className, scrollWidth: item.scrollWidth, clientWidth: item.clientWidth,
      })),
    }));
    expect(geometry.scrollWidth > geometry.clientWidth, JSON.stringify(geometry)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const controls = await dialog.locator('.snippet-pill, .zen-close-btn, .zen-save-btn, .zen-done-btn').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(controls.every(height => height >= 44)).toBe(true);
    await page.screenshot({ path: info.outputPath('journal-zen.png'), animations: 'disabled' });
    await editor.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(journal.locator('textarea').first()).toHaveValue(content);
    expect(requests).toHaveLength(before);
    await opener.click();
    await expect(page.locator('dialog.zen-overlay textarea')).toHaveValue(content);
    await page.locator('dialog.zen-overlay .zen-done-btn').click();
    await expect(dialog).toHaveCount(0);
    expect(requests).toHaveLength(before);
    expect(errors).toEqual([]);
  });
}

export function registerJournalZenCases() {
  for (const width of [375, 1440]) for (const dark of [false, true]) for (const locale of ['vi', 'en'] as const) {
    journalCase(width, dark, locale);
  }
  journalCase(375, false, 'vi', true);
}
