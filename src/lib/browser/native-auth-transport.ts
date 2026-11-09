import { fetchNativeJsonMutation, resolveApiUrl } from './native-api';

export interface VerifiedNativeLogin {
  success: true;
  userId: string;
  user: { id: string; email: string; displayName: string; avatarUrl: string; role: string };
  session: { csrfToken: string; expiresAt: string };
}

/** Use the native cookie jar and JSON transport for every identity provider. */
export async function verifyNativeLogin(payload: Record<string, unknown>,
  endpoint: '/api/auth/native-verify' | '/api/auth/facebook/native/redeem' = '/api/auth/native-verify'): Promise<VerifiedNativeLogin> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  };
  if (endpoint === '/api/auth/facebook/native/redeem') {
    (init.headers as Record<string, string>)['X-CSRF-Token'] = 'login';
  }
  const response = await fetchNativeJsonMutation(endpoint, init)
    ?? await fetch(resolveApiUrl(endpoint), init);
  const requestId = response.headers.get('x-request-id');
  const diagnostic = `HTTP ${response.status}${requestId ? `, mã ${requestId}` : ''}`;
  let data: any;
  try { data = await response.json(); } catch {
    throw new Error(`Máy chủ đăng nhập trả phản hồi không hợp lệ (${diagnostic}). Vui lòng thử lại sau.`);
  }
  if (!response.ok) {
    const message = data?.message || data?.error?.message;
    throw new Error(typeof message === 'string' && message.trim()
      ? message
      : `Không thể xác thực đăng nhập (${diagnostic}). Vui lòng thử lại sau.`);
  }
  // Never create an apparent local login from HTML, an empty body or SDK profile alone.
  if (data?.success !== true || typeof data?.userId !== 'string' || !data.userId
      || data?.user?.id !== data.userId || typeof data?.session?.csrfToken !== 'string'
      || !data.session.csrfToken || typeof data.session.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(data.session.expiresAt)) || Date.parse(data.session.expiresAt) <= Date.now()
      || !['email', 'displayName', 'avatarUrl', 'role'].every(key => typeof data.user[key] === 'string')) {
    throw new Error(`Máy chủ chưa tạo được phiên đăng nhập hợp lệ (${diagnostic}). Vui lòng đăng nhập lại.`);
  }
  return data as VerifiedNativeLogin;
}
