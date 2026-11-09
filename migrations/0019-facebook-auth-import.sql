ALTER TABLE auth_sessions ADD COLUMN identity_id TEXT REFERENCES auth_identities(id) ON DELETE SET NULL;
ALTER TABLE auth_sessions ADD COLUMN auth_provider TEXT CHECK (auth_provider IS NULL OR auth_provider IN ('google', 'facebook'));

CREATE INDEX IF NOT EXISTS idx_auth_sessions_identity_id
  ON auth_sessions(identity_id)
  WHERE identity_id IS NOT NULL;

ALTER TABLE oauth_states ADD COLUMN provider TEXT NOT NULL DEFAULT 'google'
  CHECK (provider IN ('google', 'facebook'));
ALTER TABLE oauth_states ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login'
  CHECK (purpose IN ('login', 'link', 'connector'));
ALTER TABLE oauth_states ADD COLUMN actor_user_id TEXT;
ALTER TABLE oauth_states ADD COLUMN actor_session_hash TEXT;
ALTER TABLE oauth_states ADD COLUMN required_capability TEXT;
ALTER TABLE oauth_states ADD COLUMN resource_generation INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS facebook_import_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source_url TEXT NOT NULL,
  publish_policy TEXT NOT NULL DEFAULT 'review' CHECK (publish_policy IN ('review', 'auto')),
  source_generation INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO facebook_import_settings
  (id, source_url, publish_policy, source_generation, updated_at)
VALUES (1, 'https://www.facebook.com/tranan.buhd', 'review', 0, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS facebook_connections (
  id TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  facebook_user_id TEXT,
  facebook_display_name TEXT,
  source_url TEXT NOT NULL,
  token_ciphertext TEXT,
  token_key_version TEXT,
  granted_scopes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(granted_scopes)),
  token_expires_at TEXT,
  data_access_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN (
    'disabled', 'permission_missing', 'permission_unavailable', 'active', 'backoff',
    'reauthorization_required', 'configuration_error'
  )),
  generation INTEGER NOT NULL DEFAULT 0,
  watermark_created_time TEXT,
  next_sync_at TEXT,
  backoff_until TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  tombstoned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (app_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_connections_subject
  ON facebook_connections(facebook_user_id)
  WHERE facebook_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facebook_connections_due
  ON facebook_connections(status, next_sync_at, backoff_until, lease_expires_at)
  WHERE tombstoned_at IS NULL;

CREATE TABLE IF NOT EXISTS facebook_post_imports (
  id TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES facebook_connections(id) ON DELETE SET NULL,
  facebook_post_id TEXT NOT NULL UNIQUE,
  article_id TEXT REFERENCES baiviet(id) ON DELETE SET NULL,
  permalink_url TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT '',
  source_created_at TEXT,
  source_updated_at TEXT,
  source_content_hash TEXT NOT NULL,
  article_content_hash TEXT,
  source_managed INTEGER NOT NULL DEFAULT 1 CHECK (source_managed IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN (
    'review', 'published', 'detached', 'removed', 'failed'
  )),
  missing_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  last_reconciled_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_facebook_post_imports_connection
  ON facebook_post_imports(connection_id, source_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facebook_post_imports_article
  ON facebook_post_imports(article_id)
  WHERE article_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS facebook_deletion_requests (
  confirmation_code TEXT PRIMARY KEY,
  facebook_user_id_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_facebook_deletion_requests_requested_at
  ON facebook_deletion_requests(requested_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_deletion_requests_subject
  ON facebook_deletion_requests(facebook_user_id_hash);

INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
VALUES ('facebook-import-v1', 19, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(capability) DO UPDATE SET
  schema_version = MAX(app_schema_capabilities.schema_version, excluded.schema_version);
