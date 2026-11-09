ALTER TABLE active_visitors ADD COLUMN principal_id TEXT;
ALTER TABLE active_visitors ADD COLUMN display_name TEXT;
ALTER TABLE active_visitors ADD COLUMN role TEXT;
ALTER TABLE active_visitors ADD COLUMN device_type TEXT;
ALTER TABLE active_visitors ADD COLUMN browser_name TEXT;
ALTER TABLE active_visitors ADD COLUMN operating_system TEXT;
ALTER TABLE active_visitors ADD COLUMN current_path TEXT NOT NULL DEFAULT '/';
ALTER TABLE active_visitors ADD COLUMN first_seen_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE active_visitors ADD COLUMN is_overflow INTEGER NOT NULL DEFAULT 0 CHECK (is_overflow IN (0, 1));

CREATE TABLE IF NOT EXISTS visitor_daily_presence (
  visit_date TEXT NOT NULL,
  visitor_id_hash TEXT NOT NULL,
  network_hash TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL CHECK (first_seen_at >= 0),
  last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= 0),
  heartbeat_count INTEGER NOT NULL DEFAULT 1 CHECK (heartbeat_count >= 1),
  PRIMARY KEY (visit_date, visitor_id_hash)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_visitor_daily_presence_last_seen
  ON visitor_daily_presence(last_seen_at);

CREATE INDEX IF NOT EXISTS idx_visitor_daily_presence_network
  ON visitor_daily_presence(visit_date, network_hash);

CREATE INDEX IF NOT EXISTS idx_active_visitors_principal
  ON active_visitors(principal_id)
  WHERE principal_id IS NOT NULL;
