import { describe, expect, it } from 'vitest';
import { can, hasRole } from '../../src/worker/auth/rbac.js';
import { readSingleCookie } from '../../src/worker/auth/sessions.js';
import { constantTimeEqual, enforcePublicWriteOrigin } from '../../src/worker/http/security.js';
import { sanitizeStoredHtml } from '../../src/worker/domain/content.js';
import { normalizeWrite } from '../../src/worker/domain/data-contract.js';

describe('Worker security contract', () => {
  it('rejects duplicate session cookies instead of accepting cookie tossing', () => {
    expect(readSingleCookie('__Host-quangtu_session=a; x=1', '__Host-quangtu_session')).toBe('a');
    expect(readSingleCookie(
      '__Host-quangtu_session=a; __Host-quangtu_session=b',
      '__Host-quangtu_session',
    )).toBeNull();
  });

  it('enforces the role capability matrix', () => {
    expect(can(null, 'articles:read')).toBe(true);
    expect(can({ role: 'user' }, 'articles:write')).toBe(false);
    expect(can({ role: 'ctv' }, 'articles:write')).toBe(true);
    expect(can({ role: 'ctv' }, 'articles:delete')).toBe(false);
    expect(can({ role: 'admin' }, 'articles:delete')).toBe(true);
    expect(can(null, 'downloads:use')).toBe(false);
    expect(can({ role: 'user' }, 'downloads:use')).toBe(true);
    expect(can({ role: 'ctv' }, 'downloads:use')).toBe(true);
    expect(can({ role: 'admin' }, 'downloads:use')).toBe(true);
    expect(hasRole({ role: 'admin' }, 'ctv')).toBe(true);
  });

  it('requires exact same-origin and a custom public CSRF header', () => {
    const env = { APP_ORIGIN: 'https://quangtu.vn' };
    const accepted = new Request('https://quangtu.vn/api/articles/a/views', {
      method: 'POST',
      headers: {
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': 'public',
      },
    });
    expect(enforcePublicWriteOrigin(accepted, env, 'request')).toBeNull();
    expect(enforcePublicWriteOrigin(accepted, env, 'request', { role: 'guest', csrfToken: null })).toBeNull();
    const denied = new Request('https://quangtu.vn/api/articles/a/views', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'X-CSRF-Token': 'public',
      },
    });
    expect(enforcePublicWriteOrigin(denied, env, 'request').status).toBe(403);
  });

  it('accepts the authenticated session CSRF token for public writes', () => {
    const env = { APP_ORIGIN: 'https://quangtu.vn' };
    const session = { csrfToken: 'authenticated-token' };
    const accepted = new Request('https://quangtu.vn/api/articles/a/views', {
      method: 'POST',
      headers: {
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': session.csrfToken,
      },
    });
    expect(enforcePublicWriteOrigin(accepted, env, 'request', session)).toBeNull();
  });

  it('compares values without early length acceptance', () => {
    expect(constantTimeEqual('same', 'same')).toBe(true);
    expect(constantTimeEqual('same', 'different')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('removes executable HTML while retaining article formatting', () => {
    const dirty = '<h2 onclick="steal()">Kinh</h2><script>alert(1)</script>' +
      '<a href="jav&#x61;script:alert(1)">x</a><img src="covers/a.webp" onerror="x">' +
      '<p style="text-align:center;font-size:18px;position:fixed">Nội dung</p>';
    const clean = sanitizeStoredHtml(dirty);
    expect(clean).toContain('<h2>Kinh</h2>');
    expect(clean).not.toMatch(/script|onclick|onerror|javascript/iu);
    expect(clean).toContain('<img src="covers/a.webp">');
    expect(clean).toContain('<p style="text-align:center;font-size:18px">Nội dung</p>');
    expect(clean).not.toContain('position');
  });

  it('derives sync owner IDs from the authenticated principal', () => {
    const definition = {
      columns: ['id', 'bookmarks', 'updated_at'],
      json: ['bookmarks'],
      rich: [],
      owner: true,
    };
    const row = normalizeWrite(
      'user_sync_data',
      definition,
      { id: 'attacker', bookmarks: ['article-1'] },
      { appUserId: 'owner-uuid' },
    );
    expect(row.id).toBe('owner-uuid');
  });

  it('rejects record IDs that can break HTML or inline handler contexts', () => {
    const definition = {
      columns: ['id', 'tieu_de'],
      json: [],
      rich: [],
    };
    expect(() => normalizeWrite(
      'phap_thoai',
      definition,
      { id: "x');alert(1)//", tieu_de: 'Không an toàn' },
      { role: 'ctv' },
    )).toThrow(/ID chỉ được chứa/);
  });

  it('validates talk tracks and rejects executable or unapproved URLs', () => {
    const definition = {
      columns: ['id', 'chu_de', 'tracks'],
      json: ['tracks'],
      rich: [],
    };
    const safe = normalizeWrite('phap_thoai', definition, {
      id: 'talk-safe',
      chu_de: '<img src=x onerror=steal()>',
      tracks: [{
        url: 'https://archive.org/download/talk/track.mp3',
        title: 'Pháp thoại "an toàn"',
      }, {
        url: '/api/audio/drive/file-safe-123',
        title: 'Pháp thoại Drive',
      }],
    }, { role: 'ctv' });
    expect(JSON.parse(safe.tracks)).toEqual([{
      url: 'https://archive.org/download/talk/track.mp3',
      title: 'Pháp thoại "an toàn"',
    }, {
      url: '/api/audio/drive/file-safe-123',
      title: 'Pháp thoại Drive',
    }]);
    expect(() => normalizeWrite('phap_thoai', definition, {
      id: 'talk-unsafe',
      tracks: [{ url: 'javascript:alert(1)', title: 'x" onclick="steal()' }],
    }, { role: 'ctv' })).toThrow(/URL pháp thoại/);
    expect(() => normalizeWrite('phap_thoai', definition, {
      id: 'talk-unapproved',
      tracks: [{ url: 'https://evil.example/track.mp3', title: 'Không hợp lệ' }],
    }, { role: 'ctv' })).toThrow(/nguồn được phép/);
    expect(() => normalizeWrite('phap_thoai', definition, {
      id: 'talk-drive-unsafe',
      tracks: [{ url: '/api/audio/drive/../session', title: 'Không hợp lệ' }],
    }, { role: 'ctv' })).toThrow(/URL pháp thoại/);
  });
});
