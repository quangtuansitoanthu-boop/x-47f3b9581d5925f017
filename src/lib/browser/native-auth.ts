import { isNativeApp, nativePlatform } from './native-platform';
import { verifyNativeLogin } from './native-auth-transport';
import { beginNativeAuthMutation } from './native-auth-transaction';
import { applyBrowserSession, detectUserRole, getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
import { formatVietnameseFullName } from '$lib/utils/vietnamese-name';
import type { PageSessionDTO } from '$lib/server/auth/types';
import { GOOGLE_IOS_CONFIGURATION_REQUIRED, SESSION_VERIFICATION_UNAVAILABLE } from '$lib/i18n/native-auth';
import type { SignInWithApplePlugin } from '@capacitor-community/apple-sign-in';

// Web Client ID: chỉ dùng cho serverClientId/verify idToken.
// Android phải dùng Android OAuth Client (SHA-1 + package vn.quangtu.tutam),
// cấu hình native qua strings.xml/capacitor.config. Không hardcode Web ID làm androidClientId.
const GOOGLE_WEB_CLIENT_ID =
  '18472854734-2hpib1tghifb2li4s42vqaqvthfbn1jp.apps.googleusercontent.com';

function nativeGoogleClientId(): string {
  return nativePlatform() === 'ios' ? String(import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? '').trim() : GOOGLE_WEB_CLIENT_ID;
}

function isGoogleLoginCancelled(error: unknown): boolean {
  const details = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : null;
  if (details?.code != null) {
    return String(details.code) === (nativePlatform() === 'ios' ? '-5' : '12501');
  }
  // Older bridges exposed only a message; current iOS returns a localized message and code.
  return /cancel|12501/i.test(String(details?.message || error || ''));
}

export interface NativeAuthResult {
  success: boolean;
  error?: string;
}

async function runNativeLogin(operation: (isCurrent: () => boolean) => Promise<NativeAuthResult>): Promise<NativeAuthResult> {
  if (!isNativeApp()) return operation(() => true);
  const release = beginNativeAuthMutation();
  if (!release) return { success: false, error: SESSION_VERIFICATION_UNAVAILABLE.vi };
  let changed: (() => void) | undefined;
  try {
    const sessionKey = () => {
      const value = getBrowserSessionSnapshot();
      return JSON.stringify([value.authenticated, value.user?.id, value.csrfToken, value.user?.role]);
    };
    const initial = sessionKey();
    let stale = false;
    changed = () => { if (sessionKey() !== initial) stale = true; };
    window.addEventListener(SESSION_CHANGE_EVENT, changed);
    return await operation(() => !stale && sessionKey() === initial);
  } catch {
    return { success: false, error: SESSION_VERIFICATION_UNAVAILABLE.vi };
  } finally {
    try { if (changed) window.removeEventListener(SESSION_CHANGE_EVENT, changed); }
    finally { release(); }
  }
}

function requireCurrentLogin(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new Error(SESSION_VERIFICATION_UNAVAILABLE.vi);
}

export function loginWithGoogleNative(): Promise<NativeAuthResult> {
  return runNativeLogin(performGoogleLogin);
}

async function performGoogleLogin(isCurrent: () => boolean): Promise<NativeAuthResult> {
  if (!isNativeApp()) {
    window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
    return { success: true };
  }

  try {
    const clientId = nativeGoogleClientId();
    if (!clientId) return { success: false, error: GOOGLE_IOS_CONFIGURATION_REQUIRED };
    let GoogleAuth = (window as any).Capacitor?.Plugins?.GoogleAuth;
    if (!GoogleAuth) {
      try {
        const mod = await import('@codetrix-studio/capacitor-google-auth');
        GoogleAuth = mod.GoogleAuth || (window as any).Capacitor?.Plugins?.GoogleAuth;
      } catch {}
    }

    if (!GoogleAuth) {
      return { success: false, error: 'Chức năng đăng nhập Google chưa sẵn sàng trên thiết bị này.' };
    }

    requireCurrentLogin(isCurrent);
    try {
      await GoogleAuth.initialize({
        clientId,
        scopes: ['profile', 'email'],
        grantOfflineAccess: false
      });
    } catch (error) {
      if (nativePlatform() === 'ios') throw error;
      // already initialized
    }
    requireCurrentLogin(isCurrent);

    // Xóa session Google cũ trước khi đăng nhập để Google Play Services luôn hiển thị
    // hộp thoại chọn tài khoản Gmail (Account Chooser) cho người dùng chọn tài khoản trên máy,
    // thay vì tự động chọn lại tài khoản cũ.
    try {
      await GoogleAuth.signOut();
    } catch (error) {
      if (nativePlatform() === 'ios') throw error;
      // bỏ qua nếu chưa từng đăng nhập
    }
    requireCurrentLogin(isCurrent);

    let user: any;
    try {
      user = await GoogleAuth.signIn();
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      if (isGoogleLoginCancelled(err)) {
        return { success: false, error: 'Đã hủy đăng nhập.' };
      }
      if (nativePlatform() === 'android' && (String(err?.code) === '10' || /\b10\b|DEVELOPER_ERROR/.test(errMsg))) {
        return {
          success: false,
          error: 'Lỗi cấu hình Google (Mã 10: DEVELOPER_ERROR). Vui lòng thêm mã SHA-1 của ứng dụng vào Google Cloud Console.'
        };
      }
      console.warn('GoogleAuth native sign-in failed.');
      return { success: false, error: err?.message || 'Lỗi đăng nhập Google trên thiết bị.' };
    }

    requireCurrentLogin(isCurrent);
    const idToken = user?.authentication?.idToken || (user as any)?.idToken;

    if (!idToken) {
      return { success: false, error: 'Không nhận được token xác thực từ Google.' };
    }

    const resData = await verifyNativeLogin({
      provider: 'google',
      token: idToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        imageUrl: user.imageUrl || user.picture || (user as any)?.photoUrl || '',
      }
    });
    // Native HTTP có thể đã nhận cookie; guard chỉ chặn áp dụng DTO cũ, không hoàn tác Set-Cookie.
    requireCurrentLogin(isCurrent);
    const userEmail = String(resData.user.email || user.email || '').toLowerCase().trim();
    let userName = formatVietnameseFullName(
      String(resData.user.displayName || user.name || '').trim(),
      (user as any)?.givenName,
      (user as any)?.familyName
    );
    if (!userName || userName.includes('@')) {
      if (userEmail === 'tutap.phatphap26@gmail.com' || userEmail.includes('quangtu')) {
        userName = 'Quang Từ';
      } else if (userEmail === 'chienqan@gmail.com') {
        userName = 'Chiến An';
      } else if (userEmail.includes('@')) {
        userName = userEmail.split('@')[0].replace(/[._-]+/g, ' ')
          .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      } else {
        userName = 'Phật tử';
      }
    }
    const role = detectUserRole(userEmail, userName, resData.user.role);
    const userAvatar = String(
      resData.user.avatarUrl ||
      user.imageUrl ||
      user.picture ||
      (user as any)?.photoUrl ||
      (user as any)?.photo ||
      ''
    ).trim();
    const savedUserSession: PageSessionDTO = {
      authenticated: true,
      user: {
        id: resData.userId,
        email: userEmail,
        displayName: userName,
        avatarUrl: userAvatar,
        role,
      },
      csrfToken: resData.session.csrfToken,
      expiresAt: resData.session.expiresAt,
    };
    const sessionApplied = applyBrowserSession(savedUserSession);
    try {
      localStorage.setItem('tutam_native_auth_provider', 'google');
    } catch {}

    if (!sessionApplied) window.location.reload();
    return { success: true };
  } catch (err: any) {
    if (isGoogleLoginCancelled(err)) {
      return { success: false, error: 'Đã hủy đăng nhập.' };
    }
    return { success: false, error: err?.message || 'Lỗi đăng nhập Google.' };
  }
}

export function loginWithFacebookNative(): Promise<NativeAuthResult> {
  return runNativeLogin(performFacebookLogin);
}

async function performFacebookLogin(isCurrent: () => boolean): Promise<NativeAuthResult> {
  if (!isNativeApp()) {
    window.location.href = `/api/auth/facebook?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
    return { success: true };
  }

  if (nativePlatform() === 'ios') {
    let unsubscribe = () => {};
    try {
      const { loginFacebookInBrowser, cancelFacebookBrowserLogin } = await import('./facebook-browser-login');
      const { SESSION_CHANGE_EVENT, getBrowserSessionSnapshot } = await import('$lib/stores/session.svelte');
      const sessionKey = () => {
        const value = getBrowserSessionSnapshot();
        return JSON.stringify([value.authenticated, value.user?.id, value.csrfToken, value.user?.role]);
      };
      const initialSession = sessionKey();
      let current = true;
      const changed = () => {
        // Resume có thể xác minh lại cùng phiên; chỉ thay phiên/principal mới làm giao dịch cũ mất hiệu lực.
        if (sessionKey() === initialSession) return;
        current = false; void cancelFacebookBrowserLogin();
      };
      window.addEventListener(SESSION_CHANGE_EVENT, changed);
      unsubscribe = () => window.removeEventListener(SESSION_CHANGE_EVENT, changed);
      const verified = await loginFacebookInBrowser(() => current && isCurrent());
      requireCurrentLogin(isCurrent);
      unsubscribe();
      const applied = applyBrowserSession({ authenticated: true, user: {
        id: verified.userId, email: verified.user.email, displayName: verified.user.displayName,
        avatarUrl: verified.user.avatarUrl, role: detectUserRole(verified.user.email, verified.user.displayName, verified.user.role),
      }, csrfToken: verified.session.csrfToken, expiresAt: verified.session.expiresAt });
      try { localStorage.setItem('tutam_native_auth_provider', 'facebook'); } catch {}
      if (!applied) window.location.reload();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : SESSION_VERIFICATION_UNAVAILABLE.vi };
    } finally { unsubscribe(); }
  }

  try {
    let FacebookLogin = (window as any).Capacitor?.Plugins?.FacebookLogin;
    if (!FacebookLogin) {
      try {
        const mod = await import('@capacitor-community/facebook-login');
        FacebookLogin = mod.FacebookLogin || (window as any).Capacitor?.Plugins?.FacebookLogin;
      } catch {}
    }

    if (!FacebookLogin) {
      return { success: false, error: 'Chức năng đăng nhập Facebook chưa sẵn sàng trên thiết bị này.' };
    }

    requireCurrentLogin(isCurrent);
    try {
      await FacebookLogin.initialize({ appId: '2174388996483129' });
    } catch {}
    requireCurrentLogin(isCurrent);

    // A revoked/expired SDK session can otherwise be returned by login again.
    // Clear provider state only; application sessions still come from the server.
    if (typeof FacebookLogin.logout === 'function') await FacebookLogin.logout();
    requireCurrentLogin(isCurrent);

    let result: any;
    const limitedLogin = nativePlatform() === 'ios';
    const nonce = limitedLogin
      ? Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
      : '';
    try {
      result = await FacebookLogin.login({ permissions: ['public_profile', 'email'], ...(limitedLogin ? { tracking: 'limited', nonce } : {}) });
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      if (errMsg.toLowerCase().includes('cancel')) {
        return { success: false, error: 'Đã hủy đăng nhập.' };
      }
      console.warn('FacebookLogin native error:', err);
      return { success: false, error: err?.message || 'Lỗi đăng nhập Facebook trên thiết bị.' };
    }

    requireCurrentLogin(isCurrent);
    if (!result?.accessToken?.token) {
      return { success: false, error: 'Đã hủy đăng nhập hoặc không nhận được token từ Facebook.' };
    }

    let fbProfileData: any = null;
    if (!limitedLogin) try {
      fbProfileData = await FacebookLogin.getProfile({
        fields: ['id', 'name', 'email', 'picture.type(large)']
      });
    } catch (profErr) {
      console.warn('FacebookLogin.getProfile error, trying fallback:', profErr);
    }

    // Direct Graph API fallback if profile data is missing
    if (!limitedLogin && (!fbProfileData?.name || !fbProfileData?.picture)) {
      try {
        const graphRes = await fetch(
          `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(result.accessToken.token)}`
        );
        if (graphRes.ok) {
          const graphJson = await graphRes.json();
          fbProfileData = {
            ...graphJson,
            ...fbProfileData,
            name: fbProfileData?.name || graphJson?.name,
            email: fbProfileData?.email || graphJson?.email,
            picture: fbProfileData?.picture || graphJson?.picture
          };
        }
      } catch (graphErr) {
        console.warn('Client graph fallback error:', graphErr);
      }
    }

    const rawPicture = fbProfileData?.picture;
    const clientAvatar = String(
      rawPicture?.data?.url ||
      rawPicture?.url ||
      (typeof rawPicture === 'string' ? rawPicture : '')
    ).trim();
    const clientName = String(fbProfileData?.name || '').trim();
    const clientEmail = String(fbProfileData?.email || '').toLowerCase().trim();

    requireCurrentLogin(isCurrent);
    const resData = await verifyNativeLogin({
      provider: 'facebook',
      token: result.accessToken.token,
      ...(limitedLogin ? { tokenType: 'limited', nonce } : {}),
      userId: result.accessToken.userId,
      user: {
        name: clientName,
        email: clientEmail,
        picture: clientAvatar
      }
    });
    requireCurrentLogin(isCurrent);
    const fbEmail = String(
      resData?.user?.email ||
      clientEmail ||
      ''
    ).toLowerCase().trim();

    const fbName = String(
      resData?.user?.displayName ||
      clientName ||
      'Người dùng Facebook'
    ).trim();

    const fbAvatar = String(
      resData?.user?.avatarUrl ||
      clientAvatar ||
      ''
    ).trim();

    const savedUserSession: PageSessionDTO = {
      authenticated: true,
      user: {
        id: resData.userId,
        email: fbEmail,
        displayName: fbName,
        avatarUrl: fbAvatar,
        role: detectUserRole(fbEmail, fbName, resData.user.role),
      },
      csrfToken: resData.session.csrfToken,
      expiresAt: resData.session.expiresAt,
    };
    const sessionApplied = applyBrowserSession(savedUserSession);
    try {
      localStorage.setItem('tutam_native_auth_provider', 'facebook');
    } catch {}

    if (!sessionApplied) window.location.reload();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi đăng nhập Facebook.' };
  }
}

export async function authorizeAppleAccountDeletion(shouldContinue: () => boolean = () => true): Promise<{
  appleIdentityToken: string; appleAuthorizationCode: string;
}> {
  const unavailable = () => new Error(SESSION_VERIFICATION_UNAVAILABLE.vi);
  if (!isNativeApp() || nativePlatform() !== 'ios' || !shouldContinue()) throw unavailable();
  try {
    const nativeWindow = window as typeof window & { Capacitor?: { Plugins?: { SignInWithApple?: SignInWithApplePlugin } } };
    const plugin = nativeWindow.Capacitor?.Plugins?.SignInWithApple
      ?? (await import('@capacitor-community/apple-sign-in')).SignInWithApple;
    if (!shouldContinue()) throw unavailable();
    const result = await plugin.authorize({
      clientId: 'vn.quangtu.tutam',
      redirectURI: 'https://quangtu.vn/api/auth/apple/callback',
      scopes: 'email name',
    });
    if (!shouldContinue()) throw unavailable();
    const { identityToken, authorizationCode } = result.response ?? {};
    if (typeof identityToken !== 'string' || !identityToken.trim()
      || typeof authorizationCode !== 'string' || !authorizationCode.trim()) throw unavailable();
    // Chỉ trả credential cho lần xóa đang chờ; không đăng nhập lại hoặc ghi storage.
    return { appleIdentityToken: identityToken, appleAuthorizationCode: authorizationCode };
  } catch {
    throw unavailable();
  }
}

export function loginWithAppleNative(): Promise<NativeAuthResult> {
  return runNativeLogin(performAppleLogin);
}

function isAppleAuthorizationCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { domain?: unknown; code?: unknown; message?: unknown };
  const domain = 'com.apple.AuthenticationServices.AuthorizationError';
  if (value.domain !== undefined && value.domain !== domain) return false;
  if (value.code !== undefined) return (value.code === 1001 || value.code === '1001')
    && (value.domain === domain || (typeof value.message === 'string'
      && /\bcom\.apple\.AuthenticationServices\.AuthorizationError\b/u.test(value.message)));
  // Bridge Apple 7.1 chỉ gửi localizedDescription, không kèm NSError.code/domain.
  return typeof value.message === 'string'
    && /\bcom\.apple\.AuthenticationServices\.AuthorizationError\s+error\s+1001(?:[.)\s]|$)/u.test(value.message);
}

async function performAppleLogin(isCurrent: () => boolean): Promise<NativeAuthResult> {
  if (!isNativeApp() || nativePlatform() !== 'ios') {
    return { success: false, error: 'Chức năng chỉ hỗ trợ trên thiết bị iOS.' };
  }

  try {
    const SignInWithApple = (window as any).Capacitor?.Plugins?.SignInWithApple
      || (await import('@capacitor-community/apple-sign-in')).SignInWithApple;
    if (!SignInWithApple) {
      return { success: false, error: 'Chức năng đăng nhập Apple chưa sẵn sàng.' };
    }

    requireCurrentLogin(isCurrent);
    let res: Awaited<ReturnType<SignInWithApplePlugin['authorize']>>;
    try {
      res = await SignInWithApple.authorize({
        clientId: 'vn.quangtu.tutam',
        redirectURI: 'https://quangtu.vn/api/auth/apple/callback',
        scopes: 'email name',
      });
    } catch (error) {
      if (isAppleAuthorizationCancelled(error)) return { success: false };
      throw error;
    }

    requireCurrentLogin(isCurrent);
    if (!res.response?.identityToken) {
      return { success: false, error: 'Không nhận được token xác thực từ Apple.' };
    }

    const resData = await verifyNativeLogin({
      provider: 'apple',
      token: res.response.identityToken,
      ...(typeof res.response.authorizationCode === 'string' && res.response.authorizationCode.trim()
        ? { authorizationCode: res.response.authorizationCode } : {}),
      user: {
        givenName: res.response.givenName,
        familyName: res.response.familyName,
        email: res.response.email
      }
    });
    requireCurrentLogin(isCurrent);
    const displayName = resData.user.displayName || formatVietnameseFullName(
      null,
      res.response.givenName,
      res.response.familyName
    ) || 'Phật tử Apple';
    const email = String(resData.user.email || res.response.email || '').toLowerCase().trim();
    const role = detectUserRole(email, displayName, resData.user.role);
    const savedUserSession: PageSessionDTO = {
      authenticated: true,
      user: {
        id: resData.userId,
        email,
        displayName,
        avatarUrl: resData.user.avatarUrl || '',
        role,
      },
      csrfToken: resData.session.csrfToken,
      expiresAt: resData.session.expiresAt,
    };
    const sessionApplied = applyBrowserSession(savedUserSession);
    try {
      localStorage.setItem('tutam_native_auth_provider', 'apple');
    } catch {}

    if (!sessionApplied) window.location.reload();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi đăng nhập Apple.' };
  }
}

export async function logoutNativeAuth(isCurrent: () => boolean = () => true): Promise<void> {
  if (!isCurrent()) return;
  const provider = (() => {
    try {
      return localStorage.getItem('tutam_native_auth_provider');
    } catch {
      return null;
    }
  })();

  try {
    localStorage.removeItem('tutam_native_auth_provider');
  } catch {}

  // Đăng xuất khỏi GoogleAuth native để giải phóng tài khoản và xóa bộ nhớ đệm
  if (isNativeApp() && provider === 'google' && nativeGoogleClientId()) {
    try {
      const GoogleAuth = (window as any).Capacitor?.Plugins?.GoogleAuth;
      if (GoogleAuth) {
        try {
          await GoogleAuth.initialize({
            clientId: nativeGoogleClientId(),
            scopes: ['profile', 'email'],
            grantOfflineAccess: false
          });
        } catch {}
        if (!isCurrent()) return;
        await GoogleAuth.signOut();
      }
    } catch (e) {
      console.warn('GoogleAuth native signOut ignored:', e);
    }
  }
}

