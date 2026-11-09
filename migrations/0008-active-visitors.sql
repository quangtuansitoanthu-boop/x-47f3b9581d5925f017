CREATE TABLE IF NOT EXISTS active_visitors (
  visitor_id_hash TEXT PRIMARY KEY,
  network_hash TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= 0)
);

CREATE INDEX IF NOT EXISTS idx_active_visitors_last_seen
  ON active_visitors(last_seen_at);

CREATE INDEX IF NOT EXISTS idx_active_visitors_network
  ON active_visitors(network_hash);
