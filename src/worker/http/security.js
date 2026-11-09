import { apiError } from './responses.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function expectedOrigin(request, env) {
  if (env.APP_ORIGIN) return new URL(env.APP_ORIGIN).origin;
  return new URL(request.url).origin;
}

export function enforceSameOriginMutation(request, env, session, requestId) {
  if (SAFE_METHODS.has(request.method)) return null;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expectedOrigin(request, env)) {
    return apiError(403, 'invalid_origin', 'Nguồn yêu cầu không hợp lệ.', requestId);
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') {
    return apiError(403, 'cross_site_request', 'Yêu cầu khác nguồn bị từ chối.', requestId);
  }
  if (request.method !== 'POST' && request.method !== 'PUT' &&
      request.method !== 'PATCH' && request.method !== 'DELETE') {
    return apiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ.', requestId);
  }
  if (!session || !constantTimeEqual(request.headers.get('x-csrf-token') || '', session.csrfToken)) {
    return apiError(403, 'invalid_csrf', 'CSRF token không hợp lệ.', requestId);
  }
  return null;
}

export function enforcePublicWriteOrigin(request, env, requestId, session = null) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin !== expectedOrigin(request, env) || (fetchSite && fetchSite !== 'same-origin')) {
    return apiError(403, 'invalid_origin', 'Nguồn yêu cầu không hợp lệ.', requestId);
  }
  const token = request.headers.get('x-csrf-token') || '';
  const validToken = session?.csrfToken
    ? constantTimeEqual(token, session.csrfToken)
    : constantTimeEqual(token, 'public');
  if (!validToken) {
    return apiError(403, 'invalid_csrf', 'CSRF token công khai không hợp lệ.', requestId);
  }
  return null;
}

export function enforceLoginOrigin(request, env, requestId) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin !== expectedOrigin(request, env) || (fetchSite && fetchSite !== 'same-origin')) {
    return apiError(403, 'invalid_origin', 'Nguồn yêu cầu không hợp lệ.', requestId);
  }
  if (request.headers.get('x-csrf-token') !== 'login') {
    return apiError(403, 'invalid_csrf', 'CSRF token đăng nhập không hợp lệ.', requestId);
  }
  return null;
}

export function constantTimeEqual(left, right) {
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

export function clientAddressHashInput(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}
