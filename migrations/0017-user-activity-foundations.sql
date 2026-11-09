-- Typed, owner-scoped foundations for reading activity and automatic practice.
-- High-cardinality activity must not be added to the legacy aggregate JSON sync.

CREATE TABLE IF NOT EXISTS app_schema_capabilities (
  capability TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_devices (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  high_water_sequence INTEGER NOT NULL DEFAULT 0 CHECK (high_water_sequence >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (owner_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_devices_owner_active
  ON sync_devices(owner_id, revoked_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS reading_progress (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('article', 'book', 'chapter', 'pdf', 'practice')),
  content_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  epoch INTEGER NOT NULL DEFAULT 1 CHECK (epoch >= 1),
  device_id TEXT NOT NULL,
  device_sequence INTEGER NOT NULL CHECK (device_sequence >= 1),
  position_json TEXT NOT NULL CHECK (json_valid(position_json)),
  total REAL CHECK (total IS NULL OR total >= 0),
  percent REAL NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  content_version TEXT,
  client_updated_at TEXT,
  server_updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_id, content_kind, content_id),
  FOREIGN KEY (owner_id, device_id) REFERENCES sync_devices(owner_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_owner_recent
  ON reading_progress(owner_id, deleted_at, server_updated_at DESC);

CREATE TABLE IF NOT EXISTS reading_annotations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('article', 'book', 'chapter', 'pdf', 'practice')),
  content_id TEXT NOT NULL,
  locator_json TEXT NOT NULL CHECK (json_valid(locator_json)),
  quote_text TEXT NOT NULL CHECK (length(quote_text) BETWEEN 1 AND 12000),
  context_before TEXT NOT NULL DEFAULT '',
  context_after TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL CHECK (color IN ('yellow', 'green')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 12000),
  content_version TEXT,
  anchor_status TEXT NOT NULL DEFAULT 'active' CHECK (anchor_status IN ('active', 'orphaned')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reading_annotations_owner_recent
  ON reading_annotations(owner_id, deleted_at, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_reading_annotations_content
  ON reading_annotations(owner_id, content_kind, content_id, deleted_at, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  client_session_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('meditation', 'rosary', 'scripture', 'model_chant', 'dharma_talk')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  target_duration_seconds INTEGER CHECK (target_duration_seconds IS NULL OR target_duration_seconds > 0),
  target_count INTEGER CHECK (target_count IS NULL OR target_count > 0),
  accepted_duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (accepted_duration_seconds >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  source_kind TEXT,
  source_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  verification_result TEXT CHECK (verification_result IS NULL OR verification_result IN ('accepted', 'below_threshold', 'incomplete', 'implausible', 'unsupported')),
  verification_reason TEXT,
  evidence_summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(evidence_summary_json)),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status IN ('completed', 'cancelled') AND completed_at IS NOT NULL)
  ),
  UNIQUE (owner_id, client_session_id),
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_owner_recent
  ON practice_sessions(owner_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_accepted
  ON practice_sessions(owner_id, activity_type, completed_at DESC)
  WHERE status = 'completed' AND verification_result = 'accepted';

CREATE INDEX IF NOT EXISTS idx_practice_sessions_owner_accepted_timeline
  ON practice_sessions(owner_id, completed_at, id)
  WHERE status = 'completed' AND verification_result = 'accepted';

INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
VALUES ('user-activity-foundations-v1', 17, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(capability) DO UPDATE SET
  schema_version = MAX(app_schema_capabilities.schema_version, excluded.schema_version);
