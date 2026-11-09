ALTER TABLE facebook_connections ADD COLUMN scan_after_cursor TEXT;
ALTER TABLE facebook_connections ADD COLUMN scan_since_epoch INTEGER;
ALTER TABLE facebook_connections ADD COLUMN scan_max_created_time TEXT;
ALTER TABLE facebook_connections ADD COLUMN scan_had_failure INTEGER NOT NULL DEFAULT 0
  CHECK (scan_had_failure IN (0, 1));

INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
VALUES ('facebook-import-v1', 21, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(capability) DO UPDATE SET
  schema_version = MAX(app_schema_capabilities.schema_version, excluded.schema_version),
  applied_at = excluded.applied_at;
