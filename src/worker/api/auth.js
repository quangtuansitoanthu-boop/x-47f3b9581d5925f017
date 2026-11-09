import { sha256 } from '../auth/crypto.js';
import { completeGoogleAuthorization, googleAuthorizationUrl } from '../auth/google-oauth.js';
import {
  clearSessionCookie,
  publicSession,
  requiredSecret,
  revokeSession,
} from '../auth/sessions.js';
import { readJson } from '../http/request.js';
import { apiError, json, redirect } from '../http/responses.js';
import { clientAddressHashInput, enforceLoginOrigin } from '../http/security.js';
import { checkRateLimit } from '../http/rate-limit.js';

export function sessionResponse(session) {
  return json(publicSession(session));
}

export function adapterSessionResponse(session) {
  if (!session) return json({ session: null });
  return json({ session: {
    userId: session.userId,
    id: session.userId,
    email: session.email,
    fullName: session.displayName,
    username: session.displayName,
    role: session.role,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    user: {
      id: session.userId,
      email: session.email,
      user_metadata: {
        full_name: session.displayName,
      },
    },
  } });
}

export async function beginGoogleLogin(request, env, requestId) {
  const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId);
  if (rateLimitFailure) return rateLimitFailure;
  return redirect(await googleAuthorizationUrl(request, env));
}

export async function beginGoogleLoginJson(request, env, requestId) {
  const originFailure = enforceLoginOrigin(request, env, requestId);
  if (originFailure) return originFailure;
  const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId);
  if (rateLimitFailure) return rateLimitFailure;
  const body = await readJson(request, 10_000);
  const url = new URL(request.url);
  if (body.returnTo) {
    const appOrigin = new URL(env.APP_ORIGIN || request.url).origin;
    const returnUrl = new URL(body.returnTo, appOrigin);
    if (returnUrl.origin === appOrigin) {
      url.searchParams.set('returnTo', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    }
  }
  return json({ url: await googleAuthorizationUrl(new Request(url, {
    method: 'GET',
    headers: request.headers,
  }), env) });
}

export async function googleCallback(request, env) {
  const result = await completeGoogleAuthorization(request, env);
  const origin = new URL(env.APP_ORIGIN || request.url).origin;
  return redirect(new URL(result.returnPath, origin).toString(), {
    'Set-Cookie': result.session.cookie,
  });
}

async function enforceOAuthStartRateLimit(request, env, requestId) {
  const ipHash = await sha256(`${requiredSecret(env, 'RATE_LIMIT_SALT')}:${clientAddressHashInput(request)}`);
  if (!await checkRateLimit(env.AUTH_RATE_LIMITER, `google-oauth-start:ip:${ipHash}`)) {
    return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
  }
  if (await claimGlobalOAuthStart(env)) return null;
  return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
}

async function claimGlobalOAuthStart(env) {
  const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
  const bucket = new Date(minuteStart).toISOString();
  const expiresAt = new Date(minuteStart + 10 * 60_000).toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO oauth_start_rate_limits (bucket, attempt_count, expires_at)
    VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET attempt_count = attempt_count + 1
    WHERE attempt_count < 30
  `).bind(bucket, expiresAt).run();
  return Number(result.meta?.changes || 0) === 1;
}

export async function logout(env, session) {
  await revokeSession(env, session);
  return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie() });
}
