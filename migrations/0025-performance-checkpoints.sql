CREATE TABLE IF NOT EXISTS practice_snapshot_revisions (
  owner_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS practice_progress_snapshots (
  owner_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  time_zone TEXT NOT NULL,
  date_key TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_legacy_checkpoints (
  owner_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  source_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_public_snapshots (
  cache_key TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_public_revision (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL);

INSERT OR IGNORE INTO practice_public_revision(id, revision) VALUES (1, 0);

CREATE TRIGGER IF NOT EXISTS practice_snapshot_insert AFTER INSERT ON practice_sessions WHEN NEW.status = 'completed' AND NEW.verification_result = 'accepted' BEGIN
  INSERT INTO practice_snapshot_revisions(owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS practice_snapshot_delete AFTER DELETE ON practice_sessions WHEN OLD.status = 'completed' AND OLD.verification_result = 'accepted' BEGIN
  INSERT INTO practice_snapshot_revisions(owner_id, revision) SELECT OLD.owner_id, 1 WHERE EXISTS (SELECT 1 FROM app_users WHERE id = OLD.owner_id)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS practice_snapshot_update AFTER UPDATE ON practice_sessions WHEN (OLD.status = 'completed' AND OLD.verification_result = 'accepted') OR (NEW.status = 'completed' AND NEW.verification_result = 'accepted') BEGIN
  INSERT INTO practice_snapshot_revisions(owner_id, revision) VALUES (NEW.owner_id, 1)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
  INSERT INTO practice_snapshot_revisions(owner_id, revision) SELECT OLD.owner_id, 1 WHERE OLD.owner_id <> NEW.owner_id AND EXISTS (SELECT 1 FROM app_users WHERE id = OLD.owner_id)
  ON CONFLICT(owner_id) DO UPDATE SET revision = revision + 1;
END;

CREATE INDEX IF NOT EXISTS idx_comments_article_time_id ON binh_luan(bai_viet_id, tao_luc, id);

CREATE TRIGGER IF NOT EXISTS practice_snapshot_profile_update AFTER UPDATE ON practice_profiles BEGIN
  DELETE FROM practice_progress_snapshots WHERE owner_id = NEW.owner_id;
  DELETE FROM practice_public_snapshots;
  UPDATE practice_public_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS practice_snapshot_profile_insert AFTER INSERT ON practice_profiles BEGIN
  DELETE FROM practice_progress_snapshots WHERE owner_id = NEW.owner_id;
  DELETE FROM practice_public_snapshots;
  UPDATE practice_public_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS practice_snapshot_profile_delete AFTER DELETE ON practice_profiles BEGIN
  DELETE FROM practice_progress_snapshots WHERE owner_id = OLD.owner_id;
  DELETE FROM practice_public_snapshots;
  UPDATE practice_public_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS practice_snapshot_user_update AFTER UPDATE OF display_name, avatar_url ON app_users BEGIN
  DELETE FROM practice_public_snapshots;
  UPDATE practice_public_revision SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS practice_snapshot_user_delete AFTER DELETE ON app_users BEGIN
  DELETE FROM practice_public_snapshots;
  UPDATE practice_public_revision SET revision = revision + 1 WHERE id = 1;
END;
