import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), redeem: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ authenticate: mocks.authenticate, cancel: vi.fn() }) }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (path: string) => `https://quangtu.vn${path}` }));
vi.mock('$lib/browser/native-auth-transport', () => ({ verifyNativeLogin: mocks.redeem }));
import { loginFacebookInBrowser, readFacebookHandoff } from '$lib/browser/facebook-browser-login';
const callback = `vn.quangtu.tutam://auth/facebook?code=${'a'.repeat(43)}`;
beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue({ url: callback }); mocks.redeem.mockResolvedValue({ success: true }); });
afterEach(() => vi.restoreAllMocks());

it.each([
  'https://evil.test/auth/facebook?code=x', callback + '&token=secret', callback + '#access_token=secret',
  callback.replace('/facebook', '/other'), callback.replace('auth/', 'attacker/'), callback + '&code=second',
])('rejects an unexpected callback without redeeming: %s', async url => {
  mocks.authenticate.mockResolvedValue({ url });
  await expect(loginFacebookInBrowser()).rejects.toThrow();
  expect(mocks.redeem).not.toHaveBeenCalled();
});
it('sends only a hash in the start URL and keeps the verifier in the POST body', async () => {
  await loginFacebookInBrowser();
  const start = new URL(mocks.authenticate.mock.calls[0][0].url);
  const body = mocks.redeem.mock.calls[0][0];
  expect(start.searchParams.size).toBe(1);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.verifier))).toString('base64url');
  expect(start.searchParams.get('challenge')).toBe(hash);
  expect(start.href).not.toContain(body.verifier);
  expect(readFacebookHandoff(callback)).toBe(body.code);
  expect(mocks.redeem).toHaveBeenCalledTimes(1);
});
it('rejects a concurrent login and restores retry after cancellation', async () => {
  let cancel!: (error: unknown) => void;
  mocks.authenticate.mockImplementationOnce(() => new Promise((_resolve, reject) => { cancel = reject; }));
  const first = loginFacebookInBrowser();
  await vi.waitFor(() => expect(mocks.authenticate).toHaveBeenCalledTimes(1));
  await expect(loginFacebookInBrowser()).rejects.toThrow();
  cancel({ code: 'CANCELLED' }); await expect(first).rejects.toThrow('Đã hủy');
  expect(mocks.redeem).not.toHaveBeenCalled();
  await expect(loginFacebookInBrowser()).resolves.toMatchObject({ success: true });
  expect(new URL(mocks.authenticate.mock.calls[0][0].url).searchParams.get('challenge'))
    .not.toBe(new URL(mocks.authenticate.mock.calls[1][0].url).searchParams.get('challenge'));
});
it('does not redeem a callback after the session/principal changed', async () => {
  let current = true;
  mocks.authenticate.mockImplementationOnce(async () => { current = false; return { url: callback }; });
  await expect(loginFacebookInBrowser(() => current)).rejects.toThrow();
  expect(mocks.redeem).not.toHaveBeenCalled();
});
