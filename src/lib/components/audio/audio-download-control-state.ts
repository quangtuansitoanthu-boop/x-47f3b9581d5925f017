export type OfflineAlbumDownloadStatus = 'none' | 'partial' | 'downloaded';
export type AlbumTransferMode = 'offline' | 'zip';

export interface AlbumTransferProgress {
  mode: AlbumTransferMode;
  completed: number;
  total: number;
}

export interface DownloadControlPresentation {
  icon: string;
  label: string;
  tone: 'default' | 'warning' | 'danger' | 'busy';
}

function boundedCount(value: number, total: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(total, Math.max(0, Math.trunc(value)));
}

export function transferProgressControl(
  transfer: AlbumTransferProgress,
): DownloadControlPresentation {
  const total = Math.max(1, Math.trunc(transfer.total) || 1);
  const completed = boundedCount(transfer.completed, total);
  const percent = Math.round((completed / total) * 100);
  return {
    icon: '⌛',
    label: `Tải: ${percent}% (${completed}/${total})`,
    tone: 'busy',
  };
}

export function offlineDownloadControl(
  status: OfflineAlbumDownloadStatus,
  downloadedTracks: number,
  transfer?: AlbumTransferProgress | null,
): DownloadControlPresentation {
  if (transfer?.mode === 'offline') return transferProgressControl(transfer);
  if (status === 'downloaded') return { icon: '🗑️', label: 'Xóa bản tải', tone: 'danger' };
  if (status === 'partial' || downloadedTracks > 0) {
    return { icon: '⚠️', label: 'Tải tiếp', tone: 'warning' };
  }
  return { icon: '📥', label: 'Tải Offline', tone: 'default' };
}

export function zipDownloadControl(
  transfer?: AlbumTransferProgress | null,
): DownloadControlPresentation {
  if (transfer?.mode === 'zip') return transferProgressControl(transfer);
  return { icon: '📦', label: 'Tải file MP3', tone: 'default' };
}
