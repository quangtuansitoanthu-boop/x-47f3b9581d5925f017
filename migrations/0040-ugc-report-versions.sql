-- Publication epochs are independent of candidate edits and moderation CAS.
ALTER TABLE ugc_public_profiles ADD COLUMN approved_revision INTEGER NOT NULL DEFAULT 0 CHECK (approved_revision >= 0);
UPDATE ugc_public_profiles SET approved_revision = 1 WHERE approved_display_name IS NOT NULL;

-- Version zero preserves historical receipts without guessing which publication
-- they described. Keep every identifier, complaint and resolution unchanged.
CREATE TABLE ugc_reports_versioned (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('comment', 'profile')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('offensive', 'harassment', 'spam', 'other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  moderated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  moderated_at TEXT,
  moderation_reason TEXT,
  target_revision INTEGER NOT NULL DEFAULT 0 CHECK (target_revision >= 0),
  UNIQUE (reporter_id, target_type, target_id, target_revision)
);
INSERT INTO ugc_reports_versioned (id, reporter_id, target_type, target_id, reason, details, status,
  revision, created_at, moderated_by, moderated_at, moderation_reason, target_revision)
SELECT id, reporter_id, target_type, target_id, reason, details, status,
  revision, created_at, moderated_by, moderated_at, moderation_reason, 0 FROM ugc_reports;
DROP TABLE ugc_reports;
ALTER TABLE ugc_reports_versioned RENAME TO ugc_reports;
CREATE INDEX idx_ugc_reports_queue ON ugc_reports(status, created_at, id);
CREATE INDEX idx_ugc_reports_moderator ON ugc_reports(moderated_by) WHERE moderated_by IS NOT NULL;
