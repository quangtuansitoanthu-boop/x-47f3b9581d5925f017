import { beforeAll, describe, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import driveSchema from '../../migrations/0007-google-drive-talk-sources.sql?raw';
import { getGoogleDriveAudio } from '../../src/worker/api/google-drive-audio.js';

const ROOT_ID = 'root-audio-test-123';
const FILE_ID = 'drive-audio-file-123';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0007-google-drive-talk-sources.sql', queries: splitMigration(driveSchema) },
  ]);
  await env.DB.prepare(`
    INSERT INTO phap_thoai (id, tieu_de, tracks, visibility)
    VALUES ('drive-audio-album', 'Album', '[]', 'public')
  `).run();
  await env.DB.prepare(`
    INSERT INTO phap_thoai_drive_sources
      (drive_folder_id, album_id, drive_root_folder_id, folder_name, fingerprint, last_scanned_at)
    VALUES ('drive-audio-folder', 'drive-audio-album', ?, 'Album', 'fingerprint', ?)
  `).bind(ROOT_ID, new Date().toISOString()).run();
  await env.DB.prepare(`
    INSERT INTO phap_thoai_drive_files
      (drive_file_id, drive_folder_id, album_id, file_name, mime_type, byte_size, sort_order)
    VALUES (?, 'drive-audio-folder', 'drive-audio-album', 'Bài 1.mp3', 'audio/mpeg', 10, 0)
  `).bind(FILE_ID).run();
});

describe('Google Drive audio gateway', () => {
  it('catalog-authorizes and streams a byte range with safe response headers', async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      expect(init.method).toBe('GET');
      expect(new Headers(init.headers).get('range')).toBe('bytes=2-5');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-token');
      return new Response('2345', {
        status: 206,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': '4',
          'Content-Range': 'bytes 2-5/10',
          'Accept-Ranges': 'bytes',
          ETag: '"drive-etag"',
          'Set-Cookie': 'must-not-leak=yes',
        },
      });
    });
    const response = await getGoogleDriveAudio(new Request(
      `https://quangtu.vn/api/audio/drive/${FILE_ID}`,
      { headers: { Range: 'bytes=2-5' } },
    ), { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID }, FILE_ID, {
      accessToken: 'test-token', fetchImpl,
    });
    expect(response.status).toBe(206);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('2345');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('etag')).toBe('"drive-etag"');
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('supports HEAD without returning an audio body', async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      expect(init.method).toBe('HEAD');
      return new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '10' },
      });
    });
    const response = await getGoogleDriveAudio(new Request(
      `https://quangtu.vn/api/audio/drive/${FILE_ID}`, { method: 'HEAD' },
    ), { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID }, FILE_ID, {
      accessToken: 'test-token', fetchImpl,
    });
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get('content-length')).toBe('10');
  });

  it('rejects file IDs outside the catalog without contacting Drive', async () => {
    const fetchImpl = vi.fn();
    await expect(getGoogleDriveAudio(new Request(
      'https://quangtu.vn/api/audio/drive/not-cataloged-123',
    ), { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID }, 'not-cataloged-123', {
      accessToken: 'test-token', fetchImpl,
    })).rejects.toMatchObject({ status: 404, code: 'audio_not_found' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps upstream authorization failures without exposing the response', async () => {
    await expect(getGoogleDriveAudio(new Request(
      `https://quangtu.vn/api/audio/drive/${FILE_ID}`,
    ), { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID }, FILE_ID, {
      accessToken: 'test-token',
      fetchImpl: async () => new Response('token details', { status: 403 }),
    })).rejects.toMatchObject({ status: 502, code: 'drive_audio_failed' });
  });

  it('does not expose a private album audio URL to guests', async () => {
    await env.DB.prepare("UPDATE phap_thoai SET visibility = 'private' WHERE id = 'drive-audio-album'").run();
    const request = new Request(`https://quangtu.vn/api/audio/drive/${FILE_ID}`);
    const dependencies = { accessToken: 'test-token', fetchImpl: vi.fn() };
    await expect(getGoogleDriveAudio(
      request, { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID }, FILE_ID, dependencies,
    )).rejects.toMatchObject({ status: 404, code: 'audio_not_found' });
    expect(dependencies.fetchImpl).not.toHaveBeenCalled();

    dependencies.fetchImpl = vi.fn(async () => new Response('audio', {
      headers: { 'content-type': 'audio/mpeg' },
    }));
    const response = await getGoogleDriveAudio(
      request,
      { ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID },
      FILE_ID,
      { ...dependencies, session: { role: 'ctv' } },
    );
    expect(response.status).toBe(200);
    await env.DB.prepare("UPDATE phap_thoai SET visibility = 'public' WHERE id = 'drive-audio-album'").run();
  });
});

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}
