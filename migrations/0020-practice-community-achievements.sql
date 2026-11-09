-- Private-by-default practice profiles, opt-in projections and campaign accounting.

CREATE TABLE IF NOT EXISTS practice_profiles (
  owner_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (length(time_zone) BETWEEN 1 AND 64),
  leaderboard_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (leaderboard_opt_in IN (0, 1)),
  presence_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (presence_opt_in IN (0, 1)),
  selected_badge TEXT CHECK (selected_badge IS NULL OR selected_badge IN (
    'streak-7', 'streak-21', 'streak-30', 'streak-90', 'streak-100', 'streak-180',
    'streak-300', 'streak-365', 'streak-800', 'streak-1000', 'streak-3000', 'count-10000'
  )),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_practice_profiles_public
  ON practice_profiles(leaderboard_opt_in, presence_opt_in, updated_at DESC);

CREATE TABLE IF NOT EXISTS practice_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  metric TEXT NOT NULL CHECK (metric IN ('count', 'duration_seconds', 'sessions')),
  goal_value INTEGER NOT NULL CHECK (goal_value > 0),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_by TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_practice_campaigns_window
  ON practice_campaigns(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS practice_campaign_members (
  campaign_id TEXT NOT NULL REFERENCES practice_campaigns(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (campaign_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_campaign_members_owner
  ON practice_campaign_members(owner_id, left_at, joined_at DESC);

CREATE TABLE IF NOT EXISTS practice_campaign_contributions (
  campaign_id TEXT NOT NULL REFERENCES practice_campaigns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  contribution_value INTEGER NOT NULL CHECK (contribution_value >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_campaign_contributions_owner
  ON practice_campaign_contributions(campaign_id, owner_id, created_at DESC);

ALTER TABLE active_visitors ADD COLUMN practice_visible INTEGER NOT NULL DEFAULT 0
  CHECK (practice_visible IN (0, 1));

ALTER TABLE active_visitors ADD COLUMN practice_activity TEXT
  CHECK (practice_activity IS NULL OR practice_activity IN ('meditation', 'rosary', 'scripture', 'model_chant', 'dharma_talk'));

ALTER TABLE active_visitors ADD COLUMN practice_started_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_active_visitors_practice
  ON active_visitors(practice_visible, last_seen_at DESC)
  WHERE practice_visible = 1;

INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
VALUES ('practice-community-v1', 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(capability) DO UPDATE SET
  schema_version = MAX(app_schema_capabilities.schema_version, excluded.schema_version);
