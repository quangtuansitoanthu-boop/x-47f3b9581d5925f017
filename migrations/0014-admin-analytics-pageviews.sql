CREATE TABLE IF NOT EXISTS analytics_pageviews (
  pageview_id_hash TEXT PRIMARY KEY,
  visit_date TEXT NOT NULL,
  visitor_id_hash TEXT NOT NULL,
  session_id_hash TEXT NOT NULL,
  principal_id TEXT,
  account_type TEXT NOT NULL DEFAULT 'guest' CHECK (account_type IN ('guest', 'google', 'internal')),
  path TEXT NOT NULL DEFAULT '/',
  source TEXT NOT NULL DEFAULT 'Trực tiếp',
  device_type TEXT NOT NULL DEFAULT 'Chưa xác định',
  browser_name TEXT NOT NULL DEFAULT 'Chưa xác định',
  operating_system TEXT NOT NULL DEFAULT 'Chưa xác định',
  country_code TEXT NOT NULL DEFAULT 'Chưa xác định',
  region_code TEXT NOT NULL DEFAULT 'Chưa xác định',
  city TEXT NOT NULL DEFAULT 'Chưa xác định',
  started_at INTEGER NOT NULL CHECK (started_at >= 0),
  last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= 0),
  heartbeat_count INTEGER NOT NULL DEFAULT 1 CHECK (heartbeat_count >= 1)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_date
  ON analytics_pageviews(visit_date);

CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_session
  ON analytics_pageviews(visit_date, session_id_hash);

CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_path
  ON analytics_pageviews(visit_date, path);

CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_last_seen
  ON analytics_pageviews(last_seen_at);
