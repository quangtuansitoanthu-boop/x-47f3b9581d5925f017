const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): Response {
  const error: Record<string, unknown> = { code, message };
  if (details !== undefined) error.details = details;
  return json({ error, requestId }, status);
}

export function methodNotAllowed(allowed: string[], requestId: string): Response {
  return apiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ.', requestId, {
    allowed,
  });
}

export function redirect(location: string, extraHeaders?: Headers): Response {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-store',
    Location: location,
  });
  if (extraHeaders) {
    extraHeaders.forEach((value, key) => headers.append(key, value));
  }
  return new Response(null, { status: 302, headers });
}

export function withRequestId(response: Response, requestId: string): Response {
  const next = new Response(response.body, response);
  next.headers.set('X-Request-Id', requestId);
  return next;
}
