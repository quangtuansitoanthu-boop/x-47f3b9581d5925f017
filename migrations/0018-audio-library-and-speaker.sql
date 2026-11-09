ALTER TABLE phap_thoai ADD COLUMN dien_gia TEXT;

ALTER TABLE user_sync_data ADD COLUMN pt_favorite_albums TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(pt_favorite_albums));
ALTER TABLE user_sync_data ADD COLUMN pt_listen_later_albums TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(pt_listen_later_albums));
ALTER TABLE pt_player_sync ADD COLUMN pt_favorite_albums TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(pt_favorite_albums));
ALTER TABLE pt_player_sync ADD COLUMN pt_listen_later_albums TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(pt_listen_later_albums));

CREATE TABLE player_sync_items_next (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('state', 'position', 'recent', 'favorite', 'listen_later')),
  item_key TEXT NOT NULL,
  saved_at REAL NOT NULL DEFAULT 0,
  payload TEXT CHECK (payload IS NULL OR json_valid(payload)),
  deleted_at REAL,
  PRIMARY KEY (owner_id, item_type, item_key)
);

INSERT INTO player_sync_items_next (owner_id, item_type, item_key, saved_at, payload, deleted_at)
SELECT owner_id, item_type, item_key, saved_at, payload, deleted_at FROM player_sync_items;
DROP TRIGGER IF EXISTS player_sync_ingest_snapshot;
DROP TRIGGER IF EXISTS user_sync_data_ingest_player_insert;
DROP TRIGGER IF EXISTS user_sync_data_ingest_player_update;
DROP TRIGGER IF EXISTS pt_player_sync_ingest_legacy_insert;
DROP TRIGGER IF EXISTS pt_player_sync_ingest_legacy_update;
DROP VIEW IF EXISTS player_sync_ingest;
DROP TABLE player_sync_items;
ALTER TABLE player_sync_items_next RENAME TO player_sync_items;


-- Normalize playback state during the rollback support window so writes from
-- the aggregate legacy owner and the dedicated player owner merge per field
-- and per album instead of replacing one composite snapshot with another.
CREATE TABLE IF NOT EXISTS player_sync_items (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('state', 'position', 'recent')),
  item_key TEXT NOT NULL,
  saved_at REAL NOT NULL DEFAULT 0,
  payload TEXT CHECK (payload IS NULL OR json_valid(payload)),
  deleted_at REAL,
  PRIMARY KEY (owner_id, item_type, item_key)
);

CREATE VIEW IF NOT EXISTS player_sync_ingest AS
SELECT
  '' AS owner_id,
  NULL AS pt_player_state,
  '{}' AS pt_album_positions,
  '[]' AS pt_recent_albums,
  '{}' AS sync_metadata,
  '' AS updated_at
WHERE 0;

CREATE TABLE player_sync_migration_snapshots (
  owner_id TEXT NOT NULL,
  pt_player_state TEXT,
  pt_album_positions TEXT,
  pt_recent_albums TEXT,
  sync_metadata TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO player_sync_migration_snapshots
  (owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at)
SELECT id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at
FROM user_sync_data;

INSERT INTO player_sync_migration_snapshots
  (owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at)
SELECT substr(id, 8), pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at
FROM pt_player_sync
WHERE id GLOB 'google_*'
  AND EXISTS (SELECT 1 FROM app_users WHERE app_users.id = substr(pt_player_sync.id, 8));

CREATE TRIGGER IF NOT EXISTS player_sync_ingest_snapshot
INSTEAD OF INSERT ON player_sync_ingest
BEGIN
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT
    NEW.owner_id,
    'state',
    'current',
    COALESCE(CAST(json_extract(NEW.pt_player_state, '$.savedAt') AS REAL), 0),
    NEW.pt_player_state,
    NULL
  WHERE NEW.pt_player_state IS NOT NULL
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    saved_at = excluded.saved_at,
    payload = excluded.payload,
    deleted_at = NULL
  WHERE excluded.saved_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
     OR (
       excluded.saved_at = COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
       AND excluded.payload > COALESCE(player_sync_items.payload, '')
     );
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT
    NEW.owner_id,
    'position',
    entry.key,
    COALESCE(CAST(json_extract(entry.value, '$.savedAt') AS REAL), 0),
    entry.value,
    NULL
  FROM json_each(COALESCE(NEW.pt_album_positions, '{}')) AS entry
  WHERE 1 = 1
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    saved_at = excluded.saved_at,
    payload = excluded.payload,
    deleted_at = NULL
  WHERE excluded.saved_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
     OR (
       excluded.saved_at = COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
       AND excluded.payload > COALESCE(player_sync_items.payload, '')
     );
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT
    NEW.owner_id,
    'recent',
    CASE
      WHEN entry.type = 'text' THEN CAST(entry.value AS TEXT)
      ELSE COALESCE(json_extract(entry.value, '$.albumId'), CAST(entry.key AS TEXT))
    END,
    CASE
      WHEN entry.type = 'text' THEN 0
      ELSE COALESCE(CAST(json_extract(entry.value, '$.savedAt') AS REAL), 0)
    END,
    CASE WHEN entry.type = 'text' THEN json_quote(entry.value) ELSE entry.value END,
    NULL
  FROM json_each(COALESCE(NEW.pt_recent_albums, '[]')) AS entry
  WHERE 1 = 1
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    saved_at = excluded.saved_at,
    payload = excluded.payload,
    deleted_at = NULL
  WHERE excluded.saved_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
     OR (
       excluded.saved_at = COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
       AND excluded.payload > COALESCE(player_sync_items.payload, '')
     );
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT
    NEW.owner_id,
    'position',
    tombstone.key,
    0,
    NULL,
    CAST(tombstone.value AS REAL)
  FROM json_each(json_extract(NEW.sync_metadata, '$.pt_album_positions')) AS tombstone
  WHERE 1 = 1
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    payload = NULL,
    deleted_at = excluded.deleted_at
  WHERE excluded.deleted_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at);
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT
    NEW.owner_id,
    'recent',
    tombstone.key,
    0,
    NULL,
    CAST(tombstone.value AS REAL)
  FROM json_each(json_extract(NEW.sync_metadata, '$.pt_recent_albums')) AS tombstone
  WHERE 1 = 1
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    payload = NULL,
    deleted_at = excluded.deleted_at
  WHERE excluded.deleted_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at);
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT
    NEW.owner_id,
    'state',
    'current',
    0,
    NULL,
    CAST(json_extract(NEW.sync_metadata, '$.pt_player_state_deleted_at') AS REAL)
  WHERE json_type(NEW.sync_metadata, '$.pt_player_state_deleted_at') IN ('integer', 'real')
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    payload = NULL,
    deleted_at = excluded.deleted_at
  WHERE excluded.deleted_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at);
  INSERT INTO user_sync_data (
    id, practice_logs, bookmarks, listened_history, updated_at,
    pt_player_state, pt_album_positions, pt_recent_albums, sync_revision, sync_metadata
  )
  SELECT NEW.owner_id, '[]', '[]', '[]', NEW.updated_at, NULL, '{}', '[]', 0, '{}'
  WHERE EXISTS (SELECT 1 FROM app_users WHERE id = NEW.owner_id)
  ON CONFLICT(id) DO NOTHING;
  UPDATE user_sync_data
  SET pt_player_state = (
        SELECT payload FROM player_sync_items
        WHERE owner_id = NEW.owner_id AND item_type = 'state' AND item_key = 'current'
          AND deleted_at IS NULL
      ),
      pt_album_positions = COALESCE((
        SELECT json_group_object(item_key, json(payload))
        FROM (
          SELECT item_key, payload FROM player_sync_items
          WHERE owner_id = NEW.owner_id AND item_type = 'position'
            AND deleted_at IS NULL AND payload IS NOT NULL
          ORDER BY item_key
        )
      ), '{}'),
      pt_recent_albums = COALESCE((
        SELECT json_group_array(json(payload))
        FROM (
          SELECT payload FROM player_sync_items
          WHERE owner_id = NEW.owner_id AND item_type = 'recent'
            AND deleted_at IS NULL AND payload IS NOT NULL
          ORDER BY saved_at DESC, item_key
        )
      ), '[]'),
      updated_at = MAX(updated_at, NEW.updated_at),
      sync_metadata = json_patch(sync_metadata, json_object(
        'pt_album_positions', json(COALESCE((
          SELECT json_group_object(item_key, deleted_at)
          FROM player_sync_items
          WHERE owner_id = NEW.owner_id AND item_type = 'position' AND deleted_at IS NOT NULL
        ), '{}')),
        'pt_recent_albums', json(COALESCE((
          SELECT json_group_object(item_key, deleted_at)
          FROM player_sync_items
          WHERE owner_id = NEW.owner_id AND item_type = 'recent' AND deleted_at IS NOT NULL
        ), '{}')),
        'pt_player_state_deleted_at', (
          SELECT deleted_at FROM player_sync_items
          WHERE owner_id = NEW.owner_id AND item_type = 'state' AND item_key = 'current'
        )
      ))
  WHERE id = NEW.owner_id;
  INSERT INTO pt_player_sync (
    id, pt_player_state, pt_album_positions, pt_recent_albums,
    updated_at, sync_revision, sync_metadata
  )
  SELECT
    'google_' || NEW.owner_id,
    aggregate.pt_player_state,
    aggregate.pt_album_positions,
    aggregate.pt_recent_albums,
    aggregate.updated_at,
    1,
    json_remove(aggregate.sync_metadata, '$.practice_logs', '$.bookmarks', '$.listened_history')
  FROM user_sync_data AS aggregate
  WHERE aggregate.id = NEW.owner_id
  ON CONFLICT(id) DO UPDATE SET
    pt_player_state = excluded.pt_player_state,
    pt_album_positions = excluded.pt_album_positions,
    pt_recent_albums = excluded.pt_recent_albums,
    updated_at = excluded.updated_at,
    sync_revision = pt_player_sync.sync_revision + 1,
    sync_metadata = excluded.sync_metadata;
END;

CREATE TRIGGER IF NOT EXISTS user_sync_data_ingest_player_insert
AFTER INSERT ON user_sync_data
BEGIN
  INSERT INTO player_sync_ingest
    (owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at)
  VALUES
    (NEW.id, NEW.pt_player_state, NEW.pt_album_positions, NEW.pt_recent_albums, NEW.sync_metadata, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS user_sync_data_ingest_player_update
AFTER UPDATE OF pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata ON user_sync_data
WHEN OLD.pt_player_state IS NOT NEW.pt_player_state
  OR OLD.pt_album_positions IS NOT NEW.pt_album_positions
  OR OLD.pt_recent_albums IS NOT NEW.pt_recent_albums
  OR OLD.sync_metadata IS NOT NEW.sync_metadata
BEGIN
  INSERT INTO player_sync_ingest
    (owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at)
  VALUES
    (NEW.id, NEW.pt_player_state, NEW.pt_album_positions, NEW.pt_recent_albums, NEW.sync_metadata, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS pt_player_sync_ingest_legacy_insert
AFTER INSERT ON pt_player_sync
WHEN NEW.id GLOB 'google_*'
  AND EXISTS (SELECT 1 FROM app_users WHERE id = substr(NEW.id, 8))
BEGIN
  INSERT INTO player_sync_ingest
    (owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at)
  VALUES
    (substr(NEW.id, 8), NEW.pt_player_state, NEW.pt_album_positions, NEW.pt_recent_albums, NEW.sync_metadata, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS pt_player_sync_ingest_legacy_update
AFTER UPDATE OF pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata ON pt_player_sync
WHEN NEW.id GLOB 'google_*'
  AND EXISTS (SELECT 1 FROM app_users WHERE id = substr(NEW.id, 8))
  AND (
    OLD.pt_player_state IS NOT NEW.pt_player_state
    OR OLD.pt_album_positions IS NOT NEW.pt_album_positions
    OR OLD.pt_recent_albums IS NOT NEW.pt_recent_albums
    OR OLD.sync_metadata IS NOT NEW.sync_metadata
  )
BEGIN
  INSERT INTO player_sync_ingest
    (owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at)
  VALUES
    (substr(NEW.id, 8), NEW.pt_player_state, NEW.pt_album_positions, NEW.pt_recent_albums, NEW.sync_metadata, NEW.updated_at);
END;

-- Reconcile both pre-migration representations item by item. This deliberately
-- runs both sources through the same normalized conflict rules.
INSERT INTO player_sync_ingest
  (owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at)
SELECT owner_id, pt_player_state, pt_album_positions, pt_recent_albums, sync_metadata, updated_at
FROM player_sync_migration_snapshots;

DROP TABLE player_sync_migration_snapshots;

CREATE VIEW player_library_sync_ingest AS
SELECT '' AS owner_id, '[]' AS pt_favorite_albums, '[]' AS pt_listen_later_albums, '{}' AS sync_metadata
WHERE 0;

CREATE TRIGGER player_library_sync_ingest_items
INSTEAD OF INSERT ON player_library_sync_ingest
BEGIN
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT NEW.owner_id, 'favorite', CAST(json_extract(entry.value, '$.albumId') AS TEXT),
    COALESCE(CAST(json_extract(entry.value, '$.savedAt') AS REAL), 0), entry.value, NULL
  FROM json_each(COALESCE(NEW.pt_favorite_albums, '[]')) AS entry
  WHERE json_extract(entry.value, '$.albumId') IS NOT NULL
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    saved_at = excluded.saved_at, payload = excluded.payload, deleted_at = NULL
  WHERE excluded.saved_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
     OR (excluded.saved_at = COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
       AND excluded.payload > COALESCE(player_sync_items.payload, ''));
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT NEW.owner_id, 'listen_later', CAST(json_extract(entry.value, '$.albumId') AS TEXT),
    COALESCE(CAST(json_extract(entry.value, '$.savedAt') AS REAL), 0), entry.value, NULL
  FROM json_each(COALESCE(NEW.pt_listen_later_albums, '[]')) AS entry
  WHERE json_extract(entry.value, '$.albumId') IS NOT NULL
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET
    saved_at = excluded.saved_at, payload = excluded.payload, deleted_at = NULL
  WHERE excluded.saved_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
     OR (excluded.saved_at = COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at)
       AND excluded.payload > COALESCE(player_sync_items.payload, ''));
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT NEW.owner_id, 'favorite',
    CASE WHEN tombstone.key LIKE 'albumId:%' THEN substr(tombstone.key, 9) ELSE tombstone.key END,
    0, NULL, CAST(tombstone.value AS REAL)
  FROM json_each(json_extract(NEW.sync_metadata, '$.pt_favorite_albums')) AS tombstone
  WHERE 1 = 1
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET payload = NULL, deleted_at = excluded.deleted_at
  WHERE excluded.deleted_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at);
  INSERT INTO player_sync_items (owner_id, item_type, item_key, saved_at, payload, deleted_at)
  SELECT NEW.owner_id, 'listen_later',
    CASE WHEN tombstone.key LIKE 'albumId:%' THEN substr(tombstone.key, 9) ELSE tombstone.key END,
    0, NULL, CAST(tombstone.value AS REAL)
  FROM json_each(json_extract(NEW.sync_metadata, '$.pt_listen_later_albums')) AS tombstone
  WHERE 1 = 1
  ON CONFLICT(owner_id, item_type, item_key) DO UPDATE SET payload = NULL, deleted_at = excluded.deleted_at
  WHERE excluded.deleted_at > COALESCE(player_sync_items.deleted_at, player_sync_items.saved_at);
END;

CREATE TRIGGER user_sync_data_ingest_library_insert
AFTER INSERT ON user_sync_data
BEGIN
  INSERT INTO player_library_sync_ingest (owner_id, pt_favorite_albums, pt_listen_later_albums, sync_metadata)
  VALUES (NEW.id, NEW.pt_favorite_albums, NEW.pt_listen_later_albums, NEW.sync_metadata);
END;

CREATE TRIGGER user_sync_data_ingest_library_update
AFTER UPDATE OF pt_favorite_albums, pt_listen_later_albums, sync_metadata ON user_sync_data
WHEN OLD.pt_favorite_albums IS NOT NEW.pt_favorite_albums
  OR OLD.pt_listen_later_albums IS NOT NEW.pt_listen_later_albums
  OR OLD.sync_metadata IS NOT NEW.sync_metadata
BEGIN
  INSERT INTO player_library_sync_ingest (owner_id, pt_favorite_albums, pt_listen_later_albums, sync_metadata)
  VALUES (NEW.id, NEW.pt_favorite_albums, NEW.pt_listen_later_albums, NEW.sync_metadata);
END;

CREATE TRIGGER pt_player_sync_ingest_library_insert
AFTER INSERT ON pt_player_sync
WHEN NEW.id GLOB 'google_*' AND EXISTS (SELECT 1 FROM app_users WHERE id = substr(NEW.id, 8))
BEGIN
  INSERT INTO player_library_sync_ingest (owner_id, pt_favorite_albums, pt_listen_later_albums, sync_metadata)
  VALUES (substr(NEW.id, 8), NEW.pt_favorite_albums, NEW.pt_listen_later_albums, NEW.sync_metadata);
END;

CREATE TRIGGER pt_player_sync_ingest_library_update
AFTER UPDATE OF pt_favorite_albums, pt_listen_later_albums, sync_metadata ON pt_player_sync
WHEN NEW.id GLOB 'google_*' AND EXISTS (SELECT 1 FROM app_users WHERE id = substr(NEW.id, 8))
  AND (OLD.pt_favorite_albums IS NOT NEW.pt_favorite_albums
    OR OLD.pt_listen_later_albums IS NOT NEW.pt_listen_later_albums
    OR OLD.sync_metadata IS NOT NEW.sync_metadata)
BEGIN
  INSERT INTO player_library_sync_ingest (owner_id, pt_favorite_albums, pt_listen_later_albums, sync_metadata)
  VALUES (substr(NEW.id, 8), NEW.pt_favorite_albums, NEW.pt_listen_later_albums, NEW.sync_metadata);
END;

INSERT INTO player_library_sync_ingest (owner_id, pt_favorite_albums, pt_listen_later_albums, sync_metadata)
SELECT id, pt_favorite_albums, pt_listen_later_albums, sync_metadata FROM user_sync_data;

INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
VALUES ('audio-library-and-speaker-v1', 18, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(capability) DO UPDATE SET
  schema_version = MAX(app_schema_capabilities.schema_version, excluded.schema_version);
