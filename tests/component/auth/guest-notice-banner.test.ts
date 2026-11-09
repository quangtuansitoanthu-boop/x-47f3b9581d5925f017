import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translations, type AppLocale } from '../../../src/lib/i18n/translations';
import type { PageSessionDTO } from '../../../src/lib/server/auth/types';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/stores/locale.svelte', () => ({
  getLocaleContext: () => ({ t: translations[locale] }),
}));
import GuestNoticeBanner from '../../../src/lib/components/auth/GuestNoticeBanner.svelte';

const source = readFileSync('src/lib/components/auth/GuestNoticeBanner.svelte', 'utf8');
let locale: AppLocale = 'vi';
const guest: PageSessionDTO = { authenticated: false, user: null, csrfToken: null, expiresAt: null };
const markup = (currentPath = '/', session = guest) => render(GuestNoticeBanner, { props: { currentPath, session } }).body;

beforeEach(() => { locale = 'vi'; });

describe('GuestNoticeBanner contract', () => {
  it.each(['vi', 'en'] as const)('renders current account messaging and accessible labels in %s', (language) => {
    locale = language;
    const html = markup();
    const text = translations[language].notifications;
    for (const key of ['guestTitle', 'guestDesc', 'guestLogin', 'guestLater', 'guestDismiss', 'guestAria'] as const) expect(html).toContain(text[key]);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('sẽ không được lưu');
  });

  it.each(['/', '/phap-thoai', '/phap-thoai/bai-giang'])('shows for guests on %s', (path) => {
    expect(markup(path)).toContain('data-guest-notice-banner');
  });

  it.each(['/tu-tap', '/tu-tap/niem-phat', '/kinh-sach', '/ca-nhan', '/huong-dan'])('does not interrupt the current %s flow', (path) => {
    expect(markup(path)).not.toContain('data-guest-notice-banner');
  });

  it('does not show for authenticated visitors', () => {
    expect(markup('/', { ...guest, authenticated: true, user: { id: 'member', email: 'member@example.test', displayName: 'Member', avatarUrl: '', role: 'user' } })).not.toContain('data-guest-notice-banner');
  });

  it('keeps login navigation and both dismiss controls connected', () => {
    expect(source).toContain("void goto('/ca-nhan?tab=account')");
    expect(source).toContain('onclick={handleLogin}');
    expect(source.match(/onclick=\{handleDismiss\}/g)).toHaveLength(2);
    expect(source).toContain('!dismissedManually');
  });

  it('only cleans the obsolete banner preference, preserving saved app data', () => {
    expect(source).toContain("const LEGACY_STORAGE_KEY = 'tutam_guest_notice_dismissed_date'");
    expect(source.match(/localStorage\.(?:clear|setItem|removeItem)\([^)]*\)/g)).toEqual(['localStorage.removeItem(LEGACY_STORAGE_KEY)']);
  });
});
