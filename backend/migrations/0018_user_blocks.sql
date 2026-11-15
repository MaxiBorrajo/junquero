CREATE TABLE user_blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
) WITHOUT ROWID;

CREATE INDEX user_blocks_blocked ON user_blocks (blocked);
