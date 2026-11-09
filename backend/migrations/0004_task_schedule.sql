ALTER TABLE watched ADD COLUMN next_check_at INTEGER NOT NULL DEFAULT 0;

DROP INDEX watched_open;
CREATE INDEX watched_due ON watched (closed, next_check_at);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
