const NATIVE_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
]);

function isNativeOrLocalOrigin(origin: string): boolean {
  if (!origin) return false;
  if (NATIVE_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost') || host.endsWith('.local');
  } catch {
    return false;
  }
}

function resolveCorsOrigin(request: Request): string | null {
  const origin = (request.headers.get('origin') || '').trim();
  if (isNativeOrLocalOrigin(origin)) return origin;
  return null;
}

/** Trả preflight OPTIONS cho app native; null khi không phải preflight native. */
export function corsPreflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = resolveCorsOrigin(request) || '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Accept, Range, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, X-Next-Cursor',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

/**
 * Gắn CORS cho response API khi request đến từ app native.
 * Cookie/session cross-origin vẫn cần credentials:include phía client;
 * ở đây chỉ mở đọc công khai + preflight, không nới lỏng CSRF/same-origin
 * cho các mutation (giữ nguyên enforceSameOriginMutation).
 */
export function withCors(response: Response, request: Request): Response {
  const origin = resolveCorsOrigin(request);
  if (!origin) return response;
  const next = new Response(response.body, response);
  next.headers.set('Access-Control-Allow-Origin', origin);
  next.headers.set('Access-Control-Allow-Credentials', 'true');
  next.headers.set('Access-Control-Expose-Headers', 'X-Next-Cursor, Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag');
  next.headers.set('Vary', 'Origin');
  return next;
}

