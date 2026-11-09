import { filterIosContent, isIosExcludedContent } from '$lib/domain/ios-content-policy';
import { isNativeApp } from './native-platform';

// Legacy name: the same web-only policy applies to Android and iOS.
export function isIosContentRestricted(): boolean {
  return isNativeApp() || ['android', 'ios'].includes(import.meta.env.VITE_CONTENT_PLATFORM);
}

export function isContentAvailable(row: unknown): boolean {
  return !isIosContentRestricted() || !isIosExcludedContent(row);
}

export function availableContent<T>(value: T): T {
  return isIosContentRestricted() ? filterIosContent(value) : value;
}

export function blockedContentRequest(url: URL): boolean {
  if (!isIosContentRestricted()) return false;
  const segments = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
  if (segments.some(id => isIosExcludedContent({ id }))) return true;
  for (const key of ['id', 'bai_viet_id']) {
    const value = url.searchParams.get(key);
    if (value && isIosExcludedContent({ id: value.replace(/^eq\./u, '') })) return true;
  }
  return false;
}

export async function availableContentResponse(response: Response): Promise<Response> {
  if (!isIosContentRestricted() || !response.ok || !response.headers.get('content-type')?.includes('application/json')) return response;
  const value = await response.clone().json().catch(() => undefined);
  if (value === undefined) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(JSON.stringify(isIosExcludedContent(value) ? null : availableContent(value)), { status: response.status, statusText: response.statusText, headers });
}
