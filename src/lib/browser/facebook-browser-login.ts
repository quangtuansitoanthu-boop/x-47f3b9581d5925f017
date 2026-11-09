import { registerPlugin } from '@capacitor/core';
import { resolveApiUrl } from './native-api';
import { verifyNativeLogin, type VerifiedNativeLogin } from './native-auth-transport';
import { FACEBOOK_BROWSER_ERRORS } from '$lib/i18n/native-auth';

const browserAuth = registerPlugin<{ authenticate(options: { url: string }): Promise<{ url: string }>; cancel(): Promise<void> }>('FacebookBrowserAuth');
let pending = false;

export function readFacebookHandoff(value: string): string {
  const url = new URL(value);
  const code = url.searchParams.get('code');
  if (url.protocol !== 'vn.quangtu.tutam:' || url.hostname !== 'auth' || url.pathname !== '/facebook'
    || url.username || url.password || url.port || url.hash || url.searchParams.size !== 1
    || !code || !/^[A-Za-z0-9_-]{43}$/u.test(code)) throw new Error(FACEBOOK_BROWSER_ERRORS.invalid);
  return code;
}

export async function loginFacebookInBrowser(isCurrent: () => boolean = () => true): Promise<VerifiedNativeLogin> {
  if (pending) throw new Error(FACEBOOK_BROWSER_ERRORS.busy);
  pending = true;
  // Verifier chỉ sống trong bộ nhớ: process bị đóng thì đăng nhập lại, không phục hồi một phiên thiếu bằng chứng.
  try {
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
    if (!isCurrent()) throw new Error(FACEBOOK_BROWSER_ERRORS.stale);
    const start = new URL(resolveApiUrl('/api/auth/facebook/native'));
    start.searchParams.set('challenge', challenge);
    const result = await browserAuth.authenticate({ url: start.href });
    if (!isCurrent()) throw new Error(FACEBOOK_BROWSER_ERRORS.stale);
    const code = readFacebookHandoff(result.url);
    const session = await verifyNativeLogin({ code, verifier }, '/api/auth/facebook/native/redeem');
    if (!isCurrent()) throw new Error(FACEBOOK_BROWSER_ERRORS.stale);
    return session;
  } catch (error) {
    // Không log URL callback, mã bàn giao hoặc lỗi gốc từ native.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'CANCELLED') {
      throw new Error(FACEBOOK_BROWSER_ERRORS.cancelled);
    }
    throw error;
  } finally { pending = false; }
}

export async function cancelFacebookBrowserLogin(): Promise<void> {
  if (pending) await browserAuth.cancel().catch(() => {});
}
