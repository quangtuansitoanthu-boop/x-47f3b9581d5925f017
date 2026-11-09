-- Migration 0032: Lưu trữ tính năng Thanh Tịnh Tâm (Cộng đồng cùng giữ giới)

CREATE TABLE IF NOT EXISTS thanh_tinh_community (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO thanh_tinh_community (key, value, updated_at) VALUES
  ('participants', 1280, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('urges_resisted', 8450, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('clean_days', 32600, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS thanh_tinh_pledges (
  anon_id_hash TEXT PRIMARY KEY,
  user_id TEXT,
  display_name TEXT NOT NULL DEFAULT 'Ẩn danh',
  email TEXT NOT NULL DEFAULT '',
  streak_days INTEGER NOT NULL DEFAULT 0,
  urges_resisted INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thanh_tinh_pledges_active ON thanh_tinh_pledges(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_thanh_tinh_pledges_user ON thanh_tinh_pledges(user_id);
