CREATE TABLE pending_marks (
  order_id INTEGER PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  tx_hash TEXT
);
