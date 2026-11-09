PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS baiviet (
  id TEXT PRIMARY KEY,
  tieu_de TEXT NOT NULL,
  tom_tat TEXT NOT NULL DEFAULT '',
  noi_dung TEXT NOT NULL DEFAULT '',
  danh_muc TEXT NOT NULL DEFAULT 'KHÁC',
  tags TEXT NOT NULL DEFAULT '',
  tac_gia TEXT NOT NULL DEFAULT 'Tu Tâm',
  anh_url TEXT NOT NULL DEFAULT '',
  link_ngoai TEXT NOT NULL DEFAULT '',
  noi_bat INTEGER NOT NULL DEFAULT 0,
  ngay_dang TEXT NOT NULL DEFAULT '',
  has_muc_luc INTEGER NOT NULL DEFAULT 0 CHECK (has_muc_luc IN (0, 1)),
  so_tap INTEGER NOT NULL DEFAULT 0,
  trang_thai TEXT NOT NULL DEFAULT '',
  tap_tieu_de TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tap_tieu_de)),
  created_at TEXT,
  updated_at TEXT,
  pdf_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_baiviet_created_at ON baiviet(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_baiviet_danh_muc ON baiviet(danh_muc);

CREATE TABLE IF NOT EXISTS binh_luan (
  id INTEGER PRIMARY KEY,
  bai_viet_id TEXT NOT NULL REFERENCES baiviet(id) ON DELETE CASCADE,
  ten TEXT NOT NULL DEFAULT '',
  dien_thoai TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  noi_dung TEXT NOT NULL DEFAULT '',
  tao_luc TEXT
);

CREATE INDEX IF NOT EXISTS idx_binh_luan_bai_viet_id ON binh_luan(bai_viet_id);

CREATE TABLE IF NOT EXISTS luot_xem (
  bai_viet_id TEXT PRIMARY KEY REFERENCES baiviet(id) ON DELETE CASCADE,
  so_luot INTEGER NOT NULL DEFAULT 0 CHECK (so_luot >= 0),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS phap_thoai (
  id TEXT PRIMARY KEY,
  tieu_de TEXT NOT NULL,
  mo_ta TEXT NOT NULL DEFAULT '',
  chu_de TEXT NOT NULL DEFAULT 'Tổng hợp',
  archive_id TEXT NOT NULL DEFAULT '',
  tracks TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tracks)),
  ngay_dang TEXT,
  created_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  anh_dai_dien TEXT
);

CREATE TABLE IF NOT EXISTS pt_player_sync (
  id TEXT PRIMARY KEY,
  pt_player_state TEXT CHECK (pt_player_state IS NULL OR json_valid(pt_player_state)),
  pt_album_positions TEXT CHECK (pt_album_positions IS NULL OR json_valid(pt_album_positions)),
  pt_recent_albums TEXT CHECK (pt_recent_albums IS NULL OR json_valid(pt_recent_albums)),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tap_noi_dung (
  id INTEGER PRIMARY KEY,
  bai_viet_id TEXT NOT NULL REFERENCES baiviet(id) ON DELETE CASCADE,
  so_thu_tu INTEGER NOT NULL DEFAULT 0,
  tieu_de TEXT NOT NULL DEFAULT '',
  tom_tat TEXT NOT NULL DEFAULT '',
  noi_dung TEXT NOT NULL DEFAULT '',
  updated_at TEXT,
  UNIQUE (bai_viet_id, so_thu_tu)
);

CREATE INDEX IF NOT EXISTS idx_tap_noi_dung_bai_viet_id ON tap_noi_dung(bai_viet_id);

CREATE TABLE IF NOT EXISTS user_sync_data (
  id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  practice_logs TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(practice_logs)),
  bookmarks TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(bookmarks)),
  listened_history TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(listened_history)),
  updated_at TEXT NOT NULL,
  pt_player_state TEXT CHECK (pt_player_state IS NULL OR json_valid(pt_player_state)),
  pt_album_positions TEXT CHECK (pt_album_positions IS NULL OR json_valid(pt_album_positions)),
  pt_recent_albums TEXT CHECK (pt_recent_albums IS NULL OR json_valid(pt_recent_albums))
);
