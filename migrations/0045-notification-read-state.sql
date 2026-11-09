-- Read receipts only; no notification content, private journal or historical backfill.
-- Existing shared-web contract; IF NOT EXISTS adds its schema to mobile/local only.
CREATE TABLE IF NOT EXISTS notification_state (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL CHECK (item_key IN ('collapsed_date', 'read_ids')),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  saved_at REAL NOT NULL,
  PRIMARY KEY (owner_id, item_key)
);
CREATE TABLE notification_read_receipts (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL CHECK (length(notification_id) BETWEEN 1 AND 128),
  read_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, notification_id)
) WITHOUT ROWID;
CREATE INDEX idx_notification_reads_recent ON notification_read_receipts(owner_id, read_at DESC, notification_id);
