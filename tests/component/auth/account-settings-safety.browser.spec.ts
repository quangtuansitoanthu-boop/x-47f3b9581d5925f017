import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Harness from './account-delete-session-harness.svelte';
import LoginHarness from './session-login-harness.svelte';
import { beginNativeAuthMutation, isNativeAuthMutationActive } from '$lib/browser/native-auth-transaction';

const mocks = vi.hoisted(() => ({ csrf: vi.fn(), request: vi.fn(), logout: vi.fn(), clearLocal: vi.fn(), clearBrowser: vi.fn(), google: vi.fn(), facebook: vi.fn(), apple: vi.fn(), native: vi.fn(() => false), url: new URL('http://localhost/ca-nhan?tab=account') }));
vi.mock('$app/state', () => ({ page: { get url() { return mocks.url; } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/browser/session-csrf', () => ({ requireBrowserCsrf: mocks.csrf, fetchWithSessionRefresh: mocks.request }));
vi.mock('$lib/browser/native-auth', () => ({ logoutNativeAuth: mocks.logout, loginWithGoogleNative: mocks.google, loginWithFacebookNative: mocks.facebook, loginWithAppleNative: mocks.apple, authorizeAppleAccountDeletion: vi.fn() }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: mocks.native, nativePlatform: () => mocks.native() ? 'ios' : 'web' }));
vi.mock('$lib/stores/session.svelte', async original => ({ ...await original<typeof import('$lib/stores/session.svelte')>(), clearLocalSession: mocks.clearLocal, clearBrowserSession: mocks.clearBrowser }));
vi.mock('$lib/browser/app-stats', () => ({ getCachedInstallCount: () => 1230, fetchInstallCount: async () => 1230, formatInstallNumber: () => '1.230' }));

let component: ReturnType<typeof Harness> | undefined;
let loginComponent: ReturnType<typeof LoginHarness> | undefined;
it.each([true, false])('shows a refreshed Facebook avatar after the previous image failed (status=%s)', async showStatus => {
  component = mount(Harness, { target: document.body, props: { showStatus } }); await settle();
  const selector = showStatus ? '.session-avatar img' : '.cn-avatar-img';
  const { applyBrowserSession, getBrowserSessionSnapshot } = await import('$lib/stores/session.svelte');
  const avatar = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${color}"/></svg>`)}`;
  const old = getBrowserSessionSnapshot();
  applyBrowserSession({ ...old, user: { ...old.user!, avatarUrl: avatar('red') } }); await settle();
  document.querySelector<HTMLImageElement>(selector)!.dispatchEvent(new Event('error')); await settle();
  expect(document.querySelector(selector)).toBeNull();
  const fresh = avatar('green');
  applyBrowserSession({ ...old, user: { ...old.user!, avatarUrl: fresh } }); await settle();
  expect(document.querySelector<HTMLImageElement>(selector)?.getAttribute('src')).toBe(fresh);
  expect(mocks.request).not.toHaveBeenCalled();
});
const errors: unknown[] = [];
const capture = (event: ErrorEvent) => { errors.push(event.error); event.preventDefault(); };
async function settle() { await tick(); await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); errors.length = 0;
  mocks.native.mockReturnValue(false);
  mocks.url = new URL('http://localhost/ca-nhan?tab=account');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  mocks.csrf.mockResolvedValue('csrf-a'); mocks.request.mockImplementation(async () => Response.json({ authenticated: false })); mocks.logout.mockResolvedValue(undefined);
  window.addEventListener('error', capture);
});
afterEach(async () => {
  if (component) await unmount(component); component = undefined;
  if (loginComponent) await unmount(loginComponent); loginComponent = undefined;
  window.removeEventListener('error', capture); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); localStorage.clear();
});

it.each(['google', 'facebook', 'apple'] as const)('allows one pending native %s login across repeated and other-provider clicks, then restores retry with an error', async provider => {
  mocks.native.mockReturnValue(true);
  let finish!: (result: { success: boolean; error: string }) => void;
  for (const name of ['google', 'facebook', 'apple'] as const) mocks[name].mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  loginComponent = mount(LoginHarness, { target: document.body }); await settle();
  window.dispatchEvent(new Event('quangtu:login-required')); await settle();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.oauth-options button')];
  const active = document.querySelector<HTMLButtonElement>(`.oauth-options .${provider}`)!;
  active.click(); active.click();
  for (const button of buttons) if (button !== active) button.click();
  await settle();
  expect(mocks.google.mock.calls.length + mocks.facebook.mock.calls.length + mocks.apple.mock.calls.length).toBe(1);
  expect(buttons.every(button => button.disabled)).toBe(true);
  finish({ success: false, error: 'Không thể xác thực đăng nhập. Vui lòng thử lại.' }); await settle();
  expect(document.querySelector('.login-dialog [role="alert"]')?.textContent).toContain('Không thể xác thực đăng nhập');
  expect(buttons.every(button => !button.disabled)).toBe(true);
  mocks[provider].mockResolvedValue({ success: false, error: 'Thử lại chưa thành công' });
  active.click(); await settle();
  expect(mocks[provider]).toHaveBeenCalledTimes(2);
});

it.each(['google', 'apple'] as const)('shows native %s login failure in the login dialog and permits retry', async provider => {
  mocks.native.mockReturnValue(true);
  mocks[provider].mockResolvedValue({ success: false, error: 'Đăng nhập thất bại, vui lòng thử lại.' });
  loginComponent = mount(LoginHarness, { target: document.body }); await settle();
  window.dispatchEvent(new Event('quangtu:login-required')); await settle();
  const button = document.querySelector<HTMLButtonElement>(`.oauth-options .${provider}`)!;
  button.click(); await settle();
  expect(document.querySelector('.login-dialog [role="alert"]')?.textContent).toBe('Đăng nhập thất bại, vui lòng thử lại.');
  expect(button.disabled).toBe(false);
  if (provider === 'apple') {
    mocks.apple.mockResolvedValue({ success: false });
    button.click(); await settle();
    expect(document.querySelector('.login-dialog [role="alert"]')).toBeNull();
    expect(button.disabled).toBe(false);
  }
});

it('keeps Apple cancellation silent on the account page and restores the login button for retry', async () => {
  mocks.native.mockReturnValue(true);
  mocks.apple.mockResolvedValue({ success: false });
  component = mount(Harness, { target: document.body }); await settle();
  component.becomeGuest(); await settle();
  const button = document.querySelector<HTMLButtonElement>('.cn-btn-apple')!;
  expect(button).not.toBeNull();
  button.click(); await settle();
  expect(document.body.textContent).not.toContain('AuthorizationError');
  expect(document.body.textContent).not.toContain('Chưa thể xác minh');
  expect(button.disabled).toBe(false);
  button.click(); await settle();
  expect(mocks.apple).toHaveBeenCalledTimes(2);
});
async function showLogout(status: boolean) {
  component = mount(Harness, { target: document.body, props: { showStatus: status } }); await settle();
  if (status) window.dispatchEvent(new Event('quangtu:logout-required'));
  else (document.querySelector('.cn-btn-logout') as HTMLButtonElement).click();
  await settle();
}
function confirmLogout() { const button = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find(node => node.textContent?.trim() === 'Đăng xuất'); expect(button).toBeDefined(); button!.click(); }

for (const status of [false, true]) {
  it(`does not send logout while native login owns its cookie transaction (topbar=${status})`, async () => {
    mocks.native.mockReturnValue(true);
    const release = beginNativeAuthMutation()!;
    try {
      await showLogout(status); confirmLogout(); await settle();
      expect(mocks.request).not.toHaveBeenCalled();
      expect(mocks.clearBrowser).not.toHaveBeenCalled();
    } finally { release(); }
  });
  it(`retains the native transaction until HTTP settles even after principal change aborts logout (topbar=${status})`, async () => {
    mocks.native.mockReturnValue(true);
    let finish!: (response: Response) => void;
    mocks.request.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    await showLogout(status); confirmLogout(); await settle();
    component!.switchAccount(); await settle();
    const held = isNativeAuthMutationActive();
    const competing = beginNativeAuthMutation(); competing?.();
    finish(Response.json({ authenticated: false })); await settle();
    expect(held).toBe(true); expect(competing).toBeNull();
    expect(isNativeAuthMutationActive()).toBe(false);
    expect(mocks.clearBrowser).not.toHaveBeenCalled();
  });
  it(`opts logout into preserving newer cookies while retaining CSRF and credentials (topbar=${status})`, async () => {
    mocks.request.mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));
    await showLogout(status); confirmLogout(); await settle();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const [path, request] = mocks.request.mock.calls[0];
    expect(path).toBe('/api/auth/logout');
    expect(request).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a' } });
    expect(JSON.parse(request.body)).toEqual({ preserveSessionCookie: true });
    expect(mocks.clearBrowser).not.toHaveBeenCalled();
  });
  it(`does not submit logout for a replacement principal after delayed CSRF (topbar=${status})`, async () => {
    let finish!: (value: string) => void;
    mocks.csrf.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    await showLogout(status); confirmLogout(); await settle();
    component!.switchAccount(); await settle(); finish('csrf-b'); await settle();
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.logout).not.toHaveBeenCalled(); expect(mocks.clearBrowser).not.toHaveBeenCalled();
  });
  it(`does not clear the new principal after an old logout response arrives (topbar=${status})`, async () => {
    let finish!: (response: Response) => void;
    mocks.request.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    await showLogout(status); confirmLogout(); await settle(); expect(mocks.request).toHaveBeenCalledTimes(1);
    component!.switchAccount(); await settle(); finish(Response.json({ authenticated: false })); await settle();
    expect(mocks.logout).not.toHaveBeenCalled(); expect(mocks.clearLocal).not.toHaveBeenCalled(); expect(mocks.clearBrowser).not.toHaveBeenCalled();
  });
  it(`does not clear a replacement account when native logout completes late (topbar=${status})`, async () => {
    let finish!: () => void;
    mocks.logout.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await showLogout(status); confirmLogout(); await settle(); expect(mocks.logout).toHaveBeenCalledTimes(1);
    component!.switchAccount(); await settle(); finish(); await settle();
    expect(mocks.clearLocal).not.toHaveBeenCalled(); expect(mocks.clearBrowser).not.toHaveBeenCalled();
  });
  it(`invalidates logout even when the old principal returns before CSRF (topbar=${status})`, async () => {
    let finish!: (value: string) => void;
    mocks.csrf.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    await showLogout(status); confirmLogout(); await settle();
    component!.switchAccount(); await settle(); component!.switchAccount('owner-a'); await settle(); finish('csrf-a'); await settle();
    expect(mocks.request).not.toHaveBeenCalled();
  });
}

it('keeps account settings usable when reading preferences throws', async () => {
  const original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(key) { if (key.startsWith('tutam_read_')) throw new DOMException('Denied', 'SecurityError'); return original.call(this, key); });
  mocks.url = new URL('http://localhost/ca-nhan?tab=settings');
  component = mount(Harness, { target: document.body }); await settle();
  expect(errors).toEqual([]); expect(document.querySelector('#settings-reading')).not.toBeNull();
});
it('keeps live theme changes usable when persistence throws', async () => {
  component = mount(Harness, { target: document.body }); await settle();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  expect(() => component!.applyTheme()).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe('dark');
});
it('reports a partial reading-preference write without claiming all settings were saved', async () => {
  mocks.url = new URL('http://localhost/ca-nhan?tab=settings');
  component = mount(Harness, { target: document.body }); await settle();
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) { if (key === 'tutam_read_line_height') throw new DOMException('Full', 'QuotaExceededError'); original.call(this, key, value); });
  const font = document.querySelectorAll<HTMLButtonElement>('.cn-font-btn')[1]; font.click(); await settle();
  expect(font.classList.contains('selected')).toBe(true); expect(errors).toEqual([]);
  expect(document.querySelector('.cn-feedback-badge-top')?.textContent).toMatch(/chưa.*lưu|không.*lưu/iu);
  expect(document.querySelector('.cn-feedback-badge-top')?.textContent).not.toContain('Đã lưu cài đặt');
});
it('exposes selected theme and language choices to assistive technology', async () => {
  mocks.url = new URL('http://localhost/ca-nhan?tab=settings');
  component = mount(Harness, { target: document.body }); await settle();
  const themes = document.querySelectorAll<HTMLButtonElement>('.cn-theme-toggle-group button');
  const languages = document.querySelectorAll<HTMLButtonElement>('.cn-lang-toggle-group button');
  expect(themes[0].getAttribute('aria-pressed')).toBe('true'); expect(themes[1].getAttribute('aria-pressed')).toBe('false');
  themes[1].click(); await settle(); expect(themes[0].getAttribute('aria-pressed')).toBe('false'); expect(themes[1].getAttribute('aria-pressed')).toBe('true');
  expect(languages[0].getAttribute('aria-pressed')).toBe('true'); languages[1].click(); await settle();
  expect(languages[0].getAttribute('aria-pressed')).toBe('false'); expect(languages[1].getAttribute('aria-pressed')).toBe('true');
});
