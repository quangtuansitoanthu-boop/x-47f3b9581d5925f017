import { describe, expect, it } from 'vitest';

import {
  offlineDownloadControl,
  transferProgressControl,
  zipDownloadControl,
} from '$lib/components/audio/audio-download-control-state';

describe('audio album download control presentation', () => {
  it('matches the legacy icons and labels for idle, partial and complete offline albums', () => {
    expect(offlineDownloadControl('none', 0)).toEqual({ icon: '📥', label: 'Tải Offline', tone: 'default' });
    expect(offlineDownloadControl('partial', 4)).toEqual({ icon: '⚠️', label: 'Tải tiếp', tone: 'warning' });
    expect(offlineDownloadControl('downloaded', 20)).toEqual({ icon: '🗑️', label: 'Xóa bản tải', tone: 'danger' });
  });

  it('shows deterministic progress for the active transfer without replacing the other control', () => {
    const transfer = { mode: 'zip' as const, completed: 4, total: 20 };

    expect(offlineDownloadControl('partial', 4, transfer)).toEqual({
      icon: '⚠️',
      label: 'Tải tiếp',
      tone: 'warning',
    });
    expect(zipDownloadControl(transfer)).toEqual({
      icon: '⌛',
      label: 'Tải: 20% (4/20)',
      tone: 'busy',
    });
  });

  it('renders offline progress on the offline button and keeps ZIP idle', () => {
    const transfer = { mode: 'offline' as const, completed: 3, total: 20 };

    expect(transferProgressControl(transfer)).toEqual({
      icon: '⌛',
      label: 'Tải: 15% (3/20)',
      tone: 'busy',
    });
    expect(offlineDownloadControl('partial', 3, transfer)).toEqual({
      icon: '⌛',
      label: 'Tải: 15% (3/20)',
      tone: 'busy',
    });
    expect(zipDownloadControl(transfer)).toEqual({ icon: '📦', label: 'Tải file MP3', tone: 'default' });
  });
});
