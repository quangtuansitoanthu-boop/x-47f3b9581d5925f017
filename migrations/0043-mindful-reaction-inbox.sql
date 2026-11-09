-- Chỉ tương tác được tạo sau migration mới sinh thông báo; không backfill lịch sử.
CREATE TABLE mindful_reaction_inbox (
  reaction_id TEXT PRIMARY KEY REFERENCES mindful_reactions(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_mindful_inbox_recipient_page
  ON mindful_reaction_inbox(recipient_id, created_at DESC, reaction_id DESC);

-- Trigger giữ tương thích các bản backend cũ; retry cùng reaction không chạy INSERT lại.
CREATE TRIGGER mindful_reaction_received AFTER INSERT ON mindful_reactions BEGIN
  INSERT INTO mindful_reaction_inbox(reaction_id, recipient_id, created_at)
    SELECT NEW.id, p.owner_id, NEW.created_at FROM mindful_posts p
    WHERE p.id = NEW.post_id AND p.owner_id <> NEW.owner_id;
END;
