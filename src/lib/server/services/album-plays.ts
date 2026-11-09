import type { CloudflareEnvLike } from '../cloudflare-context';
import { ServerInputError } from '../errors';

const PLAYBACK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export async function listAlbumPlays(env: CloudflareEnvLike) {
  const rows = await env.DB.prepare(`
    SELECT p.id AS albumId, COALESCE(t.play_count, 0) AS playCount
    FROM phap_thoai p LEFT JOIN album_play_totals t ON t.album_id = p.id
    WHERE p.visibility = 'public'
    ORDER BY playCount DESC, p.id ASC
  `).all();
  return rows.results ?? [];
}

export async function recordAlbumPlay(env: CloudflareEnvLike, albumId: string, input: { playbackId?: unknown; trackUrl?: unknown }, now = Date.now()) {
  const album = await env.DB.prepare("SELECT id, tracks FROM phap_thoai WHERE id = ? AND visibility = 'public'").bind(albumId).first<{ id: string; tracks: string }>();
  if (!album) throw new ServerInputError(404, 'album_not_found', 'Album không tồn tại hoặc không công khai.');
  const { playbackId, trackUrl } = input;
  if (typeof playbackId !== 'string' || !PLAYBACK_ID_PATTERN.test(playbackId)
    || typeof trackUrl !== 'string' || !trackUrl || trackUrl.length > 4096) {
    throw new ServerInputError(400, 'invalid_playback', 'Thông tin lượt phát không hợp lệ. Vui lòng tải lại trang.');
  }
  let tracks: unknown;
  try { tracks = JSON.parse(album.tracks || '[]'); } catch { tracks = []; }
  if (!Array.isArray(tracks) || !tracks.some((track) => track && typeof track === 'object' && String(track.url ?? '').trim() === trackUrl)) {
    throw new ServerInputError(400, 'track_not_found', 'Bài phát không thuộc album.');
  }
  // D1 batch is transactional. changes() ties the counter to the winning dedup write.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO album_play_events (album_id, playback_id, track_url, counted_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(album_id, playback_id) DO NOTHING`).bind(albumId, playbackId, trackUrl, now),
    env.DB.prepare(`INSERT INTO album_play_totals (album_id, play_count)
      SELECT ?, 1 WHERE changes() = 1
      ON CONFLICT(album_id) DO UPDATE SET play_count = play_count + 1`).bind(albumId),
  ]);
  const total = await env.DB.prepare('SELECT play_count FROM album_play_totals WHERE album_id = ?').bind(albumId).first<{ play_count: number }>();
  return { albumId, playCount: total?.play_count ?? 0, counted: Number(results[0].meta?.changes) === 1 };
}

export async function purgeAlbumPlayEvents(env: CloudflareEnvLike, now = Date.now()) {
  return env.DB.prepare('DELETE FROM album_play_events WHERE rowid IN (SELECT rowid FROM album_play_events WHERE counted_at < ? ORDER BY counted_at LIMIT 500)').bind(now - 86_400_000).run();
}
