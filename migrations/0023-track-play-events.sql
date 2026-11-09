CREATE TABLE album_play_events (
  album_id TEXT NOT NULL REFERENCES phap_thoai(id) ON DELETE CASCADE,
  playback_id TEXT NOT NULL,
  track_url TEXT NOT NULL,
  counted_at INTEGER NOT NULL,
  PRIMARY KEY (album_id, playback_id)
);
CREATE INDEX idx_album_play_events_time ON album_play_events(counted_at);
