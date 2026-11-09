import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SessionStatus from '../../../src/lib/components/auth/SessionStatus.svelte';

const source = readFileSync('src/lib/components/auth/SessionStatus.svelte', 'utf8');

describe('shared login modal visual contract', () => {
  it('compiles and renders an authenticated profile trigger', () => {
    const { body } = render(SessionStatus, {
      props: {
        session: {
          authenticated: true,
          user: { displayName: 'Quang Từ', role: 'admin' }
        }
      }
    });
    expect(body).toContain('Quang Từ');
  });

  it('keeps the navigation login trigger identical to production', () => {
    expect(source).toContain('.session-login{height:auto;min-height:0;padding:8px 16px');
    expect(source).toContain('background:transparent');
  });

  it('keeps Facebook Login without offering account linking', () => {
    expect(source).toContain('/api/auth/facebook?returnTo=');
    expect(source).toContain('Đăng nhập bằng Facebook');
    expect(source).not.toContain("/api/auth/facebook/link/start");
    expect(source).not.toContain('onclick={linkFacebook}');
    expect(readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8')).not.toContain('/api/auth/facebook/link/start');
    expect(source).not.toContain('/api/integrations/facebook/connect/start');
  });

  it('matches the production pointer and restrained hover treatment', () => {
    expect(source).toMatch(/\.session-status,\.session-login\{[^}]*cursor:pointer/);
    expect(source).toContain('.session-status:hover,.session-login:hover{border-color:var(--gold);background:var(--gold-muted);color:var(--brown)}');
    expect(source).not.toMatch(/\.session-status:hover,\.session-login:hover\{[^}]*box-shadow/);
    expect(source).not.toMatch(/\.session-status:hover,\.session-login:hover\{[^}]*transform/);
    expect(source).toContain('.session-status:focus-visible,.session-login:focus-visible');
  });

  it('matches the production desktop geometry', () => {
    expect(source).toContain('width:min(400px,100%)');
    expect(source).toContain('padding:36px 32px');
    expect(source).toContain('border-radius:18px');
    expect(source).toContain('.login-brand img{width:56px;height:56px');
  });

  it('lets account dialogs escape the admin topbar stacking context', () => {
    expect(source).toContain(':global(.admin-topbar:has(.login-overlay)){z-index:11010;backdrop-filter:none;-webkit-backdrop-filter:none}');
  });

  it('plays the production entrance motion when opened', () => {
    expect(source).toContain('animation:modalUp .28s cubic-bezier(.34,1.2,.64,1)');
    expect(source).toContain('@keyframes modalUp');
    expect(source).toContain('translateY(24px) scale(.97)');
  });

  it('uses the production bottom-sheet motion at the 768px breakpoint', () => {
    expect(source).toContain('@media(max-width:768px)');
    expect(source).toContain('animation:slideUp .28s cubic-bezier(.34,1.2,.64,1)');
    expect(source).toContain('@keyframes slideUp');
    expect(source).toMatch(/\.account-activity h3\{[^}]*font-size:\s*var\(--font-size-card-title\)/);
  });

  it('disables decorative entrance motion when reduced motion is requested', () => {
    expect(source).toContain('@media(prefers-reduced-motion:reduce)');
    expect(source).toMatch(/\.login-dialog\{animation:none/);
    expect(source).toContain('.session-status,.session-login,.account-progress-link{transition:none}');
  });

  it('keeps reading history local but links practice progress to the private verified dashboard', () => {
    expect(source).toContain("activeModal === 'profile'");
    expect(source).toContain('account-avatar');
    expect(source).toContain('createPrincipalStorage(localStorage, principalId)');
    expect(source).toContain('LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks');
    expect(source).toContain('LEGACY_LOCAL_STORAGE_KEYS.bookmarks');
    expect(source).toContain('LEGACY_LOCAL_STORAGE_KEYS.recentAlbums');
    expect(source).not.toContain("localStorage.getItem('tutam_pdf_bookmarks_v1')");
    expect(source).not.toContain("localStorage.getItem('tutam_bookmarks_v1')");
    expect(source).not.toContain("localStorage.getItem('tutam_recent_albums')");
    expect(source).toContain('Hoạt động của bạn');
    expect(source).toContain('href="/tien-do-tu-tap"');
    expect(source).toContain('Xem tiến độ tu tập đã xác minh');
    expect(source).not.toContain("localStorage.getItem('tt_practice_logs_v1')");
    expect(source).not.toContain('lần ghi nhận');
    expect(source).not.toContain('Tổng thời gian:');
    expect(source).not.toContain('totalMinutes');
  });

  it('requires explicit logout confirmation', () => {
    expect(source).toContain("activeModal === 'logout'");
    expect(source).toContain('Xác nhận đăng xuất');
    expect(source).toContain('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?');
    expect(source).toMatch(/onclick=\{\(event\) => showLogoutConfirm\(event\.currentTarget\)\}/);
    expect(source).toContain('onclick={logout}');
  });

  it('traps focus and restores it without closing the content modal underneath login', () => {
    expect(source).toContain('function trapFocus(event: KeyboardEvent)');
    expect(source).toContain("event.key !== 'Tab'");
    expect(source).toContain('event.stopImmediatePropagation()');
    expect(source).toContain('previousFocus?.focus()');
    expect(source).toContain("'quangtu:login-modal-state'");
    expect(source).toContain('setContentModalSuspended(false)');
  });

  it('renders the authenticated avatar with an accessible fallback', () => {
    expect(source).toContain('session.user.avatarUrl');
    expect(source).toContain('avatarFailed');
    expect(source).toContain('class="session-avatar"');
  });
});
