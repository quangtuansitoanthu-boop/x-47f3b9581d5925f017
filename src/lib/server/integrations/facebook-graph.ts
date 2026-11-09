import type { CloudflareEnvLike } from '../cloudflare-context';
import { requiredSecret } from '../auth/sessions';

const GRAPH_ORIGIN = 'https://graph.facebook.com';
const FACEBOOK_ORIGIN = 'https://www.facebook.com';
const POST_FIELDS = [
  'id', 'message', 'story', 'created_time', 'updated_time', 'permalink_url', 'privacy',
].join(',');

export interface FacebookTokenDebug {
  appId: string;
  dataAccessExpiresAt: number | null;
  expiresAt: number | null;
  isValid: boolean;
  scopes: string[];
  userId: string;
}

export interface FacebookProfile {
  id: string;
  name: string;
  email: string | null;
  pictureUrl: string | null;
}

export interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  updated_time?: string;
  permalink_url?: string;
  privacy?: { value?: string };
}

export interface FacebookPostPage {
  posts: FacebookPost[];
  after: string | null;
}

export class FacebookGraphError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public graphCode: number | null = null,
  ) {
    super(message);
    this.name = 'FacebookGraphError';
  }
}

export function facebookGraphVersion(env: CloudflareEnvLike): string {
  const value = String(env.FACEBOOK_GRAPH_API_VERSION || '').trim();
  if (!/^v\d+\.\d+$/u.test(value)) throw new FacebookGraphError('configuration_error', 'Phiên bản Graph API không hợp lệ.');
  return value;
}

export async function getFacebookPost(
  env: CloudflareEnvLike,
  accessToken: string,
  postId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FacebookPost | null> {
  const url = graphUrl(env, `/${encodeURIComponent(postId)}`);
  url.searchParams.set('fields', POST_FIELDS);
  await authorize(url, env, accessToken);
  try {
    const post = await graphJson(await fetchImpl(url)) as FacebookPost;
    return post?.id ? post : null;
  } catch (error) {
    if (error instanceof FacebookGraphError && error.graphCode === 100) return null;
    throw error;
  }
}

export function facebookAuthorizationUrl(
  env: CloudflareEnvLike,
  input: { redirectUri: string; state: string; scopes: string[] },
): string {
  const version = facebookGraphVersion(env);
  const params = new URLSearchParams({
    client_id: requiredSecret(env, 'FACEBOOK_APP_ID'),
    redirect_uri: input.redirectUri,
    response_type: 'code',
    state: input.state,
    scope: [...new Set(input.scopes)].join(','),
  });
  return `${FACEBOOK_ORIGIN}/${version}/dialog/oauth?${params}`;
}

export async function exchangeFacebookCode(
  env: CloudflareEnvLike,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  return exchangeToken(env, new URLSearchParams({
    client_id: requiredSecret(env, 'FACEBOOK_APP_ID'),
    client_secret: requiredSecret(env, 'FACEBOOK_APP_SECRET'),
    redirect_uri: redirectUri,
    code,
  }), fetchImpl);
}

export async function exchangeLongLivedFacebookToken(
  env: CloudflareEnvLike,
  shortLivedToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  return exchangeToken(env, new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: requiredSecret(env, 'FACEBOOK_APP_ID'),
    client_secret: requiredSecret(env, 'FACEBOOK_APP_SECRET'),
    fb_exchange_token: shortLivedToken,
  }), fetchImpl);
}

async function exchangeToken(
  env: CloudflareEnvLike,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const response = await fetchImpl(`${GRAPH_ORIGIN}/${facebookGraphVersion(env)}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await graphJson(response) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) throw new FacebookGraphError('oauth_exchange', 'Facebook không trả access token.');
  const expiresIn = Number(payload.expires_in);
  return { accessToken, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null };
}

export async function debugFacebookToken(
  env: CloudflareEnvLike,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FacebookTokenDebug> {
  const url = graphUrl(env, '/debug_token');
  url.searchParams.set('input_token', accessToken);
  url.searchParams.set('access_token', `${requiredSecret(env, 'FACEBOOK_APP_ID')}|${requiredSecret(env, 'FACEBOOK_APP_SECRET')}`);
  const payload = await graphJson(await fetchImpl(url)) as { data?: Record<string, unknown> };
  const data = payload.data || {};
  return {
    appId: String(data.app_id || ''),
    dataAccessExpiresAt: positiveEpoch(data.data_access_expires_at),
    expiresAt: positiveEpoch(data.expires_at),
    isValid: data.is_valid === true,
    scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
    userId: String(data.user_id || ''),
  };
}

export async function getFacebookProfile(
  env: CloudflareEnvLike,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FacebookProfile> {
  const url = graphUrl(env, '/me');
  url.searchParams.set('fields', 'id,name,email,picture');
  await authorize(url, env, accessToken);
  const data = await graphJson(await fetchImpl(url)) as Record<string, unknown>;
  const picture = data.picture as { data?: { url?: unknown } } | undefined;
  if (!data.id) throw new FacebookGraphError('identity_missing', 'Facebook không trả định danh người dùng.');
  return {
    id: String(data.id),
    name: bounded(data.name, 200) || 'Người dùng Facebook',
    email: bounded(data.email, 320)?.toLowerCase() || null,
    pictureUrl: bounded(picture?.data?.url, 2_048),
  };
}

export async function listFacebookPosts(
  env: CloudflareEnvLike,
  accessToken: string,
  input: { after?: string | null; since?: number | null },
  fetchImpl: typeof fetch = fetch,
): Promise<FacebookPostPage> {
  const url = graphUrl(env, '/me/posts');
  url.searchParams.set('fields', POST_FIELDS);
  url.searchParams.set('limit', '50');
  if (input.after) url.searchParams.set('after', input.after);
  if (input.since) url.searchParams.set('since', String(Math.floor(input.since)));
  await authorize(url, env, accessToken);
  const payload = await graphJson(await fetchImpl(url)) as {
    data?: FacebookPost[];
    paging?: { cursors?: { after?: unknown } };
  };
  return {
    posts: Array.isArray(payload.data) ? payload.data : [],
    after: bounded(payload.paging?.cursors?.after, 2_000),
  };
}

function graphUrl(env: CloudflareEnvLike, path: string): URL {
  return new URL(`${GRAPH_ORIGIN}/${facebookGraphVersion(env)}${path}`);
}

async function authorize(url: URL, env: CloudflareEnvLike, token: string): Promise<void> {
  url.searchParams.set('access_token', token);
  url.searchParams.set('appsecret_proof', await facebookAppSecretProof(token, requiredSecret(env, 'FACEBOOK_APP_SECRET')));
}

export async function facebookAppSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function graphJson(response: Response): Promise<unknown> {
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new FacebookGraphError('graph_invalid_response', 'Facebook trả phản hồi không hợp lệ.', response.status >= 500);
  }
  if (response.ok && !payload.error) return payload;
  const error = (payload.error || {}) as Record<string, unknown>;
  const graphCode = Number(error.code);
  const retryable = response.status === 429 || response.status >= 500 || [1, 2, 4, 17, 32, 613].includes(graphCode);
  const code = graphCode === 190
    ? 'reauthorization_required'
    : [10, 200].includes(graphCode)
      ? 'permission_unavailable'
      : retryable ? 'rate_limited' : 'graph_error';
  throw new FacebookGraphError(code, 'Không thể đọc dữ liệu Facebook.', retryable, Number.isFinite(graphCode) ? graphCode : null);
}

function positiveEpoch(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function bounded(value: unknown, length: number): string | null {
  return typeof value === 'string' ? value.trim().slice(0, length) || null : null;
}
