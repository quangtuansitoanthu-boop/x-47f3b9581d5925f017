import { readFileSync } from 'node:fs';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import LunarDate from '../../../src/lib/components/lunar/LunarDate.svelte';
import MasterShell from '../../../src/lib/components/layout/MasterShell.svelte';
import MobileBottomNav from '../../../src/lib/components/layout/MobileBottomNav.svelte';
import SiteHeader from '../../../src/lib/components/layout/SiteHeader.svelte';
import PresenceChip from '../../../src/lib/components/presence/PresenceChip.svelte';
import QueryTestHarness from '../query-test-harness.svelte';

describe('master shell', () => {
  it.each(['/tu-tap', '/tu-tap/chep-kinh'])('keeps one real notification bell beside the practice header controls on %s', currentPath => {
    const body = render(QueryTestHarness, { props: { Target: SiteHeader, targetProps: { currentPath, theme: 'dark' } } }).body;
    expect(body.match(/class="notification-bell-btn(?:\s|")/gu) ?? []).toHaveLength(1);
    expect(body).toContain('tt-topbar');
    expect(body).toContain('tt-back-btn');
    expect(body).toContain('tt-topbar-title');
    expect(body).toContain('tt-theme-btn');
    expect(body).toContain('tt-topbar-logo');
    expect(body).not.toContain('class="nav qts-nav');
  });
  it('renders one semantic shell with the production navigation destinations', () => {
    const children = createRawSnippet(() => ({render: () => '<p id="shell-payload">Content</p>'}));
    const { body } = render(QueryTestHarness, { props: { Target: MasterShell, targetProps: { children, currentPath: '/', theme: 'dark' } } });
    expect(body.match(/<nav class="nav qts-nav(?:\s|")/g)).toHaveLength(1);
    expect(body).toContain('id="main-content"');
    expect(body).toContain('shell-payload');
    for (const href of ['/kinh-sach','/tu-tap','/phap-thoai','/ca-nhan']) expect(body).toContain('href="'+href+'"');
    expect(body).toContain('aria-current="page"');
    expect(render(QueryTestHarness,{props:{Target:MasterShell,targetProps:{children,currentPath:'/huong-dan'}}}).body).toContain('qts-footer');
  });

  it('keeps the five mobile actions and an accessible theme toggle', () => {
    const { body } = render(MobileBottomNav, {props:{currentPath:'/',theme:'light',session:{authenticated:true}}});
    expect(body.match(/class="qts-bottom-nav__item(?:\s|")/g)).toHaveLength(5);
    for(const href of ['/','/kinh-sach','/tu-tap','/phap-thoai','/ca-nhan']) expect(body).toContain('href="'+href+'"');
    const header = render(QueryTestHarness,{props:{Target:SiteHeader,targetProps:{currentPath:'/',theme:'light'}}}).body;
    expect(header).toContain('aria-label="Chuyển sang chế độ tối"');
  });

  it('carries a sign-in fallback for a signed-out visitor and drops it once signed in', () => {
    for(const authenticated of [false,true]) {
      const body=render(MobileBottomNav,{props:{currentPath:'/',session:{authenticated}}}).body;
      expect(body).toContain('href="/ca-nhan"');
      expect(body.match(/class="qts-bottom-nav__item(?:\s|")/g)).toHaveLength(5);
    }
    expect(readFileSync('src/routes/ca-nhan/+page.svelte','utf8')).toContain('/api/auth/google');
  });

  it('highlights exactly the mobile destination that matches the current path', () => {
    const home = render(MobileBottomNav, {
      props: { currentPath: '/', theme: 'light' }
    }).body;
    const practice = render(MobileBottomNav, {
      props: { currentPath: '/tu-tap', theme: 'light' }
    }).body;

    expect(home.match(/aria-current="page"/g)).toHaveLength(1);
    expect(home).toMatch(/href="\/" aria-current="page"/u);
    expect(home).not.toMatch(/href="\/tu-tap" aria-current="page"/u);
    expect(practice.match(/aria-current="page"/g)).toHaveLength(1);
    expect(practice).toMatch(/href="\/tu-tap" aria-current="page"/u);
    expect(practice).not.toContain('qts-bottom-nav__item--practice');
  });

  it('hides unavailable presence and caps the visible count without a noisy live region', () => {
    expect(render(PresenceChip, { props: { count: null } }).body).not.toContain('presence-chip');

    const { body } = render(PresenceChip, { props: { count: 1_250 } });
    expect(body).toContain('999+ đang xem');
    expect(body).toContain('aria-label="Khoảng 999+ người đang truy cập"');
    expect(body).not.toContain('aria-live');
  });

  it('renders solar and lunar dates as separate readable values', () => {
    const { body } = render(LunarDate, {
      props: { solarDate: 'Thứ Sáu, ngày 31/07/2026', lunarDate: '18/06/2026 (Bính Ngọ)' }
    });

    expect(body).toMatch(/<strong[^>]*>Thứ Sáu<\/strong>, ngày 31\/07\/2026/u);
    expect(body).toMatch(/31\/07\/2026<\/span><span[^>]*>·<\/span><span[^>]*>Âm lịch:/u);
    expect(body).toMatch(/<span class="lunar[^>]*>18\/06\/2026 \(Bính Ngọ\)<\/span>/u);
  });

  it('preserves production tokens, 768px navigation breakpoint and reduced motion', () => {
    const tokens = readFileSync('src/lib/styles/tokens.css', 'utf8');
    const shell = readFileSync('src/lib/styles/master-shell.css', 'utf8');

    expect(tokens).toContain('--gold: #c8963e');
    expect(tokens).toContain('--brown-dark: #3e2c1a');
    expect(tokens).toContain("[data-theme='dark']");
    expect(shell).toContain('@media (max-width: 768px)');
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
    expect(shell).toContain('max(env(safe-area-inset-bottom), 6px)');
  });

  it('keeps the desktop theme action on the compact production geometry', () => {
    const shell = readFileSync('src/lib/styles/master-shell.css', 'utf8');

    expect(shell).toContain('.btn-compact {');
    expect(shell).toContain('height: 28px');
    expect(shell).toContain('padding: 4px 10px !important');
    expect(shell).toContain('font-size: var(--font-size-label) !important');
    expect(shell).toContain('border-radius: 16px !important');
  });

  it('renders the four legacy admin actions together below the home brand', () => {
    const body = render(QueryTestHarness,{props:{Target:SiteHeader,targetProps:{currentPath:'/',theme:'light',session:{authenticated:true,user:{displayName:'admin',role:'admin'}}}}}).body;
    expect(body).toContain('nav-theme-btn');
    expect(readFileSync('src/lib/components/layout/SiteHeader.svelte','utf8')).toContain('<NotificationBell');
    const account=readFileSync('src/routes/ca-nhan/+page.svelte','utf8');
    expect(account).toContain('/admin');
    expect(account).toContain("role === 'admin'");
  });
});
