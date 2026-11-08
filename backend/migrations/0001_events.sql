CREATE TABLE events (
  id TEXT PRIMARY KEY,
  block_number INTEGER NOT NULL,
  block_timestamp INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  contract TEXT NOT NULL,
  address TEXT NOT NULL,
  name TEXT NOT NULL,
  order_id INTEGER,
  case_id INTEGER,
  args TEXT NOT NULL
);

CREATE INDEX idx_events_order ON events (order_id, block_number, log_index);
CREATE INDEX idx_events_case ON events (case_id, block_number, log_index);
CREATE INDEX idx_events_position ON events (block_number, log_index);
CREATE INDEX idx_events_name ON events (name, block_number);

CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_block INTEGER NOT NULL
);
