-- Migration 0033: Dong bo chi so goc cho cong dong Thanh Tinh Tam
-- Dam bao cac chi so participants, urges_resisted, va clean_days luon lon hon hoac bang muc mac dinh

INSERT INTO thanh_tinh_community (key, value, updated_at) VALUES
  ('participants', 1352, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('urges_resisted', 8640, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('clean_days', 33450, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET
  value = MAX(value, excluded.value),
  updated_at = excluded.updated_at;
