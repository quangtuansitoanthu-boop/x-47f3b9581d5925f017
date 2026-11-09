import { jsonValue, readJson } from '../http/request.js';

const SYNC_FIELDS = [
  'practice_logs', 'bookmarks', 'listened_history', 'pt_player_state',
  'pt_album_positions', 'pt_recent_albums',
];

export async function getUserSync(env, session) {
  const row = await env.DB.prepare('SELECT * FROM user_sync_data WHERE id = ?')
    .bind(session.appUserId).first();
  return parseSync(row);
}

export async function putUserSync(request, env, session) {
  const body = await readJson(request, 800_000);
  const values = Object.fromEntries(SYNC_FIELDS.map((field) => [
    field,
    jsonValue(body[field], field, field.endsWith('_state') ? null : []),
  ]));
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO user_sync_data
      (id, practice_logs, bookmarks, listened_history, updated_at,
       pt_player_state, pt_album_positions, pt_recent_albums)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      practice_logs = excluded.practice_logs,
      bookmarks = excluded.bookmarks,
      listened_history = excluded.listened_history,
      updated_at = excluded.updated_at,
      pt_player_state = excluded.pt_player_state,
      pt_album_positions = excluded.pt_album_positions,
      pt_recent_albums = excluded.pt_recent_albums
  `).bind(
    session.appUserId,
    values.practice_logs,
    values.bookmarks,
    values.listened_history,
    updatedAt,
    values.pt_player_state,
    values.pt_album_positions,
    values.pt_recent_albums,
  ).run();
  return { id: session.appUserId, ...body, updated_at: updatedAt };
}

export async function getPlayerSync(env, session) {
  const id = playerOwnerId(session);
  const row = await env.DB.prepare('SELECT * FROM pt_player_sync WHERE id = ?').bind(id).first();
  return parseSync(row);
}

export async function putPlayerSync(request, env, session) {
  const body = await readJson(request, 600_000);
  const id = playerOwnerId(session);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO pt_player_sync
      (id, pt_player_state, pt_album_positions, pt_recent_albums, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pt_player_state = excluded.pt_player_state,
      pt_album_positions = excluded.pt_album_positions,
      pt_recent_albums = excluded.pt_recent_albums,
      updated_at = excluded.updated_at
  `).bind(
    id,
    jsonValue(body.pt_player_state, 'pt_player_state', null),
    jsonValue(body.pt_album_positions, 'pt_album_positions', {}),
    jsonValue(body.pt_recent_albums, 'pt_recent_albums', []),
    updatedAt,
  ).run();
  return { id, ...body, updated_at: updatedAt };
}

function parseSync(row) {
  if (!row) return null;
  const result = { ...row };
  for (const field of SYNC_FIELDS) {
    if (typeof result[field] !== 'string') continue;
    try {
      result[field] = JSON.parse(result[field]);
    } catch {
      result[field] = null;
    }
  }
  return result;
}

function playerOwnerId(session) {
  if (session.appUserId) return `google_${session.appUserId}`;
  const username = String(session.displayName || '').normalize('NFKC').trim().toLocaleLowerCase('vi');
  return `local_${username}`;
}
