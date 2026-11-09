ALTER TABLE app_users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'));

ALTER TABLE app_users ADD COLUMN suspended_at TEXT;
