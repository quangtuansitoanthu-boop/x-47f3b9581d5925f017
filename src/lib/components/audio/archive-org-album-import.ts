import type { TalkTrack } from './AudioCatalog.svelte';

export interface ArchiveMetadataFile {
  name?: string;
  format?: string;
  title?: string;
}

export interface ArchiveMetadataResponse {
  metadata?: {
    identifier?: string;
    title?: string;
    creator?: string | string[];
    uploader?: string;
  };
  files?: ArchiveMetadataFile[];
}

export interface ArchiveAlbumPayload {
  id: string;
  tieu_de: string;
  mo_ta: string;
  chu_de: string;
  archive_id: string;
  tracks: TalkTrack[];
  ngay_dang: string;
  visibility: 'public';
}

export function parseArchiveIdentifier(value: string): string {
  const raw = value.normalize('NFKC').trim();
  if (!raw) throw new Error('Vui lòng nhập link Archive.org.');
  let identifier = raw;
  try {
    const url = new URL(raw);
    if (url.hostname !== 'archive.org' && !url.hostname.endsWith('.archive.org')) {
      throw new Error('Link phải thuộc Archive.org.');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const detailsIndex = parts.indexOf('details');
    identifier = detailsIndex >= 0 ? decodeURIComponent(parts[detailsIndex + 1] || '') : '';
  } catch (error) {
    if (error instanceof Error && error.message === 'Link phải thuộc Archive.org.') throw error;
  }
  if (!/^[A-Za-z0-9._-]{1,200}$/u.test(identifier)) {
    throw new Error('Không tìm thấy mã nội dung Archive.org hợp lệ.');
  }
  return identifier;
}

export function buildArchiveAlbumPayload(
  response: ArchiveMetadataResponse,
  identifier: string,
  topic: string,
  authorInput: string,
  now = new Date(),
): ArchiveAlbumPayload {
  const audioFiles = (response.files ?? [])
    .filter((file) => Boolean(file.name) && (
      file.format === 'VBR MP3' ||
      /\.(mp3|m4a|webm|ogg|opus|wav|flac|aac)$/iu.test(String(file.name))
    ))
    .sort((left, right) => String(left.name).localeCompare(String(right.name), 'vi', { numeric: true }));
  if (!audioFiles.length) throw new Error('Nội dung Archive.org này không có file âm thanh.');

  const creator = response.metadata?.creator;
  const author = authorInput.trim()
    || (Array.isArray(creator) ? creator.join(', ') : String(creator || response.metadata?.uploader || '').trim());
  const tracks = audioFiles.map((file, index) => {
    const name = String(file.name);
    return {
      title: String(file.title || name.replace(/\.(mp3|m4a|webm|ogg|opus|wav|flac|aac)$/iu, '') || `Bài ${index + 1}`).trim(),
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${name.split('/').map(encodeURIComponent).join('/')}`,
    };
  });
  const title = String(response.metadata?.title || identifier).trim();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return {
    id: `pt_${now.getTime()}`,
    tieu_de: title,
    mo_ta: author ? `${tracks.length} bài pháp thoại — ${author}` : `${tracks.length} bài pháp thoại`,
    chu_de: topic.trim() || 'Tổng hợp',
    archive_id: identifier,
    tracks,
    ngay_dang: localDate,
    visibility: 'public',
  };
}
