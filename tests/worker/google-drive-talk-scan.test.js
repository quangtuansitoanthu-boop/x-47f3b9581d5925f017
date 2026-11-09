import { beforeAll, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import driveSchema from '../../migrations/0007-google-drive-talk-sources.sql?raw';
import speakerSchema from '../../migrations/0018-audio-library-and-speaker.sql?raw';
import { scanGoogleDriveTalks, speakerFromFolderName } from '../../src/worker/api/google-drive-talk-scan.js';
import { can } from '../../src/worker/auth/rbac.js';
import { getDriveAccessToken } from '../../src/worker/integrations/google-drive.js';

const ROOT_ID = 'root-folder-test-123';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0007-google-drive-talk-sources.sql', queries: splitMigration(driveSchema) },
    { name: 'speaker-column', queries: splitMigration(speakerSchema).filter((query) => query.startsWith('ALTER TABLE phap_thoai ')) },
  ]);
});

describe('Google Drive talk scan', () => {
  it.each([
    ['Tên album - Tên tác giả', 'Tên tác giả'],
    ['Tên - album – Thầy A', 'Thầy A'],
    ['Tên album — Thầy B', 'Thầy B'],
    ['Album không tác giả', null],
    ['Album-tác giả', null],
    ['Album - ', null],
  ])('extracts a default speaker from %s', (name, speaker) => {
    expect(speakerFromFolderName(name)).toBe(speaker);
  });
  it('restricts the scan capability to admins', () => {
    expect(can({ role: 'admin' }, 'talks:drive-scan')).toBe(true);
    expect(can({ role: 'ctv' }, 'talks:drive-scan')).toBe(false);
    expect(can({ role: 'user' }, 'talks:drive-scan')).toBe(false);
    expect(can(null, 'talks:drive-scan')).toBe(false);
  });

  it('exchanges a WebCrypto-signed RS256 service-account assertion', async () => {
    const keys = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const privateKey = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
    let assertion = '';
    const fetchImpl = async (input, init) => {
      expect(String(input)).toBe('https://oauth2.googleapis.com/token');
      assertion = new URLSearchParams(init.body).get('assertion');
      return Response.json({ access_token: 'signed-test-token', expires_in: 3600 });
    };
    const token = await getDriveAccessToken({
      GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: 'service_account',
        client_email: 'drive-signer@example.test',
        private_key: toPem(privateKey),
        token_uri: 'https://oauth2.googleapis.com/token',
      }),
    }, fetchImpl);
    expect(token).toBe('signed-test-token');
    const [encodedHeader, encodedClaims, encodedSignature] = assertion.split('.');
    expect(decodeJwtPart(encodedHeader)).toMatchObject({ alg: 'RS256', typ: 'JWT' });
    expect(decodeJwtPart(encodedClaims)).toMatchObject({
      iss: 'drive-signer@example.test',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
    });
    await expect(crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', keys.publicKey, decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    )).resolves.toBe(true);
  });

  it('paginates, creates private albums, preserves manual fields, and becomes idempotent', async () => {
    const drive = createDriveMock({
      folders: [
        { id: 'folder-empty-123', name: 'Album rỗng' },
        { id: 'folder-talk-123', name: 'Bài giảng - Tác giả' },
      ],
      files: {
        'folder-empty-123': [],
        'folder-talk-123': [
          driveFile('file-track-10', 'Bài 10.mp3'),
          driveFile('file-track-2', 'Bài 2.mp3'),
          { id: 'ignored-pdf-123', name: 'Ghi chú.pdf', mimeType: 'application/pdf' },
        ],
      },
    });
    const workerEnv = { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID };
    const request = scanRequest(false);
    const created = await scanGoogleDriveTalks(request, workerEnv, {
      accessToken: 'test-token', fetchImpl: drive.fetch,
    });

    expect(created.counts).toEqual({ created: 1, updated: 0, skipped: 1, error: 0 });
    expect(drive.rootPageRequests).toBe(2);
    const source = await env.DB.prepare(`
      SELECT album_id, folder_name FROM phap_thoai_drive_sources WHERE drive_folder_id = ?
    `).bind('folder-talk-123').first();
    const album = await env.DB.prepare(`
      SELECT id, tieu_de, dien_gia, mo_ta, chu_de, tracks, visibility, anh_dai_dien
      FROM phap_thoai WHERE id = ?
    `).bind(source.album_id).first();
    expect(album).toMatchObject({
      tieu_de: 'Bài giảng - Tác giả',
      dien_gia: 'Tác giả',
      mo_ta: '',
      chu_de: 'Pháp ngữ',
      visibility: 'public',
    });
    expect(JSON.parse(album.tracks).map((track) => track.title)).toEqual(['Bài 2', 'Bài 10']);

    // Old imports can have the same fingerprint but no speaker yet.
    await env.DB.prepare('UPDATE phap_thoai SET dien_gia = NULL WHERE id = ?').bind(source.album_id).run();
    const preview = await scanGoogleDriveTalks(scanRequest(true), workerEnv, { accessToken: 'test-token', fetchImpl: drive.fetch });
    expect(preview.counts.updated).toBe(1);
    expect(await env.DB.prepare('SELECT dien_gia FROM phap_thoai WHERE id = ?').bind(source.album_id).first()).toEqual({ dien_gia: null });
    const backfilled = await scanGoogleDriveTalks(scanRequest(false), workerEnv, { accessToken: 'test-token', fetchImpl: drive.fetch });
    expect(backfilled.counts.updated).toBe(1);
    expect(await env.DB.prepare('SELECT dien_gia FROM phap_thoai WHERE id = ?').bind(source.album_id).first()).toEqual({ dien_gia: 'Tác giả' });

    await env.DB.prepare(`
      UPDATE phap_thoai SET mo_ta = 'Mô tả thủ công', chu_de = 'Chủ đề riêng', dien_gia = 'Giảng sư đã duyệt',
        visibility = 'public', anh_dai_dien = 'covers/kept.jpg'
      WHERE id = ?
    `).bind(source.album_id).run();
    drive.files['folder-talk-123'] = [
      driveFile('file-track-1-new', 'Bài 1.mp3', '2026-07-31T01:00:00Z'),
      driveFile('file-track-2', 'Bài 2 đổi tên.mp3', '2026-07-31T01:00:00Z'),
      driveFile('file-track-10', 'Bài 10.mp3'),
    ];
    drive.folderNames['folder-talk-123'] = 'Tên mới - Tác giả';

    const updated = await scanGoogleDriveTalks(scanRequest(false), workerEnv, {
      accessToken: 'test-token', fetchImpl: drive.fetch,
    });
    expect(updated.counts.updated).toBe(1);
    const afterUpdate = await env.DB.prepare(`
      SELECT tieu_de, dien_gia, mo_ta, chu_de, tracks, visibility, anh_dai_dien
      FROM phap_thoai WHERE id = ?
    `).bind(source.album_id).first();
    expect(afterUpdate).toMatchObject({
      tieu_de: 'Tên mới - Tác giả',
      dien_gia: 'Giảng sư đã duyệt',
      mo_ta: 'Mô tả thủ công',
      chu_de: 'Chủ đề riêng',
      visibility: 'public',
      anh_dai_dien: 'covers/kept.jpg',
    });
    expect(JSON.parse(afterUpdate.tracks).map((track) => track.title)).toEqual([
      'Bài 2 đổi tên', 'Bài 10', 'Bài 1',
    ]);

    const repeated = await scanGoogleDriveTalks(scanRequest(false), workerEnv, {
      accessToken: 'test-token', fetchImpl: drive.fetch,
    });
    expect(repeated.counts).toEqual({ created: 0, updated: 0, skipped: 2, error: 0 });
    await expect(env.DB.prepare(
      'SELECT COUNT(*) AS count FROM phap_thoai_drive_sources WHERE drive_folder_id = ?',
    ).bind('folder-talk-123').first()).resolves.toEqual({ count: 1 });

    drive.files['folder-talk-123'] = [];
    const emptied = await scanGoogleDriveTalks(scanRequest(false), workerEnv, {
      accessToken: 'test-token', fetchImpl: drive.fetch,
    });
    expect(emptied.counts.updated).toBe(1);
    await expect(env.DB.prepare('SELECT tracks FROM phap_thoai WHERE id = ?')
      .bind(source.album_id).first()).resolves.toEqual({ tracks: '[]' });
    await expect(env.DB.prepare(
      'SELECT COUNT(*) AS count FROM phap_thoai_drive_files WHERE drive_folder_id = ?',
    ).bind('folder-talk-123').first()).resolves.toEqual({ count: 0 });
  });

  it('reports a dry-run without writing catalog or album rows', async () => {
    const drive = createDriveMock({
      folders: [{ id: 'folder-dry-run-123', name: 'Dry run - Tác giả' }],
      files: { 'folder-dry-run-123': [driveFile('file-dry-run-123', 'Bài 1.mp3')] },
    });
    const result = await scanGoogleDriveTalks(scanRequest(true), {
      ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID,
    }, { accessToken: 'test-token', fetchImpl: drive.fetch });
    expect(result.counts.created).toBe(1);
    await expect(env.DB.prepare(
      'SELECT drive_folder_id FROM phap_thoai_drive_sources WHERE drive_folder_id = ?',
    ).bind('folder-dry-run-123').first()).resolves.toBeNull();
  });

  it('requires a strict dryRun boolean', async () => {
    await expect(scanGoogleDriveTalks(new Request('https://quangtu.vn/api/admin/talks/drive-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: 'false' }),
    }), { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID }, {
      accessToken: 'test-token', fetchImpl: async () => new Response('{}'),
    })).rejects.toMatchObject({ status: 400, code: 'invalid_scan_request' });
  });

  it('blocks apply when legacy albums have not been mapped', async () => {
    await env.DB.prepare(`
      INSERT INTO phap_thoai (id, tieu_de, archive_id, tracks, visibility)
      VALUES ('legacy-unmapped-test', 'Legacy', 'legacy-archive-test', '[]', 'private')
    `).run();
    try {
      await expect(scanGoogleDriveTalks(scanRequest(false), {
        ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID,
      }, { accessToken: 'test-token', fetchImpl: async () => Response.json({ files: [] }) }))
        .rejects.toMatchObject({ status: 409, code: 'drive_mapping_required' });
    } finally {
      await env.DB.prepare("DELETE FROM phap_thoai WHERE id = 'legacy-unmapped-test'").run();
    }
  });
  it('scans multi-format audio files (.m4a, .webm, .mp3) and ignores non-audio files', async () => {
    const drive = createDriveMock({
      folders: [
        { id: 'folder-multiformat-123', name: 'Pháp Thoại Đa Định Dạng' },
      ],
      files: {
        'folder-multiformat-123': [
          driveFile('file-track-1', '01. Bài Khai Thị.m4a', '2026-08-01T00:00:00Z', 'audio/mp4'),
          driveFile('file-track-2', '02. Bài Vấn Đáp.webm', '2026-08-01T00:00:00Z', 'audio/webm'),
          driveFile('file-track-3', '03. Bài Tụng Kinh.mp3', '2026-08-01T00:00:00Z', 'audio/mpeg'),
          { id: 'ignored-doc-123', name: 'Tai_lieu.pdf', mimeType: 'application/pdf' },
        ],
      },
    });
    const result = await scanGoogleDriveTalks(scanRequest(false), {
      ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID,
    }, { accessToken: 'test-token', fetchImpl: drive.fetch });

    expect(result.counts.created).toBe(1);
    const source = await env.DB.prepare(`
      SELECT album_id FROM phap_thoai_drive_sources WHERE drive_folder_id = ?
    `).bind('folder-multiformat-123').first();
    const album = await env.DB.prepare(`
      SELECT tracks FROM phap_thoai WHERE id = ?
    `).bind(source.album_id).first();
    const tracks = JSON.parse(album.tracks);
    expect(tracks).toHaveLength(3);
    expect(tracks.map((t) => t.title)).toEqual([
      '01. Bài Khai Thị',
      '02. Bài Vấn Đáp',
      '03. Bài Tụng Kinh',
    ]);
  });
});

function scanRequest(dryRun) {
  return new Request('https://quangtu.vn/api/admin/talks/drive-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun }),
  });
}

function driveFile(id, name, modifiedTime = '2026-07-31T00:00:00Z', mimeType = 'audio/mpeg') {
  return { id, name, mimeType, size: '1234', modifiedTime };
}

function createDriveMock({ folders, files }) {
  const state = {
    files,
    folderNames: Object.fromEntries(folders.map((folder) => [folder.id, folder.name])),
    rootPageRequests: 0,
  };
  state.fetch = async (input) => {
    const url = new URL(input);
    const parent = /'([^']+)' in parents/u.exec(url.searchParams.get('q') || '')?.[1];
    if (parent === ROOT_ID) {
      state.rootPageRequests += 1;
      const currentFolders = folders.map((folder) => ({
        ...folder,
        name: state.folderNames[folder.id],
        mimeType: 'application/vnd.google-apps.folder',
      }));
      if (!url.searchParams.get('pageToken') && currentFolders.length > 1) {
        return Response.json({ files: currentFolders.slice(0, 1), nextPageToken: 'next-root-page' });
      }
      return Response.json({ files: currentFolders.length > 1 ? currentFolders.slice(1) : currentFolders });
    }
    return Response.json({ files: state.files[parent] || [] });
  };
  return state;
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}

function toPem(buffer) {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  const lines = btoa(binary).match(/.{1,64}/gu).join('\n');
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
