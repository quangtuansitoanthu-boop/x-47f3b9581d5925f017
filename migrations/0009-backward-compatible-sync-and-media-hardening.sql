ALTER TABLE user_sync_data
  ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_sync_data
  ADD COLUMN sync_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sync_metadata));

ALTER TABLE pt_player_sync
  ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pt_player_sync
  ADD COLUMN sync_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sync_metadata));

ALTER TABLE media_operations
  ADD COLUMN cleanup_claimed_at TEXT;

ALTER TABLE media_operations
  ADD COLUMN finalize_started_at TEXT;

CREATE TABLE IF NOT EXISTS article_media_cleanup_queue (
  article_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  source_field TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'failed', 'tombstoned')),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (article_id, object_key, source_field)
);

CREATE INDEX IF NOT EXISTS idx_article_media_cleanup_queue_status
  ON article_media_cleanup_queue(status, updated_at);
