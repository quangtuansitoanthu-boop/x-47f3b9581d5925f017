CREATE TABLE IF NOT EXISTS phap_bao_items (
  id TEXT PRIMARY KEY,
  loai TEXT NOT NULL CHECK (loai IN ('kinh', 'phap_bao')),
  tieu_de TEXT NOT NULL,
  mo_ta TEXT NOT NULL DEFAULT '',
  anh_url TEXT NOT NULL DEFAULT '',
  link_shopee TEXT NOT NULL,
  con_hang INTEGER NOT NULL DEFAULT 1 CHECK (con_hang IN (0, 1)),
  so_thu_tu INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_phap_bao_items_loai ON phap_bao_items(loai, con_hang, so_thu_tu);

CREATE TABLE IF NOT EXISTS phap_bao_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES phap_bao_items(id) ON DELETE SET NULL,
  item_title TEXT NOT NULL,
  item_loai TEXT NOT NULL,
  danh_hieu TEXT NOT NULL,
  shopee_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_phap_bao_history_user ON phap_bao_history(user_id, created_at DESC);

INSERT OR IGNORE INTO phap_bao_items (id, loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, created_at, updated_at)
VALUES
  ('kinh-dia-tang', 'kinh', 'Kinh Địa Tạng Bổn Nguyện', 'Bản in chữ to, rõ ràng, bìa cứng trang nghiêm thích hợp tụng đọc tại gia.', '', 'https://shopee.vn', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kinh-duoc-su', 'kinh', 'Kinh Dược Sư Lưu Ly Quang Như Lai', 'Kinh sám hối tiêu trừ tật bệnh, nghiệp chướng, cầu an gia đạo.', '', 'https://shopee.vn', 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('may-niem-phat', 'phap_bao', 'Máy Niệm Phật Cầm Tay', 'Máy gồm các bài niệm Phật, chú Đại Bi, kinh tụng thanh tịnh, pin sạc bền bỉ.', '', 'https://shopee.vn', 1, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('vong-dau-tam', 'phap_bao', 'Vòng Dâu Tằm / Chuỗi Tràng Hạt', 'Chuỗi niệm Phật 108 hạt giúp an định tâm hồn, hỗ trợ công phu niệm Phật.', '', 'https://shopee.vn', 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
