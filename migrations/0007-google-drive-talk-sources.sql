PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS phap_thoai_drive_sources (
  drive_folder_id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL UNIQUE REFERENCES phap_thoai(id) ON DELETE CASCADE,
  drive_root_folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  last_scanned_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phap_thoai_drive_sources_root
  ON phap_thoai_drive_sources(drive_root_folder_id, folder_name);

CREATE TABLE IF NOT EXISTS phap_thoai_drive_files (
  drive_file_id TEXT PRIMARY KEY,
  drive_folder_id TEXT NOT NULL
    REFERENCES phap_thoai_drive_sources(drive_folder_id) ON DELETE CASCADE,
  album_id TEXT NOT NULL REFERENCES phap_thoai(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  modified_time TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  UNIQUE (drive_folder_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_phap_thoai_drive_files_album
  ON phap_thoai_drive_files(album_id, sort_order);
