import { ServerInputError } from '../errors';

export function assertNoNewArchiveTrackUrls(
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  currentTracksById: Map<string, unknown[]> = new Map(),
  currentArchiveIdsById: Map<string, string> = new Map(),
): void {
  const rows = Array.isArray(payload) ? payload : [payload];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const requestedArchiveId = 'archive_id' in row ? String(row.archive_id || '').trim() : '';
    let permittedArchiveId = '';
    let introducesArchiveSource = false;
    if ('archive_id' in row && String(row.archive_id || '').trim()) {
      const ownerId = trackOwnerId(row);
      const currentArchiveId = currentArchiveIdsById.get(ownerId)
        ?? (currentArchiveIdsById.size === 1 ? [...currentArchiveIdsById.values()][0] : '');
      if (requestedArchiveId !== currentArchiveId && !isValidArchiveIdentifier(requestedArchiveId)) {
        throw new ServerInputError(400, 'archive_source_unsupported', 'Nguồn Archive.org không hợp lệ.');
      }
      introducesArchiveSource = requestedArchiveId !== currentArchiveId;
      if (introducesArchiveSource && !Array.isArray(row.tracks)) {
        throw new ServerInputError(400, 'archive_source_unsupported', 'Nguồn Archive.org mới phải kèm danh sách MP3 hợp lệ.');
      }
      permittedArchiveId = requestedArchiveId;
    }
    if (!('tracks' in row)) continue;
    const allowedArchiveUrls = new Set<string>();
    const currentTracks = currentTracksById.get(trackOwnerId(row))
      ?? (currentTracksById.size === 1 ? [...currentTracksById.values()][0] : undefined);
    if (Array.isArray(currentTracks)) {
      for (const track of currentTracks) {
        const url = trackUrlString(track);
        if (url && isArchiveTrackUrl(url)) allowedArchiveUrls.add(canonicalArchiveUrl(url));
      }
    }
    if (!Array.isArray(row.tracks)) continue;
    let matchingArchiveTracks = 0;
    for (const track of row.tracks) {
      const url = trackUrlString(track);
      if (!url || !isArchiveTrackUrl(url)) continue;
      const matchesRequestedSource = archiveUrlMatchesIdentifier(url, permittedArchiveId);
      if (matchesRequestedSource) matchingArchiveTracks += 1;
      if (!allowedArchiveUrls.has(canonicalArchiveUrl(url)) && !matchesRequestedSource) {
        throw new ServerInputError(400, 'invalid_track_url', 'URL pháp thoại không thuộc nguồn được phép.');
      }
    }
    if (introducesArchiveSource && matchingArchiveTracks === 0) {
      throw new ServerInputError(400, 'archive_source_unsupported', 'Nguồn Archive.org mới phải kèm danh sách MP3 hợp lệ.');
    }
  }
}

function isValidArchiveIdentifier(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,200}$/u.test(value);
}

function archiveUrlMatchesIdentifier(value: string, identifier: string): boolean {
  if (!identifier || !isValidArchiveIdentifier(identifier)) return false;
  try {
    const url = new URL(String(value).normalize('NFKC').trim());
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[0] === 'download' && decodeURIComponent(segments[1] || '') === identifier && segments.length > 2;
  } catch {
    return false;
  }
}

export function isArchiveTrackUrl(value: string): boolean {
  try {
    const url = new URL(String(value).normalize('NFKC').trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'archive.org' || host.endsWith('.archive.org'));
  } catch {
    return false;
  }
}

function canonicalArchiveUrl(value: string): string {
  return new URL(String(value).normalize('NFKC').trim()).toString();
}

function trackUrlString(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const url = (value as Record<string, unknown>).url;
  return typeof url === 'string' ? url : null;
}

function trackOwnerId(row: Record<string, unknown>): string {
  return typeof row.id === 'string' ? row.id : '__single__';
}
