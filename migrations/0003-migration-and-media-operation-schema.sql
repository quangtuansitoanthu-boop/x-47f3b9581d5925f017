PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT PRIMARY KEY,
  source_sql_sha256 TEXT NOT NULL,
  source_manifest_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'imported', 'verified', 'sealed', 'failed')),
  started_at TEXT NOT NULL,
  imported_at TEXT,
  verified_at TEXT,
  sealed_at TEXT,
  failure_code TEXT,
  CHECK (
    (status = 'started' AND sealed_at IS NULL)
    OR (status = 'imported' AND imported_at IS NOT NULL AND sealed_at IS NULL)
    OR (status = 'verified' AND imported_at IS NOT NULL AND verified_at IS NOT NULL AND sealed_at IS NULL)
    OR (status = 'sealed' AND imported_at IS NOT NULL AND verified_at IS NOT NULL AND sealed_at IS NOT NULL)
    OR status = 'failed'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_single_sealed_run
  ON migration_runs(status)
  WHERE status = 'sealed';

CREATE TABLE IF NOT EXISTS migration_table_state (
  migration_run_id TEXT NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  expected_row_count INTEGER NOT NULL CHECK (expected_row_count >= 0),
  imported_row_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_row_count >= 0),
  expected_root_sha256 TEXT NOT NULL,
  verified_root_sha256 TEXT,
  PRIMARY KEY (migration_run_id, table_name)
);

CREATE TABLE IF NOT EXISTS media_objects (
  object_key TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL,
  cache_control TEXT NOT NULL DEFAULT 'public, max-age=31536000, immutable',
  baseline INTEGER NOT NULL DEFAULT 0 CHECK (baseline IN (0, 1)),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS media_operations (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('put', 'delete')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'failed', 'tombstoned', 'purged')),
  expected_sha256 TEXT,
  expected_byte_size INTEGER CHECK (expected_byte_size IS NULL OR expected_byte_size >= 0),
  created_at TEXT NOT NULL,
  applied_at TEXT,
  purge_after TEXT,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_operations_status ON media_operations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_media_operations_object_key ON media_operations(object_key, created_at);

CREATE VIEW IF NOT EXISTS sealed_migration AS
SELECT id, source_sql_sha256, source_manifest_sha256, sealed_at
FROM migration_runs
WHERE status = 'sealed' AND sealed_at IS NOT NULL;
