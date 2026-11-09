import { fetchWithSessionRefresh, requireBrowserCsrf } from './session-csrf';
import type { ModerationDecision, ModerationQueueKind, ModerationQueuePage } from '$lib/contracts/community-moderation';

export class ModerationApiError extends Error {
  constructor(public readonly status: number) { super(`moderation_${status}`); }
}
async function check(response: Response): Promise<void> {
  if (!response.ok) throw new ModerationApiError(response.status);
}
export async function fetchModerationQueue(kind: ModerationQueueKind, after: string | null, signal: AbortSignal): Promise<ModerationQueuePage> {
  const params = new URLSearchParams({ kind, limit: '20' });
  if (after) params.set('after', after);
  const response = await fetchWithSessionRefresh(`/api/admin/community/moderation?${params}`, { headers: { accept: 'application/json' }, signal });
  await check(response);
  return response.json() as Promise<ModerationQueuePage>;
}
export async function decideModeration(kind: ModerationQueueKind, id: string, decision: ModerationDecision, signal: AbortSignal): Promise<void> {
  const csrf = await requireBrowserCsrf();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetchWithSessionRefresh(`/api/admin/community/moderation/${kind}/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(decision), signal,
  });
  await check(response);
}
export async function suspendModerationMember(id: string, signal: AbortSignal): Promise<void> {
  const csrf = await requireBrowserCsrf();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetchWithSessionRefresh(`/api/admin/members/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ status: 'suspended' }), signal,
  });
  await check(response);
}
