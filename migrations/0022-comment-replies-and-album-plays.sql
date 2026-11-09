ALTER TABLE binh_luan ADD COLUMN author_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE binh_luan ADD COLUMN parent_id INTEGER REFERENCES binh_luan(id) ON DELETE CASCADE;
CREATE INDEX idx_binh_luan_parent ON binh_luan(parent_id);

CREATE TABLE album_play_totals (
  album_id TEXT PRIMARY KEY REFERENCES phap_thoai(id) ON DELETE CASCADE,
  play_count INTEGER NOT NULL DEFAULT 0 CHECK (play_count >= 0)
);
CREATE TABLE album_play_listeners (
  album_id TEXT NOT NULL REFERENCES phap_thoai(id) ON DELETE CASCADE,
  listener_hash TEXT NOT NULL,
  counted_at INTEGER NOT NULL,
  PRIMARY KEY (album_id, listener_hash)
);
CREATE INDEX idx_album_play_listeners_time ON album_play_listeners(counted_at);
