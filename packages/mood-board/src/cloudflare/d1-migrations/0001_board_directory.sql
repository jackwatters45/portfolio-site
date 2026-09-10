CREATE TABLE board_directory (
  workspace_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  PRIMARY KEY (workspace_id, board_id)
);

CREATE INDEX board_directory_public_order
ON board_directory (workspace_id, deleted, updated_at DESC);
