CREATE TABLE watched (
  kind TEXT NOT NULL,
  id INTEGER NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, id)
);

CREATE INDEX watched_open ON watched (closed, checked_at);

CREATE TABLE task_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
