-- The release owner approved preserving existing public comments. This one-time
-- backfill never changes the pending default used by subsequent submissions.
ALTER TABLE binh_luan ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE binh_luan ADD COLUMN moderation_reason TEXT;
ALTER TABLE binh_luan ADD COLUMN approved_author_name TEXT;
ALTER TABLE binh_luan ADD COLUMN approved_author_avatar_url TEXT;
ALTER TABLE binh_luan ADD COLUMN moderated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE binh_luan ADD COLUMN moderated_at TEXT;
ALTER TABLE binh_luan ADD COLUMN moderation_revision INTEGER NOT NULL DEFAULT 1;
UPDATE binh_luan SET moderation_status = 'approved', approved_author_name = ten,
  approved_author_avatar_url = COALESCE((SELECT avatar_url FROM app_users WHERE id = binh_luan.author_user_id), '');
CREATE INDEX idx_comments_moderated_article_time ON binh_luan(bai_viet_id, moderation_status, tao_luc, id);
CREATE INDEX idx_comments_owner_article_time ON binh_luan(author_user_id, bai_viet_id, tao_luc, id);
CREATE INDEX idx_comments_approved_owner ON binh_luan(author_user_id, tao_luc DESC, id DESC) WHERE moderation_status = 'approved';
CREATE INDEX idx_comments_moderation_queue ON binh_luan(moderation_status, tao_luc, id);
CREATE INDEX idx_comments_moderator ON binh_luan(moderated_by) WHERE moderated_by IS NOT NULL;

CREATE TABLE ugc_public_profiles (
  public_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  submitted_display_name TEXT NOT NULL,
  submitted_avatar_url TEXT NOT NULL DEFAULT '',
  approved_display_name TEXT,
  approved_avatar_url TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderation_reason TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  submitted_at TEXT NOT NULL,
  moderated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  moderated_at TEXT
);
CREATE INDEX idx_ugc_profiles_queue ON ugc_public_profiles(moderation_status, submitted_at, public_id);
CREATE INDEX idx_ugc_profiles_moderator ON ugc_public_profiles(moderated_by) WHERE moderated_by IS NOT NULL;
WITH ranked_legacy AS (
  SELECT author_user_id, approved_author_name,
    ROW_NUMBER() OVER (PARTITION BY author_user_id ORDER BY tao_luc DESC, id DESC) AS position
  FROM binh_luan WHERE author_user_id IS NOT NULL AND moderation_status = 'approved'
)
INSERT INTO ugc_public_profiles (public_id, owner_id, submitted_display_name, submitted_avatar_url,
  approved_display_name, approved_avatar_url, moderation_status, submitted_at)
SELECT lower(hex(randomblob(16))), u.id, COALESCE(NULLIF(u.display_name, ''), 'Thành viên'), COALESCE(u.avatar_url, ''),
  CASE WHEN public.leaderboard_opt_in = 1 OR public.presence_opt_in = 1 THEN COALESCE(NULLIF(u.display_name, ''), 'Thành viên')
    ELSE legacy.approved_author_name END,
  COALESCE(u.avatar_url, ''),
  CASE WHEN public.leaderboard_opt_in = 1 OR public.presence_opt_in = 1 OR COALESCE(NULLIF(u.display_name, ''), 'Thành viên') =
    legacy.approved_author_name
    THEN 'approved' ELSE 'pending' END,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM app_users u LEFT JOIN practice_profiles public ON public.owner_id = u.id
LEFT JOIN ranked_legacy legacy ON legacy.author_user_id = u.id AND legacy.position = 1
WHERE public.leaderboard_opt_in = 1 OR public.presence_opt_in = 1
  OR legacy.author_user_id IS NOT NULL;

CREATE TABLE ugc_user_blocks (
  blocker_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  blocked_owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_owner_id),
  CHECK (blocker_id <> blocked_owner_id)
);
CREATE INDEX idx_ugc_blocks_owner_time ON ugc_user_blocks(blocker_id, created_at, blocked_owner_id);
CREATE INDEX idx_ugc_blocks_target ON ugc_user_blocks(blocked_owner_id);

CREATE TABLE ugc_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('comment', 'profile')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('offensive', 'harassment', 'spam', 'other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  moderated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  moderated_at TEXT,
  moderation_reason TEXT,
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX idx_ugc_reports_queue ON ugc_reports(status, created_at, id);
CREATE INDEX idx_ugc_reports_moderator ON ugc_reports(moderated_by) WHERE moderated_by IS NOT NULL;
