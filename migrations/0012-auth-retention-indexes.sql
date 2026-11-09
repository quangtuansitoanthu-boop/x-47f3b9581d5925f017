CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at
  ON auth_sessions(revoked_at)
  WHERE revoked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_states_consumed_at
  ON oauth_states(consumed_at)
  WHERE consumed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_start_rate_limits (
  bucket TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_start_rate_limits_expires_at
  ON oauth_start_rate_limits(expires_at);
