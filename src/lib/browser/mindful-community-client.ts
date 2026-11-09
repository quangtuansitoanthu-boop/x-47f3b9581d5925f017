import type { MindfulPost, MindfulPostDraft, MindfulPostKind, MindfulPostPage, MindfulReactionPage, MindfulReactionResult } from '$lib/contracts/mindful-community';
import type { MindfulNotification, MindfulNotificationPage } from '$lib/contracts/mindful-notifications';
import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
import { fetchWithSessionRefresh, requireBrowserCsrf } from './session-csrf';
import { isHtmlResponse, resolveApiUrl } from './native-api';

const ROOT = '/api/practice/mindful-posts';
export const MINDFUL_COMMUNITY_QUERY_POLICY = {
  staleTime: 15 * 60_000, gcTime: 60 * 60_000,
  refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false,
} as const;

export interface MindfulRequestOptions { signal?: AbortSignal; fetcher?: typeof fetch }

async function request<T>(path: string, init: RequestInit, options: MindfulRequestOptions): Promise<T> {
  const fetcher = options.fetcher ?? fetchWithSessionRefresh;
  const principal = getBrowserSessionSnapshot().user?.id ?? null;
  let invalidated = false;
  const sessionChanged = () => { if ((getBrowserSessionSnapshot().user?.id ?? null) !== principal) invalidated = true; };
  if (typeof window !== 'undefined') window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
  const assertCurrent = () => {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (invalidated || (getBrowserSessionSnapshot().user?.id ?? null) !== principal) throw new Error('sync_principal_changed');
  };
  try {
  assertCurrent();
  const mutation = init.method && init.method !== 'GET';
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (mutation) {
    headers.set('x-csrf-token', await requireBrowserCsrf());
    if (init.body) headers.set('content-type', 'application/json');
    assertCurrent();
  }
  const target = resolveApiUrl(path);
  const merged = { ...init, credentials: 'include' as const, signal: options.signal, headers };
  const response = await fetcher(fetcher === fetchWithSessionRefresh ? path : target, merged);
  assertCurrent();
  if (isHtmlResponse(response)) throw new Error('mindful_community_unavailable');
  const payload = await response.json();
  assertCurrent();
  if (response.status === 404 && payload?.error?.code === 'not_found') throw new Error('mindful_community_unavailable');
  if (!response.ok) throw new Error(payload?.error?.message || 'mindful_community_unavailable');
  return payload as T;
  } finally { if (typeof window !== 'undefined') window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged); }
}

export function fetchMindfulPosts(input: { kind?: MindfulPostKind; mine?: boolean; after?: string | null; period?: 'today' | 'all' }, options: MindfulRequestOptions = {}): Promise<MindfulPostPage> {
  const params = new URLSearchParams();
  if (input.kind) params.set('kind', input.kind);
  if (input.mine) params.set('mine', '1');
  if (input.after) params.set('after', input.after);
  if (input.period === 'today') params.set('period', 'today');
  return request(`${ROOT}?${params}`, {}, options);
}

export async function createMindfulPost(draft: MindfulPostDraft, options: MindfulRequestOptions = {}): Promise<MindfulPost> {
  const result = await request<{ post: MindfulPost }>(ROOT, { method: 'POST', body: JSON.stringify(draft) }, options);
  return result.post;
}

export async function fetchMindfulPost(postId: string, options: MindfulRequestOptions = {}): Promise<MindfulPost> {
  const result = await request<{ post: MindfulPost }>(`${ROOT}/${encodeURIComponent(postId)}`, {}, options);
  return result.post;
}

export function fetchMindfulPostContext(postId: string, reactionId: string | null, options: MindfulRequestOptions = {}): Promise<{ post: MindfulPost; notification?: MindfulNotification | null }> {
  const params = new URLSearchParams();
  if (reactionId) params.set('reactionId', reactionId);
  return request(`${ROOT}/${encodeURIComponent(postId)}${params.size ? `?${params}` : ''}`, {}, options);
}

export async function fetchMindfulNotifications(after?: string | null, options: MindfulRequestOptions = {}): Promise<MindfulNotificationPage> {
  const params = new URLSearchParams();
  if (after) params.set('after', after);
  const payload = await request<MindfulNotificationPage>(`/api/practice/mindful-notifications${params.size ? `?${params}` : ''}`, {}, options);
  if (!payload || typeof payload.enabled !== 'boolean' || !Array.isArray(payload.items)
    || !(payload.nextCursor === null || typeof payload.nextCursor === 'string')
    || !payload.items.every(item => item && (item.kind === 'repentance' || item.kind === 'good_deed')
      && [item.id, item.postId, item.nickname, item.templateId, item.text, item.createdAt].every(value => typeof value === 'string' && value.length > 0)
      && Number.isFinite(Date.parse(item.createdAt)))) throw new Error('mindful_notifications_invalid_response');
  return payload;
}

export function sendMindfulReaction(postId: string, input: { nickname: string; templateId: string }, options: MindfulRequestOptions = {}): Promise<MindfulReactionResult> {
  return request(`${ROOT}/${encodeURIComponent(postId)}/reactions`, { method: 'POST', body: JSON.stringify(input) }, options);
}

export function fetchMindfulReactions(postId: string, after?: string | null, options: MindfulRequestOptions = {}): Promise<MindfulReactionPage> {
  const params = new URLSearchParams();
  if (after) params.set('after', after);
  return request(`${ROOT}/${encodeURIComponent(postId)}/reactions?${params}`, {}, options);
}

export async function deleteMindfulPost(postId: string, options: MindfulRequestOptions = {}): Promise<void> {
  await request(`${ROOT}/${encodeURIComponent(postId)}`, { method: 'DELETE' }, options);
}
