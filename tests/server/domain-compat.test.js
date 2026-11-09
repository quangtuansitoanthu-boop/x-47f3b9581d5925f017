import { describe, expect, it } from 'vitest';
import {
  buildSelect as buildLegacySelect,
  normalizeWrite as normalizeLegacyWrite,
  ownerId as legacyOwnerId,
  serializeRows as serializeLegacyRows,
  tableDefinition as legacyTableDefinition,
} from '../../src/worker/domain/data-contract.js';
import {
  sanitizeStoredHtml as sanitizeLegacyHtml,
} from '../../src/worker/domain/content.js';
import {
  buildSelect,
  normalizeWrite,
  ownerId,
  serializeRows,
  tableDefinition,
} from '../../src/lib/server/domain/data-contract.ts';
import {
  sanitizeStoredHtml,
} from '../../src/lib/server/domain/content.ts';

describe('server domain compatibility', () => {
  it('matches legacy HTML sanitization for article content', () => {
    const dirty = '<h2 onclick="steal()">Kinh</h2><script>alert(1)</script>' +
      '<a href="jav&#x61;script:alert(1)">x</a><img src="covers/a.webp" onerror="x">' +
      '<p style="background-color:#fff0a8;line-height:2;position:fixed"><s>Nội dung</s><sup>2</sup></p>';
    expect(sanitizeStoredHtml(dirty)).toBe(sanitizeLegacyHtml(dirty));
  });

  it('matches legacy sanitization for malformed numeric URL entities', () => {
    const malformed = '<a href="&#999999999999999999999;">decimal</a><img src="&#x110000;" alt="hex">';

    expect(() => sanitizeLegacyHtml(malformed)).not.toThrow();
    expect(sanitizeStoredHtml(malformed)).toBe(sanitizeLegacyHtml(malformed));
    expect(sanitizeStoredHtml(malformed)).toBe('<a>decimal</a><img alt="hex">');
  });

  it('matches legacy HTML sanitization for video content with media urls and boolean attributes', () => {
    const video = '<div class="reader-video-wrapper"><video controls preload="metadata" playsinline poster="https://media.quangtu.vn/posters/test.webp" style="background-color:#000000"><source src="https://media.quangtu.vn/videos/test.mp4" type="video/mp4">Trình duyệt không hỗ trợ</video></div>';
    expect(sanitizeStoredHtml(video)).toBe(sanitizeLegacyHtml(video));
  });

  it('matches legacy table selects for public talk queries', () => {
    const legacy = buildLegacySelect(
      'phap_thoai',
      legacyTableDefinition('phap_thoai'),
      new URL('https://quangtu.vn/api/data/phap_thoai?select=id,tieu_de&order=created_at.desc&limit=10'),
      null,
    );
    const current = buildSelect(
      'phap_thoai',
      tableDefinition('phap_thoai'),
      {
        select: 'id,tieu_de',
        order: 'created_at.desc',
        limit: 10,
      },
      null,
    );
    expect(current).toEqual({
      sql: legacy.sql,
      bindings: legacy.bindings,
      selected: ['id', 'tieu_de'],
    });
  });

  it('keeps speaker and audio-library fields aligned on legacy data routes', () => {
    const principal = { appUserId: 'owner-uuid', displayName: 'User', role: 'user' };
    const legacyTalk = legacyTableDefinition('phap_thoai');
    const currentTalk = tableDefinition('phap_thoai');
    expect(legacyTalk.columns).toContain('dien_gia');
    expect(legacyTalk.columns).toEqual(currentTalk.columns);
    expect(normalizeLegacyWrite('phap_thoai', legacyTalk, { dien_gia: 'Thầy Minh' }, principal))
      .toMatchObject({ dien_gia: 'Thầy Minh' });

    for (const table of ['user_sync_data', 'pt_player_sync']) {
      const input = {
        pt_favorite_albums: [{ albumId: 'album-a', savedAt: 10 }],
        pt_listen_later_albums: [{ albumId: 'album-b', savedAt: 20 }],
      };
      const legacyDefinition = legacyTableDefinition(table);
      const currentDefinition = tableDefinition(table);
      expect(legacyDefinition.columns).toEqual(currentDefinition.columns);
      expect(legacyDefinition.json).toEqual(currentDefinition.json);
      expect(normalizeLegacyWrite(table, legacyDefinition, input, principal)).toMatchObject({
        pt_favorite_albums: JSON.stringify(input.pt_favorite_albums),
        pt_listen_later_albums: JSON.stringify(input.pt_listen_later_albums),
      });
    }
  });

  it('supports bounded offsets for paged admin inventory queries', () => {
    const current = buildSelect(
      'baiviet',
      tableDefinition('baiviet'),
      { select: 'id,tieu_de', order: 'created_at.desc', limit: 500, offset: 500 },
      { role: 'admin' },
    );

    expect(current).toEqual({
      sql: 'SELECT id, tieu_de FROM baiviet ORDER BY created_at DESC LIMIT ? OFFSET ?',
      bindings: [500, 500],
      selected: ['id', 'tieu_de'],
    });
  });

  it('matches legacy row normalization and owner derivation', () => {
    const principal = { appUserId: 'owner-uuid', displayName: 'CTV', role: 'ctv' };
    const legacy = normalizeLegacyWrite(
      'user_sync_data',
      legacyTableDefinition('user_sync_data'),
      { id: 'attacker', bookmarks: ['article-1'] },
      principal,
    );
    const current = normalizeWrite(
      'user_sync_data',
      tableDefinition('user_sync_data'),
      { id: 'attacker', bookmarks: ['article-1'] },
      principal,
    );
    expect(current).toMatchObject({
      bookmarks: legacy.bookmarks,
      id: legacy.id,
    });
    expect(Date.parse(current.updated_at)).toBeGreaterThan(0);
    expect(ownerId('pt_player_sync', principal)).toBe(legacyOwnerId('pt_player_sync', principal));
  });

  it('forces Chờ duyệt status on CTV write while allowing admin status choice', () => {
    const ctvPrincipal = { appUserId: 'ctv-id', role: 'ctv' };
    const adminPrincipal = { appUserId: 'admin-id', role: 'admin' };
    const input = { tieu_de: 'Bài viết mới', trang_thai: 'Hoàn thành' };

    const ctvResult = normalizeWrite('baiviet', tableDefinition('baiviet'), input, ctvPrincipal);
    const legacyCtv = normalizeLegacyWrite('baiviet', legacyTableDefinition('baiviet'), input, ctvPrincipal);
    expect(ctvResult.trang_thai).toBe('Chờ duyệt');
    expect(legacyCtv.trang_thai).toBe('Chờ duyệt');

    const adminResult = normalizeWrite('baiviet', tableDefinition('baiviet'), input, adminPrincipal);
    const legacyAdmin = normalizeLegacyWrite('baiviet', legacyTableDefinition('baiviet'), input, adminPrincipal);
    expect(adminResult.trang_thai).toBe('Hoàn thành');
    expect(legacyAdmin.trang_thai).toBe('Hoàn thành');
  });

  it('only exposes explicitly published articles and their chapters to guests', () => {
    const guestSelect = buildSelect(
      'baiviet',
      tableDefinition('baiviet'),
      { select: 'id,tieu_de', order: 'created_at.desc' },
      null,
    );
    const legacyGuest = buildLegacySelect(
      'baiviet',
      legacyTableDefinition('baiviet'),
      new URL('https://quangtu.vn/api/data/baiviet?select=id,tieu_de&order=created_at.desc'),
      null,
    );
    expect(guestSelect.sql).toContain("trang_thai = 'Hoàn thành'");
    expect(legacyGuest.sql).toContain("trang_thai = 'Hoàn thành'");

    const guestChapterSelect = buildSelect(
      'tap_noi_dung',
      tableDefinition('tap_noi_dung'),
      { select: 'id,bai_viet_id,tieu_de' },
      null,
    );
    const legacyGuestChapterSelect = buildLegacySelect(
      'tap_noi_dung',
      legacyTableDefinition('tap_noi_dung'),
      new URL('https://quangtu.vn/api/data/tap_noi_dung?select=id,bai_viet_id,tieu_de'),
      null,
    );
    expect(guestChapterSelect.sql).toContain('parent_article.trang_thai = \'Hoàn thành\'');
    expect(guestChapterSelect.sql).toBe(legacyGuestChapterSelect.sql);
    expect(guestChapterSelect.bindings).toEqual(legacyGuestChapterSelect.bindings);

    const adminSelect = buildSelect(
      'baiviet',
      tableDefinition('baiviet'),
      { select: 'id,tieu_de', order: 'created_at.desc' },
      { role: 'admin' },
    );
    expect(adminSelect.sql).not.toContain("trang_thai = 'Hoàn thành'");
  });
});
