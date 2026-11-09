-- Explicit user saves only. No per-keystroke events, autosync rows or index on text.
CREATE TABLE scripture_copy_chapters (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  sutra_id TEXT NOT NULL,
  chapter INTEGER NOT NULL CHECK (chapter BETWEEN 1 AND 28),
  run_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  texts_json TEXT NOT NULL,
  completed_blocks INTEGER NOT NULL DEFAULT 0,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  mutation_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, sutra_id, chapter, run_id)
);
