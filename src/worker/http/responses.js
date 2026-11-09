const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function json(data, status = 200, headers = {}) {
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

export function apiError(status, code, message, requestId, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return json({ error, requestId }, status);
}

export function methodNotAllowed(allowed, requestId) {
  return apiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ.', requestId, {
    allowed,
  });
}

export function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      ...SECURITY_HEADERS,
      'Cache-Control': 'no-store',
      Location: location,
      ...headers,
    },
  });
}

export function withRequestId(response, requestId) {
  const next = new Response(response.body, response);
  next.headers.set('X-Request-Id', requestId);
  return next;
}
