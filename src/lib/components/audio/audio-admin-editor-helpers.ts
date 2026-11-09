import { createBrowserId } from '$lib/browser/random-id';
import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
import { encodeMediaFileNameHeader } from '$lib/browser/media-upload';

export interface ObjectPosition {
  x: number;
  y: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function parseObjectPosition(value: string): ObjectPosition {
  const normalized = String(value || 'center').trim().toLowerCase();
  const percentages = normalized.match(/^(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/u);
  if (percentages) {
    return { x: clamp(Number(percentages[1])), y: clamp(Number(percentages[2])) };
  }

  return {
    x: normalized.includes('left') ? 0 : normalized.includes('right') ? 100 : 50,
    y: normalized.includes('top') ? 0 : normalized.includes('bottom') ? 100 : 50,
  };
}

export function formatObjectPosition(position: ObjectPosition): string {
  return `${clamp(position.x)}% ${clamp(position.y)}%`;
}

export function dragObjectPosition(
  current: string,
  deltaX: number,
  deltaY: number,
  previewWidth: number,
  previewHeight: number,
): string {
  const position = parseObjectPosition(current);
  const width = Math.max(1, previewWidth);
  const height = Math.max(1, previewHeight);
  return formatObjectPosition({
    x: position.x - (deltaX * 100 / width),
    y: position.y - (deltaY * 100 / height),
  });
}

export function nudgeObjectPosition(current: string, deltaX: number, deltaY: number): string {
  const position = parseObjectPosition(current);
  return formatObjectPosition({ x: position.x + deltaX, y: position.y + deltaY });
}

export function serializeAudioArtwork(source: string, position: string): string | null {
  const normalizedSource = String(source || '').trim().split('#pos=', 1)[0];
  if (!normalizedSource) return null;
  const normalizedPosition = String(position || 'center').trim() || 'center';
  return normalizedPosition === 'center'
    ? normalizedSource
    : `${normalizedSource}#pos=${encodeURIComponent(normalizedPosition)}`;
}

export function reorderItems<T>(items: readonly T[], sourceIndex: number, targetIndex: number): T[] {
  if (
    sourceIndex === targetIndex
    || sourceIndex < 0
    || targetIndex < 0
    || sourceIndex >= items.length
    || targetIndex >= items.length
  ) return [...items];

  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export async function uploadAudioArtwork(file: File, csrfToken: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  const response = await fetchWithSessionRefresh('/api/media', {
    method: 'POST',
    headers: {
      'content-type': file.type,
      'idempotency-key': createBrowserId(),
      'x-content-sha256': base64Url(digest),
      'x-csrf-token': csrfToken,
      'x-file-name': encodeMediaFileNameHeader(file.name),
      'x-media-prefix': 'covers',
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || 'Không thể tải ảnh bìa.');
  }
  const location = String(payload.url || payload.objectKey || '');
  if (!location) throw new Error('Máy chủ không trả về URL ảnh bìa.');
  return location;
}
