import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Harness from './account-delete-session-harness.svelte';
import { beginNativeAuthMutation, isNativeAuthMutationActive } from '$lib/browser/native-auth-transaction';

const mocks = vi.hoisted(() => ({ csrf: vi.fn(), request: vi.fn(), logout: vi.fn(), clearLocal: vi.fn(), clearBrowser: vi.fn(), apple: vi.fn(), native: vi.fn(() => false) }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/ca-nhan?tab=account') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/browser/session-csrf', () => ({ requireBrowserCsrf: mocks.csrf, fetchWithSessionRefresh: mocks.request }));
vi.mock('$lib/browser/native-auth', () => ({ logoutNativeAuth: mocks.logout, loginWithGoogleNative: vi.fn(), loginWithFacebookNative: vi.fn(), loginWithAppleNative: vi.fn(), authorizeAppleAccountDeletion: mocks.apple }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: mocks.native, nativePlatform: () => mocks.native() ? 'ios' : 'web' }));
vi.mock('$lib/stores/session.svelte', async importOriginal => ({
  ...await importOriginal<typeof import('$lib/stores/session.svelte')>(),
  clearLocalSession: mocks.clearLocal, clearBrowserSession: mocks.clearBrowser,
}));
vi.mock('$lib/browser/app-stats', () => ({ getCachedInstallCount: () => 1230, fetchInstallCount: async () => 1230, formatInstallNumber: () => '1.230' }));

let component: ReturnType<typeof Harness> | undefined;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn((query: string): MediaQueryList => {
    const target = new EventTarget();
    return Object.assign(target, {
      matches: false, media: query, onchange: null,
      addListener: (listener: EventListener) => target.addEventListener('change', listener),
      removeListener: (listener: EventListener) => target.removeEventListener('change', listener),
    }) as MediaQueryList;
  }));
  mocks.csrf.mockResolvedValue('csrf-a');
  mocks.native.mockReturnValue(false);
  mocks.apple.mockResolvedValue({ appleIdentityToken: 'fresh-apple-token', appleAuthorizationCode: 'fresh-apple-code' });
  mocks.logout.mockResolvedValue(undefined);
  mocks.request.mockResolvedValue(Response.json({ deleted: true }));
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren(); localStorage.clear();
});

async function confirmDeletion() {
  component = mount(Harness, { target: document.body });
  flushSync(); await tick();
  (document.querySelector('.cn-btn-delete-account') as HTMLButtonElement).click(); flushSync();
  const input = document.querySelector('#delete-confirm-input') as HTMLInputElement;
  input.value = document.querySelector('.cn-delete-code-display')!.textContent!.trim();
  input.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
  (document.querySelector('.cn-delete-dialog .cn-btn-danger') as HTMLButtonElement).click();
  await tick();
}

it('does not send account deletion while a native login can still commit its cookie', async () => {
  mocks.native.mockReturnValue(true);
  const release = beginNativeAuthMutation()!;
  try {
    await confirmDeletion(); await tick(); await tick();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.clearBrowser).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('native_auth_busy');
  } finally { release(); }
});

it('keeps the cookie transaction until the Apple retry finishes, including cancellation', async () => {
  mocks.native.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce(Response.json({ code: 'apple_reauthentication_required' }, { status: 409 }));
  let cancel!: () => void;
  mocks.apple.mockImplementationOnce(() => new Promise((_resolve, reject) => { cancel = () => reject(new Error('cancelled')); }));
  await confirmDeletion();
  await vi.waitFor(() => expect(mocks.apple).toHaveBeenCalledOnce());
  const held = isNativeAuthMutationActive();
  const competing = beginNativeAuthMutation(); competing?.();
  cancel(); await tick(); await tick();
  expect(held).toBe(true);
  expect(competing).toBeNull();
  expect(isNativeAuthMutationActive()).toBe(false);
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
});

it('opts initial deletion and Apple credential retry into preserving newer cookies', async () => {
  mocks.native.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce(Response.json({ code: 'apple_reauthentication_required' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));
  await confirmDeletion();
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  const first = mocks.request.mock.calls[0], retry = mocks.request.mock.calls[1];
  for (const [path, request] of [first, retry]) {
    expect(path).toBe('/api/auth/delete-account');
    expect(request).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a' } });
  }
  expect(JSON.parse(first[1].body)).toEqual({ preserveSessionCookie: true });
  expect(JSON.parse(retry[1].body)).toEqual({ preserveSessionCookie: true, appleIdentityToken: 'fresh-apple-token', appleAuthorizationCode: 'fresh-apple-code' });
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
});

it('does not delete the replacement account when its CSRF arrives after confirmation for the previous principal', async () => {
  let finishCsrf!: (token: string) => void;
  mocks.csrf.mockImplementation(() => new Promise<string>(resolve => { finishCsrf = resolve; }));
  await confirmDeletion();
  expect(mocks.csrf).toHaveBeenCalledTimes(1);
  component!.switchAccount(); flushSync();
  finishCsrf('csrf-b'); await tick(); await tick();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.clearLocal).not.toHaveBeenCalled();
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
});

it('does not clear the replacement account when deletion of the previous principal completes late', async () => {
  let finishDeletion!: (response: Response) => void;
  mocks.request.mockImplementation(() => new Promise<Response>(resolve => { finishDeletion = resolve; }));
  await confirmDeletion();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  component!.switchAccount(); flushSync();
  finishDeletion(Response.json({ deleted: true })); await tick(); await tick();
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.clearLocal).not.toHaveBeenCalled();
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
});

it('invalidates the displayed confirmation when its account changes before submission', async () => {
  component = mount(Harness, { target: document.body });
  flushSync(); await tick();
  (document.querySelector('.cn-btn-delete-account') as HTMLButtonElement).click(); flushSync();
  const input = document.querySelector('#delete-confirm-input') as HTMLInputElement;
  input.value = document.querySelector('.cn-delete-code-display')!.textContent!.trim();
  input.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
  component.switchAccount(); flushSync(); await tick();
  expect(document.querySelector('.cn-delete-dialog')).toBeNull();
  expect(mocks.csrf).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each([
  { code: 'apple_reauthentication_required', message: 'Apple reauthorization required' },
  { error: { code: 'apple_reauthentication_required', message: 'Apple reauthorization required' } },
])('opens Apple reauthorization only after the server challenge and retries deletion once without clearing a failed account: %j', async challenge => {
  mocks.native.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce(Response.json(challenge, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ code: 'apple_authorization_unavailable', message: 'Try again later' }, { status: 503 }));
  await confirmDeletion();
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  expect(mocks.apple).toHaveBeenCalledOnce();
  expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.apple.mock.invocationCallOrder[0]);
  expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ preserveSessionCookie: true });
  expect(JSON.parse(mocks.request.mock.calls[1][1].body)).toEqual({ appleIdentityToken: 'fresh-apple-token', appleAuthorizationCode: 'fresh-apple-code', preserveSessionCookie: true });
  await tick();
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.clearLocal).not.toHaveBeenCalled();
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
  expect(localStorage.getItem('appleAuthorizationCode')).toBeNull();
});

it('does not retry deletion for a replacement principal when the Apple sheet resolves late', async () => {
  mocks.native.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce(Response.json({ code: 'apple_reauthentication_required' }, { status: 409 }));
  let finishApple!: (credentials: { appleIdentityToken: string; appleAuthorizationCode: string }) => void;
  mocks.apple.mockImplementationOnce(() => new Promise(resolve => { finishApple = resolve; }));
  await confirmDeletion();
  await vi.waitFor(() => expect(mocks.apple).toHaveBeenCalledOnce());
  component!.switchAccount(); flushSync();
  finishApple({ appleIdentityToken: 'old-owner-token', appleAuthorizationCode: 'old-owner-code' });
  await tick(); await tick();
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.clearLocal).not.toHaveBeenCalled();
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
});

it('does not ask Apple again after a repeated server challenge', async () => {
  mocks.native.mockReturnValue(true);
  mocks.request.mockImplementation(async () => Response.json({ code: 'apple_reauthentication_required' }, { status: 409 }));
  await confirmDeletion();
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  await tick();
  expect(mocks.apple).toHaveBeenCalledOnce();
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
});

it('keeps the account and local data when Apple authorization is cancelled', async () => {
  mocks.native.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce(Response.json({ code: 'apple_reauthentication_required' }, { status: 409 }));
  mocks.apple.mockRejectedValueOnce(new Error('Authorization cancelled'));
  await confirmDeletion();
  await vi.waitFor(() => expect(mocks.apple).toHaveBeenCalledOnce());
  await tick();
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.clearLocal).not.toHaveBeenCalled();
  expect(mocks.clearBrowser).not.toHaveBeenCalled();
});
