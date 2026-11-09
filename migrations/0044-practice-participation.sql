PRAGMA foreign_keys = ON;

CREATE TABLE practice_participation_latest (
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK(module_key IN ('five','ten','eight','sutra','mantra','ritual','meditation','rosary','bowing','sutra-copy','name-copy','talk','purity','reflection','routine')),
  last_event_kind TEXT NOT NULL CHECK(last_event_kind IN ('started','recorded','completed')),
  last_activity_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  source_session_id TEXT REFERENCES practice_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY(owner_id,module_key)
);
CREATE INDEX idx_participation_recent ON practice_participation_latest(last_activity_at DESC,owner_id DESC,module_key DESC);
CREATE INDEX idx_participation_module_recent ON practice_participation_latest(module_key,last_activity_at DESC,owner_id DESC);
CREATE INDEX idx_participation_precepts_recent ON practice_participation_latest(last_activity_at DESC,owner_id DESC,module_key DESC) WHERE module_key IN ('five','ten','eight');
CREATE INDEX idx_participation_source ON practice_participation_latest(source_session_id) WHERE source_session_id IS NOT NULL;

-- Không đưa lời tụng tùy chỉnh, ghi chú, số đếm hoặc nội dung riêng vào bảng quản trị.
CREATE VIEW practice_participation_sources AS
SELECT s.id,s.owner_id,
  CASE
    WHEN s.source_kind='manual_log' THEN
      CASE WHEN json_extract(s.evidence_summary_json,'$.origin')='completed_tool' THEN
        CASE json_extract(s.evidence_summary_json,'$.type')
          WHEN 'Lễ Phật' THEN 'bowing' WHEN 'Chép kinh' THEN 'sutra-copy' WHEN 'Chép danh hiệu' THEN 'name-copy' END END
    WHEN s.activity_type='meditation' THEN 'meditation'
    WHEN s.activity_type='rosary' THEN 'rosary'
    WHEN s.activity_type='dharma_talk' THEN 'talk'
    WHEN s.activity_type IN ('scripture','model_chant') THEN
      CASE b.danh_muc WHEN 'KINH PHẬT' THEN 'sutra' WHEN 'TRÌ CHÚ' THEN 'mantra' WHEN 'CÁC NGHI THỨC' THEN 'ritual' END
  END AS module_key,
  CASE WHEN s.status='completed' AND s.verification_result='accepted' THEN 'completed' ELSE 'started' END AS last_event_kind,
  CASE WHEN s.status='completed' AND s.verification_result='accepted' THEN s.completed_at ELSE s.started_at END AS last_activity_at,
  s.updated_at AS last_synced_at
FROM practice_sessions s LEFT JOIN baiviet b ON b.id=s.source_id;

CREATE TRIGGER participation_session_insert AFTER INSERT ON practice_sessions BEGIN
  INSERT INTO practice_participation_latest(owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,source_session_id)
    SELECT owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,id FROM practice_participation_sources WHERE id=NEW.id AND module_key IS NOT NULL
    ON CONFLICT(owner_id,module_key) DO UPDATE SET last_event_kind=excluded.last_event_kind,last_activity_at=excluded.last_activity_at,
      last_synced_at=excluded.last_synced_at,source_session_id=excluded.source_session_id
    WHERE excluded.last_activity_at>practice_participation_latest.last_activity_at
      OR (excluded.last_activity_at=practice_participation_latest.last_activity_at AND excluded.last_event_kind='completed' AND practice_participation_latest.last_event_kind<>'completed');
END;
CREATE TRIGGER participation_session_update AFTER UPDATE ON practice_sessions BEGIN
  INSERT INTO practice_participation_latest(owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,source_session_id)
    SELECT owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,id FROM practice_participation_sources WHERE id=NEW.id AND module_key IS NOT NULL
    ON CONFLICT(owner_id,module_key) DO UPDATE SET last_event_kind=excluded.last_event_kind,last_activity_at=excluded.last_activity_at,
      last_synced_at=excluded.last_synced_at,source_session_id=excluded.source_session_id
    WHERE excluded.last_activity_at>practice_participation_latest.last_activity_at
      OR (excluded.last_activity_at=practice_participation_latest.last_activity_at AND excluded.last_event_kind='completed' AND practice_participation_latest.last_event_kind<>'completed');
END;
CREATE TRIGGER participation_session_delete BEFORE DELETE ON practice_sessions BEGIN
  DELETE FROM practice_participation_latest WHERE source_session_id=OLD.id;
  INSERT INTO practice_participation_latest(owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,source_session_id)
    SELECT owner_id,module_key,last_event_kind,last_activity_at,last_synced_at,id FROM practice_participation_sources
      WHERE owner_id=OLD.owner_id AND id<>OLD.id AND EXISTS(SELECT 1 FROM app_users WHERE id=OLD.owner_id)
        AND module_key=(SELECT module_key FROM practice_participation_sources WHERE id=OLD.id)
      ORDER BY last_activity_at DESC,id DESC LIMIT 1
    ON CONFLICT(owner_id,module_key) DO NOTHING;
END;

-- Backfill lịch sử là thao tác riêng có giới hạn, không quét dữ liệu khi chỉ nâng schema.
INSERT INTO app_schema_capabilities(capability,schema_version,applied_at)
VALUES('practice-participation-v1',44,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(capability) DO UPDATE SET schema_version=MAX(app_schema_capabilities.schema_version,44),applied_at=excluded.applied_at;
