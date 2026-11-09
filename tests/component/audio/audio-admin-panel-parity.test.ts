import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildArchiveAlbumPayload, parseArchiveIdentifier } from '../../../src/lib/components/audio/archive-org-album-import';

describe('Pháp Thoại admin tools parity', () => {
  it('places the original admin tools before the library', () => {
    const manager = readFileSync('src/lib/components/admin/talks/AdminTalkManager.svelte','utf8');
    expect(manager.indexOf('<AudioAdminPanel')).toBeGreaterThan(-1);
    expect(manager.indexOf('<AudioAdminPanel')).toBeLessThan(manager.indexOf('id="talk-inventory-title"'));
  });

  it('keeps the Drive preview and Archive.org importer contracts', () => {
    const panel = readFileSync('src/lib/components/audio/AudioAdminPanel.svelte', 'utf8');
    expect(panel).toContain('Xem trước thay đổi trước khi áp dụng');
    expect(panel).toContain('Album mới luôn được đặt ở chế độ công khai');
    expect(panel).toContain('Đọc metadata và danh sách track');
    expect(panel).toContain("type=\"submit\"");
    expect(panel).toContain('Tạo album');
    expect(panel).toContain('role="tablist"');
    expect(panel).toContain('role="tab"');
    expect(panel).toContain('role="tabpanel"');
    expect(panel).toContain("activeToolTab === 'drive'");
    expect(panel).toContain("activeToolTab === 'archive'");
    expect(panel).toContain('navigateToolTabs');
    expect(panel).toContain("fetchWithSessionRefresh('/api/talks'");
    expect(panel).toContain("'X-CSRF-Token': token");
    expect(panel).toContain('JSON.stringify({ ...payload, dien_gia: speaker || null })');
  });

  it('builds the same sorted Archive.org album payload as the legacy tool', () => {
    const identifier = parseArchiveIdentifier('https://archive.org/details/phap-thoai-test');
    const payload = buildArchiveAlbumPayload({
      metadata: { title: 'Pháp thoại thử', creator: 'Quang Từ' },
      files: [
        { name: '10.mp3', format: 'VBR MP3' },
        { name: '2.mp3', format: 'VBR MP3' },
        { name: 'notes.txt', format: 'Text' },
      ],
    }, identifier, 'Pháp ngữ', '', new Date('2026-08-03T00:00:00.000Z'));
    expect(payload.archive_id).toBe('phap-thoai-test');
    expect(payload.tracks.map((track) => track.title)).toEqual(['2', '10']);
    expect(payload.mo_ta).toBe('2 bài pháp thoại — Quang Từ');
    expect(payload.visibility).toBe('public');
  });
});
