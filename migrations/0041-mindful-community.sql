-- Additive community journal surfaces. No account identity is projected publicly.
CREATE TABLE mindful_posts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  client_post_id TEXT NOT NULL CHECK (length(client_post_id) BETWEEN 1 AND 100),
  kind TEXT NOT NULL CHECK (kind IN ('repentance', 'good_deed')),
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 40),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 3000 OR (status = 'removed' AND content = '')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'removed')),
  reaction_count INTEGER NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, client_post_id)
);
CREATE INDEX idx_mindful_posts_feed ON mindful_posts(kind, status, created_at DESC, id DESC);
CREATE INDEX idx_mindful_posts_owner ON mindful_posts(owner_id, created_at DESC, id DESC);

CREATE TABLE mindful_reactions (
  id TEXT NOT NULL UNIQUE,
  post_id TEXT NOT NULL REFERENCES mindful_posts(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL CHECK (template_id IN ('tam-bao', 'bo-de', 'quan-am', 'hoan-hy', 'thien-can')),
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 40),
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, owner_id)
);
CREATE INDEX idx_mindful_reactions_page ON mindful_reactions(post_id, created_at DESC, id DESC);
CREATE INDEX idx_mindful_reactions_owner ON mindful_reactions(owner_id);

-- Account deletion cascades reactions; keep the cached total exact without scanning.
CREATE TRIGGER mindful_reaction_deleted AFTER DELETE ON mindful_reactions BEGIN
  UPDATE mindful_posts SET reaction_count = MAX(0, reaction_count - 1) WHERE id = OLD.post_id;
END;
