import { validNotificationReadId, type NotificationReadState } from '$lib/contracts/notification-read-state';
import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
import { fetchWithSessionRefresh, requireBrowserCsrf } from './session-csrf';
import { isHtmlResponse } from './native-api';

export async function requestNotificationReadState(ids: string[], principal: string, write: boolean, signal?: AbortSignal): Promise<string[]> {
  const assertCurrent = () => {
    const session = getBrowserSessionSnapshot();
    if (signal?.aborted || !session.authenticated || session.user?.id !== principal) throw new DOMException('Session changed', 'AbortError');
  };
  assertCurrent();
  const headers = new Headers({ accept: 'application/json' });
  if (write) { headers.set('content-type', 'application/json'); headers.set('x-csrf-token', await requireBrowserCsrf()); }
  assertCurrent();
  const response = await fetchWithSessionRefresh(`/api/notifications/read-state${write ? '' : `?${new URLSearchParams({ ids: ids.join(',') })}`}`, {
    method: write ? 'POST' : 'GET', headers, signal, credentials: 'include',
    ...(write ? { body: JSON.stringify({ ids }) } : {}),
  });
  assertCurrent();
  if (!response.ok || isHtmlResponse(response)) throw new Error('notification_read_sync_unavailable');
  const payload = await response.json() as NotificationReadState;
  assertCurrent();
  if (!Array.isArray(payload?.readIds) || !payload.readIds.every(id => validNotificationReadId(id) && ids.includes(id))) throw new Error('invalid_notification_read_state');
  return payload.readIds;
}
