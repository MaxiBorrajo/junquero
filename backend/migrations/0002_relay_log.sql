CREATE TABLE relay_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_address TEXT NOT NULL,
  target TEXT NOT NULL,
  selector TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX relay_log_from_time ON relay_log (from_address, created_at);
