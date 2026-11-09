-- Dedicated bounded personal settings; private journals never enter this table.
CREATE TABLE practice_personal_settings (
  owner_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json) AND length(snapshot_json) <= 90000),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL
);
