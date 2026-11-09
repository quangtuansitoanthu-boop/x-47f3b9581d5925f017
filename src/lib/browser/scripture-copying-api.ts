import { fetchNativeJsonMutation } from './native-api';
import { fetchWithSessionRefresh } from './session-csrf';
import { refreshBrowserSession } from '$lib/stores/session.svelte';
import type { CopyAck, CopyAuth, CopySaveInput } from './scripture-copying-workspace';

/** Called only by the user's Save action. Never replay a write on any failure. */
export async function sendCopyingSnapshot(payload: CopySaveInput, auth: CopyAuth, signal: AbortSignal): Promise<CopyAck> {
  if (signal.aborted) throw new Error('principal_changed');
  const init: RequestInit = { method: 'PUT', signal, credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': auth.csrfToken }, body: JSON.stringify(payload) };
  const native = await fetchNativeJsonMutation('/api/practice/copying', init);
  const response = native ?? await fetchWithSessionRefresh('/api/practice/copying', init);
  if (signal.aborted) throw new Error('principal_changed');
  if (native && response.status === 401) await refreshBrowserSession().catch(() => undefined);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể lưu lên hệ thống.');
  if (!Number.isSafeInteger(body.revision) || typeof body.savedAt !== 'string') throw new Error('Phản hồi lưu chưa hợp lệ.');
  return body;
}
