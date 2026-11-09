import type { CloudflareEnvLike } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { apiError } from './responses';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const NATIVE_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
]);

export function expectedOrigin(request: Request, env: CloudflareEnvLike): string {
  if (env.APP_ORIGIN) return new URL(env.APP_ORIGIN).origin;
  return new URL(request.url).origin;
}

export function isAllowedOrigin(origin: string | null, request: Request, env: CloudflareEnvLike): boolean {
  if (!origin) return false;
  if (origin === expectedOrigin(request, env)) return true;
  if (NATIVE_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost') || host.endsWith('.local');
  } catch {
    return false;
  }
}

export function enforceSameOriginMutation(
  request: Request,
  env: CloudflareEnvLike,
  session: { csrfToken?: string | null } | null,
  requestId: string,
): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;
  const origin = request.headers.get('origin');
  if (!origin || !isAllowedOrigin(origin, request, env)) {
    return apiError(403, 'invalid_origin', 'Nguồn yêu cầu không hợp lệ.', requestId);
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none' && !isAllowedOrigin(origin, request, env)) {
    return apiError(403, 'cross_site_request', 'Yêu cầu khác nguồn bị từ chối.', requestId);
  }
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    return apiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ.', requestId);
  }
  if (!session || !constantTimeEqual(request.headers.get('x-csrf-token') || '', session.csrfToken || '')) {
    return apiError(403, 'invalid_csrf', 'CSRF token không hợp lệ.', requestId);
  }
  return null;
}

export function enforcePublicWriteOrigin(
  request: Request,
  env: CloudflareEnvLike,
  requestId: string,
  session: { csrfToken?: string | null } | null = null,
): Response | null {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!isAllowedOrigin(origin, request, env) || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none' && !isAllowedOrigin(origin, request, env))) {
    return apiError(403, 'invalid_origin', 'Nguồn yêu cầu không hợp lệ.', requestId);
  }
  const token = request.headers.get('x-csrf-token') || '';
  const validToken = session?.csrfToken
    ? constantTimeEqual(token, session.csrfToken || '')
    : constantTimeEqual(token, 'public');
  if (!validToken) {
    return apiError(403, 'invalid_csrf', 'CSRF token công khai không hợp lệ.', requestId);
  }
  return null;
}

export function enforceLoginOrigin(request: Request, env: CloudflareEnvLike, requestId: string): Response | null {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!isAllowedOrigin(origin, request, env) || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none' && !isAllowedOrigin(origin, request, env))) {
    return apiError(403, 'invalid_origin', 'Nguồn yêu cầu không hợp lệ.', requestId);
  }
  if (request.headers.get('x-csrf-token') !== 'login') {
    return apiError(403, 'invalid_csrf', 'CSRF token đăng nhập không hợp lệ.', requestId);
  }
  return null;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let mismatch = a.length ^ b.length;
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    mismatch |= (a[index % Math.max(1, a.length)] || 0) ^
      (b[index % Math.max(1, b.length)] || 0);
  }
  return mismatch === 0;
}

export function clientAddressHashInput(request: Request): string {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

export function normalizeReturnTo(raw: string | null, env: CloudflareEnvLike, requestUrl: string): string {
  if (raw == null || raw === '') return '/';
  if (/[\u0000-\u001F\u007F\\]/u.test(raw) || /%5c|%00|%0a|%0d/iu.test(raw)) {
    throw new ServerInputError(400, 'invalid_return_to', 'Đường dẫn quay lại không hợp lệ.');
  }
  const origin = new URL(env.APP_ORIGIN || requestUrl).origin;
  if (raw.startsWith('//') || /%2f%2f/iu.test(raw)) {
    throw new ServerInputError(400, 'invalid_return_to', 'Đường dẫn quay lại không hợp lệ.');
  }
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    throw new ServerInputError(400, 'invalid_return_to', 'Đường dẫn quay lại không hợp lệ.');
  }
  if (url.origin !== origin) {
    throw new ServerInputError(400, 'invalid_return_to', 'Đường dẫn quay lại không hợp lệ.');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
