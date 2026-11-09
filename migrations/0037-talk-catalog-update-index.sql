-- Người dùng duyệt ngày 26/10/2026: giảm scan cho catalog/delta album công khai.
CREATE INDEX IF NOT EXISTS idx_phap_thoai_visibility_created_at_id
  ON phap_thoai(visibility, created_at, id);
