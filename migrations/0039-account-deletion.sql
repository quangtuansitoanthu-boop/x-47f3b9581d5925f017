-- Account deletion: preserve campaign/community history without a synthetic user.
-- Run through the existing atomic D1 migration runner. Ordinary backup tables
-- avoid relying on TEMP support; all are dropped before migration completion.
CREATE TABLE account_deletion_campaigns_backup AS SELECT * FROM practice_campaigns;
CREATE TABLE account_deletion_members_backup AS SELECT * FROM practice_campaign_members;
CREATE TABLE account_deletion_contributions_backup AS SELECT * FROM practice_campaign_contributions;

-- No triggers are owned by these three tables. Drop children first so deleting
-- the parent cannot cascade away the copies that will be restored below.
DROP TABLE practice_campaign_contributions;
DROP TABLE practice_campaign_members;
DROP TABLE practice_campaigns;

CREATE TABLE practice_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  metric TEXT NOT NULL CHECK (metric IN ('count', 'duration_seconds', 'sessions')),
  goal_value INTEGER NOT NULL CHECK (goal_value > 0),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_practice_campaigns_window ON practice_campaigns(status, starts_at, ends_at);
CREATE INDEX idx_practice_campaigns_creator ON practice_campaigns(created_by);

CREATE TABLE practice_campaign_members (
  campaign_id TEXT NOT NULL REFERENCES practice_campaigns(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (campaign_id, owner_id)
);
CREATE INDEX idx_practice_campaign_members_owner ON practice_campaign_members(owner_id, left_at, joined_at DESC);

CREATE TABLE practice_campaign_contributions (
  campaign_id TEXT NOT NULL REFERENCES practice_campaigns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  contribution_value INTEGER NOT NULL CHECK (contribution_value >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, session_id)
);
CREATE INDEX idx_practice_campaign_contributions_owner ON practice_campaign_contributions(campaign_id, owner_id, created_at DESC);
CREATE INDEX idx_practice_campaign_contributions_account ON practice_campaign_contributions(owner_id);
CREATE INDEX idx_practice_campaign_contributions_session ON practice_campaign_contributions(session_id);

INSERT INTO practice_campaigns SELECT * FROM account_deletion_campaigns_backup;
INSERT INTO practice_campaign_members SELECT * FROM account_deletion_members_backup;
INSERT INTO practice_campaign_contributions SELECT * FROM account_deletion_contributions_backup;
DROP TABLE account_deletion_contributions_backup;
DROP TABLE account_deletion_members_backup;
DROP TABLE account_deletion_campaigns_backup;

CREATE TABLE apple_account_tokens (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider_subject TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  key_version TEXT NOT NULL,
  revision TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (owner_id, provider_subject)
);
CREATE INDEX IF NOT EXISTS idx_binh_luan_author_account ON binh_luan(author_user_id);

INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
VALUES ('account-deletion-v1', 39, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(capability) DO UPDATE SET schema_version = MAX(app_schema_capabilities.schema_version, excluded.schema_version);
